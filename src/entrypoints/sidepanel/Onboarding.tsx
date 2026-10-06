import { useEffect, useState } from 'react';
import { Check, Download, Lock, Sparkles } from 'lucide-react';
import { enableAutosave } from '@/lib/autosave';
import { downloadNano, nanoAvailability, type Availability } from '@/lib/ai/nano';
import { updateSettings } from '@/lib/settings';
import { COLORS } from '@/lib/collections';
import { Button } from '@/components/ui';

/** First-run setup in 3 steps. Opens in a tab after install. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(1);
  const [autoSave, setAutoSave] = useState<boolean | null>(null);
  const [nano, setNano] = useState<Availability | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    void nanoAvailability().then(setNano);
  }, []);

  async function finish(download: boolean) {
    if (download) {
      setProgress(0);
      await downloadNano((f) => setProgress(f));
      setProgress(null);
    }
    await updateSettings({ onboarded: true });
    setFinished(true);
  }

  async function openPanel() {
    const win = await browser.windows.getCurrent();
    if (win.id != null) await browser.sidePanel.open({ windowId: win.id }).catch(() => {});
    onDone();
  }

  return (
    <div className="flex min-h-screen justify-center overflow-y-auto bg-bg px-5 py-10 text-ink">
      <main className="w-full max-w-[420px]">
        {!finished && (
          <p className="mb-6 text-[13px] font-semibold text-text-3" aria-live="polite">
            Step {step} of 3
          </p>
        )}

        {finished ? (
          <section aria-labelledby="ob-title">
            <h1 id="ob-title" className="font-display text-[30px] leading-tight font-extrabold">
              You're all set
            </h1>
            <p className="mt-3 text-[15px] leading-[23px] text-text-2">
              Click the Clipboard icon in the toolbar to see your recent clips. Tip: pin it from the puzzle-piece menu so it's
              always there.
            </p>
            <ul className="mt-5 flex flex-col gap-2.5 text-sm">
              <li>
                <kbd>Alt+Shift+S</kbd> saves the text you selected
              </li>
              <li>
                <kbd>Alt+Shift+V</kbd> opens quick paste in any text box
              </li>
              <li>Right-click an image to save it</li>
            </ul>
            <Button variant="primary" size="lg" className="mt-8 w-full" onClick={() => void openPanel()}>
              Open the side panel
            </Button>
          </section>
        ) : step === 1 ? (
          <section aria-labelledby="ob-title">
            <FolderArt />
            <h1 id="ob-title" className="mt-8 font-display text-[30px] leading-tight font-extrabold">
              Everything you copy, kept and sorted
            </h1>
            <p className="mt-3 text-[15px] leading-[23px] text-text-2">
              Text, links, images and colors you copy are saved here and filed into collections, so you can find and paste them
              again in seconds.
            </p>
            <div className="mt-6 flex gap-3 rounded-2xl bg-surface p-4">
              <Lock size={18} className="mt-0.5 shrink-0" aria-hidden />
              <p className="text-sm leading-5">
                <b>Private by design.</b> No account. Your clips and the AI that sorts them stay on this computer. The code is
                open source.
              </p>
            </div>
            <Button variant="primary" size="lg" className="mt-8 w-full" onClick={() => setStep(2)}>
              Get started
            </Button>
          </section>
        ) : step === 2 ? (
          <section aria-labelledby="ob-title">
            <h1 id="ob-title" className="font-display text-[30px] leading-tight font-extrabold">
              Save everything you copy, automatically
            </h1>
            <p className="mt-3 text-[15px] leading-[23px] text-text-2">
              Copy as usual. Each clip lands here, sorted into collections, ready to paste again.
            </p>
            <ul className="mt-5 flex flex-col gap-3 text-sm leading-5">
              {[
                'Clips stay on this device. Nothing is uploaded.',
                'Pause anytime, or turn it off for a single site.',
                'Banking and password manager sites are never saved.',
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <Check size={18} className="shrink-0 text-[#0E7A62] dark:text-[#5FD6B5]" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-[13px] leading-[19px] text-text-3">
              Chrome will ask to let us read the sites you visit. We only use this to notice when you copy.
            </p>
            {autoSave === false && (
              <p className="mt-3 text-[13px] text-text-2" role="status">
                No problem. You can turn it on later in Settings.
              </p>
            )}
            <Button
              variant="primary"
              size="lg"
              className="mt-4 w-full"
              onClick={async () => {
                const ok = await enableAutosave();
                setAutoSave(ok);
                if (ok) setStep(3);
              }}
            >
              Turn on auto-save
            </Button>
            <Button variant="secondary" size="lg" className="mt-2.5 w-full" onClick={() => setStep(3)}>
              Not now, I'll save clips by hand
            </Button>
          </section>
        ) : (
          <section aria-labelledby="ob-title">
            <h1 id="ob-title" className="font-display text-[30px] leading-tight font-extrabold">
              Smart features that run on your computer
            </h1>
            <p className="mt-3 text-[15px] leading-[23px] text-text-2">We checked this device. Here is what you get.</p>
            <div className="mt-5 flex flex-col gap-2.5">
              <Capability state="ready" title="Ready now" body="Auto-sorting into collections and search by description." />
              {nano === 'available' ? (
                <Capability
                  state="ready"
                  title="Ready now"
                  body="Titles, rewriting, summaries and translation with Chrome's built-in AI."
                />
              ) : nano === 'downloadable' || nano === 'downloading' ? (
                <Capability
                  state="download"
                  title="Needs a one-time download"
                  body={
                    progress !== null
                      ? `Downloading Chrome's built-in AI: ${Math.round(progress * 100)}%`
                      : "Titles, rewriting, summaries and translation use Chrome's built-in AI. It is a few GB and downloads once."
                  }
                />
              ) : nano === 'unavailable' ? (
                <Capability
                  state="none"
                  title="Not on this computer"
                  body="Rewriting and summaries need Chrome's built-in AI, which this computer doesn't support. Everything else works."
                />
              ) : null}
            </div>
            <div className="mt-5 flex items-center justify-between rounded-2xl border border-line-strong p-4 text-sm">
              <span>
                <span className="block font-semibold">Open quick paste</span>
                <span className="text-text-3">In any text box</span>
              </span>
              <span className="flex items-center gap-2">
                <kbd>Alt+Shift+V</kbd>
                <button
                  type="button"
                  className="cursor-pointer text-[13px] font-semibold text-link hover:text-link-hover"
                  onClick={() => void browser.tabs.create({ url: 'chrome://extensions/shortcuts' })}
                >
                  Change
                </button>
              </span>
            </div>
            {nano === 'downloadable' || nano === 'downloading' ? (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  className="mt-8 w-full"
                  disabled={progress !== null}
                  onClick={() => void finish(true)}
                >
                  <Download size={18} aria-hidden />
                  Download AI and finish
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  className="mt-2.5 w-full"
                  disabled={progress !== null}
                  onClick={() => void finish(false)}
                >
                  Finish without it
                </Button>
                <p className="mt-2 text-center text-[13px] text-text-3">You can download it later in Settings.</p>
              </>
            ) : (
              <Button variant="primary" size="lg" className="mt-8 w-full" onClick={() => void finish(false)}>
                Finish
              </Button>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function Capability({ state, title, body }: { state: 'ready' | 'download' | 'none'; title: string; body: string }) {
  const tone =
    state === 'ready'
      ? 'bg-[#DDF3EC] text-[#0B5C4A] dark:bg-[#163A33] dark:text-[#5FD6B5]'
      : state === 'download'
        ? 'bg-ai-bg text-ai-fg'
        : 'bg-surface text-text-2';
  const Icon = state === 'ready' ? Check : state === 'download' ? Download : Sparkles;
  return (
    <div className={`flex gap-3 rounded-2xl p-4 ${tone}`}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
      <p className="text-sm leading-5">
        <b className="block">{title}</b>
        {body}
      </p>
    </div>
  );
}

/** Three folder tiles, as on the home screen. */
function FolderArt() {
  const tiles = [
    { name: 'Research', c: COLORS.blue! },
    { name: 'Lisbon trip', c: COLORS.mustard! },
    { name: 'Recipes', c: COLORS.pink! },
  ];
  return (
    <div className="flex gap-2.5" aria-hidden>
      {tiles.map(({ name, c }, i) => (
        <div key={name} className="flex-1" style={{ transform: `translateY(${i === 1 ? -8 : 0}px)` }}>
          <div className="h-2.5 w-10 rounded-t-lg" style={{ background: c.accent }} />
          <div
            className="rounded-tr-xl rounded-b-xl border-t-[3px] px-2.5 pt-2 pb-6 text-[13px] font-semibold"
            style={{ background: c.tint, borderColor: c.accent, color: c.text }}
          >
            {name}
          </div>
        </div>
      ))}
    </div>
  );
}
