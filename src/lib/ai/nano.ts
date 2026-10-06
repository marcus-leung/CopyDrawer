/**
 * Chrome's built-in AI (Gemini Nano) via the Prompt API, when the device supports it.
 * Never triggers the multi-GB model download by itself; that needs the user's
 * consent in onboarding or settings (see `downloadNano`).
 */
export type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

export interface LMSession {
  prompt(input: string, opts?: { signal?: AbortSignal }): Promise<string>;
  clone(): Promise<LMSession>;
  destroy(): void;
}
interface LanguageModelStatic {
  availability(opts?: unknown): Promise<Availability>;
  create(opts?: {
    initialPrompts?: { role: 'system' | 'user' | 'assistant'; content: string }[];
    monitor?: (m: EventTarget) => void;
  }): Promise<LMSession>;
}

function api(): LanguageModelStatic | undefined {
  return (globalThis as unknown as { LanguageModel?: LanguageModelStatic }).LanguageModel;
}

export async function nanoAvailability(): Promise<Availability> {
  const lm = api();
  if (!lm) return 'unavailable';
  try {
    return await lm.availability();
  } catch {
    return 'unavailable';
  }
}

/** Starts the one-time model download. Call only after the user agreed. */
export async function downloadNano(onProgress?: (fraction: number) => void): Promise<boolean> {
  const lm = api();
  if (!lm) return false;
  try {
    const session = await lm.create({
      monitor: (m) => m.addEventListener('downloadprogress', (e) => onProgress?.((e as unknown as { loaded: number }).loaded)),
    });
    session.destroy();
    return true;
  } catch {
    return false;
  }
}

const TITLE_SYSTEM =
  'You write short titles for items a person saved from their clipboard. Reply with only the title: 2 to 6 words, sentence case, no quotes, no ending punctuation.';

/** One primed session per system prompt; each request uses a fresh clone. */
const bases = new Map<string, Promise<LMSession>>();

export async function session(system: string): Promise<LMSession | null> {
  if ((await nanoAvailability()) !== 'available') return null;
  const lm = api()!;
  let base = bases.get(system);
  if (!base) {
    base = lm.create({ initialPrompts: [{ role: 'system', content: system }] });
    bases.set(system, base);
  }
  try {
    return await (await base).clone();
  } catch {
    bases.delete(system);
    return null;
  }
}

/** A short AI title for a clip, or null if on-device AI isn't ready. */
export async function nanoTitle(text: string): Promise<string | null> {
  const s = await session(TITLE_SYSTEM);
  if (!s) return null;
  try {
    const raw = await s.prompt(text.slice(0, 1500));
    const title = raw
      .split('\n')[0]!
      .replace(/^["'“”]+|["'“”.]+$/g, '')
      .trim();
    return title && title.length <= 80 ? title : null;
  } catch {
    return null;
  } finally {
    s.destroy();
  }
}
