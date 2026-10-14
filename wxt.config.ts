import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// See https://wxt.dev/api/config.html
// E2E=1 builds a test copy with all-sites access pre-granted, so auto-save can be tested.
const e2e = process.env.E2E === '1';
/** The Chrome Extension OAuth client for Drive sync. Without it, the build hides sync. */
const oauthClientId = process.env.COPYDRAWER_OAUTH_CLIENT_ID;
/** The store item's public key, so a local build gets the store's extension ID, which the OAuth client is tied to. Never shipped. */
const extensionKey = process.env.COPYDRAWER_EXTENSION_KEY;

/** Packages bundled into the extension; their licenses ship with it in THIRD_PARTY_LICENSES.txt. */
const BUNDLED = [
  'react',
  'react-dom',
  'scheduler',
  'dexie',
  'dexie-react-hooks',
  'lucide-react',
  'fflate',
  'wxt',
  '@wxt-dev/browser',
  '@wxt-dev/storage',
  '@fontsource/instrument-sans',
  '@fontsource/bricolage-grotesque',
  '@fontsource/jetbrains-mono',
];

const MIT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

/**
 * A package's folder, looked up the way Node would from here or from inside its parent. pnpm keeps a package's
 * own dependencies next to its real folder, so the lookup starts there, and never leaves this project.
 */
function packageDir(name: string, from = process.cwd()): string | undefined {
  const root = fs.realpathSync(process.cwd()) + path.sep;
  return createRequire(path.join(fs.realpathSync(from), 'x'))
    .resolve.paths(name)!
    .filter((p) => p.startsWith(root))
    .map((p) => path.join(p, name))
    .find((d) => fs.existsSync(path.join(d, 'package.json')));
}

function thirdPartyLicenses(): string {
  const parents = ['react-dom', 'wxt'].map((p) => packageDir(p)!);
  return BUNDLED.map((name) => {
    const dir = [process.cwd(), ...parents].map((from) => packageDir(name, from)).find(Boolean);
    if (!dir) throw new Error(`${name} isn't installed`);
    const texts = fs
      .readdirSync(dir)
      .filter((f) => /^(license|notice)/i.test(f))
      .map((f) => fs.readFileSync(path.join(dir, f), 'utf8').trim());
    if (!texts.length) {
      // WXT's packages declare MIT in package.json but ship no license file.
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.license !== 'MIT') throw new Error(`No license file for ${name}`);
      texts.push(`Copyright (c) ${pkg.author?.name ?? pkg.author}\n\n${MIT}`);
    }
    return `${name}\n${'='.repeat(name.length)}\n\n${texts.join('\n\n')}`;
  }).join('\n\n\n');
}

export default defineConfig({
  srcDir: 'src',
  outDir: e2e ? '.output-e2e' : '.output',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [
      tailwindcss(),
      // Chrome reads woff2, so fontsource's .woff fallbacks would only add dead weight to the package.
      {
        name: 'woff2-only',
        enforce: 'post',
        generateBundle(_, bundle) {
          for (const [name, file] of Object.entries(bundle)) {
            if (name.endsWith('.woff')) delete bundle[name];
            else if (file.type === 'asset' && name.endsWith('.css'))
              file.source = String(file.source).replace(/,\s*url\([^)]+\.woff\)\s*format\(['"]?woff['"]?\)/g, '');
          }
        },
      },
    ],
    define: { __E2E__: JSON.stringify(e2e) },
  }),
  hooks: {
    // WXT grants the matches of runtime-registered content scripts at install. All-sites
    // access must stay optional: it's requested only when the user turns on auto-save.
    'build:manifestGenerated': (_wxt, manifest) => {
      if (!e2e) delete manifest.host_permissions;
    },
    'build:publicAssets': (_wxt, files) => {
      files.push({ relativeDest: 'THIRD_PARTY_LICENSES.txt', contents: thirdPartyLicenses() });
    },
  },
  manifest: {
    name: 'CopyDrawer – Clipboard History',
    short_name: 'CopyDrawer',
    description: 'Everything you copy, kept and sorted. Private: stored on your device.',
    permissions: [
      'storage',
      'unlimitedStorage',
      'sidePanel',
      'contextMenus',
      'activeTab',
      'scripting',
      'clipboardRead',
      'clipboardWrite',
      'alarms',
    ],
    // sidePanel.open and runtime.getContexts need Chrome 116.
    minimum_chrome_version: '116',
    // Asked for when Drive sync is turned on.
    optional_permissions: ['identity'],
    ...(oauthClientId && {
      oauth2: { client_id: oauthClientId, scopes: ['https://www.googleapis.com/auth/drive.appdata'] },
    }),
    ...(extensionKey && { key: extensionKey }),
    optional_host_permissions: ['<all_urls>'],
    ...(e2e ? { host_permissions: ['<all_urls>'] } : {}),
    action: { default_title: 'Open CopyDrawer' },
    commands: {
      'save-selection': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Save the selected text',
      },
      'screenshot-area': {
        suggested_key: { default: 'Alt+Shift+X' },
        description: 'Screenshot an area of the page',
      },
      'quick-paste': {
        suggested_key: { default: 'Alt+Shift+V' },
        description: 'Open the quick-paste box',
      },
    },
  },
});
