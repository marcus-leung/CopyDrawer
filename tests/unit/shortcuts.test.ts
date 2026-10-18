import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatShortcut, suggestedShortcut } from '@/lib/shortcuts';

describe('formatShortcut', () => {
  it('writes keys the way Chrome shows them on each platform', () => {
    expect(formatShortcut('Alt+Shift+S', true)).toBe('⌥⇧S');
    expect(formatShortcut('Shift+Alt+V', true)).toBe('⌥⇧V');
    expect(formatShortcut('Ctrl+Shift+Y', true)).toBe('⇧⌘Y');
    expect(formatShortcut('MacCtrl+Alt+X', true)).toBe('⌃⌥X');
    expect(formatShortcut('Alt+Shift+S', false)).toBe('Alt+Shift+S');
  });
});

describe('suggestedShortcut', () => {
  afterEach(() => vi.restoreAllMocks());

  it("gives each OS its own default keys from the manifest, written the way that OS's Chrome shows them", () => {
    vi.spyOn(browser.runtime, 'getManifest').mockReturnValue({
      manifest_version: 3,
      name: 'CopyDrawer',
      version: '1',
      commands: {
        'save-selection': { suggested_key: { default: 'Alt+Shift+S' } },
        'screenshot-area': { suggested_key: { default: 'Alt+Shift+D', mac: 'Alt+Shift+X' } },
        'quick-paste': { suggested_key: { default: 'Alt+Shift+V' } },
      },
    });
    expect(suggestedShortcut('save-selection', 'MacIntel')).toBe('⌥⇧S');
    expect(suggestedShortcut('quick-paste', 'MacIntel')).toBe('⌥⇧V');
    expect(suggestedShortcut('screenshot-area', 'MacIntel')).toBe('⌥⇧X');
    expect(suggestedShortcut('save-selection', 'Win32')).toBe('Alt+Shift+S');
    expect(suggestedShortcut('quick-paste', 'Win32')).toBe('Alt+Shift+V');
    expect(suggestedShortcut('screenshot-area', 'Win32')).toBe('Alt+Shift+D');
    expect(suggestedShortcut('screenshot-area', 'Linux x86_64')).toBe('Alt+Shift+D');
  });
});
