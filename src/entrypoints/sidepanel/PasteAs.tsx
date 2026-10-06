import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { Clip } from '@/lib/db';
import { saveClip } from '@/lib/clips';
import { nanoAvailability } from '@/lib/ai/nano';
import { AI_TRANSFORMS, applyAi, applyPlain, languageName, PLAIN_TRANSFORMS, type AiTransform, type PlainTransform } from '@/lib/transforms';
import { Button } from '@/components/ui';

const LANGS = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'zh', 'ko', 'hi', 'ar'];

const chip = 'h-8 cursor-pointer rounded-full px-3 text-[13px] font-semibold disabled:cursor-default disabled:opacity-50';

/** Paste as: plain options copy right away; AI options show a preview first (screens 3.3–3.4). */
export function PasteAs({
  clip,
  onCopyOriginal,
  notify,
}: {
  clip: Clip;
  onCopyOriginal: () => void;
  notify: (message: string) => void;
}) {
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<{ t: AiTransform; text: string | null; busy: boolean } | null>(null);
  const [lang, setLang] = useState(() => {
    const ui = navigator.language.slice(0, 2);
    return ui === 'en' ? 'es' : ui;
  });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    void nanoAvailability().then((a) => setAiReady(a === 'available'));
    return () => abort.current?.abort();
  }, []);

  async function copyPlain(t: PlainTransform) {
    if (t === 'asis') return onCopyOriginal();
    await navigator.clipboard.writeText(applyPlain(t, clip.text, clip.html));
    notify(`Copied as ${PLAIN_TRANSFORMS.find((p) => p.id === t)!.label.toLowerCase()}`);
  }

  async function runAi(t: AiTransform, language = lang) {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPreview({ t, text: null, busy: true });
    try {
      const text = await applyAi(t, clip.text, { lang: language, signal: ctrl.signal });
      if (!ctrl.signal.aborted) setPreview({ t, text, busy: false });
    } catch {
      if (!ctrl.signal.aborted) setPreview({ t, text: null, busy: false });
    }
  }

  return (
    <section aria-labelledby="paste-as" className="mt-5">
      <h2 id="paste-as" className="mb-2 font-display text-[17px] font-semibold">
        Paste as
      </h2>
      <div className="flex flex-wrap gap-2">
        {PLAIN_TRANSFORMS.filter((t) => t.id !== 'markdown' || clip.html).map((t) => (
          <button key={t.id} type="button" className={`${chip} border border-line-strong bg-bg text-ink`} onClick={() => void copyPlain(t.id)}>
            {t.label}
          </button>
        ))}
        {AI_TRANSFORMS.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={!aiReady}
            aria-pressed={preview?.t === t.id}
            className={`${chip} bg-ai-bg text-ai-fg aria-pressed:outline-2 aria-pressed:outline-ai-fg`}
            onClick={() => void runAi(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-text-3">
        <Sparkles size={12} aria-hidden />
        {aiReady === false
          ? "Blue options need Chrome's built-in AI. Turn it on in Settings, On-device AI."
          : 'Blue options use AI on this device. Nothing is uploaded.'}
      </p>

      {preview && (
        <div className="mt-3 rounded-2xl border-2 border-ai-fg/40 bg-ai-bg/40 p-3.5" aria-live="polite">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-ai-fg">
              {AI_TRANSFORMS.find((a) => a.id === preview.t)!.label}
              {preview.t === 'translate' && ` to ${languageName(lang)}`}
            </h3>
            {preview.t === 'translate' && (
              <select
                aria-label="Language"
                value={lang}
                onChange={(e) => {
                  setLang(e.target.value);
                  void runAi('translate', e.target.value);
                }}
                className="h-8 rounded-lg border border-line-strong bg-bg px-2 text-[13px] text-ink"
              >
                {LANGS.map((l) => (
                  <option key={l} value={l}>
                    {languageName(l)}
                  </option>
                ))}
              </select>
            )}
          </div>
          {preview.busy ? (
            <p className="text-sm text-text-2">Writing on this device…</p>
          ) : preview.text ? (
            <>
              <p className="text-sm leading-[21px] whitespace-pre-wrap">{preview.text}</p>
              <p className="mt-2 text-xs text-text-3">Your original clip is unchanged.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(preview.text!);
                    notify('Copied this version');
                  }}
                >
                  Copy this version
                </Button>
                <Button size="sm" onClick={() => void runAi(preview.t)}>
                  Try again
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    await saveClip({ text: preview.text!, source: clip.source });
                    notify('Saved as a new clip');
                  }}
                >
                  Save as clip
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-text-2">Couldn't write that on this device. Try again in a moment.</p>
          )}
        </div>
      )}
    </section>
  );
}
