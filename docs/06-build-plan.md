# 06 · Build plan: barebones → MVP

_Process: Research → Design → **Plan** → Build. Inputs: [02-design.md](02-design.md) (features, architecture, decisions), [05-ui-design-system.md](05-ui-design-system.md) (UI), [mockups/](mockups/) (screens), [04-design-resources.md](04-design-resources.md) (approved libraries)._

Assumptions: solo developer, ~20 h/week, AI coding help. Chrome + Edge only. English. GPL-3.0.

---

## 1. Two stages

| | **Barebones (v0.1)** | **MVP (v1.0, public launch)** |
|---|---|---|
| Goal | Prove the core loop works end to end: **copy → saved → find → paste** | A product people install, understand in 60 seconds, and keep using |
| Who uses it | You + a few friends (unlisted store listing) | Public: Chrome Web Store + Edge Add-ons |
| Length | ~1.5 weeks | +5 weeks after barebones (≈ 6.5 weeks total) |
| Screens | Home list, clip detail (minimal), settings (minimal) | All MVP screens in the design system inventory |

---

## 2. Tech stack (locked)

| Area | Choice | Why |
|---|---|---|
| Extension framework | **WXT** (MV3, Vite, hot reload, Chrome/Edge/Safari targets) | Fast dev; Safari later is cheap |
| UI | **React + TypeScript (strict)** | Decided |
| Styling | **Tailwind CSS v4** with the design tokens as CSS variables | Tokens from doc 05; light/dark themes |
| Components | **shadcn/ui (Radix)** copied into the repo | Accessible, MIT, ours to edit |
| Animation | CSS + **Motion** (`LazyMotion`) in the panel; CSS only in the page overlay | Approved in doc 04 |
| Icons / fonts | **Lucide** (+ lucide-animated later) · **Fontsource** Bricolage Grotesque, Instrument Sans, JetBrains Mono | Bundled locally |
| Storage | **IndexedDB via Dexie** (clips, images, collections) · **OPFS** for image files · `chrome.storage.local` for settings · `chrome.storage.sync` for settings sync | Local-first |
| Tests | **Vitest** (logic) · **Playwright** with the unpacked extension (e2e) | Run locally before every push (`pnpm check`) |
| Tooling | pnpm, oxlint, Prettier | Standard |

---

## 3. Architecture (what runs where)

```
Service worker (background)
  - context menus, keyboard commands, alarms, message router
  - writes clips to IndexedDB (single writer)
Side panel (React)           - main UI: home, search, collections, detail, settings
Toolbar popup (React)        - recent clips + auto-save switch
Content script, auto-capture - listens to copy/cut; only after the user grants optional all-sites access (MVP)
Injected overlay             - quick-paste box (Alt+Shift+V), injected on demand via activeTab, Shadow DOM (MVP)
```

**Data model** (from 02-design §6.1, trimmed for v0.1):

```ts
Clip { id, createdAt, lastUsedAt, useCount, kind: 'text'|'link'|'image'|'html',
       text?, html?, imageRef?, title?, source?: { url, title, favicon },
       collectionId?, pinned }
Collection { id, name, color, kind: 'smart'|'manual', order }
Settings { autoSave, blockedSites[], retentionDays, theme, analytics, shortcutsSeen }
```

**Permissions:** install-time `storage`, `unlimitedStorage`, `sidePanel`, `contextMenus`, `activeTab`, `scripting`, `clipboardRead`, `clipboardWrite`, `alarms`; **optional** `<all_urls>` requested in onboarding for auto-save (MVP).

---

## 4. Barebones v0.1 (≈ 1.5 weeks) ✅ Built

**In scope:**
1. WXT + React + TS + Tailwind project, design tokens (light only), fonts bundled.
2. Side panel opens from the toolbar icon.
3. **Save text** three ways: right-click "Save selection", shortcut **Alt+Shift+S**, paste into the panel. Plus a "Grab clipboard" button.
4. Store clips in IndexedDB with source URL and page title.
5. **Home = recent list** (clip rows from doc 05): newest first, Paste/Copy button, pin, delete with Undo toast.
6. **Keyword search** across text and titles.
7. **Copy back**: click a clip to copy it to the clipboard (paste into the page comes in MVP via the overlay).
8. Basic **settings**: history limit (2,000 including pins, oldest unpinned dropped), delete everything, link to Chrome's shortcut page.
9. Unit tests for storage and limits; one Playwright e2e test: save selection → appears in panel → copy works.
10. Build zip + **unlisted** Chrome Web Store submission (starts the review relationship early).

**Out of scope for v0.1:** images, auto-capture, collections, quick-paste box, onboarding, dark mode.

**Exit criteria:**
- Save → find → copy works on 20 popular sites (Google Docs, Gmail, Notion, GitHub, Wikipedia, YouTube, Reddit, ChatGPT…), with any failures written down.
- Panel opens in < 300 ms with 2,000 clips; search returns in < 50 ms.
- Unlisted build approved (or reviewer feedback recorded).

### v0.1 tasks

| # | Task | Done when |
|---|---|---|
| B1 | Scaffold WXT + React + TS + Tailwind v4, lint/format, GPL-3.0 `LICENSE`, `THIRD_PARTY_NOTICES` | `pnpm dev` loads the extension; lint + build pass |
| B2 | Design tokens + fonts + base components (button, icon button, search field, clip row, toast) | Matches doc 05 light theme |
| B3 | Dexie schema + clip repository (add, list, search, pin, delete, limit enforcement) | Vitest covers add/limit/delete |
| B4 | Service worker: context menu "Save selection", command Alt+Shift+S, message router | Selected text appears in DB with source |
| B5 | Side panel home list + paste-into-panel + Grab clipboard | Clips show live as they're saved |
| B6 | Copy back to clipboard, pin, delete + Undo | Works from the panel |
| B7 | Keyword search | Filters as you type |
| B8 | Minimal settings | Limit, delete all, shortcuts link |
| B9 | Playwright e2e + release zip + unlisted submission | `pnpm check` passes; zip uploaded |

---

## 5. MVP v1.0 (≈ 5 weeks after v0.1) ✅ Built

Built on top of v0.1, in this order. Each week ends with a usable build.

### Week 1: capture everything ✅
- **Auto-save (opt-in):** onboarding step requests optional all-sites access; content script captures copy/cut with source; pause (1 hour default) and per-site block; built-in exclusions (password managers, banks); no capture in incognito by default. _Screens 1.2, 5.2, 5.3._
- **Images:** right-click "Save image", screenshot an area (`captureVisibleTab` + crop), drop/paste images into the panel; files in OPFS, thumbnails in IndexedDB; size limit 20 MB; formats PNG/JPG/GIF/WebP. _Screens 2.1–2.5._
- In-page "Saved" toast with Open/Undo. _Screen 2.3._

### Week 2: organize ✅
- **Collections:** rules sort clips into Research, Links, Code, Shopping, Recipes, Personal; colors from doc 05; users can make their own, rename, recolor, move clips. _Home, screen 4.1._
- **Trip collections:** destination detection groups travel clips (mustard color). _Screen 6.1._
- **Titles:** made from the text; users can edit them.

### Week 3: find and paste ✅
- **Search:** words, with small typos forgiven; filters: type, site, date. _Screen 3.1._
- **Quick-paste box** (Alt+Shift+V): overlay in Shadow DOM via activeTab, type to filter, Enter paste into the focused field, Tab for Paste as, Esc close. _Screen 3.2._
- **Paste as:** plain text, Markdown, bullet list, checklist, one line, case. _Screen 3.3._

### Week 4: smart actions + home polish ✅
- **Smart types and actions:** link tracking-param removal, color swatch + formats, JSON tidy, code highlight, **date → Add to calendar (.ics)**, **address → Open in Google Maps**, flight number / tracking number → status link, email/phone. Prices keep their currency symbol (no conversion). _Screens 3.3, 6.2._
- **Home** (Folders design), recent list, images and colors strip, empty state, first-clip tip. _Screens 1.4, 1.5, home._
- **Toolbar popup.** _Screen 3.6._
- **Dark theme** (system + override). _C1._

### Week 5: onboarding, settings, launch prep ✅
- **Onboarding** 3 steps: privacy promise, auto-save, the two shortcuts. _Screens 1.1–1.2._
- **Settings** complete: auto-save, blocked sites, shortcuts, history and auto-delete, theme, export/import/delete all. _Screen 5.1._
- **Notices:** paused, site blocked, history full. _Screen 5.3._
- Privacy policy, store listing assets, permission justifications, Edge package, performance + accessibility pass.

### Added after trying the MVP ✅
- **No browser dialogs:** naming a collection and confirming deletes happen inline in the panel.
- **Collection colors:** 7 presets plus a rainbow bar for any hue, readable in light and dark.
- **Image drag and drop:** reorder the images & colors strip, drop an image on a collection, drag an image out to a page or the desktop.
- **AI and Pro removed:** no on-device model, no Chrome built-in AI, no waitlist. The extension makes no network requests and is under 1 MB.

### Moved out of MVP (later)
- Emoji and symbols board (screen 3.5)
- Copy several, paste in order
- Safari → after v1.0

**MVP exit criteria (= launch):**
- All MVP screens built to the design system, light and dark.
- Activation in private beta ≥ 40% (5 clips saved + 1 paste from history within 24 h).
- No P0 bugs; Lighthouse-style accessibility check passes; panel < 300 ms, quick-paste < 150 ms to open.
- Store listings approved on Chrome and Edge.

---

## 6. Timeline

| Week | Stage | Output |
|---|---|---|
| 1–1.5 | Barebones | v0.1 unlisted |
| 2.5 | MVP week 1 | Auto-save + images |
| 3.5 | MVP week 2 | Collections + trips |
| 4.5 | MVP week 3 | Search, quick-paste, Paste as |
| 5.5 | MVP week 4 | Smart actions, home, popup, dark mode |
| 6.5 | MVP week 5 | Onboarding, settings, launch prep |
| 7.5–8.5 | Private beta | Fixes from 30–50 testers |
| ~9 | Public launch v1.0 | Chrome + Edge |

---

## 7. Engineering practices

- **Branches:** `main` is releasable; feature branches + PRs; tag releases `v0.1.0`, `v1.0.0`.
- **Local checks, no CI:** `pnpm check` runs typecheck, lint, format check, Vitest, build, the manifest check and Playwright (Chromium with the unpacked extension; headed on macOS). It must pass before every push. `pnpm zip` makes the store zip.
- **Security:** no remote code; no `eval`; all assets bundled; pinned dependencies; dependency review on upgrades; 2FA on store accounts; clip content never logged or sent anywhere.
- **Performance budgets:** side panel JS < 250 KB gzipped at first load; overlay < 30 KB.
- **Accessibility:** keyboard path for every flow; contrast per doc 05; reduced motion.
- **Definition of done** (every task): matches the mockup, works in light and dark (from MVP week 4), has tests where logic exists, no console errors, keyboard reachable.

---

## 8. Risks to watch during the build

| Risk | Mitigation |
|---|---|
| Copy events don't fire on custom editors (Google Docs, Figma) | Measured in v0.1 site test; "Grab clipboard" button as fallback |
| Store review delays | Unlisted v0.1 submission; optional all-sites permission; precise justifications |
| Scope creep | This doc is the scope; new ideas go to the later list |

---

## 9. Status

v0.1 and MVP weeks 1–5 are built and merged to `main` (`package.json` version 1.0.0). Not yet done: the unlisted store submission, the 20-site capture test, private beta, and the store approvals in the MVP exit criteria. Next steps are in [03-plan.md](03-plan.md) §6.
