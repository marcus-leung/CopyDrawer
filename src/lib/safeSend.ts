/** True while this script can still reach the extension. A reload or update cuts off scripts already running in pages. */
export function extensionAlive(): boolean {
  return !!browser.runtime?.id;
}

/**
 * Sends a message to the background. Once the extension was reloaded or updated,
 * Chrome throws "Extension context invalidated" right away (not as a rejection);
 * this resolves to undefined instead.
 */
export function safeSend<T = unknown>(msg: object): Promise<T | undefined> {
  if (!extensionAlive()) return Promise.resolve(undefined);
  try {
    return (browser.runtime.sendMessage(msg) as Promise<T>).catch(() => undefined);
  } catch {
    return Promise.resolve(undefined);
  }
}
