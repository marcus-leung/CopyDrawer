import { getSettings, updateSettings } from './settings';

const ALL_SITES = { origins: ['<all_urls>'] };
const AUTOSAVE_SCRIPT = {
  id: 'autosave',
  js: ['content-scripts/autosave.js'],
  matches: ['<all_urls>'],
  allFrames: true,
  // Also about:blank and srcdoc frames, where many rich-text editors live.
  matchOriginAsFallback: true,
  runAt: 'document_start' as const,
  persistAcrossSessions: true,
};

async function hasAllSitesAccess(): Promise<boolean> {
  try {
    return await browser.permissions.contains(ALL_SITES);
  } catch {
    return false;
  }
}

/** Pages that were open before auto-save started: give them the script now, no reload needed. */
export async function injectIntoOpenTabs() {
  const tabs = await browser.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.all(
    tabs.map((tab) =>
      tab.id == null
        ? undefined
        : browser.scripting
            .executeScript({ target: { tabId: tab.id, allFrames: true }, files: [AUTOSAVE_SCRIPT.js[0]!] })
            .catch(() => {
              // Pages Chrome won't let extensions script (the Web Store, error pages).
            }),
    ),
  );
}

/** Registers or unregisters the auto-save content script to match settings + permission. */
export async function syncAutosaveRegistration(): Promise<boolean> {
  const [settings, granted] = await Promise.all([getSettings(), hasAllSitesAccess()]);
  const shouldRun = settings.autoSave && granted;
  const existing = await browser.scripting.getRegisteredContentScripts({ ids: [AUTOSAVE_SCRIPT.id] });
  if (shouldRun) {
    // Updating keeps a registration from an earlier version in step with these options.
    if (existing.length) await browser.scripting.updateContentScripts([AUTOSAVE_SCRIPT]);
    else {
      await browser.scripting.registerContentScripts([AUTOSAVE_SCRIPT]);
      await injectIntoOpenTabs();
    }
  } else if (existing.length) {
    await browser.scripting.unregisterContentScripts({ ids: [AUTOSAVE_SCRIPT.id] });
  }
  return shouldRun;
}

/**
 * Turns auto-save on. Must be called from a click (Chrome only shows the
 * permission prompt in response to a user gesture). Returns false if declined.
 */
export async function enableAutosave(): Promise<boolean> {
  const granted = (await hasAllSitesAccess()) || (await browser.permissions.request(ALL_SITES));
  if (!granted) return false;
  await updateSettings({ autoSave: true, pausedUntil: 0 });
  await browser.runtime.sendMessage({ type: 'autosave-sync' }).catch(() => syncAutosaveRegistration());
  return true;
}

/**
 * All-sites access was just granted. The extension only asks for it to run
 * auto-save, so this turns auto-save on. It runs in the background because
 * Chrome's permission prompt closes the toolbar popup that asked for it.
 */
export async function onPermissionsAdded(added: { origins?: string[] }): Promise<void> {
  if (!added.origins?.includes('<all_urls>')) return;
  await updateSettings({ autoSave: true, pausedUntil: 0 });
  await syncAutosaveRegistration();
}

export async function disableAutosave(): Promise<void> {
  await updateSettings({ autoSave: false });
  await browser.runtime.sendMessage({ type: 'autosave-sync' }).catch(() => syncAutosaveRegistration());
}
