import { db as defaultDb, type Clip, type ClipDatabase } from '../db';
import { CATEGORIES, type CategoryId } from '../classify';
import { assignCategory } from '../collections';
import { cosine, type Embedder } from './vector';

/** What the model reads for a clip: title, the start of the text, and the page title. */
function textForEmbedding(clip: Pick<Clip, 'title' | 'text' | 'source' | 'kind'>): string {
  const parts = [clip.title, clip.kind === 'image' ? '' : clip.text.slice(0, 1000), clip.source?.title ?? ''];
  return parts.filter(Boolean).join('\n');
}

const prototypeCache = new Map<string, { id: CategoryId; vectors: Float32Array[] }[]>();

async function prototypes(embedder: Embedder) {
  const cached = prototypeCache.get(embedder.key);
  if (cached) return cached;
  const cats = Object.values(CATEGORIES);
  const vectors = await embedder.embed(cats.flatMap((c) => c.prototypes));
  let i = 0;
  const result = cats.map((c) => ({ id: c.id, vectors: c.prototypes.map(() => vectors[i++]!) }));
  prototypeCache.set(embedder.key, result);
  return result;
}

/** Thresholds for MiniLM cosine similarity. */
const CATEGORY_MIN = 0.4;
const CATEGORY_MARGIN = 0.04;
const EXAMPLE_MIN = 0.72;

/**
 * Picks a collection for a clip the rules couldn't sort:
 * 1. a collection where the user put a very similar clip ("future clips like it follow"),
 * 2. otherwise the closest category, if clearly closest (semantic models only).
 */
async function suggestCollection(
  clip: Clip,
  embedder: Embedder,
  examples: Clip[],
): Promise<{ collectionId: string } | { category: CategoryId } | null> {
  if (!clip.embedding) return null;
  let best: { sim: number; collectionId: string } | null = null;
  for (const ex of examples) {
    if (!ex.embedding || ex.id === clip.id || !ex.collectionId) continue;
    const sim = cosine(clip.embedding, ex.embedding);
    if (!best || sim > best.sim) best = { sim, collectionId: ex.collectionId };
  }
  const exampleMin = embedder.semantic ? EXAMPLE_MIN : 0.6;
  if (best && best.sim >= exampleMin) return { collectionId: best.collectionId };

  if (!embedder.semantic || clip.kind === 'image') return null;
  const scored = (await prototypes(embedder))
    .map((p) => ({ id: p.id, sim: Math.max(...p.vectors.map((v) => cosine(clip.embedding!, v))) }))
    .sort((a, b) => b.sim - a.sim);
  const [first, second] = scored;
  if (first && first.sim >= CATEGORY_MIN && (!second || first.sim - second.sim >= CATEGORY_MARGIN)) {
    return { category: first.id };
  }
  return null;
}

/**
 * Adds vectors to clips that don't have one from this embedder, then sorts
 * unsorted clips. Runs in small batches; safe to call repeatedly.
 */
export async function indexPending(
  embedder: Embedder,
  db: ClipDatabase = defaultDb,
  opts: { batch?: number; signal?: AbortSignal } = {},
): Promise<number> {
  const batchSize = opts.batch ?? 16;
  let done = 0;
  for (;;) {
    if (opts.signal?.aborted) break;
    const batch = await db.clips
      .filter((c) => c.embeddingModel !== embedder.key)
      .limit(batchSize)
      .toArray();
    if (!batch.length) break;
    const vectors = await embedder.embed(batch.map(textForEmbedding));
    await db.clips.bulkUpdate(
      batch.map((c, i) => ({ key: c.id, changes: { embedding: vectors[i], embeddingModel: embedder.key } })),
    );
    done += batch.length;

    const examples = await db.clips.filter((c) => c.collectionLocked === 1 && c.embeddingModel === embedder.key).toArray();
    for (const [i, c] of batch.entries()) {
      if (c.collectionId || c.collectionLocked) continue;
      const suggestion = await suggestCollection({ ...c, embedding: vectors[i] }, embedder, examples);
      if (!suggestion) continue;
      if ('collectionId' in suggestion) await db.clips.update(c.id, { collectionId: suggestion.collectionId });
      else await assignCategory(c.id, suggestion.category, db);
    }
  }
  return done;
}

/** Vector search: clips ranked by similarity to the query. */
export async function semanticSearch(
  query: string,
  embedder: Embedder,
  clips: Clip[],
  minScore = embedder.semantic ? 0.25 : 0.15,
): Promise<{ clip: Clip; score: number }[]> {
  const [q] = await embedder.embed([query]);
  if (!q) return [];
  return clips
    .filter((c) => c.embedding && c.embeddingModel === embedder.key)
    .map((clip) => ({ clip, score: cosine(q, clip.embedding!) }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score);
}
