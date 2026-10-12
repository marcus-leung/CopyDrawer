# Folders (collections) order

Folders on the home screen stay in the order the user set. Dropping a clip into one never moves it. Dragging a folder reorders the grid live: the dragged tile stays as a faded placeholder, the others slide aside, dropping saves that order, and Esc or letting go outside puts it back. New folders appear at the end. There is no keyboard way to reorder (by choice).

## Sub-features

- `folders-stable` dropping clips into a folder keeps every folder's position.
- `folders-drag` dragging a folder over another moves it into that slot while dragging; the drop saves it and the order survives a reload.
- `folders-cancel` ending a drag without dropping restores the saved order.

## How to get to it (user POV)

- Home screen, Collections grid: drag a tile over another tile.

## Driving it with Playwright

Preconditions:

- Baseline from the index, at least one clip (the Collections section is hidden on an empty home), and folders made with `getByRole('button', { name: 'New collection' })`, `getByLabel('Collection name')`, Enter.

- **Order.** `getByRole('list', { name: 'Collections' }).getByRole('button')` with `toHaveText([/^Alpha/, ...])`.
- **Drop a clip.** `dragAndDrop(page, clipRowButton, tile)` from `tests/e2e/helpers.ts`. Status `Moved to <name>`; order unchanged.
- **Drag a folder.** `dragAndDrop(page, tileA, tileC)`. A takes C's slot. For the live preview, dispatch `dragstart` on the tile, then `dragOver(target, dataTransfer)` (it sends the pointer position the grid needs), check the order, then `drop` or `dragend`.
- **Proof.** `specs/folder-reorder.spec.ts` captures start, after a clip drop, and after a folder drag.

## Gotchas

- The grid picks the slot from the pointer position against the tiles' layout boxes, so drag events without `clientX/clientY` do nothing. Use `dragOver` or `dragAndDrop`, which add them.
- Smoothness (no back-and-forth while tiles slide) needs a real mouse drag: move with `page.mouse` over each tile in steps and record the order after each step.
- Empty smart folders are hidden but keep their place in the order.
