import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getSettings, settingsItem, validSynced, type Settings } from '@/lib/settings';

beforeEach(() => fakeBrowser.reset());

describe('font setting', () => {
  it("reads the old 'System' choice, now the same as Default, as Default", async () => {
    await settingsItem.setValue({ font: 'system' } as unknown as Settings);
    expect((await getSettings()).font).toBe('default');
    expect(validSynced({ font: 'system' }).font).toBe('default');
    expect(validSynced({ font: 'mono' }).font).toBe('mono');
    expect(validSynced({ font: 'comic sans' }).font).toBeUndefined();
  });
});
