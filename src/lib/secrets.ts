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

/** A line that sets a password or key: "password: hunter2!x", "DB_PASSWORD=...", "api_key: '...'", "auth_token=...". */
const LABELLED =
  /^\s*(?:export\s+)?(?:[\w.-]*[_.-])?(?:password|passwd|passcode|pwd|secret|secret[_-]?key|api[_-]?key|access[_-]?key|(?:auth|access|refresh|bearer|api|session)[_-]?token|token)\s*[:=]\s*["']?([^\s"']+)["']?,?\s*$/im;

/** Values that only point at a secret: a path, a link, or code like `process.env.TOKEN`. */
const NOT_A_SECRET = /^(?:[/~.]|[a-z][a-z0-9+.-]*:\/\/|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+;?$)/i;

/** A value that could be a secret: 8+ characters, letters and at least one digit or symbol. */
function secretValue(v: string): boolean {
  return v.length >= 8 && /\p{L}/u.test(v) && /[\d\W_]/u.test(v) && !NOT_A_SECRET.test(v);
}

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
  if (labelled && secretValue(labelled[1]!)) return 'password';
  if (hasCardNumber(text) && !findTracking(text)) return 'card number';
  return null;
}
