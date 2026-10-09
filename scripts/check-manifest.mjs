import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('.output/chrome-mv3/manifest.json', 'utf8'));
if (manifest.host_permissions) {
  console.error(`host_permissions in the shipped manifest: ${manifest.host_permissions}`);
  process.exit(1);
}
console.log('Manifest OK: all-sites access stays optional.');
