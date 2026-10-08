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

/** Registers or unregisters the auto-save content script to match settings + permission. */
export async function syncAutosaveRegistration(): Promise<boolean> {
  const [settings, granted] = await Promise.all([getSettings(), hasAllSitesAccess()]);
  const shouldRun = settings.autoSave && granted;
  const existing = await browser.scripting.getRegisteredContentScripts({ ids: [AUTOSAVE_SCRIPT.id] });
  if (shouldRun) {
    // Updating keeps a registration from an earlier version in step with these options.
    if (existing.length) await browser.scripting.updateContentScripts([AUTOSAVE_SCRIPT]);
    else await browser.scripting.registerContentScripts([AUTOSAVE_SCRIPT]);
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

export async function disableAutosave(): Promise<void> {
  await updateSettings({ autoSave: false });
  await browser.runtime.sendMessage({ type: 'autosave-sync' }).catch(() => syncAutosaveRegistration());
}
