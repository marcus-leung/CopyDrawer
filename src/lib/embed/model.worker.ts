/// <reference lib="webworker" />
/**
 * Runs the sentence-embedding model (all-MiniLM-L6-v2, quantized) with
 * transformers.js. Model weights download once from Hugging Face and are cached
 * by the browser. The ONNX runtime is bundled with the extension (no remote code).
 */
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const origin = self.location.origin;
env.allowLocalModels = false;
env.useBrowserCache = true;
const wasm = env.backends.onnx.wasm!;
wasm.wasmPaths = {
  mjs: `${origin}/ort/ort-wasm-simd-threaded.asyncify.mjs`,
  wasm: `${origin}/ort/ort-wasm-simd-threaded.asyncify.wasm`,
};
wasm.numThreads = 1; // extensions aren't cross-origin isolated, so no SharedArrayBuffer
wasm.proxy = false;

let extractor: Promise<FeatureExtractionPipeline> | null = null;

type Req = { id: number; type: 'load'; modelId: string } | { id: number; type: 'embed'; modelId: string; texts: string[] };

self.onmessage = async (event: MessageEvent<Req>) => {
  const req = event.data;
  try {
    extractor ??= pipeline('feature-extraction', req.modelId, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p: { status: string; progress?: number; file?: string }) =>
        self.postMessage({ type: 'progress', status: p.status, progress: p.progress, file: p.file }),
    }) as Promise<FeatureExtractionPipeline>;
    const model = await extractor;
    if (req.type === 'load') {
      self.postMessage({ id: req.id, type: 'ready' });
      return;
    }
    const output = await model(req.texts, { pooling: 'mean', normalize: true });
    const [rows, dim] = output.dims as [number, number];
    const data = output.data as Float32Array;
    const vectors = Array.from({ length: rows }, (_, i) => data.slice(i * dim, (i + 1) * dim));
    self.postMessage({ id: req.id, type: 'result', vectors }, { transfer: vectors.map((v) => v.buffer) });
  } catch (e) {
    extractor = null;
    self.postMessage({ id: req.id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
