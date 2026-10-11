import { EMAIL, findAddress, findDate, findTracking, parseColor, PHONE } from './actions';

export const CLIP_KINDS = [
  'text',
  'link',
  'image',
  'code',
  'json',
  'color',
  'email',
  'phone',
  'address',
  'date',
  'number',
] as const;
export type ClipKind = (typeof CLIP_KINDS)[number];

/** Singular and plural names, for filters and labels. */
export const KIND_LABEL: Record<ClipKind, [string, string]> = {
  text: ['Text', 'Text'],
  link: ['Link', 'Links'],
  image: ['Image', 'Images'],
  code: ['Code', 'Code'],
  json: ['JSON', 'JSON'],
  color: ['Color', 'Colors'],
  email: ['Email', 'Emails'],
  phone: ['Phone number', 'Phone numbers'],
  address: ['Address', 'Addresses'],
  date: ['Date', 'Dates'],
  number: ['Number', 'Numbers'],
};

/** Words that find a clip by its type in search ("email", "phone"…). */
export const KIND_WORDS: Record<ClipKind, string> = {
  text: '',
  link: 'link url',
  image: 'image picture photo screenshot',
  code: 'code',
  json: 'json code',
  color: 'color colour',
  email: 'email e-mail',
  phone: 'phone number call',
  address: 'address location',
  date: 'date',
  number: 'number amount',
};

const URL_RE = /^(https?:\/\/|www\.)\S+$/i;
const CODE_HINTS = /[{};]\s*$|^\s*(const|let|var|function|import|export|def|class|SELECT|INSERT|UPDATE|<\w+)[\s(]/m;
const NUMBER = /^[-+−]?(?:[$€£¥₹]\s?)?(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:[.,]\d+)?\s?(?:%|[$€£¥₹]|USD|EUR|GBP|CAD|AUD)?$/i;

/** Plain digits a phone number is written with: needs a + or separators, so bare numbers stay numbers. */
function isPhone(t: string): boolean {
  if (!PHONE.test(t) || !/^\+|[\s().-]/.test(t)) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(t)) return false; // an IP address
  const digits = t.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
}

/** Written as a color: #hex, rgb() or hsl(). Bare hex ("2FA", "c0ffee", a git hash) stays text. */
function isColor(t: string): boolean {
  return t.length <= 40 && /^(#|rgba?\(|hsla?\()/i.test(t) && !!parseColor(t);
}

function isJson(t: string): boolean {
  if (!/^[[{]/.test(t) || t.length > 500_000) return false;
  try {
    const v: unknown = JSON.parse(t);
    return !!v && typeof v === 'object';
  } catch {
    return false;
  }
}

/** True when `found` is the whole of `t`, give or take closing punctuation. */
const isWhole = (found: string | null | undefined, t: string) => !!found && t.replace(/[\s.,;]+$/, '') === found;

/** What a clip is. A specific type only when the whole clip is that one thing; otherwise text or code. */
export function detectKind(text: string): ClipKind {
  const t = text.trim();
  if (URL_RE.test(t)) return 'link';
  if (EMAIL.test(t)) return 'email';
  if (isColor(t)) return 'color';
  if (isJson(t)) return 'json';
  // Tracking numbers stay text: their actions and Shopping sorting look for text.
  if (findTracking(t)) return 'text';
  // Before phone: "2026-10-14" has a phone number's characters.
  if (t.length <= 60 && isWhole(findDate(t)?.label, t)) return 'date';
  // Before phone: "1 000 000" is grouped like one; real phone numbers never match NUMBER.
  if (NUMBER.test(t) && !/^\+\d{7,15}$/.test(t)) return 'number';
  if (isPhone(t)) return 'phone';
  if (t.length <= 200 && isWhole(findAddress(t), t)) return 'address';
  if (t.includes('\n') && CODE_HINTS.test(t)) return 'code';
  // One-line SQL ("SELECT … FROM …"); uppercase only, so ordinary sentences don't match.
  if (/^(SELECT|INSERT|UPDATE|DELETE)\b.*\b(FROM|INTO|SET|WHERE)\b/.test(t)) return 'code';
  return 'text';
}
