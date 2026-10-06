/** Cosine similarity for normalized vectors (= dot product). */
export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i]! * b[i]!;
  return dot;
}

export function normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!;
  const len = Math.sqrt(sum) || 1;
  for (let i = 0; i < v.length; i++) v[i]! /= len;
  return v;
}

export interface Embedder {
  /** Stored on each clip so vectors from different models are never compared. */
  key: string;
  /** True for real language models (enables meaning-based sorting). */
  semantic: boolean;
  embed(texts: string[]): Promise<Float32Array[]>;
}
