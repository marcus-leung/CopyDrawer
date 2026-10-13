/**
 * Auto-save for copy buttons: runs in the page's own world to notice clipboard writes that fire no copy
 * event (see clipboardHook.ts). Registered next to the auto-save script, only while auto-save is on.
 */
import { hookClipboardWrites } from '@/lib/clipboardHook';

export default defineContentScript({
  registration: 'runtime',
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    hookClipboardWrites(window);
  },
});
