import { useEffect, useState } from 'react';

/** Creates an object URL for a Blob and revokes it when the Blob changes or the component unmounts. */
export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [entry, setEntry] = useState<{ blob: Blob; url: string }>();
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    // The URL has to be made and revoked with the effect (StrictMode runs effects twice).
    // oxlint-disable-next-line react/set-state-in-effect
    setEntry({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return entry && entry.blob === blob ? entry.url : undefined;
}
