export const WORD = /[\p{L}\p{N}]+/gu;

/** Edit distance up to `max` (early exit beyond it). */
export function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]!);
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length]! <= max;
}

/** Words too common to say which clip someone means. */
const FILLER = new Set(
  'a an and are as at be by for from how i in is it me my of on or our that the this to was what when where which who with you your'.split(
    ' ',
  ),
);

/** Typos forgiven in a word: 1 edit from 5 letters, 2 from 9. */
export const typoLimit = (w: string) => (w.length >= 9 ? 2 : w.length >= 5 ? 1 : 0);

interface Indexed {
  hay: string;
  titleWords: Set<string>;
  /** Each word of the text and how often it appears. */
  bodyWords: Map<string, number>;
  length: number;
}

const index = new WeakMap<object, Indexed>();

function indexed<T extends object>(item: T, fields: (item: T) => { title: string; body: string }): Indexed {
  let entry = index.get(item);
  if (!entry) {
    const { title, body } = fields(item);
    const t = title.toLowerCase();
    const b = body.toLowerCase();
    const bodyWords = new Map<string, number>();
    const words = b.slice(0, 20_000).match(WORD) ?? [];
    for (const w of words) bodyWords.set(w, (bodyWords.get(w) ?? 0) + 1);
    entry = { hay: `${t}\n${b}`, titleWords: new Set(t.match(WORD) ?? []), bodyWords, length: words.length };
    index.set(item, entry);
  }
  return entry;
}

/** How well `word` matches each part: whole word 1, start of a word 0.8, a small typo 0.6, anywhere else in the text 0.5. */
function matchWord(word: string, it: Indexed): { title: number; body: number } | null {
  const quality = (w: string) => (w === word ? 1 : w.startsWith(word) ? 0.8 : 0);
  let title = 0;
  for (const w of it.titleWords) title = Math.max(title, quality(w));
  let body = 0;
  for (const [w, n] of it.bodyWords) {
    const q = quality(w);
    if (q) body += q * n;
  }
  if (title || body) return { title, body };
  if (it.hay.includes(word)) return { title: 0, body: 0.5 };
  const max = typoLimit(word);
  if (!max) return null;
  for (const w of it.titleWords) if (withinEdits(word, w, max)) return { title: 0.6, body: 0 };
  for (const [w, n] of it.bodyWords) if (withinEdits(word, w, max)) return { title: 0, body: 0.6 * n };
  return null;
}

/**
 * Items matching any word of a short query, or half the words of a longer one (filler words aside). Those with every
 * word come first, in the order given (newest first, as before ranking); the rest follow by a BM25-style score
 * (rare words count more, title matches double, repeats count less and less).
 */
export function rankByQuery<T extends object>(
  items: T[],
  query: string,
  fields: (item: T) => { title: string; body: string },
): T[] {
  const typed = [...new Set(query.toLowerCase().match(WORD) ?? [])];
  // Only punctuation ("@", "://"): find it as typed.
  if (!typed.length) {
    const q = query.trim().toLowerCase();
    return q ? items.filter((item) => indexed(item, fields).hay.includes(q)) : items;
  }
  const meaningful = typed.filter((w) => !FILLER.has(w));
  const words = meaningful.length ? meaningful : typed;
  const all = items.map((item) => indexed(item, fields));
  const avgLength = all.reduce((sum, it) => sum + it.length, 0) / Math.max(1, all.length) || 1;
  const matches = all.map((it) => words.map((w) => matchWord(w, it)));
  const docFreq = words.map((_, i) => matches.reduce((n, m) => n + (m[i] ? 1 : 0), 0));
  const idf = docFreq.map((df) => Math.log(1 + (all.length - df + 0.5) / (df + 0.5)));
  const need = words.length <= 3 ? 1 : Math.ceil(words.length / 2);

  return items
    .map((item, i) => {
      const found = matches[i]!;
      const hits = found.filter(Boolean).length;
      const norm = 0.25 + (0.75 * all[i]!.length) / avgLength;
      const score = found.reduce(
        (sum, m, w) => (m ? sum + idf[w]! * (2 * m.title + (m.body * 2.2) / (m.body + 1.2 * norm)) : sum),
        0,
      );
      return { item, i, hits, score };
    })
    .filter((r) => r.hits >= need)
    .sort((a, b) => {
      const everyWord = Number(b.hits === words.length) - Number(a.hits === words.length);
      return everyWord || (a.hits === words.length ? 0 : b.score - a.score) || a.i - b.i;
    })
    .map((r) => r.item);
}
