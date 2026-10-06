import { useEffect, useState } from 'react';
import { model, type ModelState } from '@/lib/embed/model';
import { downloadNano, nanoAvailability, type Availability } from '@/lib/ai/nano';
import type { Settings } from '@/lib/settings';
import { Button } from '@/components/ui';
import { Section, Toggle } from './SettingsView';

function modelLine(state: ModelState, on: boolean): string {
  if (!on) return 'Off. Clips are sorted by simple rules, and search matches words.';
  switch (state.status) {
    case 'ready':
      return 'Ready. Runs on this computer; your clips never leave it.';
    case 'loading':
      return `Downloading once (about 25 MB)${state.progress ? `: ${Math.round(state.progress)}%` : ''}…`;
    case 'failed':
      return "Couldn't download the model. Using simple rules for now.";
    default:
      return 'Starts when the panel is open.';
  }
}

export function AiSection({
  settings,
  onChange,
  notify,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  notify: (message: string) => void;
}) {
  const [state, setState] = useState<ModelState>(model.state);
  const [nano, setNano] = useState<Availability | null>(null);
  const [nanoProgress, setNanoProgress] = useState<number | null>(null);

  useEffect(() => model.onState(setState), []);
  useEffect(() => {
    void nanoAvailability().then(setNano);
  }, []);

  async function getNano() {
    setNanoProgress(0);
    const ok = await downloadNano((f) => setNanoProgress(f));
    setNanoProgress(null);
    setNano(await nanoAvailability());
    notify(ok ? "Chrome's AI is ready" : "Chrome couldn't download its AI on this device");
  }

  return (
    <Section id="s-ai" title="On-device AI">
      <Toggle
        id="t-smart"
        label="Sort and search by meaning"
        hint={modelLine(state, settings.smartModel)}
        checked={settings.smartModel}
        onChange={(on) => onChange({ smartModel: on })}
      />
      {settings.smartModel && state.status === 'failed' && (
        <Button size="sm" className="mt-2" onClick={() => void model.load(true)}>
          Try again
        </Button>
      )}
      <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
        <span className="min-w-0 text-sm">
          Titles and Paste as
          <span className="block text-[13px] leading-[19px] text-text-3">
            {nano === 'available'
              ? "Using Chrome's built-in AI (Gemini Nano)."
              : nano === 'downloadable' || nano === 'downloading'
                ? nanoProgress !== null
                  ? `Downloading Chrome's AI: ${Math.round(nanoProgress * 100)}%`
                  : "Chrome can download its built-in AI (about 2 GB, once)."
                : "Chrome's built-in AI isn't available on this device."}
          </span>
        </span>
        {(nano === 'downloadable' || nano === 'downloading') && nanoProgress === null && (
          <Button size="sm" variant="ai" onClick={() => void getNano()}>
            Download
          </Button>
        )}
      </div>
    </Section>
  );
}
