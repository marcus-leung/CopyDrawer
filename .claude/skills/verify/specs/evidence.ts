import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const EVIDENCE_ROOT = path.resolve('verify-evidence');

/** Saves a screenshot and an ARIA snapshot to verify-evidence/<feature>/<step>.{png,aria.yml}. */
export async function capture(page: Page, feature: string, step: string) {
  const dir = path.join(EVIDENCE_ROOT, feature);
  fs.mkdirSync(dir, { recursive: true });
  await page.bringToFront();
  await page.screenshot({ path: path.join(dir, `${step}.png`), fullPage: true });
  fs.writeFileSync(path.join(dir, `${step}.aria.yml`), await page.locator('body').ariaSnapshot());
}
