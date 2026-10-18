# 07 · Store listing and launch checklist

Copy for the Chrome Web Store, the permission justifications reviewers ask for, and the steps to publish. Product decisions behind it: [02-design.md](02-design.md); GTM: [03-plan.md](03-plan.md).

## 1. Listing

**Name:** CopyDrawer – Clipboard History (see [08-branding.md](08-branding.md)).

**Short description (≤132 chars):**
> Everything you copy, kept and sorted. Private on your device, with optional sync to your own Google Drive.

This is the manifest `description` in `wxt.config.ts`; the store shows it as the summary.

**Category:** Productivity / Workflow & Planning.

**Detailed description:**

> CopyDrawer keeps what you copy and sorts it for you. Your clips stay on your computer, or sync through your own Google Drive if you want them everywhere.
>
> **Saved, sorted, found**
> • Save text, links, images and screenshots: shortcut, right-click, drag and drop, or automatically when you copy (optional), copy buttons included.
> • Collections fill themselves: Research, Shopping, Recipes, Code… and trips named after the place ("Kyoto trip"). Make your own, pick any color, and drag them into the order you like.
> • Drag images to reorder them, file them in a collection, or drop them straight onto a page.
> • Search that finds the best match first, forgives typos, and filters by type, site and date.
>
> **Paste it back anywhere**
> • Alt+Shift+V opens quick paste in any text box. Type, press Enter, done.
> • Clips with formatting paste as is or as plain text.
> • Pick several clips and copy them together, in the order you choose.
>
> **On all your computers, if you want**
> • Turn on sync and your clips, images and folders follow you to every computer where you use Chrome.
> • It syncs through a hidden folder in your own Google Drive. CopyDrawer can't see your other files, and nothing goes to us.
> • Off by default. Edit a clip on one computer and pin it on another, and both changes are kept.
>
> **Smart actions**
> • Tracking number → Track package. Date → Add to calendar. Address → Open in Maps. Flight number → status.
> • Colors in HEX/RGB/HSL, tidy JSON, links without tracking junk.
>
> **Private by design**
> • No account. Clips stay on your computer unless you turn on sync, and then they go only to your own Google Drive. (Saving an image downloads it from where it's hosted, without your cookies.)
> • Never saves password fields, password-manager, bank, government, sign-in, email, payment, tax, credit, payroll, insurance and health sites, or sites you block. Auto-save skips anything that looks like a password, key or card number.
> • Hide previews with one click while you share your screen.
> • Your clips are never wiped: if your disk fills up, CopyDrawer stops saving and tells you, so nothing already saved is lost. Export everything anytime.

**Screenshots (1280×800, 5):** `assets/store/screenshot-1.png` to `-5.png`. Each has a tomato headline band over a drawn browser window holding a made-up `.example` site and the real side panel (light theme). The sample data is a Kyoto trip. Regenerate with `E2E=1 pnpm exec wxt build && node scripts/make-store-art.mjs`:
1. Home with collections, images and colors ("Everything you copy, kept and sorted").
2. Quick paste in two frames: the box open on a notes page, then the clip typed into the note, with the Windows and Mac shortcuts ("Paste from your history, right where you type").
3. Search with a typo and the filters open ("Find it in seconds").
4. Clip detail with flight and calendar actions ("One click to the next step").
5. Two computers sharing clips through Google Drive ("On all your computers").

**Small promo tile (440×280):** `assets/store/promo-440x280.png`, cream D + "Everything you copy, kept and sorted." on tomato.

**Marquee (1400×560, optional):** `assets/store/marquee-1400x560.png`.

**Icon:** `assets/brand/icon.svg` (`icon-small.svg` at 16 px), rendered to `public/icon/*.png` by `node scripts/make-icons.mjs`. Logo rules: [08-branding.md](08-branding.md) §6.

## 2. Privacy tab answers

- **Single purpose:** "Save what the user copies and help them find and paste it again."
- **Data collected:** nothing is sent to the developer. Google counts data kept on the device and data sent to the user's own Google Drive by Drive sync. Tick:
  - **Website content:** the text and images the user saves.
  - **Web history:** each clip keeps the address and title of the page it came from.

  Then tick all three certifications: not sold or transferred to third parties, not used for purposes unrelated to the single purpose, not used for creditworthiness or lending.
- **Remote code:** No, I am not using remote code. All code is in the package. The only network requests are downloads of images the user chose to save, and, when the user turns on sync, Google Drive API calls that store and read their clips in their own Drive app folder.
- **Privacy policy URL:** https://marcus-leung.github.io/CopyDrawer/privacy, published by GitHub Pages from `site/` in this repo (`site/privacy.md` is the policy). A push to `main` that changes `site/` republishes it.

## 3. Permission justifications

| Permission | Why |
|---|---|
| `storage`, `unlimitedStorage` | Keep clips, images and settings on the user's computer. Images can exceed the default quota. |
| `sidePanel` | The main interface is a side panel next to the page. |
| `contextMenus` | "Save selection", "Save image", "Screenshot an area", "Don't save on this site". |
| `activeTab`, `scripting` | Read the selection, show the "Saved" card, run the screenshot tool and the quick-paste box on the current tab when the user asks. |
| `clipboardRead`, `clipboardWrite` | "Grab clipboard" reads what the user copied; Copy/Paste writes it back. |
| `alarms` | Daily cleanup of clips older than the user's chosen limit, and a sync every minute while Drive sync is on. |
| Optional `identity` | Only if the user turns on Drive sync: sign in with their Google account to keep their clips in a hidden app folder in their own Drive (`drive.appdata` scope only). Requested at that moment, never at install. |
| Optional host access `<all_urls>` | Only if the user turns on auto-save: notice copy events and clicks on copy buttons on the pages they visit, and save the copied text or image. Requested at that moment, never at install. |

## 4. Publish steps

1. `pnpm check` green (CI runs it on every push to `main`).
2. Bump `version` in `package.json`.
3. `COPYDRAWER_OAUTH_CLIENT_ID=<client id> pnpm zip` → `.output/copydrawer-<version>-chrome.zip`. Without the client ID it fails, so a store build always includes sync. CI builds its zip with the `COPYDRAWER_OAUTH_CLIENT_ID` repo variable.
4. Chrome Web Store dashboard: new item → upload zip → listing, privacy, distribution (public, all regions) → submit.

## 5. Drive sync setup

Sync needs a Google OAuth client tied to the store item's extension ID. Do this once.

1. **Store item.** In the Chrome Web Store developer dashboard, create a new item and upload any build of the zip. Save it as a draft; don't submit. Note the item ID. Under Package, choose View public key and copy the key (the text between the BEGIN and END lines, as one line).
2. **Cloud project.** In the [Google Cloud console](https://console.cloud.google.com/), create a project named CopyDrawer. Under APIs & Services → Library, enable the Google Drive API.
3. **Domain.** In [Search Console](https://search.google.com/search-console), add the URL-prefix property `https://marcus-leung.github.io/CopyDrawer/` and choose HTML file verification. Put the file Google gives you in `site/`, push to `main`, and press Verify.
4. **Consent screen.** Under Google Auth Platform (OAuth consent screen): User type External. App name CopyDrawer, your support email, the 120×120 logo from `assets/brand/icon.svg`, home page `https://marcus-leung.github.io/CopyDrawer/`, privacy policy `https://marcus-leung.github.io/CopyDrawer/privacy`, authorized domain `marcus-leung.github.io`. Under Data access, add only `https://www.googleapis.com/auth/drive.appdata`. Under Audience, choose Publish app. `drive.appdata` is a non-sensitive scope, so Google checks only the branding; check the console's verification status after publishing.
5. **OAuth client.** Under Clients, create a client of type Chrome Extension with the item ID. Copy the client ID.
6. **Repo variable.** In the GitHub repo, Settings → Secrets and variables → Actions → Variables, add `COPYDRAWER_OAUTH_CLIENT_ID`. It isn't a secret: it ships in the manifest.
7. **Local builds that can sign in.** Build with `COPYDRAWER_OAUTH_CLIENT_ID=<client id> COPYDRAWER_EXTENSION_KEY=<public key> pnpm build` and load `.output/chrome-mv3` unpacked. The key gives the local build the store's extension ID. `pnpm check` and `pnpm zip` fail if the key would ship.

**Testing the Drive client against real Drive.** `pnpm test:drive` runs the Drive client and two-computer sync against real Google Drive. It needs an access token in `DRIVE_TOKEN`, which you can get without any of the setup above: open the [OAuth Playground](https://developers.google.com/oauthplayground), enter the scope `https://www.googleapis.com/auth/drive.appdata` in the box under the list, choose Authorize APIs, sign in, then choose Exchange authorization code for tokens and copy the access token. It lasts an hour. The test empties that token's app folder first, which belongs to the Playground and holds only test data.

## 6. Before submitting: open items

- [x] Screenshots and promo tile.
- [ ] Trademark check ([08-branding.md](08-branding.md) §4).
- [x] Developer account ($5 one-time, non-trader).
- [x] Drive sync setup (§5), and `pnpm test:drive` passes.
- [x] Sync checked by hand in Chrome with a signed-in build: sign-in, restoring onto a fresh install, turning off with the Drive copy deleted, and signing in again after access was revoked.
- [x] Upload the zip (1.0.1) and submit for review (17 October 2026).
- [ ] Google Auth Platform app published (Audience shows "In production"), so anyone can sign in for sync.
- [ ] After approval: install from the store, check sync, and add the store link to the README and the site.
