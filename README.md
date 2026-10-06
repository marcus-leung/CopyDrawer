# Clipboard (working name)

A private, AI-powered clipboard for Chrome and Edge. Everything you copy is kept, sorted into collections, and ready to paste again. Clips and the AI that sorts them stay on your device.

> Status: **v0.1 barebones** (save → find → copy). MVP in progress. See [docs/06-build-plan.md](docs/06-build-plan.md).

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
| `pnpm build && pnpm test:e2e` | End-to-end tests with the real extension in Chromium (Playwright) |
| `pnpm zip` / `pnpm zip:edge` | Store-ready zip in `.output/` |

## How to use (v0.1)

- Select text on a page and press **Alt+Shift+S**, or right-click → **Save selection**.
- Click the toolbar icon to open the side panel. Paste with Ctrl+V to save, or use **Grab clipboard**.
- Search, open a clip, **Copy** it back, pin or delete it (with Undo).

## Project layout

```
src/entrypoints/background.ts   context menu, keyboard command, saving
src/entrypoints/sidepanel/      React side panel (home, clip detail, settings)
src/lib/                        storage (Dexie/IndexedDB), clips logic, settings, theme
src/components/                 UI building blocks (design system in docs/05)
tests/unit, tests/e2e           Vitest and Playwright tests
docs/                           research, design, plan, design system, mockups
```

## License

GPL-3.0-only. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
