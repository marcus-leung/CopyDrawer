import { getSettings, updateSettings } from './settings';
import { BUILT_IN_BLOCKED, isBuiltInBlocked } from './exclusions';

const ALL_SITES = { origins: ['<all_urls>'] };
const SCRIPT_OPTIONS = {
  matches: ['<all_urls>'],
  // Sites never saved from don't get the scripts at all, so nothing copied there leaves the page.
  excludeMatches: BUILT_IN_BLOCKED.flatMap((site) => [`*://${site}/*`, `*://*.${site}/*`]),
  allFrames: true,
  // Also about:blank and srcdoc frames, where many rich-text editors live.
  matchOriginAsFallback: true,
  runAt: 'document_start' as const,
  persistAcrossSessions: true,
};
/** The copy watcher, and the page-world hook that tells it about copy buttons. */
const AUTOSAVE_SCRIPTS = [
  { ...SCRIPT_OPTIONS, id: 'autosave', js: ['content-scripts/autosave.js'], world: 'ISOLATED' as const },
  { ...SCRIPT_OPTIONS, id: 'autosave-main', js: ['content-scripts/clipboardhook.js'], world: 'MAIN' as const },
];
const IDS = AUTOSAVE_SCRIPTS.map((s) => s.id);

export async function hasAllSitesAccess(): Promise<boolean> {
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
    tabs.flatMap((tab) =>
      tab.id == null || isBuiltInBlocked(tab.url)
        ? []
        : AUTOSAVE_SCRIPTS.map((script) =>
            browser.scripting
              .executeScript({ target: { tabId: tab.id!, allFrames: true }, files: script.js, world: script.world })
              .catch(() => {
                // Pages Chrome won't let extensions script (the Web Store, error pages).
              }),
          ),
    ),
  );
}

let syncing: Promise<unknown> = Promise.resolve();

/**
 * Registers or unregisters the auto-save content script to match settings + permission. Runs one at a time:
 * granting access fires the permission event and the panel's request together, and both would register.
 */
export function syncAutosaveRegistration(): Promise<boolean> {
  const run = syncing.then(syncNow, syncNow);
  syncing = run;
  return run;
}

async function syncNow(): Promise<boolean> {
  const [settings, granted] = await Promise.all([getSettings(), hasAllSitesAccess()]);
  const shouldRun = settings.autoSave && granted;
  const existing = new Set((await browser.scripting.getRegisteredContentScripts({ ids: IDS })).map((s) => s.id));
  if (shouldRun) {
    // A registration persists across sessions; updating keeps it in step with these options.
    const fresh = AUTOSAVE_SCRIPTS.filter((s) => !existing.has(s.id));
    const kept = AUTOSAVE_SCRIPTS.filter((s) => existing.has(s.id));
    if (kept.length) await browser.scripting.updateContentScripts(kept);
    if (fresh.length) {
      await browser.scripting.registerContentScripts(fresh);
      await injectIntoOpenTabs();
    }
  } else if (existing.size) {
    await browser.scripting.unregisterContentScripts({ ids: [...existing] });
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

/** All-sites access was taken away (in chrome://extensions): auto-save can't run, so it's off, and the UI says so. */
export async function onPermissionsRemoved(removed: { origins?: string[] }): Promise<void> {
  if (removed.origins?.includes('<all_urls>')) await updateSettings({ autoSave: false });
  await syncAutosaveRegistration();
}

/** Turns auto-save off and gives back the all-sites access it needed. */
export async function disableAutosave(): Promise<void> {
  await updateSettings({ autoSave: false });
  // Fails only when the access can't be removed (the test build grants it in the manifest).
  await browser.permissions.remove(ALL_SITES).catch(() => false);
  await browser.runtime.sendMessage({ type: 'autosave-sync' }).catch(() => syncAutosaveRegistration());
}
