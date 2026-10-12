# CopyDrawer

A private clipboard for Chrome. Everything you copy is kept, sorted into collections, and ready to paste again. Your clips stay on your device.

> Status: **MVP (v1.0 candidate)**. Built per [docs/06-build-plan.md](docs/06-build-plan.md); launch checklist in [docs/07-store-listing.md](docs/07-store-listing.md).

## Develop

```bash
pnpm install
pnpm dev          # opens Chrome with the extension loaded and hot reload
```

Load a production build by hand: `pnpm build`, then in `chrome://extensions` turn on Developer mode → **Load unpacked** → choose `.output/chrome-mv3`.

| Command | What it does |
|---|---|
| `pnpm compile` | Type-check |
| `pnpm lint` | Lint (oxlint: correctness and React hooks rules) |
| `pnpm format` / `pnpm format:check` | Format with Prettier / check formatting |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm bench` | Builds a test copy and measures panel open, search, quick paste and saving at 2k–20k clips (about 5 minutes); results in `bench-results.jsonl` |
| `pnpm test:e2e` | Builds a test copy and runs end-to-end tests with the real extension in Chromium (Playwright), incl. accessibility checks (axe). Specs that read the system clipboard are named `*.clipboard.spec.ts` and run last, one at a time |
| `pnpm check` | Everything above, plus a production build and a check that all-sites access stays optional. Run it before every push: there is no CI. |
| `pnpm zip` | Store-ready zip in `.output/` |

## Features

- **Save:** Alt+Shift+S (⌥⇧S on a Mac: Option is the Mac's Alt key) or right-click → Save selection; right-click → Save image; Alt+Shift+X screenshot an area; paste or drop into the panel; **add a clip by hand** (+ on the home screen: type or paste text or images, then Save); optional **auto-save** of the text and images you copy (asks for site access only when you turn it on, and granting that access is what turns it on; covers tabs that are already open, and keeps working in them after an update; ignores copy events a page fakes; skips password fields, password-manager, bank, government, sign-in, email, payment, tax, credit, payroll, insurance and health sites and sites you block; pause anytime).
- **Collections:** rules sort clips into Research, Links, Code, Shopping, Recipes, Personal, and trips named after the place ("Lisbon trip"). Make your own right in the panel, rename them, and pick any color (presets or a rainbow bar). Drag clips and images onto a collection to file them, and drag collections to reorder them (they stay where you put them).
- **Images:** save by paste, drop, right-click or screenshot. Drag images within the panel to reorder them or file them, or drag one out onto a page or the desktop.
- **Find:** word search that forgives small typos, with type, site and date filters.
- **Paste back:** Alt+Shift+V quick-paste box in any text box; the toolbar popup is the full app (small, medium or large) and can expand into the side panel; clips with formatting can be copied **as is** or as **plain text**.
- **Smart actions:** track package, flight status, add to calendar (.ics), open address in Maps, email/call, color formats, tidy JSON, links without tracking parameters.
- **Your data:** export to a .zip (`clips.html` to read in any browser, `clips.json` for Import, and your images as files) and import it back (older .json exports still import), with a monthly reminder to export once you have 50+ clips (Not now waits a week; turn it off in Settings), auto-delete after 30/90 days, delete all.
- **Appearance:** light and dark themes, a choice of font (default, system or monospace) and four text sizes, everywhere including the quick-paste box.
- **No pop-ups:** naming, colors and confirmations all happen inside the panel. The only prompt you'll see is Chrome's own permission request when you turn on auto-save.

## Known limitations

- **Copy buttons on sites aren't auto-saved.** Auto-save notices copy events (Ctrl/Cmd+C, Copy in the menu). Buttons that copy with `navigator.clipboard.writeText` (GitHub code blocks, ChatGPT answers) fire no copy event, so those copies aren't saved. Use **Grab clipboard** in the panel instead.
- **Chrome blocks extensions on some pages.** `chrome://` pages, the Chrome Web Store, other extensions' pages and the PDF viewer can't be read by any extension, so auto-save and the shortcuts can't work there. The toolbar icon shows **×** on those pages while auto-save is on (and on sites that are blocked, or incognito when that's off), and after a shortcut that couldn't run there. To save from such a page, copy as usual and use **Grab clipboard** in the panel.

## Project layout

```
src/entrypoints/background.ts   context menus, shortcuts, saving, quick-paste data
src/entrypoints/sidepanel/      React side panel (home, collections, detail, settings, onboarding)
src/entrypoints/popup/          toolbar popup (the full app, expands into the side panel)
src/entrypoints/*.content.ts    auto-save listener, quick-paste box (injected on demand)
src/lib/                        storage (Dexie), clips, collections + classifier, search,
                                clip types, smart actions
src/components/                 UI building blocks (design system in docs/05)
tests/unit, tests/e2e           Vitest and Playwright tests
tests/bench                     scale benchmark (pnpm bench)
docs/                           research, design, plan, design system, mockups
```

## License

GPL-3.0-only. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
