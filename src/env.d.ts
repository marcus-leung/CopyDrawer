/** True only in the test build (E2E=1), which adds test hooks. */
declare const __E2E__: boolean;

interface ImportMetaEnv {
  /** External form for the Pro waitlist (optional). */
  readonly WXT_WAITLIST_URL?: string;
}
