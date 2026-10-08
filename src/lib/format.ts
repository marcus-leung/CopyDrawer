const DAY = 86_400_000;

/** Short relative time: "now", "5m", "3h", "Yesterday", "Mon", "12 Oct". */
export function shortTime(ts: number, now = Date.now()): string {
  const diff = now - ts;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  const d = new Date(ts);
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (ts >= startOfToday) return `${Math.floor(diff / 3_600_000)}h`;
  if (ts >= startOfToday - DAY) return 'Yesterday';
  if (ts >= startOfToday - 6 * DAY) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** "en.wikipedia.org" for a web address; undefined for anything that isn't http(s). */
export function hostOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

/** "Ctrl+V", or "Cmd+V" on a Mac. */
export function modKey(key: string, platform = navigator.platform): string {
  return `${/^Mac/.test(platform) ? 'Cmd' : 'Ctrl'}+${key}`;
}
