# Copy shortcuts

Every way a user gets text into Clipboard and back out: the copy and cut keys (with auto-save on), Copy from the right-click or Edit menu, the extension's own shortcuts, and pasting back into the panel or a page.

## Sub-features

- `keys-copy` Ctrl/Cmd+C saves from a paragraph, text field, textarea, rich-text editor, same-origin frame and cross-origin frame.
- `keys-cut` Ctrl/Cmd+X saves from fields and editors, and the text leaves the field.
- `keys-windows` Ctrl+Insert copies and Shift+Delete cuts (Windows and Linux only).
- `menu-copy` Copy from the right-click or Edit menu saves the same way.
- `ext-save-selection` Alt+Shift+S saves the selection, even with auto-save off.
- `ext-quick-paste` Alt+Shift+V opens the quick-paste box; Enter pastes into the focused field.
- `ext-screenshot` Alt+Shift+X starts the area screenshot tool.
- `paste-panel` Ctrl/Cmd+V into the side panel saves a clip.
- `paste-page` the panel's Copy button, then Ctrl/Cmd+V into a page field.

## How to get to it (user POV)

- Select text on any page and press the copy or cut key, or right-click → Copy, or Edit → Copy (auto-save on in Settings).
- Press Alt+Shift+S / Alt+Shift+V / Alt+Shift+X on a page (chrome://extensions/shortcuts shows and changes them).
- Press Ctrl/Cmd+V with the side panel focused; click a clip's Copy button and paste anywhere.

## Driving it with Playwright

Preconditions:

- Baseline from the index; auto-save turned on for the key cases; a routed page with a paragraph, field, textarea, contenteditable editor, srcdoc iframe and a cross-origin iframe.

- **Keys.** Select with `locator.selectText()` (click into a frame first, as a user would, so keyboard focus moves there), then `page.keyboard.press('ControlOrMeta+C')` or `'ControlOrMeta+X'`. Poll `readClips` for the text.
- **Menu copy.** `frame.evaluate(() => document.execCommand('copy'))`: the command both menus run.
- **Extension shortcuts.** `chrome.commands.getAll()` from an extension page shows each key bound; `chrome.runtime.sendMessage({ type: 'e2e-command', command, tabId })` runs the same handler the shortcut does (E2E build only).
- **Paste back.** `navigator.clipboard.writeText` from the panel, then `ControlOrMeta+V` on the panel; Copy button, then `ControlOrMeta+V` into the page textarea.
- **Proof.** `tests/e2e/shortcuts.clipboard.spec.ts` covers all of the above.

## Gotchas

- On pages Chrome blocks (`chrome://version` works in tests), a shortcut leaves a × on that tab's toolbar icon until the tab loads another page; with auto-save on, × also marks blocked pages and blocked sites. Read it with `chrome.action.getBadgeText({ tabId })`.
- Timed badge flashes (✓, !) use `setTimeout` in the service worker, which can fire late when the worker is idle; don't assert they clear within a fixed time.
- Labels come from `chrome.commands.getAll()` (⌥⇧S on a Mac); compare UI text against it, not against "Alt+Shift".
- Playwright can't press extension shortcuts or click Chrome's native menus. Report those entry points as substituted (`e2e-command`, `execCommand('copy')`), and press Alt+Shift+S/V/X once by hand.
- `selectText()` in a frame doesn't move keyboard focus into it. Without a click first, the key goes to the previously focused element.
- On macOS, Ctrl+C, Ctrl+Insert and Shift+Delete don't copy in Chrome; the Windows/Linux key test skips there.
- These copies overwrite the real system clipboard.
