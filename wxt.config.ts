import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

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
    // WXT grants the matches of runtime-registered content scripts at install. All-sites
    // access must stay optional: it's requested only when the user turns on auto-save.
    'build:manifestGenerated': (_wxt, manifest) => {
      if (!e2e) delete manifest.host_permissions;
    },
  },
  manifest: {
    name: 'CopyDrawer',
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
