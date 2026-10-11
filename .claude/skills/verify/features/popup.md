# Popup

The toolbar popup is the full app: clips, collections, search, add, settings. A button hands the current screen and search over to the side panel.

## Sub-features

- `popup-list` shows saved clips under the `Your clips` heading.
- `popup-search` filters clips.
- `popup-expand` opens the side panel with the same search.
- `popup-settings` reaches Settings from the popup.

## How to get to it (user POV)

- Click the Clipboard icon in Chrome's toolbar.

## Driving it with Playwright

Preconditions:

- Baseline from the index, plus at least one clip (paste into the panel with `pasteIntoPanel` or copy via auto-save).

- **Open.** `page.goto(\`chrome-extension://${extensionId}/popup.html\`)`. `getByRole('heading', { name: 'Your clips' })` is visible.
- **List.** `getByRole('list', { name: 'Clips' }).getByRole('listitem')` has the expected count and text.
- **Search.** `getByLabel('Search your clips').fill('<word>')` narrows the list.
- **Expand.** With a side panel tab open, click `getByRole('button', { name: 'Open in side panel' })`. The panel's `Search your clips` has the same value.
- **Proof.** `capture(popup, 'popup', '<step>')` after each step.

## Gotchas

- A toolbar click can't be scripted. Opening `popup.html` in a tab is the substitute; report it as such.
- In a tab, the popup size setting doesn't apply.
- A first-run tip (`Try pasting it back`, `Got it`) can sit above the list.
