import { describe, expect, it } from 'vitest';
import { formatShortcut } from '@/lib/shortcuts';

describe('formatShortcut', () => {
  it('writes keys the way Chrome shows them on each platform', () => {
    expect(formatShortcut('Alt+Shift+S', true)).toBe('⌥⇧S');
    expect(formatShortcut('Shift+Alt+V', true)).toBe('⌥⇧V');
    expect(formatShortcut('Ctrl+Shift+Y', true)).toBe('⇧⌘Y');
    expect(formatShortcut('MacCtrl+Alt+X', true)).toBe('⌃⌥X');
    expect(formatShortcut('Alt+Shift+S', false)).toBe('Alt+Shift+S');
  });
});
