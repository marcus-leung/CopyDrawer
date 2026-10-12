import { notSavedHere } from './exclusions';
import { getSettings, type Settings } from './settings';

const CROSS_COLOR = '#5B6170';
// Pages with a web address where Chrome still won't run extension scripts. A guess from the address, so it only
// decides the badge: a page that sends a copy can be seen, whatever its address.
const UNSCRIPTABLE = /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)\/|\.pdf([?#]|$)/i;

/** True when auto-save is on but copies on this tab can't be seen or aren't saved: the toolbar icon shows ×. */
export function copiesHidden(
  tab: { url?: string; incognito?: boolean },
  s: Pick<Settings, 'autoSave' | 'blockedSites' | 'saveInIncognito'>,
): boolean {
  return s.autoSave && (notSavedHere(tab, s) || UNSCRIPTABLE.test(tab.url ?? ''));
}

// Tabs where Chrome refused a shortcut, until they load another page. Session storage outlives the service worker.
const REFUSED_KEY = 'refusedTabs';
const refusedTabs = async () => ((await browser.storage.session.get(REFUSED_KEY))[REFUSED_KEY] as number[] | undefined) ?? [];

/** The error Chrome gives when it keeps extensions out of a page, as opposed to a passing hiccup (a tab mid-load or closed). */
export function refusedByChrome(error: unknown): boolean {
  return /cannot (access|be scripted)/i.test(error instanceof Error ? error.message : String(error));
}

/** Chrome wouldn't let a shortcut script this tab (chrome:// pages, the Web Store, PDFs): × until it loads another page. */
export async function markRefused(tab: Browser.tabs.Tab) {
  if (tab.id == null) return;
  const ids = await refusedTabs();
  if (!ids.includes(tab.id)) await browser.storage.session.set({ [REFUSED_KEY]: [...ids, tab.id] });
  await refreshTabBadge(tab);
}

export async function forgetRefused(tabId: number) {
  const ids = await refusedTabs();
  if (ids.includes(tabId)) await browser.storage.session.set({ [REFUSED_KEY]: ids.filter((id) => id !== tabId) });
}

/** Sets a tab's own badge: × where copies are hidden or a shortcut was refused, otherwise nothing. */
export async function refreshTabBadge(tab: Browser.tabs.Tab, settings?: Settings, refused?: number[]) {
  if (tab.id == null) return;
  const hidden = copiesHidden(tab, settings ?? (await getSettings())) || (refused ?? (await refusedTabs())).includes(tab.id);
  await browser.action.setBadgeBackgroundColor({ tabId: tab.id, color: CROSS_COLOR });
  await browser.action.setBadgeText({ tabId: tab.id, text: hidden ? '×' : '' });
  await browser.action.setTitle({ tabId: tab.id, title: hidden ? "CopyDrawer can't work on this page" : '' });
}

export async function refreshAllTabBadges() {
  const [tabs, settings, refused] = await Promise.all([browser.tabs.query({}), getSettings(), refusedTabs()]);
  await Promise.all(tabs.map((tab) => refreshTabBadge(tab, settings, refused).catch(() => {})));
}
