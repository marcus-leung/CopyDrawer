import { deleteOlderThan, saveClip } from '@/lib/clips';
import { getSettings } from '@/lib/settings';

const MENU_SAVE_SELECTION = 'save-selection';
const ALARM_CLEANUP = 'daily-cleanup';

async function cleanup() {
  const { retentionDays } = await getSettings();
  await deleteOlderThan(retentionDays);
}

interface SelectionPayload {
  text: string;
  html: string;
}

/** Runs in the page: returns the current selection as text and HTML. */
function readSelection(): SelectionPayload {
  const sel = window.getSelection();
  const text = sel?.toString() ?? '';
  let html = '';
  if (sel && sel.rangeCount > 0) {
    const box = document.createElement('div');
    for (let i = 0; i < sel.rangeCount; i++) box.appendChild(sel.getRangeAt(i).cloneContents());
    html = box.innerHTML;
  }
  return { text, html };
}

async function flashBadge(text: string, color: string) {
  await browser.action.setBadgeBackgroundColor({ color });
  await browser.action.setBadgeText({ text });
  setTimeout(() => browser.action.setBadgeText({ text: '' }), 1500);
}

async function saveSelectionFromTab(tab: Browser.tabs.Tab | undefined, fallbackText?: string) {
  if (!tab?.id) return;
  let payload: SelectionPayload | undefined;
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      func: readSelection,
    });
    payload = result?.result as SelectionPayload | undefined;
  } catch {
    // Pages like chrome:// or the Web Store can't be scripted; fall back below.
  }
  const text = payload?.text?.trim() ? payload.text : (fallbackText ?? '');
  const clip = await saveClip({
    text,
    html: payload?.html,
    source: { url: tab.url, title: tab.title, favicon: tab.favIconUrl },
  });
  if (clip) await flashBadge('✓', '#0E7A62');
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: MENU_SAVE_SELECTION,
      title: 'Save selection',
      contexts: ['selection'],
    });
    void browser.alarms.create(ALARM_CLEANUP, { periodInMinutes: 24 * 60 });
  });

  browser.runtime.onStartup.addListener(() => void cleanup());
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_CLEANUP) void cleanup();
  });

  // Clicking the toolbar icon opens the side panel.
  browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_SAVE_SELECTION) {
      void saveSelectionFromTab(tab, info.selectionText);
    }
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === 'save-selection') void saveSelectionFromTab(tab);
  });
});
