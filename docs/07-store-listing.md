# 07 · Store listing and launch checklist

Copy for the Chrome Web Store and Microsoft Edge Add-ons, the permission justifications reviewers ask for, and the steps to publish. Product decisions behind it: [02-design.md](02-design.md); GTM: [03-plan.md](03-plan.md).

## 1. Listing

**Name:** CopyDrawer – Smart Clipboard Manager (see [08-branding.md](08-branding.md)).

**Short description (≤132 chars):**
> Everything you copy, kept and sorted into collections. Find it fast, paste it anywhere with Alt+Shift+V. Private, on your device.

**Category:** Productivity / Workflow & Planning.

**Detailed description:**

> CopyDrawer keeps what you copy and sorts it for you, without sending anything to the cloud.
>
> **Saved, sorted, found**
> • Save text, links, images and screenshots: shortcut, right-click, drag and drop, or automatically when you copy (optional).
> • Collections fill themselves: Research, Shopping, Recipes, Code… and trips named after the place ("Lisbon trip"). Make your own and pick any color.
> • Drag images to reorder them, file them in a collection, or drop them straight onto a page.
> • Search that forgives typos, with filters for type, site and date.
>
> **Paste it back anywhere**
> • Alt+Shift+V opens quick paste in any text box. Type, press Enter, done.
> • Clips with formatting paste as is or as plain text.
>
> **Smart actions**
> • Tracking number → Track package. Date → Add to calendar. Address → Open in Maps. Flight number → status.
> • Colors in HEX/RGB/HSL, tidy JSON, links without tracking junk.
>
> **Private by design**
> • No account. Clips stay on your computer. The extension sends nothing anywhere.
> • Never saves password fields, password-manager, bank, government, sign-in, email, payment, tax, credit, payroll, insurance and health sites, or sites you block.
> • Open source (GPL-3.0).

**Screenshots (1280×800, 5):** take from the side panel docked next to a real page, light theme:
1. Home with collections and recent clips ("Everything you copy, kept and sorted").
2. Search with filters ("Find it in seconds").
3. Quick paste over a web form ("Paste anywhere with Alt+Shift+V").
4. Clip detail with smart actions (tracking number or event) ("One click to the next step").
5. A trip collection ("Plans sort themselves").

**Small promo tile (440×280):** icon + "Everything you copy, kept and sorted."

**Icon:** `assets/brand/icon.svg`, rendered to `public/icon/*.png` by `node scripts/make-icons.mjs`.

## 2. Privacy tab answers

- **Single purpose:** "Save what the user copies and help them find and paste it again."
- **Data collected:** none sent to the developer. Declare "Website content" is *handled locally*; check the box that data is not sold, not used for unrelated purposes, not used for creditworthiness.
- **Remote code:** No. All code is in the package, and the extension makes no network requests.
- **Privacy policy URL:** link to `PRIVACY.md` on GitHub (or a GitHub Pages copy).

## 3. Permission justifications

| Permission | Why |
|---|---|
| `storage`, `unlimitedStorage` | Keep clips, images and settings on the user's computer. Images can exceed the default quota. |
| `sidePanel` | The main interface is a side panel next to the page. |
| `contextMenus` | "Save selection", "Save image", "Screenshot an area", "Don't save on this site". |
| `activeTab`, `scripting` | Read the selection, show the "Saved" card, run the screenshot tool and the quick-paste box on the current tab when the user asks. |
| `clipboardRead`, `clipboardWrite` | "Grab clipboard" reads what the user copied; Copy/Paste writes it back. |
| `alarms` | Daily cleanup of clips older than the user's chosen limit. |
| Optional host access `<all_urls>` | Only if the user turns on auto-save: notice copy events on the pages they visit and save the copied text or image. Requested at that moment, never at install. |

## 4. Publish steps

1. `pnpm compile && pnpm test && pnpm test:e2e` all green.
2. Bump `version` in `package.json`.
3. `pnpm zip` → `.output/copydrawer-<version>-chrome.zip`; `pnpm zip:edge` → the Edge zip.
4. Chrome Web Store dashboard: new item → upload zip → listing, privacy, distribution (public, all regions) → submit.
5. Edge Add-ons (Partner Center): same zip from `zip:edge`, same copy.

## 5. Before submitting: open items

- [ ] Final name and trademark check.
- [ ] Screenshots and promo tile.
