import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// The ONNX runtime the AI model needs, bundled so nothing loads from a CDN.
const transformersDir = fs.realpathSync(path.resolve('node_modules/@huggingface/transformers'));
const ortEntry = createRequire(path.join(transformersDir, 'package.json')).resolve('onnxruntime-web');
const ortDist = path.join(ortEntry.slice(0, ortEntry.lastIndexOf(`${path.sep}dist${path.sep}`)), 'dist');
const ORT_FILES = ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'];

// See https://wxt.dev/api/config.html
// E2E=1 builds a test copy with all-sites access pre-granted, so auto-save can be tested.
const e2e = process.env.E2E === '1';

export default defineConfig({
  srcDir: 'src',
  outDir: e2e ? '.output-e2e' : '.output',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
    define: { __E2E__: JSON.stringify(e2e) },
  }),
  hooks: {
    'build:publicAssets': (_wxt, files) => {
      for (const file of ORT_FILES) files.push({ absoluteSrc: path.join(ortDist, file), relativeDest: `ort/${file}` });
    },
  },
  manifest: {
    name: 'Clipboard',
    content_security_policy: {
      // 'wasm-unsafe-eval' lets the bundled AI runtime (WebAssembly) run. No remote scripts.
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
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
    optional_host_permissions: ['<all_urls>'],
    ...(e2e ? { host_permissions: ['<all_urls>'] } : {}),
    action: { default_title: 'Open Clipboard' },
    commands: {
      'save-selection': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Save the selected text',
      },
      'screenshot-area': {
        suggested_key: { default: 'Alt+Shift+X' },
        description: 'Screenshot an area of the page',
      },
    },
  },
});
