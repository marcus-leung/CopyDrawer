import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Clipboard',
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
    action: { default_title: 'Open Clipboard' },
    commands: {
      'save-selection': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Save the selected text',
      },
    },
  },
});
