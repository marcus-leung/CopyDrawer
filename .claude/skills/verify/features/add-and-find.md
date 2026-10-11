# Add and find clips

The user adds clips by pasting into the side panel, finds them with search and filters, copies one back, and can delete with undo.

## Sub-features

- `add-paste` saves text pasted (Ctrl/Cmd+V) anywhere in the panel.
- `find-search` matches every word, in any order, with typo tolerance.
- `find-filters` narrows by Type, Site and Date.
- `copy-back` puts a clip on the clipboard.
- `delete-undo` deletes a clip and restores it with Undo.

## How to get to it (user POV)

- Open the side panel or popup and press Ctrl/Cmd+V.
- Type in `Search your clips`; open `Filters`.
- Click a clip's `Copy` button, or open it and choose `Delete`.

## Driving it with Playwright

Preconditions:

- Baseline from the index. Empty state heading `Save something to start` is visible.

- **Paste.** `pasteIntoPanel(panel, 'text', ...)` from `tests/e2e/helpers.ts`. `getByRole('list', { name: 'Clips' })` gains one listitem per text.
- **Search.** `getByRole('searchbox', { name: 'Search your clips' }).fill('garlic')`. The list narrows and `1 clip matches` shows.
- **Filter.** Click `getByRole('button', { name: 'Filters' })`, then `getByLabel('Type').selectOption('link')`.
- **Copy back.** Click the listitem's `getByRole('button', { name: 'Copy' })`. Status contains `Copied`; `navigator.clipboard.readText()` returns the text.
- **Delete and undo.** Open the clip (`getByRole('button', { name: /<text>/ })`), click `Delete`, status `Clip deleted`, click `Undo`. The listitem returns.
- **Proof.** Capture after paste, search and undo; `readClips` confirms the stored rows.

## Gotchas

- `pasteIntoPanel` dispatches a synthetic paste event. It is the closest scriptable path to a real Ctrl+V on the panel; say so when reporting.
- Copy back writes the real system clipboard.
