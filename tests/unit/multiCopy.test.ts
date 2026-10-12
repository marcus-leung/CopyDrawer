// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { Clip } from '@/lib/db';
import { joinTexts } from '@/lib/join';
import { buildCombined, encodedImageBytes, fragmentOf } from '@/lib/multiCopy';

const clip = (id: string, text: string, extra: Partial<Clip> = {}): Clip =>
  ({ id, text, title: text || id, kind: 'text', createdAt: 0, lastUsedAt: 0, useCount: 0, pinned: 0, ...extra }) as Clip;
const image = (id: string) => clip(id, '', { kind: 'image', title: 'photo.png' });

describe('joinTexts', () => {
  it('joins with each separator', () => {
    expect(joinTexts(['a', 'b'], 'line')).toBe('a\nb');
    expect(joinTexts(['a', 'b'], 'blank')).toBe('a\n\nb');
    expect(joinTexts(['a', 'b'], 'space')).toBe('a b');
    expect(joinTexts(['a', 'b'], 'comma')).toBe('a, b');
  });

  it('keeps clips apart with a space in one-line boxes, which drop line breaks', () => {
    expect(joinTexts(['a', 'b'], 'line', true)).toBe('a b');
    expect(joinTexts(['a', 'b'], 'blank', true)).toBe('a b');
    expect(joinTexts(['a', 'b'], 'comma', true)).toBe('a, b');
  });
});

describe('buildCombined', () => {
  it('plain clips need no formatting', () => {
    expect(buildCombined([clip('1', 'eggs'), clip('2', 'milk')], 'line', new Map())).toEqual({
      text: 'eggs\nmilk',
      skippedImages: 0,
    });
  });

  it('keeps formatting and escapes plain text, in the order given', () => {
    const out = buildCombined([clip('1', 'a < b'), clip('2', 'bold', { html: '<b>bold</b>' })], 'line', new Map());
    expect(out.text).toBe('a < b\nbold');
    expect(out.html).toBe('<div>a &lt; b</div><div><b>bold</b></div>');
  });

  it('puts images in the rich version only, and says how many the plain text leaves out', () => {
    const out = buildCombined([clip('1', 'caption'), image('2')], 'blank', new Map([['2', 'data:image/png;base64,AA']]));
    expect(out.text).toBe('caption');
    expect(out.html).toBe('<div>caption</div><div><br></div><div><img src="data:image/png;base64,AA" alt="photo.png"></div>');
    expect(out.skippedImages).toBe(1);
  });

  it('space and comma keep everything on one line, formatting included', () => {
    const out = buildCombined([clip('1', 'red', { html: '<i>red</i>' }), clip('2', 'blue\nsky')], 'comma', new Map());
    expect(out.text).toBe('red, blue\nsky');
    expect(out.html).toBe('<span><i>red</i></span>, <span>blue<br>sky</span>');
  });

  it('images only: no plain text', () => {
    const out = buildCombined(
      [image('1'), image('2')],
      'line',
      new Map([
        ['1', 'data:a'],
        ['2', 'data:b'],
      ]),
    );
    expect(out.text).toBe('');
    expect(out.html).toContain('<img src="data:a"');
    expect(out.html!.indexOf('data:a')).toBeLessThan(out.html!.indexOf('data:b'));
  });
});

describe('fragmentOf', () => {
  it('keeps only the content of a saved clipboard document, so joined clips form one document', () => {
    expect(fragmentOf('<meta charset="utf-8"><h2 style="color: red">Pinned <b>heading</b></h2>')).toBe(
      '<h2 style="color: red">Pinned <b>heading</b></h2>',
    );
    expect(
      fragmentOf(
        '<html><head><style>p{}</style></head><body>\n<!--StartFragment--><p>Word text</p><!--EndFragment-->\n</body></html>',
      ),
    ).toBe('<p>Word text</p>');
  });

  it("drops Google Docs' internal id, which makes Docs paste its own copy of one clip", () => {
    expect(
      fragmentOf(
        '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b3c4d-7fff-0e1f"><p dir="ltr">From Docs</p></b>',
      ),
    ).toBe('<b style="font-weight:normal;"><p dir="ltr">From Docs</p></b>');
  });

  it('joined clips carry no repeated document headers', () => {
    const out = buildCombined(
      [
        clip('1', 'Pinned heading', { html: '<meta charset="utf-8"><h2>Pinned heading</h2>' }),
        clip('2', 'Second row text', { html: '<meta charset="utf-8"><span>Second row text</span>' }),
        image('3'),
      ],
      'line',
      new Map([['3', 'data:image/png;base64,AA']]),
    );
    expect(out.html).toBe(
      '<div><h2>Pinned heading</h2></div><div><span>Second row text</span></div><div><img src="data:image/png;base64,AA" alt="photo.png"></div>',
    );
  });
});

describe('fragmentOf edge cases', () => {
  it('drops styles, stray titles and unquoted Docs ids, and keeps comment-like text in attributes', () => {
    expect(fragmentOf('<title>Page</title><style>p{color:red}</style><p>Kept</p>')).toBe('<p>Kept</p>');
    expect(fragmentOf('<b id=docs-internal-guid-abc>Docs</b>')).toBe('<b>Docs</b>');
    expect(fragmentOf('<a title="a <!-- b -->" href="#">x</a><!-- note -->')).toBe('<a title="a <!-- b -->" href="#">x</a>');
  });
});

describe('encodedImageBytes', () => {
  it('counts images as the base64 they travel as', () => {
    const img = (bytes: number) =>
      clip('i' + bytes, '', {
        kind: 'image',
        image: { imageId: 'x', bytes, mime: 'image/png', width: 1, height: 1, thumb: new Blob() },
      });
    expect(encodedImageBytes([img(3), img(4), clip('t', 'text')])).toBe(4 + 8);
    expect(encodedImageBytes([img(16 * 1024 * 1024)])).toBeGreaterThan(20 * 1024 * 1024);
  });
});
