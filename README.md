# CopyDrawer

A private clipboard for Chrome. Everything you copy is kept, sorted into collections, and ready to paste again. Your clips stay on your device, unless you turn on Google Drive sync.

> Status: **v1.0 candidate**, ready for Chrome Web Store submission. Built per [docs/06-build-plan.md](docs/06-build-plan.md); launch checklist in [docs/07-store-listing.md](docs/07-store-listing.md).

## Develop

```bash
pnpm install
pnpm dev          # opens Chrome with the extension loaded and hot reload
```

**Drive sync** needs Google's OAuth client: set `COPYDRAWER_OAUTH_CLIENT_ID` (a "Chrome Extension" client for the store item's ID) when building, or the build hides sync. To sign in from a local build, also set `COPYDRAWER_EXTENSION_KEY` to the store item's public key, so the local build gets the store's ID; `pnpm check` fails if the key would ship. Tests use a fake Drive and need neither.

Load a production build by hand: `pnpm build`, then in `chrome://extensions` turn on Developer mode → **Load unpacked** → choose `.output/chrome-mv3`.

| Command | What it does |
|---|---|
| `pnpm compile` | Type-check |
| `pnpm lint` | Lint (oxlint: correctness and React hooks rules) |
| `pnpm format` / `pnpm format:check` | Format with Prettier / check formatting |
| `pnpm test` | Unit tests (Vitest) |
| `node scripts/disk-full-test.mjs` | macOS, by hand, after `E2E=1 pnpm exec wxt build`: runs Chrome on a small RAM disk, fills it, and checks that no clips are lost (about 3 minutes) |
| `pnpm bench` | Builds a test copy and measures panel open, search, quick paste and saving at 2k–20k clips (about 5 minutes); results in `bench-results.jsonl` |
| `pnpm test:e2e` | Builds a test copy and runs end-to-end tests with the real extension in Chromium (Playwright), incl. accessibility checks (axe). Specs that read the system clipboard are named `*.clipboard.spec.ts` and run last, one at a time |
| `pnpm check` | Everything above, plus a production build and a check that all-sites access stays optional. Run it before every push: there is no CI. |
| `pnpm zip` | Store-ready zip in `.output/` |

## Features

- **Save:** Alt+Shift+S (⌥⇧S on a Mac: Option is the Mac's Alt key) or right-click → Save selection; right-click → Save image; Alt+Shift+X screenshot an area; paste or drop into the panel; **add a clip by hand** (+ on the home screen: type or paste text or images, then Save); optional **auto-save** of the text and images you copy (asks for site access only when you turn it on, and granting that access is what turns it on; covers tabs that are already open, and keeps working in them after an update; also saves what a site's **copy buttons** copy, once per click; ignores copies a page makes on its own; skips password fields, password-manager, bank, government, sign-in, email, payment, tax, credit, payroll, insurance and health sites and sites you block; never keeps **passwords, access keys, private keys or card numbers** (the page says so; paste one into the panel to keep it); pause anytime).
- **Collections:** rules sort clips into Research, Links, Code, Shopping, Recipes, Personal, and trips named after the place ("Lisbon trip"). Make your own right in the panel, rename them, and pick any color (presets or a rainbow bar). Drag clips and images onto a collection to file them, and drag collections to reorder them: the others slide aside as you drag, and they stay where you put them.
- **Images:** save by paste, drop, right-click or screenshot. Drag images within the panel to reorder them or file them, or drag one out onto a page or the desktop.
- **Find:** **best match** search: clips with every word first (newest first), then clips with some of the words, best match first (rare words and titles count more); forgives small typos and finds word starts. Type, site and date filters, and other orders (newest, oldest, most used, A–Z) that list only clips with every word. Quick paste ranks the same way.
- **Copy several at once:** pick clips with the checkbox on hover, Cmd/Ctrl-click or Shift-click (Cmd/Ctrl+A picks every clip on screen, Esc clears). Picks are numbered in the order you pick them, which is the order they paste in. **Copy all** writes them as one clipboard item, joined with a new line, blank line, space or comma (remembered), with each clip's formatting and images in order. Google Docs, Gmail and Notion take all of it; chat apps such as Discord and Slack take only the plain text. The ⋯ menu also moves the picks to a collection, copies them as plain text or deletes them (with Undo).
- **Paste back:** Alt+Shift+V quick-paste box in any text box (Tab picks several clips, Enter pastes them joined; one-line inputs get a space between them); the toolbar popup is the full app (small, medium or large) and can expand into the side panel; clips with formatting can be copied **as is** or as **plain text**.
- **Smart actions:** track package, flight status, add to calendar (.ics), open address in Maps, email/call, color formats, tidy JSON, links without tracking parameters.
- **Your data:** export to a .zip (`clips.html` to read in any browser, `clips.json` for Import, and your images as files) and import it back (older .json exports still import), with a monthly reminder to export once you have 50+ clips (Not now waits a week; turn it off in Settings), auto-delete after 30/90 days, delete all. **Full disk:** saving stops while less than 50 MB is free, and the page and panel say why; if the disk still fills (Chrome's database then reports an error), every write stops until Chrome restarts, and the first start after that moves the clips to fresh storage before anything else writes (when there's room for the copy; otherwise the panel says how much space to free), since later writes could make Chrome discard them.
- **Google Drive sync** (off until you turn it on in Settings): the same clips, images and folders on every computer where you turn it on, kept in a hidden app folder of your own Google Drive (CopyDrawer can't see your other Drive files). Changes merge field by field, so a pin on one computer and an edit on another both survive; a delete wins unless the clip changed after it; the same text saved on two computers becomes one clip, and folders of the same name merge. Syncs every minute and whenever the panel opens. Each computer still keeps at most 5,000 clips: the oldest unpinned ones that don't fit leave that computer only, and stay in Drive and on computers with room. If one computer deletes the Drive copy, the others stop and keep their clips until you choose **Sync again**.
- **Hide previews:** the eye button (or Settings → Appearance) blurs clips in the panel, popup and quick paste until you point at one, for screen sharing. This computer only.
- **Appearance:** light and dark themes, a choice of font (default, system or monospace) and four text sizes, everywhere including the quick-paste box.
- **No pop-ups:** naming, colors and confirmations all happen inside the panel. The only prompts you'll see are Chrome's own: the permission request when you turn on auto-save, and Google sign-in when you turn on Drive sync.

## Known limitations

- **Right-click → Save image needs auto-save for most images.** Images are usually hosted on another site than the page (an image server), and Chrome blocks downloading those unless the extension has access to all sites, which it asks for only when you turn on auto-save. Without it, the page shows "Image not saved" and says so. Same-site images, and image servers that allow it, save either way.
- **A page can add one clip per click on it.** Copy buttons are saved because a small script in the page reports `navigator.clipboard` writes. A report is accepted only within 2 seconds of a real click, once per click, so a page can't fill your history; but after a click it could report text it didn't copy, and that clip would be saved.
- **A restart with the disk still completely full can skip the clean-up.** After a disk error, CopyDrawer marks the clips to be moved to fresh storage at the next Chrome start. If the disk is so full that even that small mark can't be written, and Chrome restarts before any space is freed, the move doesn't happen.
- **Drive sync works in Chrome only, with the Google account Chrome is signed in to.** Other Chromium browsers (Edge, Brave) can't sign in to Google for extensions, so they don't show it.
- **Sync isn't a backup.** A delete or **Delete all** reaches every computer that syncs. Export a copy now and then.
- **The first sync downloads every clip one by one.** With thousands of clips that takes a minute or two (Settings shows the progress). Use counts merge by taking the larger, not by adding up. A clip saved while sync couldn't reach Drive for a long time, then pushed out by 5,000 newer ones before it went up, isn't kept anywhere, as without sync.
- **Chrome blocks extensions on some pages.** `chrome://` pages, the Chrome Web Store, other extensions' pages and the PDF viewer can't be read by any extension, so auto-save and the shortcuts can't work there. The toolbar icon shows **×** on those pages while auto-save is on (and on sites that are blocked, or incognito when that's off), and after a shortcut that couldn't run there. To save from such a page, copy as usual and use **Grab clipboard** in the panel.

## Project layout

```
src/entrypoints/background.ts   context menus, shortcuts, saving, quick-paste data
src/entrypoints/sidepanel/      React side panel (home, collections, detail, settings, onboarding),
                                folder reorder and picked-clip hooks
src/entrypoints/popup/          toolbar popup (the full app, expands into the side panel)
src/entrypoints/*.content.ts    auto-save listener, quick-paste box (injected on demand)
src/lib/                        storage (Dexie), clips, collections + classifier, search,
                                clip types, smart actions
src/lib/sync/                   Drive sync: change tracking, Drive client, merge, controller
src/components/                 UI building blocks (design system in docs/05)
tests/unit, tests/e2e           Vitest and Playwright tests
tests/bench                     scale benchmark (pnpm bench)
docs/                           research, design, plan, design system, mockups
```

## License

Proprietary, all rights reserved. See [LICENSE](LICENSE). Third-party licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); the build ships their full texts as `THIRD_PARTY_LICENSES.txt` (generated in `wxt.config.ts`).
