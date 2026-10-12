import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('.output/chrome-mv3/manifest.json', 'utf8'));
if (manifest.host_permissions) {
  console.error(`host_permissions in the shipped manifest: ${manifest.host_permissions}`);
  process.exit(1);
}
console.log('Manifest OK: all-sites access stays optional.');

const licenses = fs.readFileSync('.output/chrome-mv3/THIRD_PARTY_LICENSES.txt', 'utf8').split('\n');
const { dependencies } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const missing = Object.keys(dependencies).filter((name) => !licenses.includes(name));
if (missing.length) {
  console.error(`No license shipped for ${missing.join(', ')}: add them to BUNDLED in wxt.config.ts.`);
  process.exit(1);
}
console.log('Licenses OK: every dependency ships its license.');
