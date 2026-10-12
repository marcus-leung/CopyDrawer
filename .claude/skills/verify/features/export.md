# Export

Settings → Export (or Export now on the backup reminder) downloads `clipboard-export-YYYY-MM-DD.zip`: `clips.html` to read in any browser, `clips.json` (version 2, pretty-printed) that Import reads, and `images/` with the full-size files. Import takes the .zip (also one zipped again as a folder) or an older .json export; it rebuilds previews and sizes from the images, and skips anything that isn't a real image under 20 MB.

## Sub-features

- `export-zip` the download is a .zip with clips.html, clips.json and images/.
- `export-page` clips.html groups clips by collection with dates, sources, notes, pins and images; all text is escaped.
- `import-zip` importing the .zip restores clips, folders, pins, notes and image bytes; nothing is duplicated on a second import.
- `import-v1` an older single-file .json export still imports.

## How to get to it (user POV)

- Settings → Your data → Export / Import.
- The "Back up your clips" notice on home → Export now.

## Driving it with Playwright

Preconditions:

- Baseline from the index, a few clips (paste into the panel), and one image (paste an image file).

- **Export.** `Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export' }).click()])`.
- **Inspect.** `unzipSync(new Uint8Array(fs.readFileSync(await download.path())))` from `fflate`.
- **Read it.** Write the entries to a folder and `page.goto('file://…/clips.html')`.
- **Import.** `page.locator('input[type=file]').setInputFiles(zipPath)`; status `Imported N clips`.
- **Proof.** `specs/export-page.spec.ts` exports from the real extension, unzips to `verify-evidence/export/unzipped/` and screenshots clips.html.

## Gotchas

- In the toolbar popup, Import opens Settings in the side panel instead of a file dialog (a file dialog would close the popup).
- Clip text comes from web pages: check that tags show as text in clips.html and that only http(s) links are clickable.
