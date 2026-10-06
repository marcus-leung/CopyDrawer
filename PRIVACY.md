# Privacy policy

_Last updated: 6 October 2026_

Clipboard is a browser extension that keeps what you copy and sorts it into collections. It is built so that **your clips never leave your computer**.

## What the extension stores

- **Clips you save:** text, links, images and the page they came from (address and title). They are stored in your browser's local storage (IndexedDB) on this computer only.
- **Settings:** your choices (auto-save, blocked sites, theme, and so on), stored locally.
- **Search data:** short number lists ("vectors") made from your clips so you can search by meaning. Made and stored on this computer.

There is no account, and no server stores your clips.

## When the extension reads pages

- **Saving by hand** (shortcut, right-click menu, screenshot tool, quick paste): Chrome gives the extension access to the current tab only, only at that moment.
- **Auto-save** (off until you turn it on): Chrome asks you to allow access to the sites you visit. The extension uses it only to notice when you copy or cut text, and saves that text. It never reads password fields, and never saves on banking and password-manager sites or on sites you block. You can pause it or turn it off at any time.

## Network requests

- **AI model download:** the first time the side panel opens with "Sort and search by meaning" on, the extension downloads a small open-source language model (about 25 MB, all-MiniLM-L6-v2) from Hugging Face (huggingface.co). This is a plain file download: **no clip content is sent**. Hugging Face's own privacy policy applies to that request. You can turn this off in Settings, On-device AI.
- **Chrome's built-in AI** (titles, rewriting, summaries, translation) runs on your computer through Chrome. If you choose to download it, Chrome downloads the model; the extension sends nothing.
- **Links you open** from the extension (for example "Track package" or "Open address in Maps") open that website in a new tab, like any link.
- **Pro waitlist:** if you click "Email me when it's ready", a form opens in a new tab. Anything you enter there goes to that form's provider, and only what you type.

The extension does not use analytics, ads or trackers, and does not sell or share data.

## Your control

- Delete any clip, everything older than 30 or 90 days, or all clips, in the side panel.
- Export your clips to a file, and import them again, in Settings.
- Uninstalling the extension deletes everything it stored.

## Contact

Questions: open an issue at https://github.com/marcus-leung/clipboard/issues.
