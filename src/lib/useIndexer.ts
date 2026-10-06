import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { hashEmbedder } from './embed/hash';
import { indexPending } from './embed/indexer';
import { model, type ModelState } from './embed/model';
import type { Embedder } from './embed/vector';
import { nanoTitle } from './ai/nano';

let active: Embedder = hashEmbedder;
/** The embedder search should use right now: the AI model when loaded, else the offline fallback. */
export function activeEmbedder(): Embedder {
  return active;
}

/** Gives long text clips a short on-device AI title (only when Chrome's AI is ready). */
async function titlePending(limit = 8) {
  const candidates = await db.clips
    .filter((c) => c.titleSource === 'heuristic' && (c.kind === 'text' || c.kind === 'code') && c.text.length > 90)
    .limit(limit)
    .toArray();
  for (const c of candidates) {
    const title = await nanoTitle(c.text);
    if (!title) return; // AI not available; try again another time
    await db.clips.update(c.id, { title, titleSource: 'ai' });
  }
}

/**
 * While the panel is open: loads the AI model (if allowed), adds search vectors
 * to new clips and sorts the ones the rules missed.
 */
export function useIndexer(smartModel: boolean | undefined): ModelState {
  const [state, setState] = useState<ModelState>(model.state);
  const clipCount = useLiveQuery(() => db.clips.count(), [], 0);
  const running = useRef(false);
  const again = useRef(false);

  useEffect(() => model.onState(setState), []);

  useEffect(() => {
    if (smartModel === undefined) return;
    const run = async () => {
      if (running.current) {
        again.current = true;
        return;
      }
      running.current = true;
      try {
        do {
          again.current = false;
          active = smartModel && (await model.load()) ? model : hashEmbedder;
          await indexPending(active);
          await titlePending();
        } while (again.current);
      } catch (e) {
        console.warn('Indexing stopped', e);
        if (active !== hashEmbedder) {
          active = hashEmbedder;
          await indexPending(hashEmbedder).catch(() => {});
        }
      } finally {
        running.current = false;
      }
    };
    void run();
  }, [smartModel, clipCount]);

  return state;
}
