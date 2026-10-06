/**
 * Sites where nothing is ever saved: password managers and common banks.
 * A small safety net (docs/02-design.md §4); users add their own in Settings.
 */
export const BUILT_IN_BLOCKED = [
  '1password.com',
  'bitwarden.com',
  'lastpass.com',
  'dashlane.com',
  'keepersecurity.com',
  'proton.me',
  'accounts.google.com',
  'chase.com',
  'bankofamerica.com',
  'wellsfargo.com',
  'citi.com',
  'capitalone.com',
  'usbank.com',
  'paypal.com',
  'hsbc.com',
  'barclays.co.uk',
  'lloydsbank.com',
  'natwest.com',
  'santander.com',
  'revolut.com',
  'wise.com',
  'monzo.com',
  'td.com',
  'rbc.com',
  'scotiabank.com',
  'commbank.com.au',
];

export function hostnameOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

/** Normalizes what a user types ("https://www.Example.com/x") to "example.com". */
export function normalizeSite(input: string): string | undefined {
  const t = input.trim().toLowerCase();
  if (!t) return undefined;
  const host = hostnameOf(t.includes('://') ? t : `https://${t}`);
  return host && host.includes('.') ? host : undefined;
}

/** True when `host` equals `site` or is a subdomain of it. */
function matches(host: string, site: string): boolean {
  return host === site || host.endsWith(`.${site}`);
}

export function isBlocked(url: string | undefined, userBlocked: string[]): boolean {
  const host = hostnameOf(url);
  if (!host) return true; // chrome://, file://, extension pages: never auto-save
  return [...BUILT_IN_BLOCKED, ...userBlocked].some((site) => matches(host, site));
}

export function isBuiltInBlocked(url: string | undefined): boolean {
  const host = hostnameOf(url);
  return !!host && BUILT_IN_BLOCKED.some((site) => matches(host, site));
}
