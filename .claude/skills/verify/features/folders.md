# Folders (collections) order

Folders on the home screen stay in the order the user set. Dropping a clip into one never moves it; dragging a folder onto another puts it in that one's place; the folder screen has Move earlier / Move later for keyboard users. New folders appear at the end.

## Sub-features

- `folders-stable` dropping clips into a folder keeps every folder's position.
- `folders-drag` dragging a folder tile onto another reorders them, and the order survives a reload.
- `folders-move-buttons` "Folder N of M" with Move earlier / Move later on the folder screen, disabled at the ends.

## How to get to it (user POV)

- Home screen, Collections grid: drag a tile onto another tile.
- Click a tile to open its screen; use Move earlier / Move later under the clip count.

## Driving it with Playwright

Preconditions:

- Baseline from the index, at least one clip (the Collections section is hidden on an empty home), and folders made with `getByRole('button', { name: 'New collection' })`, `getByLabel('Collection name')`, Enter.

- **Order.** `getByRole('list', { name: 'Collections' }).getByRole('button')` with `toHaveText([/^Alpha/, ...])`.
- **Drop a clip.** `dragAndDrop(page, clipRowButton, tile)` from `tests/e2e/helpers.ts`. Status `Moved to <name>`; order unchanged.
- **Drag a folder.** `dragAndDrop(page, tileA, tileC)`. A takes C's place.
- **Move buttons.** Open a tile; `getByText('Folder 1 of 3')`; `getByRole('button', { name: 'Move later' })`.
- **Proof.** `specs/folder-reorder.spec.ts` captures start, after a clip drop, and after a folder drag.

## Gotchas

- `dragAndDrop` dispatches drag events. One real-mouse drag test exists for clips (`additions.clipboard.spec.ts`); folder drags are proved with dispatched events only.
- Empty smart folders are hidden but keep their place in the order.
