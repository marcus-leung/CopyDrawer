import { ChevronLeft, Cloud, Image, Infinity as InfinityIcon, RefreshCw } from 'lucide-react';
import { storage } from '#imports';
import { Button, IconButton } from '@/components/ui';

/** Where "Join the waitlist" goes: an external form, set at build time (WXT_WAITLIST_URL). */
export const WAITLIST_URL: string = import.meta.env.WXT_WAITLIST_URL ?? '';

/** Local count of waitlist clicks (the fake door's signal). Not sent anywhere. */
const interest = storage.defineItem<number>('local:proInterest', { fallback: 0 });

const FEATURES = [
  { icon: RefreshCw, title: 'Sync between your devices', body: 'Encrypted before it leaves your computer' },
  { icon: InfinityIcon, title: 'Unlimited clips and 10 GB for images', body: 'No more oldest-clip cleanup' },
  { icon: Cloud, title: 'AI on any computer', body: 'Cloud rewriting and summaries, only when you ask' },
  { icon: Image, title: 'Text in images', body: 'Copy words from screenshots, search by them' },
];

/** Pro waitlist fake door (screen 5.4). */
export function ProWaitlist({ onBack }: { onBack: () => void }) {
  async function join() {
    await interest.setValue((await interest.getValue()) + 1);
    if (WAITLIST_URL) await browser.tabs.create({ url: WAITLIST_URL });
  }

  return (
    <>
      <header className="flex items-center gap-1.5 px-3.5 pt-3.5 pb-2">
        <IconButton label="Back" onClick={onBack}>
          <ChevronLeft size={20} aria-hidden />
        </IconButton>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-6">
        <h1 className="font-display text-[28px] leading-tight font-extrabold">Pro is coming</h1>
        <p className="mt-2 text-[15px] leading-[23px] text-text-2">Everything in the free version stays free. Pro adds:</p>
        <ul className="mt-5 flex flex-col gap-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ai-bg text-ai-fg">
                <Icon size={18} aria-hidden />
              </span>
              <span className="text-sm leading-5">
                <b className="block">{title}</b>
                <span className="text-text-2">{body}</span>
              </span>
            </li>
          ))}
        </ul>
        {WAITLIST_URL ? (
          <>
            <Button variant="primary" size="lg" className="mt-8 w-full" onClick={() => void join()}>
              Email me when it's ready
            </Button>
            <p className="mt-2 text-center text-[13px] text-text-3">
              Opens a short form. We only use your email for this. No spam.
            </p>
          </>
        ) : (
          <p className="mt-8 rounded-2xl bg-surface p-4 text-sm text-text-2">The waitlist opens soon.</p>
        )}
      </main>
    </>
  );
}
