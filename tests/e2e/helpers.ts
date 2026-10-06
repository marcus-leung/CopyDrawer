import path from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';

const STUB = path.resolve('tests/fixtures/minilm-stub');

/**
 * Answers the model download from Hugging Face with the tiny stand-in model
 * (scripts/make-test-model.mjs), so the real worker + ONNX Runtime path runs.
 */
export async function stubModel(context: BrowserContext, opts: { fail?: boolean } = {}) {
  const requests: string[] = [];
  await context.route('https://huggingface.co/**', (route) => {
    const file = new URL(route.request().url()).pathname.split('/resolve/main/')[1] ?? '';
    requests.push(file);
    if (opts.fail) return route.fulfill({ status: 503, body: 'down' });
    return route.fulfill({ path: path.join(STUB, file) }).catch(() => route.fulfill({ status: 404 }));
  });
  return requests;
}

/**
 * A stand-in for Chrome's built-in AI (window.LanguageModel) on extension pages.
 * Replies are predictable so tests can check them. Set `window.__ai = 'fail'`
 * or `'unavailable'` in a page to change its behavior.
 */
export async function mockChromeAI(context: BrowserContext, availability: 'available' | 'downloadable' | 'unavailable' = 'available') {
  await context.addInitScript((initial) => {
    if (!location.protocol.startsWith('chrome-extension')) return;
    const w = window as unknown as { __ai?: string; __aiCalls: { system: string; input: string }[]; LanguageModel: unknown };
    w.__aiCalls = [];
    let state = initial;
    const make = (system: string) => ({
      async prompt(input: string) {
        w.__aiCalls.push({ system, input });
        await new Promise((r) => setTimeout(r, 150));
        if (w.__ai === 'fail') throw new Error('model crashed');
        const words = input.split(/\s+/).slice(0, 3).join(' ');
        if (system.includes('short titles')) return `AI title: ${words}`;
        if (system.includes('Summarize')) return `Summary of ${words}`;
        if (system.includes('friendlier')) return `Hi! ${input} Thanks so much!`;
        if (system.includes('Translate')) return `[${/into (\w+)/.exec(system)?.[1]}] ${input}`;
        return `Rewritten: ${input}`;
      },
      async clone() {
        return make(system);
      },
      destroy() {},
    });
    w.LanguageModel = {
      async availability() {
        return w.__ai === 'unavailable' ? 'unavailable' : state;
      },
      async create(opts?: { initialPrompts?: { content: string }[]; monitor?: (m: EventTarget) => void }) {
        if (opts?.monitor) {
          const target = new EventTarget();
          opts.monitor(target);
          for (const loaded of [0.25, 0.5, 1]) {
            await new Promise((r) => setTimeout(r, 50));
            target.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded }));
          }
          state = 'available';
        }
        return make(opts?.initialPrompts?.[0]?.content ?? '');
      },
    };
  }, availability);
}

/** Pastes text into the side panel, as if the user pressed Ctrl+V on it. */
export async function pasteIntoPanel(page: Page, ...texts: string[]) {
  for (const t of texts) {
    await page.evaluate((text) => {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    }, t);
  }
}

/** Reads clips straight from the extension's IndexedDB. */
export function readClips(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ text: string; title: string; titleSource?: string; collectionId?: string; embeddingModel?: string; useCount: number }[]>(
        (resolve, reject) => {
          const req = indexedDB.open('clipboard');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const all = req.result.transaction('clips').objectStore('clips').getAll();
            all.onsuccess = () => resolve(all.result);
          };
        },
      ),
  );
}
