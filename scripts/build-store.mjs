// Builds the zip you upload to the Chrome Web Store.
//
//   node scripts/build-store.mjs                      first upload (keeps the current Calendar client)
//   node scripts/build-store.mjs --client-id <id>     after you create the OAuth client for the store ID
//
// The store assigns its own extension ID, so the manifest "key" (which pins the
// developer ID used while loading unpacked) is left out. Writes dist/still-<version>.zip.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };

// Only what the extension runs. backend/, tests/, docs/, scripts/ and site/ stay out.
const SHIP = [
  'manifest.json', 'background.js', 'content.js', 'guard.js',
  'home.html', 'popup.html', 'focus.html', 'blocked.html', 'capture.html', 'nudge.html', 'offscreen.html',
  'js', 'css', 'fonts', 'assets'
];

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
delete manifest.key;
const clientId = arg('--client-id');
if (clientId) {
  if (!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('That does not look like an OAuth client ID: ' + clientId);
  manifest.oauth2.client_id = clientId;
}

const out = join(root, 'dist');
const stage = join(out, 'still');
rmSync(out, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const p of SHIP) {
  if (!existsSync(join(root, p))) throw new Error('Missing ' + p);
  cpSync(join(root, p), join(stage, p), { recursive: true });
}
writeFileSync(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const zip = join(out, 'still-' + manifest.version + '.zip');
execFileSync('zip', ['-qr', '-X', zip, '.', '-x', '*.DS_Store', '-x', '*Thumbs.db'], { cwd: stage });
console.log('Built ' + zip);
console.log('Calendar client: ' + manifest.oauth2.client_id + (clientId ? '' : ' (unchanged; pass --client-id once the store ID has its own client)'));
