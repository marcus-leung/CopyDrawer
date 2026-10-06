import type { Embedder } from './vector';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const MODEL_KEY = 'minilm-l6-q8';

export type ModelState =
  { status: 'idle' } | { status: 'loading'; progress?: number } | { status: 'ready' } | { status: 'failed'; message: string };

type Listener = (s: ModelState) => void;

/** Talks to the model worker. One per page; the worker loads the model lazily. */
class ModelClient implements Embedder {
  key = MODEL_KEY;
  semantic = true;
  state: ModelState = { status: 'idle' };
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: Float32Array[] | true) => void; reject: (e: Error) => void }>();
  private listeners = new Set<Listener>();

  onState(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(state: ModelState) {
    this.state = state;
    for (const fn of this.listeners) fn(state);
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./model.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        if (msg.status === 'progress' && typeof msg.progress === 'number')
          this.set({ status: 'loading', progress: msg.progress });
        return;
      }
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.type === 'error') p.reject(new Error(msg.message));
      else p.resolve(msg.type === 'ready' ? true : (msg.vectors as Float32Array[]));
    };
    worker.onerror = (e) => {
      this.set({ status: 'failed', message: e.message || 'Worker failed' });
      for (const p of this.pending.values()) p.reject(new Error('Worker failed'));
      this.pending.clear();
      this.worker = null;
    };
    this.worker = worker;
    return worker;
  }

  private call<T extends Float32Array[] | true>(msg: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: Float32Array[] | true) => void, reject });
      this.getWorker().postMessage({ ...msg, id, modelId: MODEL_ID });
    });
  }

  /** Loads the model once. After a failure it waits for an explicit retry (`force`). */
  async load(force = false): Promise<boolean> {
    if (this.state.status === 'ready') return true;
    if (this.state.status === 'failed' && !force) return false;
    if (this.loading) return this.loading;
    this.loading = this.doLoad().finally(() => (this.loading = null));
    return this.loading;
  }

  private loading: Promise<boolean> | null = null;

  private async doLoad(): Promise<boolean> {
    this.set({ status: 'loading' });
    try {
      await this.call<true>({ type: 'load' });
      this.set({ status: 'ready' });
      return true;
    } catch (e) {
      this.set({ status: 'failed', message: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    if (!texts.length) return [];
    return this.call<Float32Array[]>({ type: 'embed', texts });
  }
}

export const model = new ModelClient();
