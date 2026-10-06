import { useEffect, useState } from 'react';
import { MAX_CLIPS } from '@/lib/clips';
import { hostOf } from '@/lib/format';
import { nanoAvailability } from '@/lib/ai/nano';
import { isPaused, updateSettings, type Settings } from '@/lib/settings';
import { Notice } from '@/components/Notice';

/** The hostname of the tab next to the panel, when Chrome lets us see it. */
function useActiveHost(): string | null {
  const [host, setHost] = useState<string | null>(null);
  useEffect(() => {
    const read = () =>
      void browser.tabs
        .query({ active: true, currentWindow: true })
        .then(([tab]) => setHost(tab?.url ? (hostOf(tab.url) ?? null) : null))
        .catch(() => setHost(null));
    read();
    const onActivated = () => read();
    const onUpdated = (_id: number, info: { url?: string }) => info.url && read();
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);
  return host;
}

/** One notice at a time under the search bar: paused, site blocked, history full, basic AI. */
export function HomeNotice({
  settings,
  now,
  count,
  onCleanUp,
  onPro,
}: {
  settings: Settings;
  now: number;
  count: number;
  onCleanUp: () => void;
  onPro: () => void;
}) {
  const host = useActiveHost();
  const [basicAi, setBasicAi] = useState(false);
  useEffect(() => {
    void nanoAvailability().then((a) => setBasicAi(a === 'unavailable'));
  }, []);

  let notice: React.ReactNode = null;
  if (isPaused(settings, now)) {
    const mins = Math.max(1, Math.round((settings.pausedUntil - now) / 60_000));
    notice = (
      <Notice
        tone="warning"
        title="Auto-save is paused"
        body={`Nothing you copy is being saved. Resumes in ${mins} ${mins === 1 ? 'minute' : 'minutes'}.`}
        action={{ label: 'Resume now', onClick: () => void updateSettings({ pausedUntil: 0 }) }}
      />
    );
  } else if (settings.autoSave && host && settings.blockedSites.includes(host)) {
    notice = (
      <Notice
        tone="neutral"
        title="This site isn't saved"
        body={`You blocked ${host}.`}
        action={{
          label: 'Unblock this site',
          onClick: () => void updateSettings({ blockedSites: settings.blockedSites.filter((s) => s !== host) }),
        }}
      />
    );
  } else if (count >= MAX_CLIPS) {
    notice = (
      <Notice
        tone="neutral"
        title={`History is full: ${count.toLocaleString()} of ${MAX_CLIPS.toLocaleString()}`}
        body="New clips replace your oldest unpinned ones. Pinned clips are kept."
        action={{ label: 'Clean up', onClick: onCleanUp }}
        secondary={{ label: 'Unlimited with Pro', onClick: onPro }}
      />
    );
  } else if (basicAi && settings.onboarded && !settings.dismissedTips.includes('basic-ai')) {
    notice = (
      <Notice
        tone="ai"
        title="Basic AI on this computer"
        body="Sorting and search work. Rewriting and summaries need Chrome's built-in AI, which this computer doesn't support."
        action={{
          label: 'Got it',
          onClick: () => void updateSettings({ dismissedTips: [...settings.dismissedTips, 'basic-ai'] }),
        }}
      />
    );
  }
  return notice ? <div className="px-[18px] pb-3">{notice}</div> : null;
}
