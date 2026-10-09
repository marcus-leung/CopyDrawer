// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeSend } from '@/lib/safeSend';
import { watchCopies } from '@/lib/copyWatcher';

const setId = (id: string | undefined) => Object.defineProperty(browser.runtime, 'id', { value: id, configurable: true });

afterEach(() => {
  vi.restoreAllMocks();
  setId('test-extension');
});

function copy(text: string) {
  const data = new DataTransfer();
  data.setData('text/plain', text);
  window.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data }));
}

describe('after the extension is reloaded', () => {
  it('safeSend resolves instead of throwing', async () => {
    const send = vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(() => {
      throw new Error('Extension context invalidated.');
    });
    setId('test-extension');
    await expect(safeSend({ type: 'x' })).resolves.toBeUndefined();
    setId(undefined);
    await expect(safeSend({ type: 'x' })).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('the copy watcher sends copies, then stops listening once cut off', () => {
    const send = vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue(undefined);
    setId('test-extension');
    const stop = watchCopies(window);
    copy('first');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'autosave-copy', text: 'first' }));

    setId(undefined);
    expect(() => copy('second')).not.toThrow();
    setId('test-extension');
    copy('third');
    expect(send).toHaveBeenCalledTimes(1);
    stop();
  });
});
