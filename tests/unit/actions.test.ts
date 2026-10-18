import { describe, expect, it } from 'vitest';
import {
  cleanUrl,
  colorFormats,
  detectActions,
  findAddress,
  findDate,
  findFlight,
  findTracking,
  makeIcs,
  parseColor,
} from '@/lib/actions';
import { detectKind } from '@/lib/clips';

const NOW = new Date(2026, 9, 6, 12, 0); // Tue 6 Oct 2026, noon

describe('cleanUrl', () => {
  it('drops tracking parameters and keeps the rest', () => {
    expect(cleanUrl('https://shop.test/p/1?utm_source=x&utm_medium=y&color=red&fbclid=abc')).toBe(
      'https://shop.test/p/1?color=red',
    );
    expect(cleanUrl('https://youtu.be/abc?si=XYZ')).toBe('https://youtu.be/abc');
    expect(cleanUrl('https://www.amazon.com/dp/B00X/ref=sr_1_1?crid=1&keywords=lamp&qid=2&sr=8-1')).toBe(
      'https://www.amazon.com/dp/B00X/ref=sr_1_1',
    );
    // ?ref= matters on GitHub; leave it.
    expect(cleanUrl('https://github.com/a/b?ref=main')).toBe('https://github.com/a/b?ref=main');
    expect(cleanUrl('not a link')).toBe('not a link');
  });
});

describe('colors', () => {
  it('reads hex, rgb and hsl and converts between them', () => {
    expect(colorFormats(parseColor('#2457c5')!)).toEqual({ hex: '#2457C5', rgb: 'rgb(36, 87, 197)', hsl: 'hsl(221 69% 46%)' });
    expect(colorFormats(parseColor('rgb(255 0 0 / 50%)')!).hex).toBe('#FF000080');
    expect(colorFormats(parseColor('hsl(120, 100%, 25%)')!).hex).toBe('#008000');
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('123')).toBeNull(); // digits only: not a color
  });
});

describe('findDate', () => {
  it('reads common formats and picks the next occurrence', () => {
    const show = findDate('Flamenco on Sat 18 Oct, 9 PM at Calle de Alcalá 42, Madrid.', NOW)!;
    expect(show.start).toEqual(new Date(2026, 9, 18, 21, 0));
    expect(show.label).toBe('Sat 18 Oct, 9 PM');
    expect(findDate('Flight Tue 14 Oct, 07:40', NOW)!.start).toEqual(new Date(2026, 9, 14, 7, 40));
    expect(findDate('Party on March 3rd at 7:30pm', NOW)!.start).toEqual(new Date(2027, 2, 3, 19, 30));
    const allDay = findDate('Due 2026-11-02', NOW)!;
    expect(allDay.allDay).toBe(true);
    expect(findDate('Nothing here, just 14 cats', NOW)).toBeNull();
  });

  it('makes a calendar file', () => {
    const date = findDate('Sat 18 Oct, 9 PM', NOW)!;
    const ics = makeIcs({ title: 'Flamenco show', date, location: 'Calle de Alcalá 42, Madrid' }, NOW);
    expect(ics).toContain('DTSTART:20261018T210000');
    expect(ics).toContain('DTEND:20261018T220000');
    expect(ics).toContain('LOCATION:Calle de Alcalá 42\\, Madrid');
  });
});

describe('places, parcels and flights', () => {
  it('finds addresses', () => {
    expect(findAddress('Send it to 221B Baker Street, London NW1 6XE please')).toBe('221B Baker Street, London NW1 6XE');
    expect(findAddress('Flamenco at Calle de Alcalá 42, Madrid. Tickets €35')).toBe('Calle de Alcalá 42, Madrid');
    expect(findAddress('Fado at Rua de São João da Praça 94, Porto. Tickets €35')).toBe('Rua de São João da Praça 94, Porto');
    expect(findAddress('Meet at Torstraße 1, Berlin')).toBe('Torstraße 1, Berlin');
    expect(findAddress('I have 3 cats')).toBeNull();
  });

  it('finds tracking numbers and flights', () => {
    expect(findTracking('1Z 999 AA1 01 2345 6784')).toMatchObject({ carrier: 'UPS', number: '1Z999AA10123456784' });
    expect(findTracking('9400 1000 0000 0000 0000 00')?.carrier).toBe('USPS');
    expect(findTracking('Call me at 415 555 0100')).toBeNull();
    expect(findFlight('Flight JL 44 to Tokyo')).toBe('JL 44');
    expect(findFlight('UA90')).toBe('UA 90');
    expect(findFlight('Room B2 12')).toBeNull();
  });

  it('offers the right actions', () => {
    const ups = detectActions({ kind: 'text', text: '1Z 999 AA1 01 2345 6784' }, NOW);
    expect(ups.note).toBe('Looks like a UPS tracking number');
    expect(ups.actions.map((a) => a.label)).toEqual(['Track package', 'Copy without spaces']);
    const show = detectActions({ kind: 'text', text: 'Flamenco on Sat 18 Oct, 9 PM at Calle de Alcalá 42, Madrid.' }, NOW);
    expect(show.actions.map((a) => a.label)).toEqual(['Add Sat 18 Oct, 9 PM to calendar', 'Open address in Maps']);
    expect(detectActions({ kind: 'json', text: '{"a":1,"b":[2,3]}' }, NOW).actions[0]).toMatchObject({
      text: '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}',
    });
    expect(detectActions({ kind: 'email', text: 'alex@example.com' }, NOW).actions[0]).toMatchObject({
      url: 'mailto:alex@example.com',
    });
  });
});

describe('detectKind', () => {
  it('spots one-line SQL but not sentences', () => {
    expect(detectKind('SELECT * FROM orders JOIN users ON users.id = orders.user_id;')).toBe('code');
    expect(detectKind('Select the best one from the list')).toBe('text');
  });
});
