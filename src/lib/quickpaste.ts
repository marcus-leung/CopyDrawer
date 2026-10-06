/** A clip as the quick-paste box sees it (sent from the background). */
export interface QuickClip {
  id: string;
  title: string;
  text: string;
  kind: string;
  host?: string;
  collection?: string;
  color?: string;
}
