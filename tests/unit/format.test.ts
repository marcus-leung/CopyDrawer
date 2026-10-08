import { describe, expect, it } from 'vitest';
import { modKey } from '@/lib/format';

describe('modKey', () => {
  it('names the key people actually press', () => {
    expect(modKey('V', 'MacIntel')).toBe('Cmd+V');
    expect(modKey('C', 'Win32')).toBe('Ctrl+C');
    expect(modKey('V', 'Linux x86_64')).toBe('Ctrl+V');
  });
});
