# 07 · Store listing and launch checklist

Copy for the Chrome Web Store and Microsoft Edge Add-ons, the permission justifications reviewers ask for, and the steps to publish. Product decisions behind it: [02-design.md](02-design.md); GTM: [03-plan.md](03-plan.md).

## 1. Listing

**Name:** Clipboard (working name; check trademark and store search before submitting).

**Short description (≤132 chars):**
> Everything you copy, kept and sorted by on-device AI. Find it by meaning, paste it anywhere with Alt+Shift+V. Private.

**Category:** Productivity / Workflow & Planning.

**Detailed description:**

> Clipboard keeps what you copy and sorts it for you, without sending anything to the cloud.
>
> **Saved, sorted, found**
> • Save text, links, images and screenshots: shortcut, right-click, drag and drop, or automatically when you copy (optional).
> • Smart collections fill themselves: Research, Shopping, Recipes, Code… and trips named after the place ("Lisbon trip").
> • Search by meaning: type "that pasta recipe" and find it even if you never wrote those words.
>
> **Paste it back anywhere**
> • Alt+Shift+V opens quick paste in any text box. Type, press Enter, done.
> • Paste as plain text, a bullet list, a checklist, Markdown, or change the case.
> • With Chrome's built-in AI: summarize, make it friendlier or more formal, fix grammar, translate. Always with a preview.
>
> **Smart actions**
> • Tracking number → Track package. Date → Add to calendar. Address → Open in Maps. Flight number → status.
> • Colors in HEX/RGB/HSL, tidy JSON, links without tracking junk.
>
> **Private by design**
> • No account. Clips stay on your computer. The AI runs on your computer.
> • Never saves password fields, banking or password-manager sites, or sites you block.
> • Open source (GPL-3.0).

**Screenshots (1280×800, 5):** take from the side panel docked next to a real page, light theme:
1. Home with smart collections and recent clips ("Everything you copy, kept and sorted").
2. Search by meaning with filters ("Find it by what it means").
3. Quick paste over a web form ("Paste anywhere with Alt+Shift+V").
4. Clip detail with smart actions (tracking number or event) ("One click to the next step").
5. A trip collection ("Plans sort themselves").

**Small promo tile (440×280):** icon + "Everything you copy, kept and sorted."

**Icon:** `assets/brand/icon.svg`, rendered to `public/icon/*.png` by `node scripts/make-icons.mjs`.

## 2. Privacy tab answers

- **Single purpose:** "Save what the user copies and help them find and paste it again."
- **Data collected:** none sent to the developer. Declare "Website content" is *handled locally*; check the box that data is not sold, not used for unrelated purposes, not used for creditworthiness.
- **Remote code:** No. All code is in the package. The AI runtime (ONNX Runtime WebAssembly) is bundled; the only download is model weights (data) from huggingface.co.
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
| Optional host access `<all_urls>` | Only if the user turns on auto-save: notice copy events on the pages they visit. Requested at that moment, never at install. |

## 4. Publish steps

1. `pnpm compile && pnpm test && pnpm test:e2e` all green.
2. Bump `version` in `package.json`.
3. `pnpm zip` → `.output/clipboard-extension-<version>-chrome.zip`; `pnpm zip:edge` → the Edge zip.
4. Chrome Web Store dashboard: new item → upload zip → listing, privacy, distribution (public, all regions) → submit.
5. Edge Add-ons (Partner Center): same zip from `zip:edge`, same copy.
6. Optional: set `WXT_WAITLIST_URL` to the Pro waitlist form before building (for example in `.env`), so "Email me when it's ready" opens it.

## 5. Before submitting: open items

- [ ] Final name and trademark check.
- [ ] Pro waitlist form URL (`WXT_WAITLIST_URL`).
- [ ] Load the packaged build on a computer that can reach huggingface.co and confirm Settings → On-device AI says "Ready" (the build sandbox couldn't download the model, so this path hasn't run end to end yet).
- [ ] Real-device check of Chrome's built-in AI (Paste as, titles) on a supported computer.
- [ ] Screenshots and promo tile.
