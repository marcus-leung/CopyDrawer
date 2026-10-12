import { describe, expect, it } from 'vitest';
import { copiesHidden } from '@/lib/tabBadge';

const on = { autoSave: true, blockedSites: ['news.example.com'], saveInIncognito: false };

describe('copiesHidden: where the toolbar icon shows ×', () => {
  it('marks pages where auto-save is on but copies are not seen', () => {
    expect(copiesHidden({ url: 'https://en.wikipedia.org/wiki/Lisbon' }, on)).toBe(false);
    expect(copiesHidden({ url: undefined }, on)).toBe(true); // chrome:// and extension pages hide their address
    expect(copiesHidden({ url: 'https://news.example.com/today' }, on)).toBe(true);
    expect(copiesHidden({ url: 'https://www.chase.com/' }, on)).toBe(true);
    expect(copiesHidden({ url: 'https://chromewebstore.google.com/detail/x' }, on)).toBe(true);
    expect(copiesHidden({ url: 'https://chrome.google.com/webstore/detail/x' }, on)).toBe(true);
    expect(copiesHidden({ url: 'https://example.org/menu.pdf' }, on)).toBe(true);
    expect(copiesHidden({ url: 'https://example.org/', incognito: true }, on)).toBe(true);
    expect(copiesHidden({ url: 'https://example.org/', incognito: true }, { ...on, saveInIncognito: true })).toBe(false);
  });

  it('marks nothing while auto-save is off', () => {
    const off = { ...on, autoSave: false };
    for (const url of [undefined, 'https://www.chase.com/', 'https://example.org/menu.pdf']) {
      expect(copiesHidden({ url }, off)).toBe(false);
    }
  });
});

describe('refusedByChrome: when a failed shortcut gets the ×', () => {
  it('only for pages Chrome keeps extensions out of', async () => {
    const { refusedByChrome } = await import('@/lib/tabBadge');
    for (const m of [
      'Cannot access a chrome:// URL',
      'The extensions gallery cannot be scripted.',
      'Cannot access contents of url "chrome-extension://abc/page.html". Extension manifest must request permission to access this host.',
    ])
      expect([m, refusedByChrome(new Error(m))]).toEqual([m, true]);
    for (const m of ['Frame with ID 0 is showing error page', 'No tab with id: 5.', 'The tab was closed.'])
      expect([m, refusedByChrome(new Error(m))]).toEqual([m, false]);
  });
});

describe('notSavedHere and the badge', () => {
  it('saving trusts that a page that sent a copy can be seen; only the badge guesses from the address', async () => {
    const { notSavedHere } = await import('@/lib/exclusions');
    const viewer = { url: 'https://viewer.example/web/viewer.html?file=report.pdf' };
    expect(notSavedHere(viewer, on)).toBe(false);
    expect(copiesHidden(viewer, on)).toBe(true);
  });
});
