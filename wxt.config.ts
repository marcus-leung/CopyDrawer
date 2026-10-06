import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// The ONNX runtime the AI model needs, bundled so nothing loads from a CDN.
const transformersDir = fs.realpathSync(path.resolve('node_modules/@huggingface/transformers'));
const ortEntry = createRequire(path.join(transformersDir, 'package.json')).resolve('onnxruntime-web');
const ortDist = path.join(ortEntry.slice(0, ortEntry.lastIndexOf(`${path.sep}dist${path.sep}`)), 'dist');
// The runtime build transformers.js expects (its default is this same file from a CDN).
const ORT_FILES = ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'];

/**
 * transformers.js falls back to loading the runtime from a CDN when no path is
 * set. We always set one, but point the fallback at the bundled copy too, so
 * the shipped code never references remote code.
 */
function noCdnOrt() {
  return {
    name: 'no-cdn-ort',
    transform(code: string, id: string) {
      if (!id.includes('@huggingface/transformers') || !code.includes('cdn.jsdelivr.net')) return null;
      return {
        code: code.replace(/`https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@\$\{[^}]+\}\/dist\/`/g, '"/ort/"'),
        map: null,
      };
    },
  };
}

// See https://wxt.dev/api/config.html
// E2E=1 builds a test copy with all-sites access pre-granted, so auto-save can be tested.
const e2e = process.env.E2E === '1';

export default defineConfig({
  srcDir: 'src',
  outDir: e2e ? '.output-e2e' : '.output',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss(), noCdnOrt()],
    worker: { format: 'es' as const, plugins: () => [noCdnOrt()] },
    define: { __E2E__: JSON.stringify(e2e) },
    // The ORT entry that loads its WebAssembly from wasmPaths (/ort/) instead of
    // bundling a second 27 MB copy.
    resolve: { alias: { 'onnxruntime-web/webgpu': path.join(ortDist, 'ort.webgpu.min.mjs') } },
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
      'quick-paste': {
        suggested_key: { default: 'Alt+Shift+V' },
        description: 'Open the quick-paste box',
      },
    },
  },
});
