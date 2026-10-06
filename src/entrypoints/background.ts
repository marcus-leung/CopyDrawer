import { deleteClip, deleteOlderThan, listClips, markUsed, saveClip } from '@/lib/clips';
import { db } from '@/lib/db';
import { colorOf } from '@/lib/collections';
import { hostOf } from '@/lib/format';
import { applyAi, applyPlain, isAiTransform, type Transform } from '@/lib/transforms';
import { nanoAvailability } from '@/lib/ai/nano';
import type { QuickClip } from '@/lib/quickpaste';
import { OPEN_CLIP_KEY } from '@/lib/openClip';
import { getSettings, isPaused, pullSyncedSettings, syncedSettingsItem, updateSettings } from '@/lib/settings';
import { isBlocked } from '@/lib/exclusions';
import { syncAutosaveRegistration } from '@/lib/autosave';
import { blobToDataUrl, dataUrlToBlob, ImageError, saveImageClip } from '@/lib/images';
import { fetchImageInPage, readSelection, selectArea, showSavedToast } from '@/lib/injected';
import type { Clip, ClipSource } from '@/lib/db';

const MENU = {
  saveSelection: 'save-selection',
  saveImage: 'save-image',
  screenshot: 'screenshot-area',
  blockSite: 'block-site',
  parent: 'clipboard-parent',
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

async function flashBadge(text: string, color: string) {
  await browser.action.setBadgeBackgroundColor({ color });
  await browser.action.setBadgeText({ text });
  setTimeout(() => void browser.action.setBadgeText({ text: '' }), 1500);
}

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
    await flashBadge('✓', '#0E7A62');
  }
}

async function saveSelectionFromTab(tab: Browser.tabs.Tab | undefined, fallbackText?: string) {
  if (!tab?.id) return;
  let payload: { text: string; html: string } | undefined;
  try {
    const [result] = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: readSelection });
    payload = result?.result as typeof payload;
  } catch {
    // chrome:// pages, the Web Store and PDFs can't be scripted; fall back below.
  }
  const text = payload?.text?.trim() ? payload.text : (fallbackText ?? '');
  const clip = await saveClip({ text, html: payload?.html, source: sourceOf(tab) });
  if (clip) await flashBadge('✓', '#0E7A62');
}

async function fetchImage(srcUrl: string, tabId?: number): Promise<Blob | null> {
  if (srcUrl.startsWith('data:')) return dataUrlToBlob(srcUrl);
  try {
    const res = await fetch(srcUrl);
    if (res.ok) return await res.blob();
  } catch {
    // Cross-origin without access; try from the page below.
  }
  if (tabId == null) return null;
  try {
    const [result] = await browser.scripting.executeScript({ target: { tabId }, func: fetchImageInPage, args: [srcUrl] });
    const dataUrl = result?.result as string | null;
    return dataUrl ? dataUrlToBlob(dataUrl) : null;
  } catch {
    return null;
  }
}

async function saveImageFromUrl(srcUrl: string, tab?: Browser.tabs.Tab) {
  const blob = await fetchImage(srcUrl, tab?.id);
  if (!blob) {
    await flashBadge('!', '#B42318');
    return;
  }
  try {
    const fileName = decodeURIComponent(new URL(srcUrl, tab?.url).pathname.split('/').pop() ?? '') || undefined;
    const clip = await saveImageClip({ blob, source: sourceOf(tab), srcUrl, fileName });
    await toastInTab(tab?.id, clip, 'Image saved');
  } catch (e) {
    console.warn('Image not saved', e instanceof ImageError ? e.message : e);
    await flashBadge('!', '#B42318');
  }
}

async function screenshotArea(tab?: Browser.tabs.Tab) {
  if (tab?.id == null || tab.windowId == null) return;
  type Area = { x: number; y: number; w: number; h: number; dpr: number };
  let area = null as Area | null;
  try {
    const [result] = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: selectArea });
    area = (result?.result as Area | null | undefined) ?? null;
  } catch {
    await flashBadge('!', '#B42318');
    return;
  }
  if (!area) return;
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
  const clip = await saveImageClip({
    blob,
    source: sourceOf(tab),
    fileName: `Screenshot of ${tab.title ?? 'page'}`.slice(0, 80),
  });
  await toastInTab(tab.id, clip, 'Screenshot saved');
}

async function blockSiteOf(tab?: Browser.tabs.Tab) {
  const host = tab?.url ? new URL(tab.url).hostname.replace(/^www\./, '') : undefined;
  if (!host) return;
  const s = await getSettings();
  if (!s.blockedSites.includes(host)) await updateSettings({ blockedSites: [...s.blockedSites, host] });
  await flashBadge('off', '#555A6E');
}

async function handleAutosave(msg: { text: string; html?: string; title?: string }, sender: Browser.runtime.MessageSender) {
  const s = await getSettings();
  if (!s.autoSave || isPaused(s)) return;
  const tab = sender.tab;
  const url = sender.url ?? tab?.url;
  if (isBlocked(url, s.blockedSites) || isBlocked(tab?.url, s.blockedSites)) return;
  if (tab?.incognito && !s.saveInIncognito) return;
  const clip = await saveClip({
    text: msg.text,
    html: msg.html,
    source: { url: tab?.url ?? url, title: tab?.title ?? msg.title, favicon: tab?.favIconUrl },
  });
  if (clip) await flashBadge('✓', '#0E7A62');
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
  await browser.storage.session.set({ [OPEN_CLIP_KEY]: { clipId, at: Date.now() } });
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
  } catch {
    // Chrome pages, the Web Store and PDFs don't allow scripts: use the side panel instead.
    await flashBadge('×', '#5B6170');
  }
}

async function quickPasteClips(): Promise<{ clips: QuickClip[]; aiReady: boolean }> {
  const [clips, collections, ai] = await Promise.all([listClips(), db.collections.toArray(), nanoAvailability()]);
  const byId = new Map(collections.map((c) => [c.id, c]));
  return {
    aiReady: ai === 'available',
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
          host: hostOf(c.source?.url) || undefined,
          collection: col?.name,
          color: col ? colorOf(col).accent : undefined,
        };
      }),
  };
}

async function quickPasteTransform(id: string, transform: Transform): Promise<string | null> {
  const clip = await db.clips.get(id);
  if (!clip) return null;
  if (isAiTransform(transform)) return applyAi(transform, clip.text, { lang: navigator.language.slice(0, 2) });
  return applyPlain(transform, clip.text, clip.html);
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener((details) => {
    createMenus();
    void browser.alarms.create(ALARM_CLEANUP, { periodInMinutes: 24 * 60 });
    void syncAutosaveRegistration();
    if (details.reason === 'install') {
      void browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html?onboarding=1') });
    }
  });

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

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_CLEANUP) void cleanup();
  });

  // If the user removes the all-sites permission in Chrome, stop auto-save.
  browser.permissions.onRemoved.addListener(() => void syncAutosaveRegistration());

  // The toolbar button opens the popup (recent clips); the popup opens the panel.
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

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === 'save-selection') void saveSelectionFromTab(tab);
    if (command === 'screenshot-area') void screenshotArea(tab);
    if (command === 'quick-paste') void openQuickPaste(tab);
  });

  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'autosave-copy':
        void handleAutosave(msg, sender);
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
      case 'qp-transform':
        void quickPasteTransform(msg.id, msg.transform).then(sendResponse, () => sendResponse(null));
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
  });
});
