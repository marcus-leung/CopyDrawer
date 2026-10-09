import { createContext, useContext } from 'react';
import { PanelRight } from 'lucide-react';
import { IconButton } from './ui';

/** Set only in the toolbar popup: moves the current screen into the side panel. */
export const ExpandContext = createContext<(() => void) | null>(null);

export function ExpandButton({ className = '', iconSize = 18 }: { className?: string; iconSize?: number }) {
  const expand = useContext(ExpandContext);
  if (!expand) return null;
  return (
    <IconButton label="Open in side panel" className={className} onClick={expand}>
      <PanelRight size={iconSize} aria-hidden />
    </IconButton>
  );
}
