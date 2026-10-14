import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('.output/chrome-mv3/manifest.json', 'utf8'));
if (manifest.host_permissions) {
  console.error(`host_permissions in the shipped manifest: ${manifest.host_permissions}`);
  process.exit(1);
}
if (manifest.key) {
  console.error('The shipped manifest has a key: unset COPYDRAWER_EXTENSION_KEY for store builds.');
  process.exit(1);
}
if (manifest.permissions?.includes('identity') || !manifest.optional_permissions?.includes('identity')) {
  console.error('identity must be an optional permission, asked for when Drive sync is turned on.');
  process.exit(1);
}
console.log('Manifest OK: all-sites access and Google sign-in stay optional.');
if (!manifest.oauth2?.client_id) console.warn('Note: no oauth2.client_id, so Drive sync is hidden in this build.');

const licenses = fs.readFileSync('.output/chrome-mv3/THIRD_PARTY_LICENSES.txt', 'utf8').split('\n');
const { dependencies } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const missing = Object.keys(dependencies).filter((name) => !licenses.includes(name));
if (missing.length) {
  console.error(`No license shipped for ${missing.join(', ')}: add them to BUNDLED in wxt.config.ts.`);
  process.exit(1);
}
console.log('Licenses OK: every dependency ships its license.');
