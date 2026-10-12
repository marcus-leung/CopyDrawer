# CopyDrawer verification map

This directory is the maintained source for verifying the user-facing behavior of the CopyDrawer extension. Read the index before driving, then use the matching feature file as the recipe.

## Baseline preconditions

- `E2E=1 corepack pnpm exec wxt build` has run since the last `src/` change.
- `node .claude/skills/verify/doctor.mjs` prints `ok:`.
- Each spec starts from a fresh profile: no clips, default settings, auto-save off, setup tab already closed.
- Fake sites are served with `context.route` on `*.e2e.test` hosts. No real network.

## Driving conventions

- Write proof specs in `.claude/skills/verify/specs/` using the fixtures from `tests/e2e/fixtures.ts`.
- Prefer ARIA roles and accessible names over CSS selectors or DOM position.
- Change settings through the Settings screen when the feature is about settings. Direct `chrome.storage` writes are setup only.
- Capture each step with `capture(page, feature, step)`.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof is a screenshot plus an ARIA snapshot in `verify-evidence/<feature>/`.
- Saving proof also reads the stored clip with `readClips`.
- Record which entry point you drove. A path that can't be scripted (toolbar click, keyboard shortcut) is reported as skipped or substituted, never as verified.

## Features

- [Auto-save copies](./autosave.md): copying on a web page saves a clip, with password fields and blocked sites skipped.
- [Popup](./popup.md): the toolbar popup is the full app and can hand off to the side panel.
- [Add and find clips](./add-and-find.md): pasting into the panel, search, filters, copy back, delete and undo.
- [Copy shortcuts](./copy-shortcuts.md): copy/cut keys, menu Copy, Alt+Shift+S/V/X, and pasting back.
- [Export](./export.md): the .zip export: clips.html reads well, clips.json and images import back.
- [Folders order](./folders.md): folders stay where the user put them, reorder by drag or Move buttons.
- [Quick paste](./quick-paste.md): the Alt+Shift+V box that pastes a clip into a field on any page.
