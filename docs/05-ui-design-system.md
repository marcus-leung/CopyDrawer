# 05 · UI design system

_Process: Research → **Design** → Plan → Build. Source of truth for how the extension looks and behaves._

- **Chosen direction:** C, "Folders": organized, friendly, light-first. A dark theme is a variation.
- **Live mockups (private canvas):** https://claude.ai/artifact/416MBBuqTKwgNxzm4zJ7PW. Pages: Directions, All screens, Flows.
- **Mockup source files:** [`docs/mockups/`](mockups/). These are a snapshot of the canvas; each `.dc.html` is one screen.

---

## 1. Principles

1. **Organization first.** Home leads with collections, so users see the product's point in one glance.
2. **One main action per screen.** A single dark primary button; everything else is quiet grey.
3. **Private and plain.** Say what stays on the device. No hype, no jargon.
4. **Keyboard-friendly.** Every main action has a shortcut; show key hints where they help.
5. **Calm.** Color comes from collections; the rest of the UI is white, grey and ink.
6. **Simple beats complete.** Extras wait for user demand (see the travel section in [02-design.md](02-design.md)).

---

## 2. Color

### 2.1 Core tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FFFFFF` | `#14161F` | Panel background |
| `--surface` | `#F1F2F6` | `#232636` | Search field, secondary buttons, tips |
| `--surface-raised` | `#FFFFFF` | `#1F2230` | Cards, toasts, popovers |
| `--border` | `#ECEDF2` | `#262A3A` | List dividers |
| `--border-strong` | `#DADCE5` | `#34384A` | Inputs, chips, outline buttons |
| `--ink` | `#1B1D2A` | `#EEF0F6` | Main text, primary button fill |
| `--on-ink` | `#FFFFFF` | `#14161F` | Text on primary button |
| `--text-2` | `#3E4357` | `#C3C8D8` | Secondary body text |
| `--text-3` | `#555A6E` | `#A3A8BC` | Meta text: sources, times, captions |
| `--link` | `#2457C5` | `#9DBBFF` | Links (hover `#173D8F` / `#C6D7FF`) |
| `--focus` | `#2457C5` | `#9DBBFF` | 2px focus ring, 2px offset |
| `--danger` | `#B42318` | `#FF8A80` | Delete |
| `--success-bg` / `--success-fg` | `#DDF3EC` / `#0B5C4A` | `#163A33` / `#5FD6B5` | Saved checks |
| `--warning-bg` / `--warning-fg` | `#FFF4D6` / `#6B4A00` (border `#F2D27A`) | `#3A2F12` / `#F2D27A` | Paused notice |
| `--scrim` | `rgba(27,29,42,0.25–0.45)` | `rgba(0,0,0,0.5)` | Behind overlays and sheets |

### 2.2 Collection colors

Each collection has an **accent** (folder tab, dots, top border), a **tint** (tile and header background) and a **text-on-tint** color. The tint is always paired with its text color, so contrast holds.

| Collection | Accent (light) | Tint (light) | Text on tint | Accent (dark) | Tint (dark) |
|---|---|---|---|---|---|
| Research | `#2457C5` blue | `#E6EEFC` | `#173D8F` | `#7EA6FF` | `#1E2C4D` |
| Links | `#B35A00` orange | `#FCEBD9` | `#7A3D00` | `#FFB36B` | `#3D2A17` |
| Code | `#6A46C9` violet | `#EEE8FB` | `#4A2FA0` | `#B69CFF` | `#2D2547` |
| Shopping | `#0E7A62` green | `#DDF3EC` | `#0B5C4A` | `#5FD6B5` | `#163A33` |
| Recipes | `#B83280` pink | `#FBE4F0` | `#7A1F55` | `#F28CC0` | `#43192F` |
| Trips | `#7C6A0A` mustard | `#F6F0D5` | `#4D4200` | `#E3C860` | `#3A3214` |
| Personal | `#5B6170` grey | `#F1F2F6` | `#3E4357` | `#A3A8BC` | `#232636` |

Rules:
- Sorted collections get the color of their category; collections users make take the next unused preset, then repeat. Users can change any collection's color.
- **Custom colors:** besides the 7 presets, a rainbow bar picks any hue (stored as `hue:<0-359>`). The app derives the five shades from the hue with fixed lightness steps (accent L34, tint L93, text L22; dark accent L68, dark tint L20), so text stays ≥ 4.5:1 on its tint and the tab ≥ 3:1 on the page for every hue, in light and dark. A unit test checks all 360 hues.
- Never rely on hue alone: collections also show their name, and the accents differ in lightness.

---

## 3. Typography

| Role | Font | Weight | Size / line height |
|---|---|---|---|
| Screen title ("Your clips") | Bricolage Grotesque | 800 | 26px / 1.15 (22px on sub-screens) |
| Onboarding headline | Bricolage Grotesque | 800 | 30–32px / 34–36px |
| Section heading ("Collections") | Bricolage Grotesque | 600 | 17px |
| Body / clip text | Instrument Sans | 400–600 | 14–15px / 20–23px |
| Labels, buttons | Instrument Sans | 600 | 13–15px |
| Meta (source, time) | Instrument Sans | 400 | 12–13px |
| Small group heading ("Saving") | Instrument Sans | 600 | 13px, `--text-3` |
| Code clips | JetBrains Mono | 400 | 13px |
| Key hints | inherit, in `<kbd>` | 600 | 11–13px, 1px `--border-strong`, radius 6px |

- Fonts are **bundled locally** (Fontsource npm packages, SIL OFL), never loaded from Google's CDN (privacy, offline use, MV3).
- **Users can change the font** in Settings → Appearance: Default (the table above), System (`system-ui`, e.g. SF Pro on a Mac) or Monospace (JetBrains Mono). The choice replaces both `--font-sans` and `--font-display`, so headings and body text match. Code clips stay in JetBrains Mono.
- Sentence case everywhere. No all-caps labels.

---

## 4. Layout and spacing

- **Spacing scale (px):** 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32.
- **Side panel:** designed at **400px wide**; must work from 320px to 600px (Chrome lets users resize). Side padding 18px (14px on dense screens).
- **Quick-paste box:** 480px wide card centered near the top of the page, inside Shadow DOM.
- **Toolbar popup:** 400 × 600px (medium, the default); small 360 × 480px; large 520 × 600px.
- **Touch and click targets:** at least 44 × 44px for icon buttons and list rows (chips may be 32–36px tall).
- **Structure of a panel screen:** header (title + 44px icon buttons) → optional notice → content → sticky footer (privacy line + Pause, or the main action).

### Radii
| Element | Radius |
|---|---|
| Buttons, chips, search field | Fully round (height / 2) |
| Cards, clip previews | 12–16px |
| Sheets, drop zone | 18–24px |
| Folder tile body | `0 12px 12px 12px` (square top-left meets the tab) |
| Folder tab | `8px 8px 0 0`, 56 × 10px |

### Elevation
| Level | Shadow | Use |
|---|---|---|
| 0 | none | Panel content (use borders and tints instead) |
| 1 | `0 1px 3px rgba(27,29,42,0.12)` | Selected segment in a segmented control |
| 2 | `0 14px 36px rgba(27,29,42,0.24)` + 1px hairline | Toasts, menus |
| 3 | `0 20px 48px rgba(27,29,42,0.28)` | Quick-paste box, sheets |

---

## 5. Components

| Component | Spec |
|---|---|
| **Primary button** | `--ink` fill, `--on-ink` text, 600, height 48–52 (full width at the bottom of a screen) or 36 (inline). One per screen. |
| **Secondary button** | `--surface` fill, `--ink` text, same sizes. |
| **Outline button** | 1.5px `--ink` border, transparent, used for Pause. |
| **Icon button** | 44 × 44, round, `--surface` or transparent, `aria-label` required, Lucide icon 18–20px, stroke 2. |
| **Search field** | 44px tall, round, `--surface` fill, search icon, placeholder "Search your clips". Active state: 2px `--link` border. |
| **Folder tile** | Tab (accent) above a tinted body with a 3px accent top border; name 15px/600 + count line 13px. 2-column grid, 10px gap. Compact variant: 4 tiles in one row. |
| **Clip row** | Collection dot (8–10px) · title (14px/600, one line, ellipsis) · meta (12px, `--text-3`) · a copy icon button on the right (Lucide `Copy`, 40px, `--surface`, `aria-label` "Copy" or "Copy image"). Row min-height 48–64px, divider `--border`. Clicking the row opens the clip. |
| **Clip card** (selected / expanded) | 2px `--ink` or accent border, radius 16, padding 14, actions inside. |
| **Chip / filter** | 32px tall, round. Off: 1px `--border-strong` on white. On: `--ink` fill, white text, `aria-pressed`. |
| **Segmented control** | `--surface` track with 4px padding; selected segment white + elevation 1. |
| **Toggle** | Native checkbox with `role="switch"`, accent `--ink`, label on the left, row ≥ 44px. |
| **Notice** | Radius 16, padding 14×16, tinted by meaning (warning, info blue, neutral grey), title 14/600 + one sentence + up to two buttons. One at a time, under search. |
| **Inline confirm** | Replaces browser dialogs. A `--surface` box with a `--danger`-tinted border, shown in place under the control that asked: one sentence, a danger outline button naming the action ("Delete collection") and Cancel. Focus moves to Cancel; Esc cancels; focus returns to the trigger. `role="alertdialog"`. |
| **New collection form** | Inline, above the collection grid (or under the Collection select in clip detail): "Collection name" field (focused, up to 100 characters; rename and import use the same cap), color picker, Create (primary) and Cancel. Enter creates, Esc cancels, an empty name shows "Give the collection a name." |
| **Add clip form** | The + button in the home header ("Add a clip") opens it under the search bar: a "Clip" textarea (focused), Save (primary) and Cancel. Cmd/Ctrl+Enter saves, Esc cancels, empty text shows "Type or paste something to save." Pasting into it stays in the box. Pasted images show as removable previews and the text becomes their note (text pasted with an image lands in the box); other files show "Only PNG, JPG, GIF and WebP images can be saved." |
| **Color picker** | A row of 7 round preset swatches (28px, `role="radio"`, ring on the selected one) and a 12px rainbow bar (`<input type="range">` 0–359, labelled "Custom color", ring when a custom hue is chosen). |
| **Toolbar popup** | The full app, same screens as the side panel. An expand button ("Open in side panel") opens the current screen and search in the side panel. Import in Settings does the same instead of opening a file dialog, because Chrome closes a popup that loses focus. |
| **Toast** | Dark (`--ink`) bar for "Clip deleted · Undo"; white card with thumbnail for "Image saved, filed in Research · Open · Undo" (shown on the page, bottom right, 5s). |
| **Sheet** | Bottom sheet over a scrim, radius 24 top corners, grab handle, close button. |
| **Drop zone** | 3px dashed `--link`, blue-tint fill at 92%, centered illustration + "Drop to save N images". |
| **Drag targets** | Images, colors, clip rows and folder tiles are draggable. Dropping on a folder tile or another strip tile shows a 2px `--ink` outline on the target. A folder dropped on another takes its place; folders never reorder themselves. The folder screen has "Folder N of M" with Move earlier / Move later for keyboard users. Internal drags never trigger the drop zone. |
| **Key hint** | `<kbd>` pill: Enter paste · Esc close. |
| **Empty placeholder** | 2px dashed `--border-strong` tile where collections will appear. |
| **Image placeholder** | Diagonal-stripe fill (`#F1F2F6` / `#E5E7EE`), used until thumbnails load. |

---

## 6. Iconography

- **Lucide** (ISC), stroke width 2, round caps and joins, 16–20px; animated variants from lucide-animated (MIT) for hover/tap feedback only.
- Icons always sit next to a text label, or carry an `aria-label` when alone.
- No emoji as icons. Emoji appear only as user content (emoji board, chat messages).

---

## 7. Motion

Full guidelines: [04-design-resources.md §7](04-design-resources.md). In short:
- Motion answers actions: clip saved → toast slides in; pasted → brief check; deleted → row collapses.
- One signature moment: collections "forming" on first run.
- 120–200ms for small changes, ≤300ms for panel transitions; ease-out in, ease-in out.
- Respect `prefers-reduced-motion`; animate only `transform` and `opacity`.
- Libraries: CSS + Motion (MIT) in the panel; CSS only in the page overlay.

---

## 8. Theme and text

- **Light is the default.** Dark follows the system setting (`prefers-color-scheme`), with an override in Settings (System / Light / Dark).
- Every surface follows that choice: side panel, onboarding, toolbar popup and the quick-paste box. The last choice is cached so pages open in the right theme without a white flash. The in-page "Saved" card stays light.
- Implement themes as CSS variables (the tokens above) under Tailwind v4 theme variables; components never use raw hex values.
- Dark mode swaps the core tokens and uses the dark collection columns; layout and type stay the same (see mockup C1).
- **Text size:** Small 90%, Default 100%, Large 115%, Larger 130%, in Settings → Appearance. Applied as CSS `zoom` on the page, so text, spacing and icons scale together and layouts keep their proportions (most sizes in this doc are px, which a root font size wouldn't scale). The side panel sizes itself by percentage, not `vh`, so the zoom never adds a page scrollbar.
- Theme, font and text size apply to the side panel, onboarding, toolbar popup and quick-paste box, sync between computers with the other settings, and are cached so pages open with them already applied.

---

## 9. Voice and copy

- Plain, active, short. Buttons say exactly what happens ("Copy for group chat", "Turn on auto-save").
- Name things the way users think: "collections", "clips", "Paste as". Not "categories".
- No pop-ups: never use browser dialogs (`alert`, `confirm`, `prompt`). Ask in place with an inline confirm or form.
- Always say where data lives: "Private: stored and sorted on this device."
- Errors explain and offer the fix; empty states invite action ("Copy anything to start").

---

## 10. Accessibility

- Text contrast ≥ 4.5:1 (all token pairs above are chosen for this; re-check any new tint).
- Visible focus ring on every interactive element; full keyboard path through panel, palette and sheets.
- Real `<button>`, `<a>`, `<input>` + `<label>`; icon-only buttons have `aria-label`.
- Collections are distinguishable by name, not color alone.
- Respect reduced motion. Text size steps up to 130% in Settings (see §8); every screen passes axe at that size.

---

## 11. Screen inventory

Every screen and flow below is on the canvas; files are in [`docs/mockups/`](mockups/).

| # | Screen | File |
|---|---|---|
| Home | Folders home (chosen) · dark · compact · timeline variations | `Folders`, `FoldersDark`, `FoldersCompact`, `FoldersTimeline` |
| 1.1–1.5 | Welcome · Turn on auto-save · Empty home · First clip saved | `Welcome`, `Onboarding`, `EmptyHome`, `FirstClip` |
| 2.1–2.5 | Right-click save image · Screenshot an area · Image saved toast · Drop images in · Image detail | `ContextMenu`, `Screenshot`, `SavedToast`, `DropZone`, `ImageDetail` |
| 3.1–3.6 | Search results · Quick-paste box · Clip detail · Emoji and symbols · Toolbar popup | `Search`, `Palette`, `ClipDetail`, `EmojiBoard`, `ToolbarPopup` |
| 4.1 | Inside a collection | `Collection` |
| 5.1–5.3 | Settings · Blocked sites · Notices | `Settings`, `BlockedSites`, `Notices` |
| 6.1–6.2 | Trip collection · Dates and places in a clip | `Trip`, `PlaceDetail` |
| Flows | First run · Saving an image · Find and paste · Planning a trip | `FlowFirstRun`, `FlowImages`, `FlowPaste`, `FlowTravel` |
| Explorations | A Index Card · B Highlighter (not chosen) | `Main`, `Highlighter` |
