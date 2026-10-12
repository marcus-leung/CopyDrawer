# Quick paste

On any page, Alt+Shift+V opens a small box over the focused field. The user filters their clips and presses Enter to paste one into the field.

## Sub-features

- `qp-open` opens the box with focus in `Filter clips`, most recent clip first.
- `qp-filter` narrows options as the user types.
- `qp-paste` pastes the highlighted clip into text inputs, textareas and contenteditable.
- `qp-dismiss` closes the box without pasting.

## How to get to it (user POV)

- Focus a field on a web page and press Alt+Shift+V.

## Driving it with Playwright

Preconditions:

- Baseline from the index, clips added with `pasteIntoPanel`, and a routed `https://form.e2e.test/` page with an input.

- **Open.** Focus the field (`page.locator('#name').click()`). From the panel, `chrome.runtime.sendMessage({ type: 'e2e-menu', action: 'quick-paste', tabId })` with the form tab's id. `getByRole('combobox', { name: 'Filter clips' })` is focused and `getByRole('dialog', { name: 'Quick paste' })` is visible.
- **Filter.** `page.keyboard.type('alex m')`. `getByRole('option')` count drops.
- **Paste.** `page.keyboard.press('Enter')`. The field's value is the clip text and the dialog is gone.
- **Proof.** Capture the open box and the filled field.

## Gotchas

- The real shortcut can't be pressed from Playwright. The `e2e-menu` message exists only in the E2E build. Report the shortcut itself as unverified.
- The box lives in a shadow root (`#copydrawer-quick-paste`). Role locators pierce it; CSS locators need the shadow root.
- `tests/e2e/find-and-paste.clipboard.spec.ts` (`setupQuickPaste`) has a full working setup to copy from.
