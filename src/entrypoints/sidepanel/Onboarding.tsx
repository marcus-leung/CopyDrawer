import { useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { enableAutosave } from '@/lib/autosave';
import { updateSettings } from '@/lib/settings';
import { useShortcuts } from '@/lib/useShortcuts';
import { COLORS } from '@/lib/collections';
import { Button } from '@/components/ui';

/** First-run setup in 3 steps. Opens in a tab after install. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(1);
  const [autoSave, setAutoSave] = useState<boolean | null>(null);
  const [finished, setFinished] = useState(false);
  const keys = useShortcuts();

  async function finish() {
    await updateSettings({ onboarded: true });
    setFinished(true);
  }

  async function openPanel() {
    const win = await browser.windows.getCurrent();
    if (win.id != null) await browser.sidePanel.open({ windowId: win.id }).catch(() => {});
    onDone();
  }

  return (
    <div className="flex min-h-full justify-center overflow-y-auto bg-bg px-5 py-10 text-ink">
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
                <kbd>{keys['save-selection']}</kbd> saves the text you selected
              </li>
              <li>
                <kbd>{keys['quick-paste']}</kbd> opens quick paste in any text box
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
                <b>Private by design.</b> No account. Your clips stay on this computer. The code is open source.
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
              Two shortcuts to know
            </h1>
            <p className="mt-3 text-[15px] leading-[23px] text-text-2">They work on any page. You can change them anytime.</p>
            <div className="mt-5 flex flex-col gap-2.5">
              <Shortcut title="Save what you selected" keys={keys['save-selection']} />
              <Shortcut title="Open quick paste" hint="In any text box" keys={keys['quick-paste']} />
            </div>
            <button
              type="button"
              className="mt-3 cursor-pointer text-[13px] font-semibold text-link hover:text-link-hover"
              onClick={() => void browser.tabs.create({ url: 'chrome://extensions/shortcuts' })}
            >
              Change shortcuts in Chrome
            </button>
            <Button variant="primary" size="lg" className="mt-8 w-full" onClick={() => void finish()}>
              Finish
            </Button>
          </section>
        )}
      </main>
    </div>
  );
}

function Shortcut({ title, hint, keys }: { title: string; hint?: string; keys: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line-strong p-4 text-sm">
      <span>
        <span className="block font-semibold">{title}</span>
        {hint && <span className="text-text-3">{hint}</span>}
      </span>
      <kbd>{keys}</kbd>
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
