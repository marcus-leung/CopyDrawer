import { normalize, type Embedder } from './vector';

/**
 * Offline fallback "embedding": hashed words and character trigrams. It finds
 * near-duplicates, typos and shared words, not meaning. Used when the AI model
 * can't load (no network on first run, very old hardware).
 */
export const HASH_KEY = 'hash-v1';
const DIM = 512;
const STOP = new Set(
  'a an and are as at be by for from has have i in is it its of on or that the this to was were will with you your'.split(' '),
);

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function hashEmbed(text: string): Float32Array {
  const v = new Float32Array(DIM);
  const add = (token: string, weight: number) => {
    const h = fnv1a(token);
    v[h % DIM]! += (h & 0x80000000 ? -1 : 1) * weight;
  };
  const plain = text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const words = plain.match(/[\p{L}\p{N}]+/gu) ?? [];
  for (const raw of words) {
    if (STOP.has(raw)) continue;
    const w = stem(raw);
    add(`w:${w}`, 1);
    const padded = ` ${w} `;
    for (let i = 0; i + 3 <= padded.length; i++) add(`t:${padded.slice(i, i + 3)}`, 0.4);
  }
  return normalize(v);
}

export const hashEmbedder: Embedder = {
  key: HASH_KEY,
  semantic: false,
  embed: async (texts) => texts.map(hashEmbed),
};
