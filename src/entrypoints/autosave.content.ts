/**
 * Auto-save: notices copy/cut on web pages and sends the copied text (or a
 * selected image) to the background. Registered at runtime only after the user grants all-sites
 * access, so it's not in the manifest.
 */
import { watchCopies } from '@/lib/copyWatcher';

declare global {
  interface Window {
    __clipboardAutosave?: boolean;
  }
}

export default defineContentScript({
  registration: 'runtime',
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  main() {
    // Already-open pages get the script when auto-save starts; listen once even if it arrives twice.
    if (window.__clipboardAutosave) return;
    window.__clipboardAutosave = true;
    watchCopies(window);
  },
});
