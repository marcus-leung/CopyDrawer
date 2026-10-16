import { hostOf } from './format';

/**
 * Sites where nothing is ever saved: private accounts, money and government.
 * Each entry also covers its subdomains, so "gov" means every *.gov site.
 * Users add their own in Settings.
 */
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
  // Email and private messages
  'mail.google.com',
  'outlook.live.com',
  'outlook.office.com',
  'mail.yahoo.com',
  'web.whatsapp.com',
  'messages.google.com',
  'web.telegram.org',
  // Sign-in pages
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.live.com',
  'appleid.apple.com',
  'account.apple.com',
  'okta.com',
  'auth0.com',
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
  // Government, by country domain
  'gov',
  'mil',
  'gov.uk',
  'gc.ca',
  'gov.au',
  'govt.nz',
  'gov.ie',
  'gouv.fr',
  'bund.de',
  'admin.ch',
  'gob.mx',
  'gob.es',
  'gov.it',
  'gov.in',
  'gov.sg',
  'go.jp',
  'gov.br',
  'gov.za',
  'gov.hk',
  // Tax, credit, payroll and insurance
  'turbotax.intuit.com',
  'hrblock.com',
  'experian.com',
  'equifax.com',
  'transunion.com',
  'creditkarma.com',
  'adp.com',
  'myworkday.com',
  'gusto.com',
  'paychex.com',
  'geico.com',
  'progressive.com',
  'statefarm.com',
  'allstate.com',
  // Health portals
  'mychart.com',
  'kp.org',
  'followmyhealth.com',
  'zocdoc.com',
];

/** Normalizes what a user types ("https://www.Example.com/x") to "example.com". */
export function normalizeSite(input: string): string | undefined {
  // "*.example.com" means the same as "example.com": subdomains are always included.
  const t = input.trim().toLowerCase().replace(/^\*\./, '');
  if (!t) return undefined;
  const host = hostOf(t.includes('://') ? t : `https://${t}`);
  return host && host.includes('.') && /^[a-z0-9.-]+$/.test(host) ? host : undefined;
}

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

/**
 * Whether copies on a page are never saved: a blocked site, or incognito when that's off. `frameUrl` is the frame the copy came from; a blank or srcdoc frame
 * (an editor inside the page) belongs to the page around it.
 */
export function notSavedHere(
  page: { url?: string; frameUrl?: string; incognito?: boolean },
  s: { blockedSites: string[]; saveInIncognito: boolean },
): boolean {
  const copiedFrom = hostOf(page.frameUrl) ? page.frameUrl : page.url;
  return isBlocked(copiedFrom, s.blockedSites) || isBlocked(page.url, s.blockedSites) || (!!page.incognito && !s.saveInIncognito);
}

/** Names that only resolve on a home or office network. */
const LOCAL_SUFFIXES = ['localhost', 'local', 'lan', 'home', 'home.arpa', 'internal', 'intranet', 'corp'];

function privateIpv4(a: number, b: number): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function privateIpv6(h: string): boolean {
  if (h === '::' || h === '::1') return true;
  // IPv4 inside IPv6, as the URL parser writes it: ::ffff:7f00:1 is 127.0.0.1.
  const mapped = /^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/.exec(h);
  if (mapped) {
    const high = parseInt(mapped[1]!, 16);
    return privateIpv4(high >> 8, high & 0xff);
  }
  const first = parseInt(h.split(':')[0] || '0', 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80; // unique local fc00::/7, link-local fe80::/10
}

/**
 * This computer or the local network, judged from the address alone: names that resolve to private addresses
 * through public DNS can't be told apart here. Takes a hostname as `URL` gives it (IPv4 normalized, IPv6 in brackets).
 */
export function isPrivateHost(host: string): boolean {
  const h = host
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (h.includes(':')) return privateIpv6(h);
  // A single word ("router", "nas") only resolves on a local network.
  if (!h.includes('.')) return true;
  if (LOCAL_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`))) return true;
  const ip = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h);
  return !!ip && privateIpv4(Number(ip[1]), Number(ip[2]));
}
