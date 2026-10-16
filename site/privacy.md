---
title: CopyDrawer privacy policy
permalink: /privacy
---

# Privacy policy

_Last updated: 15 October 2026_

CopyDrawer is a browser extension that keeps what you copy and sorts it into collections. It is built so that **your clips stay on your computer**, unless you turn on Google Drive sync, which keeps a copy in your own Google Drive.

## What the extension stores

- **Clips you save:** text, links, images and the page they came from (address and title). They are stored in your browser's local storage (IndexedDB) on this computer only.
- **Settings:** your choices (auto-save, blocked sites, theme, and so on), stored on this computer. If you use Chrome sync, Chrome also copies some of them to your other computers through your Google account: the blocked-sites list, whether to save in incognito, how long to keep clips, and the theme, font, text size and popup size. That copy is kept by Chrome sync in your Google account, not on any server of ours. Your clips are never synced.

There is no CopyDrawer account, and no server of ours stores your clips.

## Your clipboard

- The extension reads your clipboard only when you press **Grab clipboard**.
- It writes to your clipboard only when you copy a clip, or when quick paste can't type into the box you're in and copies the clip for you to paste instead.

## When the extension reads pages

- **Saving by hand** (shortcut, right-click menu, screenshot tool): Chrome gives the extension access to the current tab only, only at that moment.
- **Quick paste** (Alt+Shift+V) shows your recent clips in a box on the current page and types the one you pick into the box you were typing in. It doesn't save anything from the page.
- **Auto-save** (off until you turn it on): Chrome asks you to allow access to the sites you visit. The extension uses it only to notice when you copy or cut, or click a page's copy button, and saves the text or image you copied. Copies a page makes on its own, without your click or key press, are ignored. It never reads password fields, and never saves:
  - on password-manager, bank, government, sign-in, email, payment, tax, credit, payroll, insurance and health sites (it doesn't even run there);
  - on sites you block;
  - in incognito windows, unless you allow it in Settings;
  - anything that looks like a password, access key, private key or card number. You can still save one on purpose by pasting it into CopyDrawer.

  You can pause it or turn it off at any time. Turning it off also gives the site access back to Chrome.

## Google Drive sync

Sync is off until you turn it on in Settings. It keeps the same clips on every computer where you turn it on.

- **What it stores, and where.** Your clips, images and folders, with each clip's page address and title, are copied to a hidden app folder in **your own Google Drive**. Settings aren't part of it; they go through Chrome sync as described above.
- **What it can see.** Chrome asks you to sign in and to allow access to the app folder only (the `drive.appdata` permission). CopyDrawer can't see, open or change any other file in your Drive, and the app folder doesn't show among your files.
- **Who can read it.** Only you, through your Google account. The copy goes straight from your browser to Google Drive; it never passes through or reaches the developer. Google stores it under [Google's privacy policy](https://policies.google.com/privacy).
- **Turning it off.** Turn off sync in Settings to stop. You can also choose to delete the Drive copy at the same moment. Uninstalling the extension doesn't delete the Drive copy: delete it in Settings first, or in Google Drive under Settings → Manage apps → CopyDrawer → Options → Delete hidden app data. You can remove CopyDrawer's access at any time at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

CopyDrawer's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements. It uses your Drive data only to sync your clips between your computers, never for ads, and never sells it or shares it with anyone.

## Network requests

- **Saving an image downloads it.** When you save an image (right-click → Save image, or auto-save when you copy one), the extension downloads that one image so it can keep a copy, in one of two ways:
  - **Directly,** without your cookies or sign-ins. It won't follow a redirect, and it doesn't download from addresses on your own computer or local network unless the page itself is there. Right-click → Save image tries this first.
  - **Through the page,** exactly as the page itself could load it, with the page's own sign-in if it has one. Auto-save tries this first, since you copied the image there.

  If the first way fails, the other is tried.

  The image's server sees an ordinary request for that image. Nothing from your clips is sent.
- **Drive sync,** if you turn it on, sends your clips to and from your own Google Drive, as described above.
- **Nothing else goes over the network.** Your clips are never sent to the developer or anyone else. Settings travel only through Chrome sync, as described above.
- **Links you open** from the extension (for example "Track package" or "Open address in Maps") open that website in a new tab, like any link.

The extension does not use analytics, ads or trackers, and does not sell or share data. It is not directed at children, and since it collects no personal information from anyone, it collects none from children either.

## Your control

- Delete any clip, everything older than 30 or 90 days, or all clips, in the side panel. With sync on, a delete also applies on your other computers and in the Drive copy.
- Export your clips to a .zip file (a readable page, the data and your images), and import them again, in Settings. The file is saved on your computer; nothing is uploaded.
- Uninstalling the extension deletes your clips and settings from this computer. It doesn't delete a Drive sync copy; see Google Drive sync above.

## Changes

If this policy changes, the new version is posted here with a new date.

## Contact

Questions: email leungmarcus89@gmail.com.
