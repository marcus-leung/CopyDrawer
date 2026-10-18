import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, CircleCheck, Clipboard, ClipboardPaste, Lock, Search, TriangleAlert } from 'lucide-react';
import { enableAutosave } from '@/lib/autosave';
import { keyLabel, useShortcuts } from '@/lib/useShortcuts';
import { NOT_SET, suggestedShortcut, type CommandName } from '@/lib/shortcuts';
import { canSync } from '@/lib/sync/controller';
import { startSync, useDriveSync } from '@/lib/sync/useDriveSync';
import { COLORS } from '@/lib/collections';
import { Button } from '@/components/ui';

type StepId = 'welcome' | 'autosave' | 'shortcuts' | 'sync' | 'howto';

const LABELS: Record<StepId, string> = {
  welcome: 'Welcome',
  autosave: 'Auto-save',
  shortcuts: 'Shortcuts',
  sync: 'Sync',
  howto: 'How to use',
};

const openShortcuts = () => void browser.tabs.create({ url: 'chrome://extensions/shortcuts' });

/** Opens in a tab after install. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [steps] = useState<StepId[]>(() => [
    'welcome',
    'autosave',
    'shortcuts',
    ...(canSync() ? ['sync' as const] : []),
    'howto',
  ]);
  const [at, setAt] = useState(0);
  const [finished, setFinished] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const step = steps[at]!;
  const next = () => (at + 1 < steps.length ? setAt(at + 1) : setFinished(true));

  // A new step moves focus to its heading, so a screen reader reads the step from the top.
  useEffect(() => {
    if (moved.current) heading.current?.focus();
    moved.current = true;
  }, [at, finished]);

  async function openPanel() {
    const win = await browser.windows.getCurrent();
    if (win.id != null) await browser.sidePanel.open({ windowId: win.id }).catch(() => {});
    onDone();
  }

  const title = (text: string) => (
    <h1 ref={heading} tabIndex={-1} id="ob-title" className="font-display text-[40px] leading-[1.1] font-extrabold outline-none">
      {text}
    </h1>
  );

  return (
    <div className="flex min-h-full justify-center overflow-y-auto bg-bg px-6 text-ink">
      <main className="flex min-h-full w-full max-w-[600px] flex-col py-12">
        <p className="mb-10 flex items-center gap-3 font-display text-[24px] font-extrabold">
          <img src="/icon/128.png" alt="" className="size-11" />
          <span>
            Copy<span className="text-accent">Drawer</span>
          </span>
        </p>

        <section aria-labelledby="ob-title" className="flex-1">
          {finished ? (
            <Done title={title} openPanel={openPanel} />
          ) : step === 'welcome' ? (
            <Welcome title={title} next={next} />
          ) : step === 'autosave' ? (
            <AutoSave title={title} next={next} />
          ) : step === 'shortcuts' ? (
            <ShortcutsStep title={title} next={next} />
          ) : step === 'sync' ? (
            <SyncStep title={title} next={next} />
          ) : (
            <HowTo title={title} next={next} />
          )}
        </section>

        {!finished && <StepBar steps={steps} at={at} go={setAt} />}
      </main>
    </div>
  );
}

type StepProps = { title: (text: string) => ReactNode; next: () => void };

const Lead = ({ children }: { children: ReactNode }) => <p className="mt-4 text-[18px] leading-7 text-text-2">{children}</p>;

function Welcome({ title, next }: StepProps) {
  return (
    <>
      <FolderArt />
      <div className="mt-10">{title('Everything you copy, kept and sorted')}</div>
      <Lead>
        Text, links, images and colors you copy are saved here and filed into collections, so you can find and paste them again in
        seconds.
      </Lead>
      <div className="mt-7 flex gap-3 rounded-2xl bg-surface p-5">
        <Lock size={20} className="mt-0.5 shrink-0" aria-hidden />
        <p className="text-[16px] leading-6">
          <b>Private by design.</b> No account. Your clips stay on this computer, unless you turn on sync to your own Google
          Drive.
        </p>
      </div>
      <Button variant="primary" size="lg" className="mt-9 w-full text-[16px]" onClick={next}>
        Get started
      </Button>
    </>
  );
}

function AutoSave({ title, next }: StepProps) {
  const [refused, setRefused] = useState(false);
  return (
    <>
      {title('Save everything you copy, automatically')}
      <Lead>Copy as usual. Each clip lands here, sorted into collections, ready to paste again.</Lead>
      <ul className="mt-6 flex flex-col gap-3.5 text-[16px] leading-6">
        {[
          'Clips stay on this device. Nothing goes to us.',
          'Pause anytime, or turn it off for a single site.',
          'Banking and password manager sites are never saved.',
        ].map((t) => (
          <li key={t} className="flex gap-3">
            <Check size={20} className="mt-0.5 shrink-0 text-[#0E7A62] dark:text-[#5FD6B5]" aria-hidden />
            {t}
          </li>
        ))}
      </ul>
      <p className="mt-7 text-[14px] leading-5 text-text-3">
        Chrome will ask to let us read the sites you visit. We only use this to notice when you copy.
      </p>
      {refused && (
        <p className="mt-3 text-[14px] text-text-2" role="status">
          No problem. You can turn it on later in Settings.
        </p>
      )}
      <Button
        variant="primary"
        size="lg"
        className="mt-5 w-full text-[16px]"
        onClick={async () => {
          if (await enableAutosave()) next();
          else setRefused(true);
        }}
      >
        Turn on auto-save
      </Button>
      <Button variant="secondary" size="lg" className="mt-3 w-full text-[16px]" onClick={next}>
        Not now, I'll save clips by hand
      </Button>
    </>
  );
}

function ShortcutsStep({ title, next }: StepProps) {
  const keys = useShortcuts();
  return (
    <>
      {title('Two shortcuts to know')}
      <Lead>They work on any page. You can change them anytime.</Lead>
      <div className="mt-6 flex flex-col gap-3">
        <ShortcutRow title="Save what you selected" name="save-selection" keys={keyLabel(keys, 'save-selection')} />
        <ShortcutRow title="Open quick paste" hint="In any text box" name="quick-paste" keys={keyLabel(keys, 'quick-paste')} />
      </div>
      <button
        type="button"
        className="mt-4 cursor-pointer text-[14px] font-semibold text-link hover:text-link-hover"
        onClick={openShortcuts}
      >
        Change shortcuts in Chrome
      </button>
      <Button variant="primary" size="lg" className="mt-9 w-full text-[16px]" onClick={next}>
        Next
      </Button>
    </>
  );
}

function ShortcutRow({ title, hint, name, keys }: { title: string; hint?: string; name: CommandName; keys: string }) {
  const unset = keys === NOT_SET;
  return (
    <div className={`rounded-2xl border p-5 text-[16px] ${unset ? 'border-warning-line bg-warning-bg' : 'border-line-strong'}`}>
      <div className="flex items-center justify-between gap-4">
        <span>
          <span className="block font-semibold">{title}</span>
          {hint && <span className="text-[14px] text-text-3">{hint}</span>}
        </span>
        <kbd className="px-2.5! py-1! text-[15px]!">{unset ? NOT_SET : keys}</kbd>
      </div>
      {unset && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[14px] text-warning-fg">
          <span className="flex items-start gap-2">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
            Chrome didn't set {suggestedShortcut(name)}. Another extension may already use it.
          </span>
          <Button size="sm" onClick={openShortcuts}>
            Set it in Chrome
          </Button>
        </div>
      )}
    </div>
  );
}

function SyncStep({ title, next }: StepProps) {
  const sync = useDriveSync();
  const [refused, setRefused] = useState(false);
  const on = !!sync?.settings.on;
  const settingUp = !!sync?.settingUp;
  return (
    <>
      {title('Your clips on all your computers')}
      <Lead>Turn on sync and your clips, images and collections follow you to every computer where you use Chrome.</Lead>
      <ul className="mt-6 flex flex-col gap-3.5 text-[16px] leading-6">
        {[
          'Kept in a hidden folder in your own Google Drive. CopyDrawer can’t see your other files.',
          'Nothing goes to us. Off unless you turn it on.',
        ].map((t) => (
          <li key={t} className="flex gap-3">
            <Check size={20} className="mt-0.5 shrink-0 text-[#0E7A62] dark:text-[#5FD6B5]" aria-hidden />
            {t}
          </li>
        ))}
      </ul>
      <div role="status" className="mt-6 min-h-6 text-[15px]">
        {on ? (
          <span className="flex items-center gap-2 font-semibold text-success-fg">
            <CircleCheck size={20} aria-hidden />
            Sync is on
          </span>
        ) : settingUp ? (
          <span className="text-text-2">Signing in to Google…</span>
        ) : refused ? (
          <span className="text-text-2">Sync needs permission to sign in to Google. You can turn it on later in Settings.</span>
        ) : sync?.status.message ? (
          <span className="text-danger">{sync.status.message}</span>
        ) : null}
      </div>
      {on ? (
        <Button variant="primary" size="lg" className="mt-4 w-full text-[16px]" onClick={next}>
          Next
        </Button>
      ) : (
        <>
          <Button
            variant="primary"
            size="lg"
            className="mt-4 w-full text-[16px]"
            disabled={settingUp}
            onClick={async () => setRefused(!(await startSync()))}
          >
            Turn on sync
          </Button>
          <Button variant="secondary" size="lg" className="mt-3 w-full text-[16px]" onClick={next}>
            Skip for now
          </Button>
        </>
      )}
    </>
  );
}

function HowTo({ title, next }: StepProps) {
  const keys = useShortcuts();
  const save = keyLabel(keys, 'save-selection');
  const paste = keyLabel(keys, 'quick-paste');
  // A shortcut Chrome left unset gets the other way to do it, not "press Not set".
  const rows = [
    {
      icon: Clipboard,
      name: 'Save',
      text:
        save === NOT_SET ? (
          'Copy as usual, or right-click a selection or an image and choose Save.'
        ) : (
          <>
            Copy as usual, press <kbd className="text-[14px]!">{save}</kbd> on a selection, or right-click an image.
          </>
        ),
    },
    {
      icon: Search,
      name: 'Find',
      text: 'Click the CopyDrawer icon in the toolbar. Clips are sorted into collections, and search forgives typos.',
    },
    {
      icon: ClipboardPaste,
      name: 'Paste',
      text:
        paste === NOT_SET ? (
          'Set a quick-paste shortcut in Chrome, then press it in any text box and pick a clip. It’s typed in for you.'
        ) : (
          <>
            Press <kbd className="text-[14px]!">{paste}</kbd> in any text box and pick a clip. It's typed in for you.
          </>
        ),
    },
  ];
  return (
    <>
      {title('How to use it')}
      <ul className="mt-7 flex flex-col gap-3">
        {rows.map(({ icon: Icon, name, text }) => (
          <li key={name} className="flex gap-4 rounded-2xl bg-surface p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
              <Icon size={20} aria-hidden />
            </span>
            <span className="text-[16px] leading-6">
              <b className="block text-[17px]">{name}</b>
              {text}
            </span>
          </li>
        ))}
      </ul>
      <Button variant="primary" size="lg" className="mt-9 w-full text-[16px]" onClick={next}>
        Finish
      </Button>
    </>
  );
}

function Done({ title, openPanel }: { title: (text: string) => ReactNode; openPanel: () => Promise<void> }) {
  return (
    <>
      {title("You're all set")}
      <Lead>
        Click the CopyDrawer icon in the toolbar to see your recent clips. Tip: pin it from the puzzle-piece menu so it's always
        there.
      </Lead>
      <Button variant="primary" size="lg" className="mt-9 w-full text-[16px]" onClick={() => void openPanel()}>
        Open the side panel
      </Button>
    </>
  );
}

/** One segment per step. Finished steps can be revisited; later ones open in order. */
function StepBar({ steps, at, go }: { steps: StepId[]; at: number; go: (i: number) => void }) {
  return (
    <nav aria-label="Setup steps" className="mt-12">
      <p className="sr-only" aria-live="polite">
        Step {at + 1} of {steps.length}: {LABELS[steps[at]!]}
      </p>
      <ol className="flex gap-2">
        {steps.map((id, i) => {
          const done = i < at;
          const bar = (
            <>
              <span className={`block h-1.5 rounded-full ${i === at ? 'bg-accent' : done ? 'bg-accent/40' : 'bg-line-strong'}`} />
              <span
                className={`mt-2 flex items-center gap-1 text-[13px] font-semibold ${i === at ? 'text-ink' : done ? 'text-text-2' : 'text-text-3'}`}
              >
                {done && <Check size={13} aria-hidden />}
                {LABELS[id]}
              </span>
            </>
          );
          return (
            <li key={id} className="flex-1" aria-current={i === at ? 'step' : undefined}>
              {done ? (
                <button
                  type="button"
                  className="block w-full cursor-pointer text-left"
                  aria-label={`Back to ${LABELS[id]}`}
                  onClick={() => go(i)}
                >
                  {bar}
                </button>
              ) : (
                bar
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function FolderArt() {
  const tiles = [
    { name: 'Research', c: COLORS.blue! },
    { name: 'Kyoto trip', c: COLORS.mustard! },
    { name: 'Recipes', c: COLORS.pink! },
  ];
  return (
    <div className="flex items-end gap-3" aria-hidden>
      {tiles.map(({ name, c }) => (
        <div key={name} className="flex-1">
          <div className="h-3 w-12 rounded-t-lg" style={{ background: c.accent }} />
          <div
            className="rounded-tr-xl rounded-b-xl border-t-[3px] px-3 pt-2.5 pb-9 text-[16px] font-semibold"
            style={{ background: c.tint, borderColor: c.accent, color: c.text }}
          >
            {name}
          </div>
        </div>
      ))}
    </div>
  );
}
