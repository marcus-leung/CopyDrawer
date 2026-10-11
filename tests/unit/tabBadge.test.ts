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
