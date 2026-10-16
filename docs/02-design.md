# 02 · Design

_Process: [Research](01-research.md) → **Design** → [Plan](03-plan.md)_

Status: **decisions locked**; name chosen (CopyDrawer, see [08-branding.md](08-branding.md)). MVP built per [06-build-plan.md](06-build-plan.md). AI features and a paid tier are out of scope for now.

---

## 1. Product definition

**One-liner:** a private clipboard for Chrome. Everything you copy is saved, sorted into collections, and ready to paste again.

**Positioning:** _your clipboard, organized, on your device._ Lead with **free + private + organized**. Competitors are free but flat lists (Clipboard History Pro), organized but Mac-only (Paste, Raycast), or cloud-dependent.

**Target user**

| Persona | Pain | Lead feature | Notes |
|---|---|---|---|
| **A. Students & researchers** | Copying quotes and links from many tabs, losing sources | Collections with sources, search | Huge Chromebook population (Chromebooks rely on extensions; ChromeOS clipboard history is very short); low willingness to pay |
| B. Knowledge workers (ops, marketing, recruiting, support) | Re-copying the same text, forms, templates | Quick paste, Paste as | |
| C. Developers | Code snippets, JSON | Code/JSON smart actions | Vocal and influential; also has the most free alternatives |

✅ **Decision: general audience, targeting A and B together.** The headline uses three points: it sorts itself · find it fast · paste it the way you need. Developer features (C) are a bonus, not the focus.

---

## 2. Selling points

Ranked by marketing strength × feasibility. The first three are the **hero claims** for the store listing and launch. Everything runs on simple rules on the user's computer.

| # | Selling point | Tagline | How it works |
|---|---|---|---|
| 1 | **It sorts itself** | "Never tag a clip again." | Rules sort clips into collections (Research, Links, Code, Shopping, Recipes, Personal) and trips named after the place |
| 2 | **Find it fast** | "That Airbnb link from last week." | Word search that forgives small typos, plus type, site and date filters |
| 3 | **Paste it back anywhere** | "Any clip, in any text box." | Quick-paste box → filter → Enter. Clips with formatting paste as is or as plain text |
| 4 | **Private by design** | "Your clipboard never leaves your device." | No account, no server; the only network requests download images the user saves |
| 5 | **Smart actions** | "Copy a tracking number, get a Track button." | Rules: tracking, address, color, date, JSON, code, email/phone |
| 6 | **Clipboard Guard** _(post-MVP)_ | "Catches passwords and keys." | Rule-based secret detection, auto-expiry |

---

## 3. Capture & permission strategy (critical for store review and trust)

Problem: auto-capturing copies on every site needs `<all_urls>` content scripts → scary warning + in-depth review (weeks).

✅ **Decision: minimal install, auto-capture is opt-in (one click, recommended in onboarding).**

| Mode | Permissions | How capture works |
|---|---|---|
| **Default (install)** | `storage`, `unlimitedStorage`, `sidePanel`, `contextMenus`, `activeTab`, `scripting`, `clipboardRead`, `clipboardWrite`, `alarms` | Shortcut / context menu "Save selection" or "Save image"; paste or drop into panel; "Grab clipboard" button; `activeTab` grants the current page on a user gesture |
| **Auto-capture (opt-in)** | `optional_host_permissions: ["<all_urls>"]`, requested at runtime with a clear explainer. Onboarding step 2 offers "Turn on auto-save" | Content script listens to copy/cut on all sites (including blank and srcdoc editor frames); pause toggle; per-site blocklist; off in incognito by default |

Why: a lighter install warning, a likely smoother first review, and a trust story ("we only read pages if you turn it on"), while most users still end up with auto-capture through onboarding. The production build must not list `<all_urls>` in `host_permissions`; `pnpm check` checks this before every push.

Always excluded (hardcoded + user list): `chrome://` pages, the Web Store, and a built-in list of password-manager, bank, government, sign-in, email, payment, tax, credit, payroll, insurance and health sites (cheap safety net). Auto-save also skips text that looks like a password, access key, private key or card number (`src/lib/secrets.ts`). Only trusted copy events (made by the user, not dispatched by the page) are saved, plus copy-button writes (`navigator.clipboard`) reported within 2 seconds of a real click (a key press on a focused button counts); a copied image is fetched from inside the page, never with the extension's all-sites access.

---

## 4. UX design

### 4.1 Surfaces
1. **Side panel (main home):** search bar, collection folders, images & colors strip, recent clips.
2. **Quick-paste box:** `Alt+Shift+V` overlay (user-changeable; see §9) injected on the current page (via activeTab). Type to filter, Enter to paste, Tab to pick several and paste them joined, Esc to close.
3. **Context menu:** Save selection · Save image · Screenshot an area · Don't save on this site.
4. **Toolbar popup:** the full app (small, medium or large); an expand button opens the same screen and search in the side panel.
5. **Onboarding:** 3 steps: privacy promise → turn on auto-save (recommended; explains page access) → the two shortcuts to know.

### 4.2 Everything happens in the panel
✅ **Decision: no browser dialogs.** Naming a collection, picking its color and confirming deletes all happen inline in the panel (a small confirm box with the action and Cancel; Esc cancels). The only prompt the user ever sees outside the panel is Chrome's own permission request when turning on auto-save, which Chrome requires.

### 4.3 Collections
- Sorted automatically by rules; users can also create their own, rename them, delete them (clips stay in history), move clips by dragging a row or image onto a folder, and reorder folders by dragging them: the other folders slide aside while you drag to show where it will land, like apps on a phone's home screen. Folders keep the order the user set; new ones appear at the end.
- **Colors:** 7 preset swatches plus a rainbow bar for any hue. Custom hues get matching tints and text colors that stay readable in light and dark (checked for every hue in tests).

### 4.4 Images
- Save by paste, drop, right-click "Save image" or a screenshot of an area.
- Drag within the panel: reorder the images & colors strip (order is kept), or drop an image on a collection to file it.
- Drag out: drop an image from the panel onto a page, a document or the desktop. Sites that accept dropped images (most rich editors) receive the full image; plain text boxes don't.

### 4.5 Clip card
Type icon · title · preview (text, image thumbnail, color swatch, code highlighted) · source site · smart-action buttons · pin / collection / delete.

### 4.6 Design principles
Keyboard-first · zero setup · instant (local, < 100 ms search) · calm (no nagging, no pop-ups) · transparent (everything is stored on this computer).

---

## 5. MVP feature spec

| Area | In MVP | Later |
|---|---|---|
| Capture | Text, rich text (stored as HTML + plain), links, images (context menu, paste/drop, region screenshot), **auto-capture opt-in** via onboarding (pause + site blocklist) | OS-wide (desktop companion) |
| Organize | Pins, rule-sorted collections, user collections with colors, drag to file, drag folders to reorder, duplicate merge, retention setting; move or delete several picked clips at once | Shareable boards |
| Find | Ranked search (best match first) with typo tolerance, filters (type, site, date) | |
| Paste | Quick-paste box, **Paste as** (as is or plain text), **copy several at once**: pick clips (numbered in pick order, which is paste order) and Copy all as one clipboard item, joined with a new line, blank line, space or comma, with formatting and images in order; quick paste picks several with Tab | Paste stack |
| Smart | Types + actions (URL clean, color, JSON, code, date, tracking, email/phone) | More detectors |
| Guard | Site blocklist + seed exclusions; auto-save skips passwords, keys and card numbers; Hide previews for screen sharing | Masking secrets saved by hand |
| Data | Local only (a few settings sync through Chrome sync), export/import .zip, wipe all | Sync between devices |

Limit: 5,000 clips **including pins** (images limited by local storage).

---

## 6. Technical architecture

```
┌──────────────── Chrome extension (MV3, WXT + React + TS) ───────────────────────┐
│ Content script (opt-in)   Side panel UI      Popup        Quick-paste box        │
│   copy/cut listener ─┐        │                │              │                  │
│                      ▼        ▼                ▼              ▼                  │
│               Service worker (router, context menus, commands, alarms)           │
│                      │                                                           │
│  Storage: IndexedDB (Dexie) clips, images, collections · chrome.storage settings │
│  Logic: rules (type detection, sorting, smart actions, transforms)               │
└──────────────────────────────────────────────────────────────────────────────────┘
No server. The network requests download images the user saves and, if the user turns on Drive sync, store clips in their own Google Drive app folder. Clips never reach the developer.
```

### 6.1 Data model (IndexedDB)
```
Clip {
  id, createdAt, lastUsedAt, useCount,
  kind: 'text'|'link'|'image'|'code',
  text, html?, title, titleSource: 'heuristic'|'user',
  source?: { url, title, favicon },
  hash, collectionId?, collectionLocked?, pinned, stripRank?,
  image?: { imageId, mime, width, height, bytes, thumb, srcUrl? }
}
Collection { id, key, name, color /* preset name or "hue:<0-359>" */, kind: 'smart'|'trip'|'manual', order }
Settings   { retentionDays, theme, font: 'default'|'system'|'mono', textSize: 90|100|115|130, autoSave, pausedUntil, blockedSites, saveInIncognito }
```

### 6.2 Privacy & security design
- Local-first; no account.
- Analytics: none.
- Open source (GPL-3.0); Chrome's default strict CSP; no remote code; minimal dependencies.
- Supply-chain hygiene: 2FA on the store account, signed releases, lockfile and dependency review. Compromised updates are exactly how 2026's attacks happened.

---

## 7. Decisions log

| # | Decision | Status |
|---|---|---|
| 1 | Audience | ✅ General: students/researchers + knowledge workers |
| 2 | Name/brand | ✅ CopyDrawer (see [08-branding.md](08-branding.md)) |
| 3 | UI framework | ✅ React (+ TypeScript, WXT, Tailwind) |
| 4 | Source model / license | ✅ **Open source, GPL-3.0**; see §8 |
| 5–14 | Product defaults | ✅ Decided; see §9 |
| 15 | AI features and paid tier | ✅ Out of scope for now; the app ships without them |

## 8. Source model / license options

Chrome extension code is shipped as JavaScript that **anyone can download and read**, even if "closed". Keeping it closed protects less than people expect.

| Option | What it means | Pros | Cons |
|---|---|---|---|
| **MIT** (permissive open source) | Anyone may copy, modify, and sell it, even closed-source, if they keep your copyright notice | Max adoption and contributions; simplest; strong trust signal | Anyone can rebrand it and publish a competing (even closed or ad-filled) clone; no recourse |
| **GPL-3.0** (copyleft open source) | Anyone may copy and modify, but if they distribute a modified version, it must also be GPL with source published | Trust signal; clones must stay open, which deters closed copycats | Some companies avoid GPL code; to relicense later you need contributor agreements (CLA); doesn't stop open clones |
| **Source-available** (e.g. FSL, BSL) | Code is public, but competing use is banned for ~2 years, after which it becomes MIT/Apache | Transparency + protection from direct clones | Not "open source" by the official definition; fewer contributors |
| **Closed source** | No public repo | Simplest; maximum legal control | Loses the trust differentiator; code is still inspectable in the store package anyway |

✅ **Decision: open source, GPL-3.0 (GPL-3.0-only).** The repo is public, and the privacy policy is published from `site/` in it. Clones must stay open, and as the sole copyright holder we can still relicense later; outside contributions would need a CLA to keep that option. Bundled libraries' licenses ship in the package as `THIRD_PARTY_LICENSES.txt`. Register the **name as a trademark** later, since licenses don't cover branding.

## 9. Product defaults (decided)

| # | Decision | Outcome |
|---|---|---|
| 5 | History limit | ✅ 5,000 clips, **pins count toward the limit** (lists draw 100 at a time; see `pnpm bench`) |
| 6 | Retention | ✅ Keep until limit (oldest unpinned dropped first); optional auto-delete after 30/90 days, confirmed in place with the number of clips it deletes |
| 7 | Auto-capture default | ✅ **Opt-in**, strongly offered in onboarding (see §3) |
| 8 | Keyboard shortcuts | ✅ Alt+Shift+V (quick paste), Alt+Shift+S (save selection), Alt+Shift+D (screenshot; ⌥⇧X on a Mac, since Chrome on Windows and Linux keeps Alt+Shift+X). **All configurable** (in-app link to `chrome://extensions/shortcuts`) |
| 9 | Main surface | ✅ Side panel + quick-paste box |
| 10 | Passwords/keys handling | ✅ **Out of scope for MVP** (no detection/masking). Only the seed site exclusions from §3 |
| 11 | Analytics | ✅ None |
| 12 | Browsers | ✅ Chrome only at launch · **Safari fast-follow** after v1.0 (see §10) · Firefox removed from scope |
| 13 | Language | ✅ English only for launch, i18n-ready strings |
| 14 | User interviews | ✅ No pre-build interviews; feedback comes from the private beta |

## 10. Safari notes

Safari supports Web Extensions, but it's a different distribution path:
- Requires a **Mac + Xcode** and an **Apple Developer Program membership ($99/yr)**. Distributed via the **Mac App Store** (and iOS/iPadOS if desired), with Apple's App Review.
- The extension is wrapped in a small native app (WXT can build the Safari target; Apple's `safari-web-extension-converter` packages it).
- **Missing APIs vs Chrome:** no Side Panel API (use the popup + a full-page tab view instead), and stricter clipboard and permission behavior.
- ✅ **Decision:** ship Safari as a **fast-follow after the Chrome v1.0**. Building on WXT from day one keeps it cheap, and code is written with browser-specific APIs behind small adapters.

## 11. Visual direction

✅ **Decision: Direction C, "Folders"** (chosen from three mockups: A Index Card, B Highlighter, C Folders). Canvas: https://claude.ai/artifact/416MBBuqTKwgNxzm4zJ7PW (private).

- **Home screen leads with organization:** collections as colored folder tiles (tab + tinted body), then an images & colors strip, then recent clips with one-tap Copy.
- **Look:** white ground, soft grey fills (#F1F2F6), ink #1B1D2A, secondary text #555A6E; one color per collection (presets: blue #2457C5, orange #B35A00, violet #6A46C9, teal #0E7A62, pink, mustard, grey, or any custom hue), each with a light tint for the tile body; pill-shaped search and buttons.
- **Type:** the computer's own system font, with no bundled or downloaded fonts.
- **Privacy line in the footer:** "Private: stored and sorted on this device" + Pause.

## 12. Travel and plans use case (kept simple)

People research trips and hangouts by copying stays, flights, places and dates across many tabs. We keep it to two things. Trips use their own collection color: mustard #7C6A0A (tint #F6F0D5).

| Feature | What it does | Release |
|---|---|---|
| Trip collection | Clips about one destination group into a trip ("Lisbon trip") as one simple list | MVP |
| Calendar and Maps | A date in a clip → one tap adds it to the calendar (.ics); an address → opens in Google Maps (link, no embedded map). Prices stay in their original currency symbol; no conversion | MVP |

Cut to keep it simple: stay comparison table, day-by-day planner, budget totals, vote/hangout modes, shared plans. Revisit only if users ask.

Positioning note: travel stays a strong **marketing hook** ("plan a trip from your clipboard") for both audiences.
