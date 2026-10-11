---
name: verify
description: Drive the Clipboard Chrome extension (side panel, toolbar popup, auto-save on web pages, quick-paste box) in a real Chromium through Playwright and capture screenshot + ARIA proof. Use to prove a change works in the actual extension, not just unit tests or a green build.
---

# Verify the Clipboard extension

The extension is driven in Playwright's Chromium with the **E2E build** (`.output-e2e/chrome-mv3`) loaded unpacked. The E2E build is the normal extension plus pre-granted `<all_urls>` and a few test hooks (`__E2E__`). It reuses the fixtures in `tests/e2e/fixtures.ts`, which launch a fresh throwaway profile per test, close the first-install setup tab, and fail the test if any browser dialog appears.

Run every command from the repo root. `pnpm` is not on PATH in Claude's shell; use `corepack pnpm` or put a shim (`exec corepack pnpm "$@"`) on PATH.

Before driving a feature, read [`features/README.md`](features/README.md) and the matching feature file.

## Launch

There is no server. "Launch" is building the E2E copy once per source change:

```sh
E2E=1 corepack pnpm exec wxt build
```

Ready when it prints `✔ Finished`. Each Playwright test then starts and stops its own Chromium.

## Doctor

```sh
node .claude/skills/verify/doctor.mjs
```

`ok: E2E build ...` means `.output-e2e` exists, is an E2E build, and is newer than everything in `src/` and `wxt.config.ts`. Any `not ok:` line names the rebuild command. Run this first, and again whenever a result looks stale.

## Drive

Proof specs live in `.claude/skills/verify/specs/` and run with their own config (one worker, evidence kept):

```sh
corepack pnpm exec playwright test -c .claude/skills/verify/playwright.config.ts            # all
corepack pnpm exec playwright test -c .claude/skills/verify/playwright.config.ts autosave   # one file
```

`specs/autosave-to-popup.spec.ts` is the reference recipe: turn on auto-save in Settings, copy text on a stubbed web page with a real Ctrl/Cmd+C, then open the popup and see the clip with its source site.

To prove something new, add a spec file next to it. Pattern:

- `import { test, expect } from '../../../../tests/e2e/fixtures'` gives `context` and `extensionId`.
- Extension pages: `chrome-extension://${extensionId}/sidepanel.html` and `/popup.html`.
- Fake websites: `context.route('https://<name>.e2e.test/**', r => r.fulfill({ contentType: 'text/html', body }))`. Never hit the real internet.
- Select by role and accessible name (`getByRole('list', { name: 'Clips' })`, `getByRole('button', { name: 'Settings' })`, `getByLabel('Save what I copy automatically')`). The feature files list the handles.
- Read stored clips with `readClips(page)` from `tests/e2e/helpers.ts` (opens the extension's IndexedDB `clipboard`, store `clips`).
- Call `capture(page, '<feature>', '<n-step>')` from `specs/evidence.ts` after each meaningful action.

Keep one-off specs out of `tests/e2e/`. That suite is `pnpm check`'s and has its own rules (a spec that reads the clipboard must be named `*.clipboard.spec.ts`).

## Evidence

`capture()` writes `verify-evidence/<feature>/<step>.png` (full-page screenshot) and `<step>.aria.yml` (ARIA snapshot of `body`). `verify-evidence/` is gitignored and survives cleanup. Playwright's own traces and failure context go to `test-results/verify/`.

Proof standards:

- Drive the user path: Settings toggles, real keypresses, real copy on a page. Writing `chrome.storage` or IndexedDB directly is setup, not proof. If a spec has to do it, say so in the report.
- Capture the action and the resulting state (for example the settings toast, the page after copy, the popup list), not just the final screen.
- Check the stored side effect too (`readClips`) when the feature saves something.
- Show that the spec can fail: run it once with the feature switched off or the key step removed, and confirm it fails.
- Report which entry point you used. The toolbar popup is opened as a tab at `popup.html`; a real toolbar click cannot be scripted (see Gotchas).

## Cleanup

Each test closes its own Chromium and throwaway profile, so there are no processes to kill. If a run is interrupted, close only the Chromium windows Playwright opened (they show "Chrome is being controlled by automated test software"); never kill Chrome by name, because the user's own Chrome is running too.

Delete any temporary spec files you created. Leave `verify-evidence/` in place; it is the proof. Remove one feature's folder only when re-running that feature.

## Gotchas

- **Headed on macOS.** The fixture runs headed on macOS (headless closes tabs the extension opens), so windows appear and take focus during a run.
- **Real system clipboard.** Copy actions write the real macOS clipboard. Don't run verify specs at the same time as `pnpm test:e2e`, and expect the user's clipboard to be overwritten.
- **Stale build.** Specs load whatever is in `.output-e2e`. After any `src/` edit, rebuild, or you are proving the old code. Doctor catches this.
- **Keyboard commands can't be pressed.** Chrome's extension shortcuts (Alt+Shift+V/S/X) don't fire from Playwright. The E2E build accepts `chrome.runtime.sendMessage({ type: 'e2e-menu', action: 'quick-paste', tabId })` from an extension page instead. Say so when reporting.
- **Popup is a tab here.** `popup.html` in a tab renders the same app, but the width and height come from the tab, not the popup size setting.
