# Privacy policy

_Last updated: 11 October 2026_

CopyDrawer is a browser extension that keeps what you copy and sorts it into collections. It is built so that **your clips never leave your computer**.

## What the extension stores

- **Clips you save:** text, links, images and the page they came from (address and title). They are stored in your browser's local storage (IndexedDB) on this computer only.
- **Settings:** your choices (auto-save, blocked sites, theme, and so on), stored locally. If you use Chrome sync, Chrome also copies some of them to your other computers through your Google account: the blocked-sites list, whether to save in incognito, how long to keep clips, and the theme, font, text size and popup size. That copy is kept by Chrome sync in your Google account, not on any server of ours. Your clips are never synced.

There is no account, and no server stores your clips.

## When the extension reads pages

- **Saving by hand** (shortcut, right-click menu, screenshot tool, quick paste): Chrome gives the extension access to the current tab only, only at that moment.
- **Auto-save** (off until you turn it on): Chrome asks you to allow access to the sites you visit. The extension uses it only to notice when you copy or cut, and saves the text or image you copied. Only copies you make count; a page can't fake one. It never reads password fields, and never saves on password-manager, bank, government, sign-in, email, payment, tax, credit, payroll, insurance and health sites or on sites you block. You can pause it or turn it off at any time.

## Network requests

- **Saving an image downloads it from where it's hosted.** When you save an image (right-click → Save image, or auto-save when you copy one), the extension downloads that one image from its own web address so it can keep a copy. Either the page loads it, exactly as the page itself could (with the page's own sign-in, if it has one), or the extension downloads it directly without your cookies or sign-ins. A direct download never reaches your own computer or local network unless the page itself is there. The image's server sees an ordinary request for that image; nothing from your clips is sent.
- **Nothing else goes over the network.** Your clips are never sent to the developer or anyone else, and settings travel only through Chrome sync as described above.
- **Links you open** from the extension (for example "Track package" or "Open address in Maps") open that website in a new tab, like any link.

The extension does not use analytics, ads or trackers, and does not sell or share data.

## Your control

- Delete any clip, everything older than 30 or 90 days, or all clips, in the side panel.
- Export your clips to a .zip file (a readable page, the data and your images), and import them again, in Settings. The file is saved on your computer; nothing is uploaded.
- Uninstalling the extension deletes everything it stored.

## Contact

Questions: open an issue at https://github.com/marcus-leung/clipboard/issues.
