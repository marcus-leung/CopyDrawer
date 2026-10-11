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
