import { hostOf } from './format';

/** Sites where nothing is ever saved: private accounts and money. Users add their own in Settings. */
export const BUILT_IN_BLOCKED = [
  // Password managers
  '1password.com',
  '1password.ca',
  '1password.eu',
  'bitwarden.com',
  'lastpass.com',
  'dashlane.com',
  'keepersecurity.com',
  'nordpass.com',
  'roboform.com',
  'enpass.io',
  'vault.zoho.com',
  'proton.me',
  // Sign-in pages
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.live.com',
  'appleid.apple.com',
  'account.apple.com',
  'okta.com',
  'auth0.com',
  'login.gov',
  'id.me',
  // Banks, cards and brokerages: US
  'chase.com',
  'bankofamerica.com',
  'wellsfargo.com',
  'citi.com',
  'capitalone.com',
  'usbank.com',
  'pnc.com',
  'truist.com',
  'tdbank.com',
  'ally.com',
  'discover.com',
  'americanexpress.com',
  'sofi.com',
  'schwab.com',
  'fidelity.com',
  'vanguard.com',
  'etrade.com',
  'robinhood.com',
  'navyfederal.org',
  'usaa.com',
  'regions.com',
  'key.com',
  '53.com',
  'huntington.com',
  'citizensbank.com',
  'mtb.com',
  'synchrony.com',
  'mysynchrony.com',
  'chime.com',
  'marcus.com',
  // Banks: UK and Europe
  'hsbc.com',
  'hsbc.co.uk',
  'barclays.co.uk',
  'lloydsbank.com',
  'natwest.com',
  'santander.com',
  'santander.co.uk',
  'halifax.co.uk',
  'nationwide.co.uk',
  'monzo.com',
  'starlingbank.com',
  'revolut.com',
  'n26.com',
  'ing.com',
  'mabanque.bnpparibas',
  'societegenerale.fr',
  'deutsche-bank.de',
  'commerzbank.de',
  'ubs.com',
  'abnamro.nl',
  'rabobank.nl',
  'bbva.com',
  'bbva.es',
  'caixabank.es',
  'intesasanpaolo.com',
  'unicredit.it',
  'nordea.com',
  'danskebank.com',
  // Banks: Canada, Australia, Asia
  'td.com',
  'rbc.com',
  'rbcroyalbank.com',
  'scotiabank.com',
  'bmo.com',
  'cibc.com',
  'tangerine.ca',
  'commbank.com.au',
  'westpac.com.au',
  'anz.com',
  'anz.com.au',
  'nab.com.au',
  'dbs.com.sg',
  'ocbc.com',
  'uob.com.sg',
  'icicibank.com',
  'hdfcbank.com',
  'onlinesbi.sbi',
  'mufg.jp',
  // Payments and crypto
  'paypal.com',
  'venmo.com',
  'cash.app',
  'wise.com',
  'dashboard.stripe.com',
  'coinbase.com',
  'binance.com',
  'kraken.com',
  'crypto.com',
  'gemini.com',
  'metamask.io',
  // Tax and government accounts
  'irs.gov',
  'ssa.gov',
  'account.gov.uk',
  'cra-arc.gc.ca',
  'my.gov.au',
  'turbotax.intuit.com',
  'hrblock.com',
  // Health portals
  'mychart.com',
  'kp.org',
  'followmyhealth.com',
];

/** Normalizes what a user types ("https://www.Example.com/x") to "example.com". */
export function normalizeSite(input: string): string | undefined {
  // "*.example.com" means the same as "example.com": subdomains are always included.
  const t = input.trim().toLowerCase().replace(/^\*\./, '');
  if (!t) return undefined;
  const host = hostOf(t.includes('://') ? t : `https://${t}`);
  return host && host.includes('.') && /^[a-z0-9.-]+$/.test(host) ? host : undefined;
}

/** True when `host` equals `site` or is a subdomain of it. */
function matches(host: string, site: string): boolean {
  return host === site || host.endsWith(`.${site}`);
}

export function isBlocked(url: string | undefined, userBlocked: string[]): boolean {
  const host = hostOf(url);
  if (!host) return true; // chrome://, file://, extension pages: never auto-save
  return [...BUILT_IN_BLOCKED, ...userBlocked].some((site) => matches(host, site));
}

export function isBuiltInBlocked(url: string | undefined): boolean {
  const host = hostOf(url);
  return !!host && BUILT_IN_BLOCKED.some((site) => matches(host, site));
}
