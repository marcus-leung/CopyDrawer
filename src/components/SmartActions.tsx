import { CalendarPlus, Copy, ExternalLink } from 'lucide-react';
import type { Clip } from '@/lib/db';
import { colorFormats, detectActions, makeIcs, type SmartAction } from '@/lib/actions';

function downloadIcs(clip: Clip, action: Extract<SmartAction, { kind: 'calendar' }>) {
  const ics = makeIcs({ title: clip.title, date: action.date, details: clip.text, location: action.location });
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${clip.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'event'}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "Looks like a UPS tracking number" + one-click next steps (screens 3.3, 6.2). */
export function SmartActions({ clip, notify }: { clip: Clip; notify: (message: string) => void }) {
  const found = detectActions(clip);
  if (!found.actions.length && !found.color) return null;

  async function run(action: SmartAction) {
    if (action.kind === 'open-link') {
      if (/^(mailto|tel):/.test(action.url)) window.open(action.url);
      else await browser.tabs.create({ url: action.url });
    } else if (action.kind === 'copy') {
      await navigator.clipboard.writeText(action.text);
      notify('Copied');
    } else if (action.kind === 'calendar') {
      downloadIcs(clip, action);
      notify('Calendar file downloaded. Open it to add the event.');
    }
  }

  return (
    <section aria-label="Smart actions" className="mt-3 rounded-2xl bg-surface p-3.5">
      {found.color && <Swatch clip={clip} />}
      {found.note && <p className="mb-2.5 text-[13px] font-semibold text-text-2">{found.note}</p>}
      <div className="flex flex-wrap gap-2">
        {found.actions.map((a, i) => {
          const Icon = a.kind === 'calendar' ? CalendarPlus : a.kind === 'open-link' ? ExternalLink : Copy;
          return (
            <button
              key={i}
              type="button"
              onClick={() => void run(a)}
              className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold hover:opacity-90 ${
                i === 0 ? 'bg-ink text-on-ink' : 'bg-bg text-ink'
              }`}
            >
              <Icon size={14} aria-hidden />
              {a.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Swatch({ clip }: { clip: Clip }) {
  const found = detectActions(clip);
  if (!found.color) return null;
  const f = colorFormats(found.color);
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="size-12 shrink-0 rounded-xl border border-line-strong" style={{ background: f.rgb }} aria-hidden />
      <span className="font-mono text-[12px] leading-5 text-text-2">
        {f.hex}
        <br />
        {f.rgb}
        <br />
        {f.hsl}
      </span>
    </div>
  );
}
