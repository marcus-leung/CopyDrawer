import { getSettings, updateSettings } from './settings';

export const AUTOSAVE_SCRIPT_ID = 'autosave';
const ALL_SITES = { origins: ['<all_urls>'] };

export async function hasAllSitesAccess(): Promise<boolean> {
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
  const existing = await browser.scripting.getRegisteredContentScripts({ ids: [AUTOSAVE_SCRIPT_ID] });
  if (shouldRun && existing.length === 0) {
    await browser.scripting.registerContentScripts([
      {
        id: AUTOSAVE_SCRIPT_ID,
        js: ['content-scripts/autosave.js'],
        matches: ['<all_urls>'],
        allFrames: true,
        runAt: 'document_start',
        persistAcrossSessions: true,
      },
    ]);
  } else if (!shouldRun && existing.length > 0) {
    await browser.scripting.unregisterContentScripts({ ids: [AUTOSAVE_SCRIPT_ID] });
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
