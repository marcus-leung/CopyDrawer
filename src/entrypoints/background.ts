import { deleteClip, deleteOlderThan, listClips, markUsed, saveClip } from '@/lib/clips';
import { db } from '@/lib/db';
import { colorOf } from '@/lib/collections';
import { hostOf } from '@/lib/format';
import type { QuickClip } from '@/lib/quickpaste';
import { requestView } from '@/lib/openView';
import { forgetRefused, markRefused, refreshAllTabBadges, refreshTabBadge, refusedByChrome } from '@/lib/tabBadge';
import { getShortcuts, NOT_SET } from '@/lib/shortcuts';
import { getSettings, isPaused, pullSyncedSettings, settingsItem, syncedSettingsItem, updateSettings } from '@/lib/settings';
import { isPrivateHost, notSavedHere } from '@/lib/exclusions';
import { injectIntoOpenTabs, onPermissionsAdded, syncAutosaveRegistration } from '@/lib/autosave';
import { blobToDataUrl, dataUrlToBlob, IMAGE_TYPES, ImageError, MAX_IMAGE_BYTES, saveImageClip } from '@/lib/images';
import { BACKUP_EVERY } from '@/lib/backup';
import { fetchImageInPage, readSelection, selectArea, showSavedToast } from '@/lib/injected';
import type { Clip, ClipSource } from '@/lib/db';

const MENU = {
  saveSelection: 'save-selection',
  saveImage: 'save-image',
  screenshot: 'screenshot-area',
  blockSite: 'block-site',
} as const;
const ALARM_CLEANUP = 'daily-cleanup';

async function cleanup() {
  const { retentionDays } = await getSettings();
  await deleteOlderThan(retentionDays);
}

function sourceOf(tab?: Browser.tabs.Tab): ClipSource | undefined {
  if (!tab) return undefined;
  return { url: tab.url, title: tab.title, favicon: tab.favIconUrl };
}

/** A short mark on the toolbar icon, for pages where the in-page card can't show. Then the tab's own mark returns. */
async function flashBadge(text: string, color: string, tabId?: number) {
  await browser.action.setBadgeBackgroundColor({ color, tabId });
  await browser.action.setBadgeText({ text, tabId });
  setTimeout(() => {
    if (tabId == null) void browser.action.setBadgeText({ text: '' });
    else
      void browser.tabs.get(tabId).then(
        (tab) => refreshTabBadge(tab),
        () => {},
      );
  }, 1500);
}
const badgeOk = (tabId?: number) => flashBadge('✓', '#0E7A62', tabId);
const badgeError = (tabId?: number) => flashBadge('!', '#B42318', tabId);

/** Shows the in-page "saved" card. Needs scripting access to the tab (activeTab or all sites). */
async function toastInTab(tabId: number | undefined, clip: Clip, title: string) {
  if (tabId == null) return;
  try {
    const thumbUrl = clip.image ? await blobToDataUrl(clip.image.thumb) : undefined;
    await browser.scripting.executeScript({
      target: { tabId },
      func: showSavedToast,
      args: [{ title, detail: clip.title, clipId: clip.id, thumbUrl, openShadow: __E2E__ }],
    });
  } catch {
    await badgeOk(tabId);
  }
}

async function saveSelectionFromTab(tab: Browser.tabs.Tab | undefined, fallbackText?: string) {
  if (!tab?.id) return;
  let payload: { text: string; html: string } | undefined;
  try {
    const [result] = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: readSelection });
    payload = result?.result as typeof payload;
  } catch (e) {
    // The right-click menu passes the selection (it works on PDFs); a shortcut has nothing to fall back on.
    if (!fallbackText) return refusedByChrome(e) ? markRefused(tab) : badgeError(tab.id);
  }
  const text = payload?.text?.trim() ? payload.text : (fallbackText ?? '');
  try {
    const clip = await saveClip({ text, html: payload?.html, source: sourceOf(tab) });
    if (clip) await badgeOk(tab.id);
  } catch (e) {
    console.warn('Selection not saved', e);
    await badgeError(tab.id);
  }
}

/** A data URL longer than this decodes to more than an image may be. */
const MAX_DATA_URL = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 100;
const TOO_BIG = 'too-big';
type Fetched = Blob | typeof TOO_BIG | null;

/** An image response's bytes, read until the cap. */
async function readImage(res: Response): Promise<Fetched> {
  const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
  if (!res.ok || !res.body || !IMAGE_TYPES.includes(type)) return null;
  if (Number(res.headers.get('content-length')) > MAX_IMAGE_BYTES) return TOO_BIG;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return new Blob(chunks as BlobPart[], { type });
    total += value.length;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      return TOO_BIG;
    }
    chunks.push(value);
  }
}

/**
 * An image's bytes. The page picks the URL, so the extension never sends cookies, and it won't reach this
 * computer or the local network unless the page itself is there; fetching from inside the page uses the page's
 * own access. Auto-save asks the page first (where it was copied), the right-click menu asks the extension
 * first. Too big ends it: no second download.
 */
async function fetchImage(
  srcUrl: string,
  tab: Browser.tabs.Tab | undefined,
  { frameId, pageFirst = false }: { frameId?: number; pageFirst?: boolean } = {},
) {
  if (srcUrl.startsWith('data:')) {
    if (srcUrl.length > MAX_DATA_URL) return null;
    try {
      return dataUrlToBlob(srcUrl);
    } catch {
      return null;
    }
  }
  const fromExtension = async (): Promise<Fetched> => {
    const host = hostOf(srcUrl);
    if (!/^https?:/i.test(srcUrl) || !host) return null;
    const pageHost = hostOf(tab?.url);
    if (isPrivateHost(host) && !(pageHost && isPrivateHost(pageHost))) return null;
    try {
      return await readImage(await fetch(srcUrl, { credentials: 'omit' }));
    } catch {
      return null;
    }
  };
  const fromPage = (): Promise<Fetched> | null => (tab?.id == null ? null : fetchImageFromPage(srcUrl, tab.id, frameId));
  const [first, second] = pageFirst ? [fromPage, fromExtension] : [fromExtension, fromPage];
  const got = (await first()) ?? (await second());
  return got === TOO_BIG ? null : got;
}

async function fetchImageFromPage(srcUrl: string, tabId: number, frameId?: number): Promise<Fetched> {
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId, frameIds: frameId == null ? undefined : [frameId] },
      func: fetchImageInPage,
      args: [srcUrl, MAX_IMAGE_BYTES, IMAGE_TYPES],
    });
    const got = result?.result as string | { tooBig: true } | null;
    if (got && typeof got === 'object') return TOO_BIG;
    return got ? dataUrlToBlob(got) : null;
  } catch {
    return null;
  }
}

async function saveImageFromUrl(srcUrl: string, tab?: Browser.tabs.Tab) {
  const blob = await fetchImage(srcUrl, tab);
  if (!blob) {
    await badgeError(tab?.id);
    return;
  }
  try {
    const fileName = decodeURIComponent(new URL(srcUrl, tab?.url).pathname.split('/').pop() ?? '') || undefined;
    const clip = await saveImageClip({ blob, source: sourceOf(tab), srcUrl, fileName });
    await toastInTab(tab?.id, clip, 'Image saved');
  } catch (e) {
    console.warn('Image not saved', e instanceof ImageError ? e.message : e);
    await badgeError(tab?.id);
  }
}

/** Auto-save of a copied image: quiet like text auto-save, ! when it couldn't be fetched. */
async function autosaveImage(srcUrl: string, tab?: Browser.tabs.Tab, frameId?: number) {
  const blob = await fetchImage(srcUrl, tab, { frameId, pageFirst: true });
  if (!blob) return badgeError(tab?.id);
  try {
    await saveImageClip({ blob, source: sourceOf(tab), srcUrl });
    await badgeOk(tab?.id);
  } catch (e) {
    console.warn('Image not auto-saved', e instanceof ImageError ? e.message : e);
    await badgeError(tab?.id);
  }
}

type Area = { x: number; y: number; w: number; h: number; dpr: number };

async function screenshotArea(tab?: Browser.tabs.Tab) {
  if (tab?.id == null || tab.windowId == null) return;
  let area = null as Area | null;
  try {
    const [result] = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: selectArea });
    area = (result?.result as Area | null | undefined) ?? null;
  } catch (e) {
    await (refusedByChrome(e) ? markRefused(tab) : badgeError(tab.id));
    return;
  }
  if (!area) return;
  try {
    await toastInTab(tab.id, await captureArea(tab, area), 'Screenshot saved');
  } catch (e) {
    console.warn('Screenshot not saved', e);
    await badgeError(tab.id);
  }
}

async function captureArea(tab: Browser.tabs.Tab, area: Area) {
  const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const full = await createImageBitmap(dataUrlToBlob(dataUrl));
  const sx = Math.round(area.x * area.dpr);
  const sy = Math.round(area.y * area.dpr);
  const sw = Math.min(full.width - sx, Math.round(area.w * area.dpr));
  const sh = Math.min(full.height - sy, Math.round(area.h * area.dpr));
  const canvas = new OffscreenCanvas(sw, sh);
  canvas.getContext('2d')!.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  full.close();
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return saveImageClip({
    blob,
    source: sourceOf(tab),
    fileName: `Screenshot of ${tab.title ?? 'page'}`.slice(0, 80),
  });
}

async function blockSiteOf(tab?: Browser.tabs.Tab) {
  const host = hostOf(tab?.url);
  if (!host) return;
  const s = await getSettings();
  if (!s.blockedSites.includes(host)) await updateSettings({ blockedSites: [...s.blockedSites, host] });
  await flashBadge('off', '#555A6E', tab?.id);
}

/** Whether a copy reported by the auto-save script should be kept; if so, the page's URL. */
async function autosaveAllowed(sender: Browser.runtime.MessageSender): Promise<{ url?: string } | null> {
  const s = await getSettings();
  if (!s.autoSave || isPaused(s)) return null;
  const tab = sender.tab;
  if (notSavedHere({ url: tab?.url, frameUrl: sender.url, incognito: tab?.incognito }, s)) return null;
  return { url: hostOf(sender.url) ? sender.url : tab?.url };
}

async function handleAutosave(msg: { text: string; html?: string; title?: string }, sender: Browser.runtime.MessageSender) {
  const allowed = await autosaveAllowed(sender);
  if (!allowed) return;
  const tab = sender.tab;
  try {
    const clip = await saveClip({
      text: msg.text,
      html: msg.html,
      source: { url: tab?.url ?? allowed.url, title: tab?.title ?? msg.title, favicon: tab?.favIconUrl },
    });
    if (clip) await badgeOk(tab?.id);
  } catch (e) {
    console.warn('Copy not auto-saved', e);
    await badgeError(tab?.id);
  }
}

function createMenus() {
  browser.contextMenus.removeAll(() => {
    browser.contextMenus.create({ id: MENU.saveSelection, title: 'Save selection', contexts: ['selection'] });
    browser.contextMenus.create({ id: MENU.saveImage, title: 'Save image', contexts: ['image'] });
    browser.contextMenus.create({
      id: MENU.screenshot,
      title: 'Screenshot an area…',
      contexts: ['page', 'image', 'selection', 'link'],
    });
    browser.contextMenus.create({ id: MENU.blockSite, title: "Don't save on this site", contexts: ['page'] });
  });
}

/**
 * "Open" on the in-page card: shows the clip in the side panel. An open panel
 * picks it up from session storage; otherwise we open the panel, or a tab if
 * Chrome won't (it only allows that right after a click).
 */
async function openClip(clipId: string, tab: Browser.tabs.Tab | undefined) {
  await requestView({ view: { name: 'detail', id: clipId }, windowId: tab?.windowId });
  try {
    if (tab?.id == null) throw new Error('no tab');
    await browser.sidePanel.open({ tabId: tab.id });
  } catch {
    const panelOpen = (
      await browser.runtime.getContexts?.({ contextTypes: ['SIDE_PANEL' as Browser.runtime.ContextType] }).catch(() => [])
    )?.length;
    if (!panelOpen) {
      await browser.tabs.create({
        url: browser.runtime.getURL(`/sidepanel.html?clip=${encodeURIComponent(clipId)}`),
        index: tab ? tab.index + 1 : undefined,
      });
    }
  }
}

/** Opens the quick-paste box on the page (activeTab from the shortcut grants access). */
async function openQuickPaste(tab: Browser.tabs.Tab | undefined) {
  if (!tab?.id) return;
  try {
    await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/quickpaste.js'] });
  } catch (e) {
    await (refusedByChrome(e) ? markRefused(tab) : badgeError(tab.id));
  }
}

async function quickPasteClips(): Promise<{ clips: QuickClip[]; shortcut: string }> {
  const [clips, collections, keys] = await Promise.all([listClips(), db.collections.toArray(), getShortcuts()]);
  const byId = new Map(collections.map((c) => [c.id, c]));
  return {
    // No hint for a shortcut Chrome left unset.
    shortcut: keys['quick-paste'] === NOT_SET ? '' : keys['quick-paste'],
    clips: clips
      .filter((c) => c.kind !== 'image')
      .slice(0, 300)
      .map((c) => {
        const col = c.collectionId ? byId.get(c.collectionId) : undefined;
        return {
          id: c.id,
          title: c.title,
          text: c.text.slice(0, 20_000),
          kind: c.kind,
          host: hostOf(c.source?.url),
          collection: col?.name,
          color: col ? colorOf(col).accent : undefined,
        };
      }),
  };
}

/** A keyboard shortcut from the manifest's `commands`. */
async function runCommand(command: string, tab?: Browser.tabs.Tab) {
  if (command === 'save-selection') await saveSelectionFromTab(tab);
  if (command === 'screenshot-area') await screenshotArea(tab);
  if (command === 'quick-paste') await openQuickPaste(tab);
}

async function onInstalled(reason: string) {
  createMenus();
  void browser.alarms.create(ALARM_CLEANUP, { periodInMinutes: 24 * 60 });
  if (reason === 'install') {
    void browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html?onboarding=1') });
  }
  // The first export reminder comes a month after install, or after this update for earlier installs.
  if (!(await getSettings()).backupRemindAfter) await updateSettings({ backupRemindAfter: Date.now() + BACKUP_EVERY });
  const autosaveOn = await syncAutosaveRegistration();
  // An update cuts off the auto-save script in open tabs; give them the new one.
  if (autosaveOn && reason === 'update') await injectIntoOpenTabs();
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener((details) => void onInstalled(details.reason));

  browser.runtime.onStartup.addListener(() => {
    void cleanup();
    void syncAutosaveRegistration();
  });

  // Settings changed on another computer (Chrome sync): apply them here.
  const applySynced = () =>
    void pullSyncedSettings()
      .then(async (changed) => {
        if (changed) await cleanup();
      })
      .catch((e) => console.warn('Settings sync failed', e));
  applySynced();
  syncedSettingsItem.watch(applySynced);

  // × on the toolbar icon for tabs where auto-save can't see copies.
  // Once per browser session: session storage starts empty when the browser starts and when the extension
  // is installed, updated, reloaded or turned back on, which are the times Chrome resets every tab's badge.
  void browser.storage.session.get('badgesSet').then(({ badgesSet }) => {
    if (badgesSet) return;
    void browser.storage.session.set({ badgesSet: true });
    void refreshAllTabBadges();
  });
  settingsItem.watch((next, prev) => {
    const affects = (s: typeof next) => JSON.stringify([s?.autoSave, s?.blockedSites, s?.saveInIncognito]);
    if (affects(next) !== affects(prev)) void refreshAllTabBadges();
  });
  browser.tabs.onActivated.addListener(
    ({ tabId }) =>
      void browser.tabs.get(tabId).then(
        (tab) => refreshTabBadge(tab),
        () => {},
      ),
  );
  browser.tabs.onUpdated.addListener((id, info, tab) => {
    // "loading" marks a new page even where Chrome hides the address.
    if (info.status === 'loading') void forgetRefused(id).then(() => refreshTabBadge(tab));
    else if (info.url || info.status) void refreshTabBadge(tab);
  });
  browser.tabs.onRemoved.addListener((id) => void forgetRefused(id));

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_CLEANUP) void cleanup();
  });

  // If the user removes the all-sites permission in Chrome, stop auto-save.
  browser.permissions.onRemoved.addListener(() => void syncAutosaveRegistration());
  browser.permissions.onAdded.addListener((added) => void onPermissionsAdded(added));

  // The toolbar button opens the popup (the full app), which can expand into the panel.
  browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

  browser.contextMenus.onClicked.addListener((info, tab) => {
    switch (info.menuItemId) {
      case MENU.saveSelection:
        return void saveSelectionFromTab(tab, info.selectionText);
      case MENU.saveImage:
        return info.srcUrl ? void saveImageFromUrl(info.srcUrl, tab) : undefined;
      case MENU.screenshot:
        return void screenshotArea(tab);
      case MENU.blockSite:
        return void blockSiteOf(tab);
    }
  });

  browser.commands.onCommand.addListener((command, tab) => void runCommand(command, tab));

  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'autosave-copy':
        void handleAutosave(msg, sender);
        return;
      case 'autosave-image':
        void autosaveAllowed(sender).then((ok) => ok && autosaveImage(msg.srcUrl, sender.tab, sender.frameId));
        return;
      case 'autosave-sync':
        void syncAutosaveRegistration().then(sendResponse);
        return true;
      case 'undo-save':
        void deleteClip(msg.clipId);
        return;
      case 'open-clip':
        void openClip(msg.clipId, sender.tab);
        return;
      case 'qp-clips':
        void quickPasteClips().then(sendResponse);
        return true;
      case 'qp-used':
        void markUsed(msg.id);
        return;
    }
    // Test-only hooks: Playwright can't click Chrome's context menu.
    if (__E2E__ && msg.type === 'e2e-menu') {
      void browser.tabs.get(msg.tabId).then(async (tab) => {
        if (msg.action === 'save-image') await saveImageFromUrl(msg.srcUrl, tab);
        if (msg.action === 'screenshot') await screenshotArea(tab);
        if (msg.action === 'quick-paste') await openQuickPaste(tab);
        sendResponse(true);
      });
      return true;
    }
    // Test-only: Playwright can't press Chrome's extension shortcuts.
    if (__E2E__ && msg.type === 'e2e-command') {
      void browser.tabs
        .get(msg.tabId)
        .then((tab) => runCommand(msg.command, tab))
        .then(() => sendResponse(true));
      return true;
    }
    // Test-only: Playwright can't update an extension.
    if (__E2E__ && msg.type === 'e2e-installed') {
      void onInstalled(msg.reason).then(() => sendResponse(true));
      return true;
    }
    // Test-only: a database that refuses writes. Dexie doesn't reopen one closed on purpose.
    if (__E2E__ && msg.type === 'e2e-close-db') {
      db.close();
      sendResponse(true);
      return;
    }
    // Test-only: Playwright can't click Chrome's permission prompt.
    if (__E2E__ && msg.type === 'e2e-permissions-added') {
      void onPermissionsAdded({ origins: ['<all_urls>'] }).then(() => sendResponse(true));
      return true;
    }
  });
});
