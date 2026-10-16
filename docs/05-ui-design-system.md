# 05 · UI design system

_Process: Research → **Design** → Plan → Build. Source of truth for how the extension looks and behaves._

- **Chosen direction:** C, "Folders": organized, friendly, light-first. A dark theme is a variation.
- **Live mockups (private canvas):** https://claude.ai/artifact/416MBBuqTKwgNxzm4zJ7PW. Pages: Directions, All screens, Flows.

---

## 1. Principles

1. **Organization first.** Home leads with collections, so users see the product's point in one glance.
2. **One main action per screen.** A single tomato primary button; everything else is quiet.
3. **Private and plain.** Say what stays on the device. No hype, no jargon.
4. **Keyboard-friendly.** Every main action has a shortcut; show key hints where they help.
5. **Warm and calm.** Cream, warm ink and one tomato accent; the other colors come from collections.
6. **Simple beats complete.** Extras wait for user demand (see the travel section in [02-design.md](02-design.md)).

---

## 2. Color

### 2.1 Core tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FFF8F0` cream | `#1C1214` | Panel background |
| `--surface` | `#F7EBDD` | `#2A1D1F` | Search field, secondary buttons, tips |
| `--surface-raised` | `#FFFFFF` | `#241819` | Cards, toasts, popovers |
| `--border` | `#F0E2D2` | `#33242A` | List dividers |
| `--border-strong` | `#E3CDB6` | `#4A3438` | Inputs, chips, outline buttons |
| `--ink` | `#2A0E12` | `#FFF1E6` | Main text, toasts |
| `--on-ink` | `#FFF8F0` | `#1C1214` | Text on ink |
| `--accent` | `#C93214` tomato | `#FF7A5C` | Primary button, picks, active filters, switches, focus ring |
| `--on-accent` | `#FFFFFF` | `#1C1214` | Text on the accent (5.3:1 / 7.2:1) |
| `--text-2` | `#5A3A36` | `#E6CFC4` | Secondary body text |
| `--text-3` | `#6E5550` | `#BFA59C` | Meta text: sources, times, captions |
| `--link` | `#C93214` | `#FF8A6E` | Links (hover `#8F2210` / `#FFB39E`) |
| `--danger` | `#9B1C1C` crimson | `#FF7A90` rose | Delete. Always with its trash icon and the word Delete, so it never depends on telling it from the tomato accent |
| `--info-bg` / `--info-fg` | `#FDE6DC` / `#8F2210` | `#3A1E18` / `#FFB39E` | Drop zone, add form |
| `--success-bg` / `--success-fg` | `#DDF3EC` / `#0B5C4A` | `#163A33` / `#5FD6B5` | Saved checks |
| `--warning-bg` / `--warning-fg` | `#FFF4D6` / `#6B4A00` (border `#F2D27A`) | `#3A2F12` / `#F2D27A` | Paused notice |
| `--scrim` | `rgba(42,14,18,0.25–0.45)` | `rgba(0,0,0,0.5)` | Behind overlays and sheets |

The logo's bright tomato `#FF4A2B` (3.4:1 on cream) is for the logo and store art only, never for text or controls. Code drawn into web pages (the Saved card, the screenshot tool, quick paste) and the exported backup page can't read these tokens, so they repeat the same values.

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
| Personal | `#6E5550` warm grey | `#F7EBDD` | `#5A3A36` | `#BFA59C` | `#2A1D1F` |

Rules:
- Sorted collections get the color of their category; collections users make take the next unused preset, then repeat. Users can change any collection's color.
- **Custom colors:** besides the 7 presets, a rainbow bar picks any hue (stored as `hue:<0-359>`). The app derives the five shades from the hue with fixed lightness steps (accent L34, tint L93, text L22; dark accent L68, dark tint L20), so text stays ≥ 4.5:1 on its tint and the tab ≥ 3:1 on the page for every hue, in light and dark. A unit test checks the 7 presets and all 360 hues against the cream and dark backgrounds.
- Never rely on hue alone: collections also show their name, and the accents differ in lightness.

---

## 3. Typography

| Role | Font | Weight | Size / line height |
|---|---|---|---|
| Screen title ("Your clips") | System font | 800 | 26px / 1.15 (22px on sub-screens) |
| Onboarding headline | System font | 800 | 30–32px / 34–36px |
| Section heading ("Collections") | System font | 600 | 17px |
| Body / clip text | System font | 400–600 | 14–15px / 20–23px |
| Labels, buttons | System font | 600 | 13–15px |
| Meta (source, time) | System font | 400 | 12–13px |
| Small group heading ("Saving") | System font | 600 | 13px, `--text-3` |
| Code clips | System monospace | 400 | 13px |
| Key hints | inherit, in `<kbd>` | 600 | 11–13px, 1px `--border-strong`, radius 6px |

- **No bundled or downloaded fonts:** text uses the computer's own font (`system-ui`: San Francisco on a Mac, Segoe UI on Windows), and code its own monospace font (`ui-monospace`).
- **Users can change the font** in Settings → Appearance: Default (the system font) or Monospace. The choice replaces both `--font-sans` and `--font-display`, so headings and body text match.
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
| **Primary button** | `--accent` fill, `--on-accent` text, 600, height 48–52 (full width at the bottom of a screen) or 36 (inline). One per screen. |
| **Secondary button** | `--surface` fill, `--ink` text, same sizes. |
| **Outline button** | 1.5px `--ink` border, transparent, used for Pause. |
| **Icon button** | 44 × 44, round, `--surface` or transparent, `aria-label` required, Lucide icon 18–20px, stroke 2. |
| **Search field** | 44px tall, round, `--surface` fill, search icon, placeholder "Search your clips". Active state: 2px `--link` border. |
| **Folder tile** | Tab (accent) above a tinted body with a 3px accent top border; name 15px/600 + count line 13px. 2-column grid, 10px gap. Compact variant: 4 tiles in one row. |
| **Clip row** | Type icon in a 40px slot (image thumbnail, color swatch, or a Lucide type icon) · collection dot (8px) and pin before the title · title (14px/600, one line, ellipsis) · meta (12px, `--text-3`) · a copy icon button on the right (Lucide `Copy`, 40px, `--surface`, `aria-label` "Copy" or "Copy image"). Row min-height 48–64px, divider `--border`. Clicking the row opens the clip. |
| **Clip card** (selected / expanded) | 2px `--ink` or accent border, radius 16, padding 14, actions inside. |
| **Pick checkbox** | Picks a clip for copying several at once. Hover or keyboard focus reveals it in the row's icon slot: a 22px box, radius 6, 1.5px `--border-strong` on `--bg`. Picked: `--accent` fill with the pick number (12px/600, `--on-accent`), 1 for the first pick, which is also the paste order. `role="checkbox"`, `aria-label` "Pick <title>". While anything is picked, every row shows the box, clicking a row picks it, and the rows' Copy buttons hide. Cmd/Ctrl-click and Shift-click (range) pick without the box; Cmd/Ctrl+A picks the rows on screen; Esc clears. |
| **Selection bar** | Replaces the home footer while clips are picked, above a 1px `--border` top line: Clear picks ✕ (36px icon button), "N picked" (13px/600, `aria-live`) with "· M not shown" in `--text-2` when a search hides some, ⋯ (36px icon button), and the primary "Copy all" (36px). ⋯ opens a `--surface` sheet above the bar (radius 16): Join with (New line, Blank line, Space, Comma; remembered), Move to (a collection or None), Copy as plain text (outline), Delete N (danger; asks with an inline confirm when some picks are hidden). Toasts sit above the bar. |
| **Chip / filter** | 32px tall, round. Off: 1px `--border-strong` on `--bg`. On: `--accent` fill, `--on-accent` text, `aria-pressed`. |
| **Segmented control** | `--surface` track with 4px padding; selected segment white + elevation 1. |
| **Toggle** | Native checkbox with `role="switch"`, accent `--accent`, label on the left, row ≥ 44px. |
| **Notice** | Radius 16, padding 14×16, tinted by meaning (warning, info, neutral); its button is the accent, title 14/600 + one sentence + up to two buttons. One at a time, under search. |
| **Inline confirm** | Replaces browser dialogs. A `--surface` box with a `--danger`-tinted border, shown in place under the control that asked: one sentence, a danger outline button naming the action ("Delete collection") and Cancel. Focus moves to Cancel; Esc cancels; focus returns to the trigger. `role="alertdialog"`. |
| **New collection form** | Inline, above the collection grid (or under the Collection select in clip detail): "Collection name" field (focused, up to 100 characters; rename and import use the same cap), color picker, Create (primary) and Cancel. Enter creates, Esc cancels, an empty name shows "Give the collection a name." |
| **Add clip form** | The + button in the home header ("Add a clip") opens it under the search bar: a "Clip" textarea (focused), Save (primary) and Cancel. Cmd/Ctrl+Enter saves, Esc cancels, empty text shows "Type or paste something to save." Pasting into it stays in the box. Pasted images show as removable previews and the text becomes their note (text pasted with an image lands in the box); other files show "Only PNG, JPG, GIF and WebP images can be saved." |
| **Color picker** | A row of 7 round preset swatches (28px, `role="radio"`, ring on the selected one) and a 12px rainbow bar (`<input type="range">` 0–359, labelled "Custom color", ring when a custom hue is chosen). |
| **Toolbar popup** | The full app, same screens as the side panel. An expand button ("Open in side panel") opens the current screen and search in the side panel. Import in Settings does the same instead of opening a file dialog, because Chrome closes a popup that loses focus. |
| **Toast** | Dark (`--ink`) bar for "Clip deleted · Undo"; cream card with thumbnail for "Image saved, filed in Research · Open · Undo" (shown on the page, bottom right, 5s). |
| **Sheet** | Bottom sheet over a scrim, radius 24 top corners, grab handle, close button. |
| **Drop zone** | 3px dashed `--link`, `--info-bg` fill at 92%, centered illustration + "Drop to save N images". |
| **Drag targets** | Images, colors, clip rows and folder tiles are draggable. Dropping on a folder tile or another strip tile shows a 2px `--ink` outline on the target. Dragging a folder reorders the grid live: the dragged tile stays as a faded placeholder and the others slide aside (180 ms, none with reduced motion); dropping keeps that order, letting go elsewhere puts it back. Folders never reorder themselves. Internal drags never trigger the drop zone. |
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
- Every surface follows that choice: side panel, onboarding, toolbar popup and the quick-paste box. The last choice is cached so pages open in the right theme without a white flash. The in-page "Saved" card stays light (cream).
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

Every screen and flow below is on the canvas.

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
