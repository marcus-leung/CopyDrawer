import type { BackupFile, ExportedClip } from './backup';
import { escapeHtml as escape } from './format';

const CSS = `
:root { color-scheme: light dark; }
body { margin: 0 auto; max-width: 760px; padding: 32px 20px 64px; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #2a0e12; background: #fff8f0; }
@media (prefers-color-scheme: dark) { body { color: #fff1e6; background: #1c1214; } .meta, .note { color: #bfa59c; } article { border-color: #33242a; } a { color: #ff8a6e; } }
h1 { font-size: 26px; margin: 0 0 4px; }
h2 { font-size: 19px; margin: 36px 0 8px; }
.meta { color: #6e5550; font-size: 13px; }
article { border-top: 1px solid #f0e2d2; padding: 14px 0; }
h3 { font-size: 15px; margin: 0 0 4px; overflow-wrap: anywhere; }
.text { white-space: pre-wrap; overflow-wrap: anywhere; margin: 6px 0; }
.note { color: #5a3a36; margin: 6px 0; }
img { max-width: 100%; max-height: 480px; border-radius: 8px; display: block; margin: 8px 0; }
a { color: #c93214; overflow-wrap: anywhere; }
`;

function clipHtml(c: ExportedClip): string {
  const url = c.source?.url && /^https?:\/\//i.test(c.source.url) ? c.source.url : undefined;
  const from = url
    ? ` · from <a href="${escape(url)}">${escape(c.source?.title || url)}</a>`
    : c.source?.title
      ? ` · from ${escape(c.source.title)}`
      : '';
  const text = c.text.trim();
  const body =
    c.kind === 'image'
      ? c.image?.data
        ? `<img src="${escape(c.image.data)}" alt="${escape(c.title)}">`
        : ''
      : c.kind === 'link' && /^https?:\/\/\S+$/i.test(text)
        ? `<div class="text"><a href="${escape(text)}">${escape(text)}</a></div>`
        : text === c.title.trim()
          ? ''
          : `<div class="text">${escape(c.text)}</div>`;
  return `<article>
<h3>${c.pinned === 1 ? '★ ' : ''}${escape(c.title || c.text.slice(0, 80))}</h3>
<div class="meta">${escape(new Date(c.createdAt).toLocaleString())}${from}</div>
${body}${c.note ? `\n<p class="note">${escape(c.note)}</p>` : ''}
</article>`;
}

/** clips.html in an export: every clip, grouped by collection, readable in any browser. */
export function renderBackupPage(file: BackupFile): string {
  const groups = [...file.collections].sort((a, b) => a.order - b.order).map((c) => ({ id: c.id, name: c.name }));
  const known = new Set(groups.map((g) => g.id));
  const sections = [...groups, { id: undefined, name: 'Not in a collection' }]
    .map((g) => {
      const clips = file.clips.filter((c) => (g.id ? c.collectionId === g.id : !c.collectionId || !known.has(c.collectionId)));
      return clips.length
        ? `<section>\n<h2>${escape(g.name)} <span class="meta">${clips.length}</span></h2>\n${clips.map(clipHtml).join('\n')}\n</section>`
        : '';
    })
    .filter(Boolean)
    .join('\n');
  const count = file.clips.length;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CopyDrawer export</title>
<style>${CSS}</style>
</head>
<body>
<h1>Your clips</h1>
<p class="meta">${count} ${count === 1 ? 'clip' : 'clips'}, exported ${escape(new Date(file.exportedAt).toLocaleString())}. Import the whole .zip in CopyDrawer's Settings to bring them back.</p>
${sections}
</body>
</html>
`;
}
