/**
 * "Paste as": ways to paste a clip. They run anywhere (side panel, service
 * worker, quick-paste box).
 */
export type Transform = 'asis' | 'plain';

export const TRANSFORMS: { id: Transform; label: string }[] = [
  { id: 'asis', label: 'Paste as is' },
  { id: 'plain', label: 'Plain text' },
];
