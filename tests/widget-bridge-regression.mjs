import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = fs.readFileSync(path.join(root, 'native/native-bridge.js'), 'utf8');

assert.match(source, /import\s*\{\s*Capacitor\s*,\s*registerPlugin\s*\}\s*from\s*['"]@capacitor\/core['"]/,
  'native bridge imports Capacitor runtime detection and local plugin registration');
assert.match(source, /const WidgetSnapshot = registerPlugin\('WidgetSnapshot'\)/,
  'native bridge registers WidgetSnapshot using the Swift jsName');
assert.match(source, /widgets:\s*isNative\s*\?\s*\{[\s\S]*publish:\s*options\s*=>\s*WidgetSnapshot\.publish\(options\)[\s\S]*\}\s*:\s*null/,
  'native runtime exposes a widget snapshot publisher while browser/PWA stays null');

console.log('widget native bridge regression checks passed');
