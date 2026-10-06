# Clipboard (working name)

A private, AI-powered clipboard for Chrome and Edge. Everything you copy is kept, sorted into collections, and ready to paste again. Clips and the AI that sorts them stay on your device.

> Status: **MVP (v1.0 candidate)**. Built per [docs/06-build-plan.md](docs/06-build-plan.md); launch checklist in [docs/07-store-listing.md](docs/07-store-listing.md).

## Develop

```bash
pnpm install
pnpm dev          # opens Chrome with the extension loaded and hot reload
pnpm dev:edge     # same for Edge
```

Load a production build by hand: `pnpm build`, then in `chrome://extensions` turn on Developer mode → **Load unpacked** → choose `.output/chrome-mv3`.

| Command | What it does |
|---|---|
| `pnpm compile` | Type-check |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | Builds a test copy and runs end-to-end tests with the real extension in Chromium (Playwright), incl. accessibility checks (axe) |
| `pnpm zip` / `pnpm zip:edge` | Store-ready zip in `.output/` |

## Features

- **Save:** Alt+Shift+S or right-click → Save selection; right-click → Save image; Alt+Shift+X screenshot an area; paste or drop into the panel; optional **auto-save** of everything you copy (asks for site access only when you turn it on; skips password fields, banks, password managers and blocked sites; pause anytime).
- **Smart collections:** rules sort clips into Research, Links, Code, Shopping, Recipes, Personal, and trips named after the place ("Lisbon trip"). An on-device model (all-MiniLM-L6-v2 via transformers.js, bundled ONNX runtime) sorts the rest and learns from clips you move.
- **Find:** search blends word matches and meaning, with type, site and date filters.
- **Paste back:** Alt+Shift+V quick-paste box in any text box; toolbar popup with recent clips; **Paste as** plain text, Markdown, bullets, checklist, one line, case, plus summarize/rewrite/grammar/translate with Chrome's built-in AI (preview first).
- **Smart actions:** track package, flight status, add to calendar (.ics), open address in Maps, email/call, color formats, tidy JSON, links without tracking parameters.
- **Your data:** export/import (JSON), auto-delete after 30/90 days, delete all. Light and dark themes.

## Configuration

| Variable | Use |
|---|---|
| `WXT_WAITLIST_URL` | Form opened by "Email me when it's ready" on the Pro page. Unset: the page says the waitlist opens soon. |

## Project layout

```
src/entrypoints/background.ts   context menus, shortcuts, saving, quick-paste data
src/entrypoints/sidepanel/      React side panel (home, collections, detail, settings, onboarding)
src/entrypoints/popup/          toolbar popup (recent clips)
src/entrypoints/*.content.ts    auto-save listener, quick-paste box (injected on demand)
src/lib/                        storage (Dexie), clips, collections + classifier, search,
                                embeddings (embed/), Chrome AI (ai/), smart actions, transforms
src/components/                 UI building blocks (design system in docs/05)
tests/unit, tests/e2e           Vitest and Playwright tests
docs/                           research, design, plan, design system, mockups
```

## License

GPL-3.0-only. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
