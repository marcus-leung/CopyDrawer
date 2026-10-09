import { describe, expect, it } from 'vitest';
import { BUILT_IN_BLOCKED, isBlocked, isBuiltInBlocked, normalizeSite } from '@/lib/exclusions';

describe('blocked sites', () => {
  it('never auto-saves on non-web pages', () => {
    expect(isBlocked('chrome://settings', [])).toBe(true);
    expect(isBlocked(undefined, [])).toBe(true);
    expect(isBlocked('https://en.wikipedia.org/wiki/Lisbon', [])).toBe(false);
  });

  it('blocks built-in sites and their subdomains', () => {
    expect(isBlocked('https://my.1password.com/vaults', [])).toBe(true);
    expect(isBuiltInBlocked('https://www.paypal.com/myaccount')).toBe(true);
    expect(isBuiltInBlocked('https://notpaypal.com')).toBe(false);
  });

  it('covers sign-in, banks, crypto, tax and health portals, each listed once as a plain host', () => {
    for (const url of [
      'https://login.microsoftonline.com/common/oauth2',
      'https://secure.chase.com/web/auth',
      'https://www.coinbase.com/home',
      'https://sa.www4.irs.gov/ola',
      'https://mychart.com/login',
      'https://online.hsbc.co.uk',
    ])
      expect(isBuiltInBlocked(url)).toBe(true);
    expect(isBuiltInBlocked('https://www.google.com/search?q=chase')).toBe(false);
    expect(new Set(BUILT_IN_BLOCKED).size).toBe(BUILT_IN_BLOCKED.length);
    for (const site of BUILT_IN_BLOCKED) expect(normalizeSite(site)).toBe(site);
  });

  it('blocks user sites', () => {
    expect(isBlocked('https://mail.work.com/inbox', ['work.com'])).toBe(true);
    expect(isBlocked('https://work.com.evil.io', ['work.com'])).toBe(false);
  });

  it('normalizes what people type', () => {
    expect(normalizeSite('  https://www.MyBank.com/login ')).toBe('mybank.com');
    expect(normalizeSite('docs.example.org')).toBe('docs.example.org');
    expect(normalizeSite('not a site')).toBeUndefined();
    expect(normalizeSite('')).toBeUndefined();
  });

  it('treats a wildcard as the site itself (subdomains are always included)', () => {
    expect(normalizeSite('*.evil.com')).toBe('evil.com');
    expect(isBlocked('https://a.evil.com/', [normalizeSite('*.evil.com')!])).toBe(true);
    expect(normalizeSite('ev*l.com')).toBeUndefined();
  });
});
