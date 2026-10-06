// Renders assets/brand/icon.svg to the PNG sizes Chrome and the stores need.
// Usage: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const svg = fs.readFileSync('assets/brand/icon.svg', 'utf8');
const out = 'public/icon';
fs.mkdirSync(out, { recursive: true });
const local = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(fs.existsSync(local) ? { executablePath: local } : {});
const page = await browser.newPage();
for (const size of [16, 32, 48, 96, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: path.join(out, `${size}.png`), omitBackground: true });
}
await browser.close();
console.log('icons written to', out);
