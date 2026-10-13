import { findTracking } from './actions';

const PATTERNS: [kind: string, re: RegExp][] = [
  ['private key', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
  ['access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['access key', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/],
  ['access key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/],
  ['access key', /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/],
  ['access key', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['access key', /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/],
  ['access key', /\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/],
  ['password', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i],
];

/** A whole line that sets a password or key: "password: hunter2!", "DB_PASSWORD=...", "api_key: '...'". */
const LABELLED =
  /^\s*(?:export\s+)?[\w.-]*(?:password|passwd|pwd|passcode|secret|api[_-]?key|access[_-]?key|auth[_-]?token|token)[\w.-]*\s*[:=]\s*["']?([^\s"']{6,})["']?,?\s*$/im;
const TYPE_NAMES = /^(?:string|number|boolean|null|undefined|true|false|any|unknown)\b/i;

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

const CARD_START = /^(?:4|5[1-5]|2(?:2[2-9]|[3-6]\d|7[01]|720)|3[47]|6011|65|64[4-9])/;

function hasCardNumber(text: string): boolean {
  for (const m of text.matchAll(/(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g)) {
    const digits = m[0].replace(/\D/g, '');
    const amex = /^3[47]/.test(digits);
    if ((amex ? digits.length === 15 : digits.length >= 13) && CARD_START.test(digits) && luhn(digits)) return true;
  }
  return false;
}

/**
 * What kind of secret the text holds (a password, access key, private key or card number), or null.
 * Auto-save skips these. Errs toward missing an unusual secret rather than skipping ordinary text.
 */
export function secretKind(text: string): string | null {
  for (const [kind, re] of PATTERNS) if (re.test(text)) return kind;
  const labelled = LABELLED.exec(text);
  if (labelled && !TYPE_NAMES.test(labelled[1]!)) return 'password';
  if (hasCardNumber(text) && !findTracking(text)) return 'card number';
  return null;
}
