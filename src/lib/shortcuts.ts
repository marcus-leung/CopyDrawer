export type CommandName = 'save-selection' | 'screenshot-area' | 'quick-paste';
export type Shortcuts = Record<CommandName, string>;

export const NOT_SET = 'Not set';
export const NO_SHORTCUTS: Shortcuts = { 'save-selection': NOT_SET, 'screenshot-area': NOT_SET, 'quick-paste': NOT_SET };

/** The keys Chrome bound to each command, as Chrome writes them on this platform (⌥⇧S on a Mac, Alt+Shift+S elsewhere). */
export async function getShortcuts(): Promise<Shortcuts> {
  const out = { ...NO_SHORTCUTS };
  for (const c of await browser.commands.getAll()) {
    if (c.name && c.name in out && c.shortcut) out[c.name as CommandName] = c.shortcut;
  }
  return out;
}

const MAC_KEYS: [string, string][] = [
  ['MacCtrl', '⌃'],
  ['Alt', '⌥'],
  ['Shift', '⇧'],
  ['Command', '⌘'],
  ['Ctrl', '⌘'],
];

/** A manifest key spec ("Alt+Shift+S") written as Chrome shows it: "⌥⇧S" on a Mac, unchanged elsewhere. */
export function formatShortcut(spec: string, mac: boolean): string {
  if (!mac) return spec;
  const parts = spec.split('+');
  const key = parts.pop()!;
  return (
    MAC_KEYS.filter(([name]) => parts.includes(name))
      .map(([, sign]) => sign)
      .join('') + key
  );
}

/** The keys the manifest suggests for a command on this platform, which Chrome binds unless they're taken. */
export function suggestedShortcut(name: CommandName, platform = navigator.platform): string {
  const mac = /^Mac/.test(platform);
  const suggested = browser.runtime.getManifest().commands?.[name]?.suggested_key;
  const spec = typeof suggested === 'string' ? suggested : (mac && suggested?.mac) || suggested?.default;
  return spec ? formatShortcut(spec, mac) : '';
}
