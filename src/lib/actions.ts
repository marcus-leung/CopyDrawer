/**
 * Smart actions: rules that spot what a clip is (a tracking number, a date, an
 * address, a color…) and offer the obvious next step. No AI, instant, offline.
 */

// ---------- Links ----------

const TRACKING_PARAMS =
  /^(utm_\w+|fbclid|gclid|gclsrc|dclid|gbraid|wbraid|msclkid|yclid|twclid|mc_cid|mc_eid|_hsenc|_hsmi|igshid|ref_src|ref_url|mkt_tok|oly_anon_id|oly_enc_id|vero_id|wickedid|__s|_ga|_gl)$/i;
/** Parameters that are tracking only on some sites (elsewhere they can matter). */
const SITE_PARAMS: Record<string, RegExp> = {
  'youtube.com': /^(si|feature|pp)$/,
  'youtu.be': /^(si|feature)$/,
  'spotify.com': /^(si|context)$/,
  'amazon.': /^(ref|ref_|pf_rd_\w+|pd_rd_\w+|psc|qid|sr|keywords|crid|sprefix|content-id|th|linkCode|tag|linkId)$/,
  'instagram.com': /^(igsh|img_index)$/,
  'twitter.com': /^(s|t)$/,
  'x.com': /^(s|t)$/,
  'linkedin.com': /^(trk|trackingId|lipi|refId|midToken|midSig|trkEmail|eid|otpToken)$/,
};

/** Removes tracking parameters from a link. Returns the input unchanged if it isn't a URL. */
export function cleanUrl(input: string): string {
  const raw = input.trim();
  let url: URL;
  try {
    url = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw);
  } catch {
    return input;
  }
  if (!/^https?:$/.test(url.protocol)) return input;
  const host = url.hostname.replace(/^www\./, '');
  const siteRule = Object.entries(SITE_PARAMS).find(([h]) =>
    h.endsWith('.') ? host.includes(h) : host === h || host.endsWith(`.${h}`),
  )?.[1];
  let changed = false;
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key) || siteRule?.test(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) return input;
  let out = url.toString();
  if (!url.search) out = out.replace(/\?$/, '');
  return /^www\./i.test(raw) ? out.replace(/^https:\/\//, '') : out;
}

// ---------- Colors ----------

export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(text: string): Rgb | null {
  const t = text.trim().toLowerCase();
  let m = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(t);
  if (m && (t.startsWith('#') || /[a-f]/.test(m[1]!))) {
    let h = m[1]!;
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? Math.round((n(6) / 255) * 100) / 100 : 1 };
  }
  m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(t);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number) as [number, number, number];
    if (r > 255 || g > 255 || b > 255) return null;
    return { r, g, b, a: alpha(m[4]) };
  }
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(t);
  if (m) return { ...hslToRgb(Number(m[1]), Number(m[2]), Number(m[3])), a: alpha(m[4]) };
  return null;
}

function alpha(s: string | undefined): number {
  if (!s) return 1;
  return s.endsWith('%') ? Number(s.slice(0, -1)) / 100 : Number(s);
}

function hslToRgb(h: number, s: number, l: number) {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return { r: f(0), g: f(8), b: f(4) };
}

export function colorFormats({ r, g, b, a }: Rgb): { hex: string; rgb: string; hsl: string } {
  const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}${
    a < 1
      ? Math.round(a * 255)
          .toString(16)
          .padStart(2, '0')
      : ''
  }`.toUpperCase();
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const aPart = a < 1 ? ` / ${a}` : '';
  return {
    hex,
    rgb: a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`,
    hsl: `hsl(${h} ${Math.round(s * 100)}% ${Math.round(l * 100)}%${aPart})`,
  };
}

// ---------- Dates ----------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const WEEKDAY = '(?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|urday)?\\.?,?\\s+)?';
const TIME = '(?:,?\\s*(?:at\\s+|@\\s*)?(\\d{1,2})(?:[:.h](\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?)?';

interface FoundDate {
  start: Date;
  /** No time of day was given. */
  allDay: boolean;
  /** The words in the clip, e.g. "Sat 18 Oct, 9 PM". */
  label: string;
}

function toHour(h: string | undefined, min: string | undefined, ampm: string | undefined): [number, number] | null {
  if (h == null) return null;
  let hour = Number(h);
  const minute = min ? Number(min) : 0;
  const ap = ampm?.replace(/\./g, '').toLowerCase();
  // A bare number after a date ("14 Oct 2026") isn't a time; need minutes or am/pm.
  if (!min && !ap) return null;
  if (ap === 'pm' && hour < 12) hour += 12;
  if (ap === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return [hour, minute];
}

/** Finds the first date (and time) in text. Dates without a year mean the next one coming. */
export function findDate(text: string, now = new Date()): FoundDate | null {
  const candidates: { index: number; build: () => FoundDate | null }[] = [];
  const push = (re: RegExp, make: (m: RegExpExecArray) => FoundDate | null) => {
    const m = re.exec(text);
    if (m) candidates.push({ index: m.index, build: () => make(m) });
  };

  const finish = (
    m: RegExpExecArray,
    y: number | null,
    mo: number,
    d: number,
    time: [number, number] | null,
  ): FoundDate | null => {
    if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
    let year = y ?? now.getFullYear();
    let start = new Date(year, mo, d, time?.[0] ?? 0, time?.[1] ?? 0);
    if (start.getMonth() !== mo) return null; // 31 Feb
    if (y == null && start.getTime() < now.getTime() - 86_400_000) {
      year += 1;
      start = new Date(year, mo, d, time?.[0] ?? 0, time?.[1] ?? 0);
    }
    return { start, allDay: !time, label: m[0].trim().replace(/[,\s]+$/, '') };
  };
  const monthIndex = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase());

  // 2026-10-14 07:40
  push(/\b(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?\b/, (m) =>
    finish(m, Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? [Number(m[4]), Number(m[5])] : null),
  );
  // Sat 18 Oct(ober) (2026), 9 PM
  push(new RegExp(`\\b${WEEKDAY}(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}(?:,?\\s+(\\d{4}))?${TIME}`, 'i'), (m) =>
    finish(m, m[3] ? Number(m[3]) : null, monthIndex(m[2]!), Number(m[1]), toHour(m[4], m[5], m[6])),
  );
  // Sat, Oct 18(th)(, 2026) at 9:30pm
  push(new RegExp(`\\b${WEEKDAY}${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${TIME}`, 'i'), (m) =>
    finish(m, m[3] ? Number(m[3]) : null, monthIndex(m[1]!), Number(m[2]), toHour(m[4], m[5], m[6])),
  );

  candidates.sort((a, b) => a.index - b.index);
  for (const c of candidates) {
    const found = c.build();
    if (found) return found;
  }
  return null;
}

function icsDate(d: Date, allDay: boolean): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const day = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  return allDay ? day : `${day}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

function icsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\r\n?|\n/g, '\\n')
    .replace(/[,;]/g, (c) => `\\${c}`);
}

/** A calendar file for one event (local time, 1 hour; all-day when no time). */
export function makeIcs(
  event: { title: string; date: FoundDate; details?: string; location?: string },
  now = new Date(),
): string {
  const { start, allDay } = event.date;
  const end = allDay
    ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
    : new Date(start.getTime() + 3_600_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CopyDrawer//EN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@clipboard`,
    `DTSTAMP:${now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '')}`,
    allDay ? `DTSTART;VALUE=DATE:${icsDate(start, true)}` : `DTSTART:${icsDate(start, false)}`,
    allDay ? `DTEND;VALUE=DATE:${icsDate(end, true)}` : `DTEND:${icsDate(end, false)}`,
    `SUMMARY:${icsText(event.title)}`,
    ...(event.details ? [`DESCRIPTION:${icsText(event.details.slice(0, 1000))}`] : []),
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
}

// ---------- Addresses, tracking, flights, contacts ----------

const STREET_TYPES =
  'St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Ln|Lane|Dr|Drive|Way|Ct|Court|Pl|Place|Sq|Square|Ter|Terrace|Pkwy|Parkway|Hwy|Highway';
const STREET_FIRST =
  'Rua|Calle|Carrer|Via|Viale|Avenida|Av\\.|Avenue|Rue|Boulevard|Bd|Praça|Largo|Travessa|Plaza|Paseo|Piazza|Corso|Straße|Strasse|Str\\.|Weg|Platz|Gasse|Ulica|ul\\.';

/** Finds a street address: "221B Baker Street, London NW1 6XE" or "Rua de São João 94, Lisbon". */
export function findAddress(text: string): string | null {
  // ", London NW1 6XE": capitalized words and postcodes after a comma.
  const word = "[\\p{Lu}\\d][\\p{L}\\d'-]*";
  const tail = `(?:,\\s*${word}(?:\\s+${word}){0,4}){0,2}`;
  const res = [
    new RegExp(`\\b\\d{1,5}[A-Za-z]?\\s+(?:[\\p{Lu}\\d][\\p{L}'.-]*\\s+){1,4}(?:${STREET_TYPES})\\b\\.?${tail}`, 'u'),
    new RegExp(`(?<![\\p{L}])(?:${STREET_FIRST})\\s+(?:[\\p{L}'.-]+\\s+){0,5}\\d{1,4}[A-Za-z]?\\b${tail}`, 'u'),
    new RegExp(
      `(?<![\\p{L}])[\\p{Lu}][\\p{L}-]*(?:straße|strasse|gasse|weg|platz|laan|gade|vej|gatan)\\s+\\d{1,4}[a-z]?\\b${tail}`,
      'u',
    ),
  ];
  for (const re of res) {
    const m = re.exec(text);
    if (m) return m[0].replace(/[\s,.]+$/, '').replace(/\s+/g, ' ');
  }
  return null;
}

interface Tracking {
  carrier: string;
  number: string;
  url: string;
}

export function findTracking(text: string): Tracking | null {
  const compact = (s: string) => s.replace(/\s+/g, '').toUpperCase();
  let m = /\b1Z(?:\s?[0-9A-Z]){16}\b/i.exec(text);
  if (m) {
    const n = compact(m[0]);
    return { carrier: 'UPS', number: n, url: `https://www.ups.com/track?tracknum=${n}` };
  }
  m = /\b9[2-5](?:\s?\d){20}\b/.exec(text);
  if (m) {
    const n = compact(m[0]);
    return { carrier: 'USPS', number: n, url: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}` };
  }
  if (/fedex/i.test(text)) {
    m = /\b(?:\d\s?){11}\d\b|\b(?:\d\s?){14}\d\b/.exec(text);
    if (m) {
      const n = compact(m[0]);
      return { carrier: 'FedEx', number: n, url: `https://www.fedex.com/fedextrack/?trknbr=${n}` };
    }
  }
  if (/\bdhl\b/i.test(text)) {
    m = /\b\d{10}\b|\bJ[DV]D\d{11,18}\b/i.exec(text);
    if (m) {
      const n = compact(m[0]);
      return {
        carrier: 'DHL',
        number: n,
        url: `https://www.dhl.com/global-en/home/tracking/tracking-express.html?tracking-id=${n}`,
      };
    }
  }
  return null;
}

/** "TP 1355" when the clip talks about a flight, or is just a flight number. */
export function findFlight(text: string): string | null {
  const re = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{1,4})\b/;
  const m = re.exec(text);
  if (!m) return null;
  const flighty = /\b(flight|flug|vuelo|voo|vol|boarding|departs?|departure|gate)\b/i.test(text) || text.trim().length <= 8;
  return flighty ? `${m[1]} ${m[2]}` : null;
}

export const EMAIL = /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/;
export const PHONE = /^\+?[\d\s().-]{7,20}$/;

/** "$1,299.00" → "1299.00": the number without currency, separators or units. */
export function plainNumber(text: string): string {
  const t = text.trim().replace(/−/g, '-');
  const sign = t.startsWith('-') ? '-' : '';
  const body = t.replace(/[^\d.,]/g, '');
  // A comma followed by exactly two digits at the end is a decimal comma ("12,50").
  const normalized = /,\d{1,2}$/.test(body) && !body.includes('.') ? body.replace(/,(?=\d{1,2}$)/, '.') : body;
  return sign + normalized.replace(/[, ]/g, '');
}

// ---------- All actions for a clip ----------

export type SmartAction =
  | { kind: 'open-link'; label: string; url: string }
  | { kind: 'copy'; label: string; text: string }
  | { kind: 'calendar'; label: string; date: FoundDate; location?: string }
  | { kind: 'color'; label: string; rgb: Rgb };

interface Detected {
  /** One line saying what we noticed, e.g. "Looks like a UPS tracking number". */
  note?: string;
  actions: SmartAction[];
  color?: Rgb;
  json?: unknown;
}

export function detectActions(clip: { kind: string; text: string }, now = new Date()): Detected {
  const out: Detected = { actions: [] };
  if (clip.kind === 'image') return out;
  const text = clip.text.trim();

  if (clip.kind === 'link') {
    const cleaned = cleanUrl(text);
    if (cleaned !== text) out.actions.push({ kind: 'copy', label: 'Copy without tracking', text: cleaned });
    return out;
  }

  const color = clip.kind === 'color' ? parseColor(text) : null;
  if (color) {
    const f = colorFormats(color);
    out.color = color;
    out.note = 'Looks like a color';
    out.actions.push({ kind: 'copy', label: `Copy ${f.hex}`, text: f.hex });
    out.actions.push({ kind: 'copy', label: 'Copy RGB', text: f.rgb });
    out.actions.push({ kind: 'copy', label: 'Copy HSL', text: f.hsl });
    return out;
  }

  if (clip.kind === 'json') {
    try {
      const json: unknown = JSON.parse(text);
      out.json = json;
      out.note = 'Looks like JSON';
      out.actions.push({ kind: 'copy', label: 'Copy tidy', text: JSON.stringify(json, null, 2) });
      out.actions.push({ kind: 'copy', label: 'Copy on one line', text: JSON.stringify(json) });
    } catch {
      // Marked JSON but doesn't parse: no JSON actions.
    }
    return out;
  }
  if (clip.kind === 'code') return out;

  if (clip.kind === 'number') {
    const n = plainNumber(text);
    if (n !== text) out.actions.push({ kind: 'copy', label: 'Copy number only', text: n });
    return out;
  }

  const tracking = findTracking(text);
  if (tracking) {
    out.note = `Looks like a ${tracking.carrier} tracking number`;
    out.actions.push({ kind: 'open-link', label: 'Track package', url: tracking.url });
    if (/\s/.test(text) && text.replace(/\s+/g, '').toUpperCase() === tracking.number) {
      out.actions.push({ kind: 'copy', label: 'Copy without spaces', text: tracking.number });
    }
  }

  if (clip.kind === 'email') {
    out.note ??= 'Looks like an email address';
    out.actions.push({ kind: 'open-link', label: 'Write an email', url: `mailto:${text}` });
  } else if (clip.kind === 'phone') {
    out.note ??= 'Looks like a phone number';
    out.actions.push({ kind: 'open-link', label: 'Call', url: `tel:${text.replace(/[^\d+]/g, '')}` });
  }

  const flight = findFlight(text);
  if (flight && !tracking) {
    out.actions.push({
      kind: 'open-link',
      label: `Flight ${flight} status`,
      url: `https://www.google.com/search?q=${encodeURIComponent(`${flight.replace(' ', '')} flight status`)}`,
    });
  }

  const address = findAddress(text);
  const date = findDate(text, now);
  if (date) {
    out.actions.push({ kind: 'calendar', label: `Add ${date.label} to calendar`, date, location: address ?? undefined });
  }
  if (address) {
    out.actions.push({
      kind: 'open-link',
      label: 'Open address in Maps',
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    });
  }
  return out;
}
