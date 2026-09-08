import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(root, 'www');

await fs.rm(webDir, { recursive:true, force:true });
await fs.mkdir(webDir, { recursive:true });

const sourceIndex = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const bridgeTag = '<script src="./native-bridge.js"></script>';
const closingHead = '</head>';
if (!sourceIndex.includes(closingHead) || sourceIndex.includes(bridgeTag)) {
  throw new Error('Native bridge injection point is missing or already present.');
}
const nativeIndex = sourceIndex.replace(closingHead, `  ${bridgeTag}\n${closingHead}`);
await fs.writeFile(path.join(webDir, 'index.html'), nativeIndex);

for (const file of ['manifest.webmanifest', 'sw.js']) {
  await fs.copyFile(path.join(root, file), path.join(webDir, file));
}
await fs.cp(path.join(root, 'icons'), path.join(webDir, 'icons'), { recursive:true });

await build({
  entryPoints:[path.join(root, 'native', 'native-bridge.js')],
  outfile:path.join(webDir, 'native-bridge.js'),
  bundle:true,
  format:'iife',
  platform:'browser',
  target:['safari15'],
  minify:true,
  legalComments:'none',
});

console.log('Capacitor web assets built in www/.');
