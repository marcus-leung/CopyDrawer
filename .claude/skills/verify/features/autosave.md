# Auto-save copies

With auto-save on, text or an image the user copies on a web page becomes a clip labeled with the site it came from. Password fields and blocked sites are never saved, and auto-save can be paused.

## Sub-features

- `autosave-toggle` turns auto-save on and off from Settings.
- `autosave-text` saves selected text copied with Ctrl/Cmd+C.
- `autosave-source` labels the clip "From <host>".
- `autosave-skip-password` never saves a copied password field.
- `autosave-blocked` skips sites in Blocked sites.
- `autosave-pause` pauses saving for an hour.

## How to get to it (user POV)

- Side panel or popup, `Settings` button, `Save what I copy automatically` switch.
- Then copy anything on a normal web page.

## Driving it with Playwright

Preconditions:

- Baseline from the index. The E2E build already holds all-sites access, so the switch turns on without a Chrome permission prompt.

- **Turn on.** Open `sidepanel.html`, click `getByRole('button', { name: 'Settings' })`, then `getByLabel('Save what I copy automatically').click()`. Wait for `toBeChecked()`; a status reads `Auto-save is on`.
- **Copy text.** Route `https://<name>.e2e.test/` to a page, `locator('#id').selectText()`, `keyboard.press('ControlOrMeta+C')`.
- **Stored.** `expect.poll(() => readClips(panel))` contains the copied text.
- **Visible.** In `popup.html` or the panel, `getByRole('list', { name: 'Clips' })` has a listitem with the text and `From <host>`.
- **Proof.** `specs/autosave-to-popup.spec.ts` runs this whole path and captures three steps.

## Gotchas

- Don't use Playwright's `check()` on the switch. It flips only after an async permission check and settings write, so `check()` fails intermittently with "Clicking the checkbox did not change its state".
- The copy reaches the background asynchronously. Poll `readClips`; don't assert right after the keypress.
- The real clipboard is overwritten by the copy.
- `tests/e2e/autosave.spec.ts` turns auto-save on by writing `chrome.storage`. Fine for regression tests, but use the switch when proving the setting itself.
- Blocked sites match by host. Use a separate `*.e2e.test` host for the blocked case.
