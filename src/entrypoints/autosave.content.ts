/**
 * Auto-save: notices copy/cut on web pages and sends the copied text (or a
 * selected image) to the background. Registered at runtime only after the user grants all-sites
 * access, so it's not in the manifest.
 */
import { watchCopies } from '@/lib/copyWatcher';

declare global {
  interface Window {
    /** Stops this tab's current copy watcher. */
    __clipboardAutosave?: () => void;
  }
}

export default defineContentScript({
  registration: 'runtime',
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  main() {
    // The script can arrive twice (open tabs get it when auto-save starts or the extension updates).
    // The newest copy takes over, so a watcher cut off by an update never blocks its replacement.
    window.__clipboardAutosave?.();
    window.__clipboardAutosave = watchCopies(window);
  },
});
