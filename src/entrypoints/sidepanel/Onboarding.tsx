import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import {
  ArrowLeftRight,
  Check,
  ChevronLeft,
  CircleCheck,
  Clipboard,
  ClipboardPaste,
  Lock,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { enableAutosave } from '@/lib/autosave';
import { keyLabel, useShortcuts } from '@/lib/useShortcuts';
import { NOT_SET, suggestedShortcut, type CommandName } from '@/lib/shortcuts';
import { canSync, startSync } from '@/lib/sync/controller';
import { useDriveSync } from '@/lib/sync/useDriveSync';
import { useSettings } from '@/lib/useSettings';
import { collectionVars } from '@/components/CollectionTile';
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

type StepProps = { next: () => void };

const BODIES: Record<StepId, ComponentType<StepProps>> = {
  welcome: Welcome,
  autosave: AutoSave,
  shortcuts: ShortcutsStep,
  sync: SyncStep,
  howto: HowTo,
};

const STEPS: StepId[] = ['welcome', 'autosave', 'shortcuts', ...(canSync() ? ['sync' as const] : []), 'howto'];

/** Opens in a tab after install. Past the last step is the done screen. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [at, setAt] = useState(0);
  const section = useRef<HTMLElement>(null);
  const moved = useRef(false);
  const done = at === STEPS.length;
  const Body = done ? null : BODIES[STEPS[at]!];
  const next = () => setAt((a) => Math.min(a + 1, STEPS.length));

  // A new step moves focus to its heading, so a screen reader reads the step from the top.
  useEffect(() => {
    if (moved.current) section.current?.querySelector('h1')?.focus();
    moved.current = true;
  }, [at]);

  async function openPanel() {
    const win = await browser.windows.getCurrent();
    if (win.id != null) await browser.sidePanel.open({ windowId: win.id }).catch(() => {});
    onDone();
  }

  return (
    <div className="flex min-h-full justify-center overflow-y-auto bg-bg px-6 text-ink">
      <main className="flex min-h-full w-full max-w-[600px] flex-col py-10">
        <p className="mb-8 flex items-center gap-3 font-display text-[24px] font-extrabold">
          <img src="/icon/128.png" alt="" className="size-11" />
          <span>
            Copy<span className="text-accent">Drawer</span>
          </span>
        </p>

        <section ref={section} aria-labelledby="ob-title" className="flex-1">
          {at > 0 && (
            <button
              type="button"
              className="mb-3 -ml-1 flex cursor-pointer items-center gap-1 rounded-full py-1 pr-3 pl-1 text-[15px] font-semibold text-text-2 hover:text-ink"
              onClick={() => setAt((a) => a - 1)}
            >
              <ChevronLeft size={20} aria-hidden />
              Back
            </button>
          )}
          {Body ? <Body next={next} /> : <Done openPanel={openPanel} />}
        </section>

        {!done && <StepBar at={at} go={setAt} />}
      </main>
    </div>
  );
}

function Title({ children, className = '' }: { children: string; className?: string }) {
  return (
    <h1 tabIndex={-1} id="ob-title" className={`font-display text-[40px] leading-[1.1] font-extrabold outline-none ${className}`}>
      {children}
    </h1>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 flex flex-col gap-3.5 text-[16px] leading-6">
      {items.map((t) => (
        <li key={t} className="flex gap-3">
          <Check size={20} className="mt-0.5 shrink-0 text-success-fg" aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  );
}

const Lead = ({ children }: { children: ReactNode }) => <p className="mt-4 text-[18px] leading-7 text-text-2">{children}</p>;

function Welcome({ next }: StepProps) {
  return (
    <>
      <FolderArt />
      <Title className="mt-10">Everything you copy, kept and sorted</Title>
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

function AutoSave({ next }: StepProps) {
  const on = !!useSettings()?.autoSave;
  const [refused, setRefused] = useState(false);
  return (
    <>
      <Title>Save everything you copy, automatically</Title>
      <Lead>Copy as usual. Each clip lands here, sorted into collections, ready to paste again.</Lead>
      <CheckList
        items={[
          'Clips stay on this device. Nothing goes to us.',
          'Pause anytime, or turn it off for a single site.',
          'Banking and password manager sites are never saved.',
        ]}
      />
      {on ? (
        <>
          <p role="status" className="mt-7 flex items-center gap-2 text-[15px] font-semibold text-success-fg">
            <CircleCheck size={20} aria-hidden />
            Auto-save is on
          </p>
          <Button variant="primary" size="lg" className="mt-5 w-full text-[16px]" onClick={next}>
            Next
          </Button>
        </>
      ) : (
        <>
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
      )}
    </>
  );
}

function ShortcutsStep({ next }: StepProps) {
  const keys = useShortcuts();
  return (
    <>
      <Title>Two shortcuts to know</Title>
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
        <kbd className="px-2.5! py-1! text-[15px]!">{keys}</kbd>
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

function SyncStep({ next }: StepProps) {
  const sync = useDriveSync();
  const [refused, setRefused] = useState(false);
  const on = !!sync?.settings.on;
  const settingUp = !!sync?.settingUp;
  return (
    <>
      <SyncArt />
      <Title className="mt-8">Your clips on all your computers</Title>
      <Lead>Turn on sync and your clips, images and collections follow you to every computer where you use Chrome.</Lead>
      <CheckList
        items={[
          'Kept in a hidden folder in your own Google Drive. CopyDrawer can’t see your other files.',
          'Nothing goes to us. Off unless you turn it on.',
        ]}
      />
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
            onClick={async () => {
              setRefused(false);
              setRefused(!(await startSync()));
            }}
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

function HowTo({ next }: StepProps) {
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
          'Copy as usual, or right-click and choose Save selection or Save image.'
        ) : (
          <>
            Copy as usual, press <kbd className="text-[14px]!">{save}</kbd> on a selection, or right-click an image and choose
            Save image.
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
      <Title>How to use it</Title>
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

function Done({ openPanel }: { openPanel: () => Promise<void> }) {
  return (
    <>
      <Title>You're all set</Title>
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
function StepBar({ at, go }: { at: number; go: (i: number) => void }) {
  return (
    <nav aria-label="Setup steps" className="mt-10">
      <ol className="flex gap-2">
        {STEPS.map((id, i) => {
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
    { name: 'Research', color: 'blue' },
    { name: 'Kyoto trip', color: 'mustard' },
    { name: 'Recipes', color: 'pink' },
  ];
  return (
    <div className="flex items-end gap-3" aria-hidden>
      {tiles.map(({ name, color }) => (
        <div key={name} className="flex-1" style={collectionVars(color)}>
          <div className="h-3 w-12 rounded-t-lg bg-[var(--c-accent)] dark:bg-[var(--c-accent-d)]" />
          <div className="rounded-tr-xl rounded-b-xl border-t-[3px] border-[var(--c-accent)] bg-[var(--c-tint)] px-3 pt-2.5 pb-9 text-[16px] font-semibold text-[var(--c-text)] dark:border-[var(--c-accent-d)] dark:bg-[var(--c-tint-d)] dark:text-ink">
            {name}
          </div>
        </div>
      ))}
    </div>
  );
}

/** CopyDrawer and Google Drive side by side, the same height as the Welcome step's folders. */
function SyncArt() {
  const tile = 'grid size-[72px] place-items-center rounded-2xl bg-surface';
  return (
    <div className="flex items-start gap-4">
      <figure className="flex flex-col items-center gap-2">
        <span className={tile}>
          <img src="/icon/128.png" alt="" className="size-10" />
        </span>
        <figcaption className="text-[13px] font-semibold text-text-2">CopyDrawer</figcaption>
      </figure>
      <ArrowLeftRight size={28} className="mt-[22px] shrink-0 text-text-3" aria-hidden />
      <figure className="flex flex-col items-center gap-2">
        <span className={tile}>
          <DriveLogo />
        </span>
        <figcaption className="text-[13px] font-semibold text-text-2">Your Google Drive</figcaption>
      </figure>
    </div>
  );
}

/** Google Drive's product icon, unmodified. */
function DriveLogo() {
  return (
    <svg viewBox="0 0 87.3 78" className="h-9 w-auto" role="img" aria-label="Google Drive">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path
        d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"
        fill="#ea4335"
      />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}
