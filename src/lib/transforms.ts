/**
 * "Paste as": ways to reshape a clip before pasting. They run anywhere (side
 * panel, service worker, quick-paste box).
 */
export type Transform = 'asis' | 'plain' | 'markdown' | 'bullets' | 'checklist' | 'oneline' | 'upper' | 'lower' | 'title';

export const TRANSFORMS: { id: Transform; label: string }[] = [
  { id: 'asis', label: 'Paste as is' },
  { id: 'plain', label: 'Plain text' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'bullets', label: 'Bullet list' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'oneline', label: 'One line' },
  { id: 'upper', label: 'UPPERCASE' },
  { id: 'lower', label: 'lowercase' },
  { id: 'title', label: 'Title Case' },
];

const BULLET = /^\s*(?:[-*•–·]|\d+[.)]|\[[ xX]?\])\s+/;

/** Splits text into list items: lines, else a comma list, else sentences. */
export function listItems(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(BULLET, '').trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;
  const one = lines[0] ?? '';
  // Commas outside parentheses: "12 oz spaghetti, 1 lemon (zest, juice), salt".
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of one) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  const clean = parts
    .map((p) =>
      p
        .trim()
        .replace(/^and\s+/i, '')
        .replace(/\.$/, ''),
    )
    .filter(Boolean);
  if (clean.length >= 3) return clean;
  const sentences =
    one
      .match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? [];
  return sentences.length > 1 ? sentences : one ? [one] : [];
}

const SMALL = new Set('a an and as at but by for in nor of on or the to up via vs'.split(' '));

export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu, (w, offset: number) =>
      offset > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1),
    );
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
function decode(s: string): string {
  return s.replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#')
      return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Small HTML → Markdown converter for copied page fragments (no DOM needed). */
export function htmlToMarkdown(html: string): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/\r?\n/g, ' ');
  s = s.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, c: string) => `\n\n\`\`\`\n${c.replace(/<[^>]+>/g, '')}\n\`\`\`\n\n`);
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n: string, c: string) => `\n\n${'#'.repeat(Number(n))} ${c}\n\n`);
  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, '_$2_');
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  s = s.replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, c: string) =>
    href.startsWith('javascript:') ? c : `[${c}](${href})`,
  );
  s = s.replace(/<li[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/?(p|div|ul|ol|blockquote|section|article|tr|table)[^>]*>/gi, '\n\n');
  s = decode(s.replace(/<[^>]+>/g, ''));
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n[ ]+(?=\S)/g, (m) => (m.includes('- ') ? m : '\n'))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Applies a transform. Never fails. */
export function applyTransform(t: Transform, text: string, html?: string): string {
  switch (t) {
    case 'asis':
    case 'plain':
      return text;
    case 'markdown':
      return html ? htmlToMarkdown(html) : text;
    case 'bullets':
      return listItems(text)
        .map((i) => `- ${i}`)
        .join('\n');
    case 'checklist':
      return listItems(text)
        .map((i) => `- [ ] ${i}`)
        .join('\n');
    case 'oneline':
      return text.replace(/\s+/g, ' ').trim();
    case 'upper':
      return text.toUpperCase();
    case 'lower':
      return text.toLowerCase();
    case 'title':
      return titleCase(text);
  }
}
