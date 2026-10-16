# Security policy

CopyDrawer sees everything you copy, so security reports get top priority.

## Report a vulnerability

Report privately. Don't open a public issue.

- **GitHub:** [report a vulnerability](https://github.com/marcus-leung/CopyDrawer/security/advisories/new) (Security tab → Report a vulnerability).
- **Email:** leungmarcus89@gmail.com, with "CopyDrawer security" in the subject.

Include the steps to reproduce, the Chrome version, and what an attacker could do. You'll get a reply within a few days. Once a fix ships to the Chrome Web Store, you'll be credited in the advisory unless you ask not to be.

## In scope

- A web page reading, changing or adding clips beyond what [Known limitations](README.md#known-limitations) describes.
- A page or another extension reaching the side panel, popup, quick-paste box or the extension's storage.
- Auto-save keeping a password, key or card number that [`src/lib/secrets.ts`](src/lib/secrets.ts) is meant to catch, or saving on a site it should skip.
- Clip data leaving the computer other than through Google Drive sync, which you turn on yourself.
- A crafted backup file that does harm when imported.

## Supported versions

Only the latest version on the Chrome Web Store gets fixes.
