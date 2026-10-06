import { describe, expect, it } from 'vitest';
import { applyPlain, htmlToMarkdown, listItems, titleCase } from '@/lib/transforms';

describe('listItems', () => {
  it('uses lines, then commas outside parentheses, then sentences', () => {
    expect(listItems('- eggs\n- milk\n\n* bread')).toEqual(['eggs', 'milk', 'bread']);
    expect(listItems('12 oz spaghetti, 1 lemon (zest and juice), ½ cup parmesan, and salt.')).toEqual([
      '12 oz spaghetti',
      '1 lemon (zest and juice)',
      '½ cup parmesan',
      'salt',
    ]);
    expect(listItems('Book the hotel. Buy train tickets! Pack light.')).toEqual([
      'Book the hotel.',
      'Buy train tickets!',
      'Pack light.',
    ]);
    expect(listItems('just one thing')).toEqual(['just one thing']);
  });
});

describe('applyPlain', () => {
  it('makes lists and changes case', () => {
    expect(applyPlain('checklist', 'eggs, milk, bread')).toBe('- [ ] eggs\n- [ ] milk\n- [ ] bread');
    expect(applyPlain('oneline', 'a\n  b\tc ')).toBe('a b c');
    expect(titleCase('the lord of the rings: a guide')).toBe('The Lord of the Rings: a Guide');
  });

  it('converts copied HTML to Markdown', () => {
    const md = htmlToMarkdown(
      '<h2>Lemon pasta</h2><p>Use <b>fresh</b> lemons &amp; <a href="https://x.test/a">good oil</a>.</p><ul><li>One</li><li>Two</li></ul>',
    );
    expect(md).toBe('## Lemon pasta\n\nUse **fresh** lemons & [good oil](https://x.test/a).\n\n- One\n- Two');
    expect(applyPlain('markdown', 'plain only')).toBe('plain only');
  });
});
