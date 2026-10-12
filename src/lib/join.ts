/** What goes between clips copied or pasted together. */
export type JoinWith = 'line' | 'blank' | 'space' | 'comma';

export const JOIN_OPTIONS: { value: JoinWith; label: string }[] = [
  { value: 'line', label: 'New line' },
  { value: 'blank', label: 'Blank line' },
  { value: 'space', label: 'Space' },
  { value: 'comma', label: 'Comma' },
];

const SEPARATORS: Record<JoinWith, string> = { line: '\n', blank: '\n\n', space: ' ', comma: ', ' };

/** `singleLine` is for one-line text boxes, which drop line breaks: there clips are kept apart by a space. */
export function joinTexts(texts: string[], joinWith: JoinWith, singleLine = false): string {
  const sep = singleLine && (joinWith === 'line' || joinWith === 'blank') ? ' ' : SEPARATORS[joinWith];
  return texts.join(sep);
}
