# Copy several clips at once

Pick clips in the panel and copy, move or delete them together. Picks are numbered in pick order, which is the paste order. Quick paste can pick several with Tab.

## Sub-features

- `pick` checkbox on hover, Cmd/Ctrl-click, Shift-click range (in the list's on-screen order), Cmd/Ctrl+A (rows on screen only), Esc clears (not while typing).
- `copy-all` one clipboard item: text joined by the chosen separator (New line, Blank line, Space, Comma; remembered), and HTML with each clip's formatting and images in order. Copy as plain text leaves images out.
- `not-shown` picks hidden by a search stay picked; the bar says "N picked · M not shown" and Delete asks first.
- `move-delete` Move to a collection; Delete with Undo.
- `quick-paste-picks` Tab picks in the quick-paste box; Enter inserts them joined (a space in one-line inputs).

## How to get to it (user POV)

- Side panel or popup: hover a clip's icon and tick it, then use the bar at the bottom (Copy all, ⋯ for the rest).
- On a page: Alt+Shift+V, Tab on each clip, Enter.

## Driving it with Playwright

- Bar: `getByRole('region', { name: 'Picked clips' })`. Checkboxes: `getByRole('checkbox', { name: 'Pick <title>', exact: true })`; their text is the pick number.
- Read the clipboard from the panel page (`navigator.clipboard.read()`), retrying until the panel has focus.
- Tests: `tests/e2e/multi-copy.clipboard.spec.ts`.

## Gotchas

- Google Docs pastes its own stored copy when the HTML carries a `docs-internal-guid` id; the joined HTML strips it (`fragmentOf`). Only checkable in a real signed-in Doc.
- Chat apps (Discord, Slack) ignore HTML and take one image at most: images in a multi-copy don't reach them. That's expected.
