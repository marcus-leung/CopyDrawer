import { Button } from '@/components/ui';
import { modKey } from '@/lib/format';

/** Home before anything is saved: where collections will appear, and how to save. */
export function EmptyState({ onGrab, autoSave }: { onGrab: () => void; autoSave: boolean }) {
  return (
    <>
      <h2 className="font-display text-[17px] font-semibold">Collections</h2>
      <p className="mt-2 mb-4 rounded-xl border-2 border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-text-2">
        Collections appear as you save. You don't need to make any.
      </p>
      <section className="rounded-[18px] bg-surface p-5" aria-labelledby="empty-title">
        <h2 id="empty-title" className="font-display text-[22px] font-extrabold">
          {autoSave ? 'Copy anything to start' : 'Save something to start'}
        </h2>
        <ol className="mt-3.5 flex flex-col gap-3 text-sm leading-5">
          <Step n={1}>
            {autoSave ? (
              <>
                Copy text or a link on any site with <kbd className="bg-bg">{modKey('C')}</kbd>
              </>
            ) : (
              <>
                Select text on any page and press <kbd className="bg-bg">Alt+Shift+S</kbd>, or right-click and choose{' '}
                <b>Save selection</b>
              </>
            )}
          </Step>
          <Step n={2}>
            Right-click an image and choose <b>Save image</b>, or drop it here
          </Step>
          <Step n={3}>
            Paste it back anywhere with <kbd className="bg-bg">Alt+Shift+V</kbd>
          </Step>
        </ol>
        <Button className="mt-4 bg-bg" onClick={onGrab}>
          Grab what's on my clipboard
        </Button>
      </section>
    </>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-bg text-[13px] font-bold">{n}</span>
      <span>{children}</span>
    </li>
  );
}
