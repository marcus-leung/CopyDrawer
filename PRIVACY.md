# Privacy policy

_Last updated: 12 October 2026_

CopyDrawer is a browser extension that keeps what you copy and sorts it into collections. It is built so that **your clips never leave your computer**.

## What the extension stores

- **Clips you save:** text, links, images and the page they came from (address and title). They are stored in your browser's local storage (IndexedDB) on this computer only.
- **Settings:** your choices (auto-save, blocked sites, theme, and so on), stored on this computer. If you use Chrome sync, Chrome also copies some of them to your other computers through your Google account: the blocked-sites list, whether to save in incognito, how long to keep clips, and the theme, font, text size and popup size. That copy is kept by Chrome sync in your Google account, not on any server of ours. Your clips are never synced.

There is no account, and no server stores your clips.

## Your clipboard

- The extension reads your clipboard only when you press **Grab clipboard**.
- It writes to your clipboard only when you copy a clip, or when quick paste can't type into the box you're in and copies the clip for you to paste instead.

## When the extension reads pages

- **Saving by hand** (shortcut, right-click menu, screenshot tool): Chrome gives the extension access to the current tab only, only at that moment.
- **Quick paste** (Alt+Shift+V) shows your recent clips in a box on the current page and types the one you pick into the box you were typing in. It doesn't save anything from the page.
- **Auto-save** (off until you turn it on): Chrome asks you to allow access to the sites you visit. The extension uses it only to notice when you copy or cut, and saves the text or image you copied. Copy events a page makes up on its own are ignored; a copy still counts when a page puts its own text on the clipboard as you click its copy button, because that's what you copied. It never reads password fields, and never saves:
  - on password-manager, bank, government, sign-in, email, payment, tax, credit, payroll, insurance and health sites (it doesn't even run there);
  - on sites you block;
  - in incognito windows, unless you allow it in Settings.

  You can pause it or turn it off at any time. Turning it off also gives the site access back to Chrome.

## Network requests

- **Saving an image downloads it.** When you save an image (right-click → Save image, or auto-save when you copy one), the extension downloads that one image so it can keep a copy, in one of two ways:
  - **Directly,** without your cookies or sign-ins. It won't follow a redirect, and it doesn't download from addresses on your own computer or local network unless the page itself is there. Right-click → Save image tries this first.
  - **Through the page,** exactly as the page itself could load it, with the page's own sign-in if it has one. Auto-save tries this first, since you copied the image there.

  If the first way fails, the other is tried.

  The image's server sees an ordinary request for that image. Nothing from your clips is sent.
- **Nothing else goes over the network.** Your clips are never sent to the developer or anyone else. Settings travel only through Chrome sync, as described above.
- **Links you open** from the extension (for example "Track package" or "Open address in Maps") open that website in a new tab, like any link.

The extension does not use analytics, ads or trackers, and does not sell or share data. It is not directed at children, and since it collects no personal information from anyone, it collects none from children either.

## Your control

- Delete any clip, everything older than 30 or 90 days, or all clips, in the side panel.
- Export your clips to a .zip file (a readable page, the data and your images), and import them again, in Settings. The file is saved on your computer; nothing is uploaded.
- Uninstalling the extension deletes your clips and settings from this computer.

## Changes

If this policy changes, the new version is posted here with a new date.

## Contact

Questions: email leungmarcus89@gmail.com.
