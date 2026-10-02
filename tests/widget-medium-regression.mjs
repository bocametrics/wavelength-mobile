import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const widgetSource = read('ios/App/WavelengthWidget/WavelengthWidget.swift');
const readme = read('README.md');
const architecture = read('references/widgetkit-architecture.md');

assert.match(widgetSource, /private struct SnapshotNextWave:\s*Decodable,\s*Equatable/,
  'the schema-v1 Next Wave presentation model must be decoded explicitly');
for (const field of ['state', 'eyebrow', 'habitId', 'title', 'targetLabel', 'detail']) {
  assert.match(widgetSource, new RegExp(`let ${field}: String`),
    `Next Wave must decode the allowlisted ${field} field`);
}
assert.match(widgetSource, /let freshUntil:\s*Date/);
assert.match(widgetSource, /let nextWave:\s*SnapshotNextWave/,
  'the widget snapshot must require its schema-v1 Next Wave object');
assert.match(widgetSource, /snapshot\.nextWave\.freshUntil\s*<=\s*snapshot\.nextRefreshAt/,
  'recommendation freshness must not outlive the app-provided refresh boundary');
assert.match(widgetSource, /snapshot\.nextWave\.freshUntil\s*<=\s*snapshot\.expiresAt/,
  'recommendation freshness must not outlive the local-day snapshot');
assert.match(widgetSource, /snapshot\.nextWave\.freshUntil\s*>\s*now/,
  'stale recommendations must fail closed without invalidating current small-widget progress');

assert.match(widgetSource, /let nextWave:\s*SnapshotNextWave\?/,
  'timeline entries must distinguish a current recommendation from a stale or unavailable one');
assert.match(widgetSource, /date:\s*snapshot\.nextWave\.freshUntil[\s\S]*?progress:\s*snapshot\.progress[\s\S]*?nextWave:\s*nil/,
  'recommendation expiry must preserve valid same-day progress while failing the medium surface closed');
assert.match(widgetSource, /snapshot\.nextRefreshAt,\s*snapshot\.nextWave\.freshUntil,\s*snapshot\.expiresAt/,
  'timeline reload scheduling must consider app refresh, recommendation freshness, and local midnight');

assert.match(widgetSource, /@Environment\(\\\.widgetFamily\)/);
assert.match(widgetSource, /case \.systemMedium:/);
assert.match(widgetSource, /supportedFamilies\(\[\.systemSmall,\s*\.systemMedium\]\)/,
  'Phase 3 must expose small and medium without exposing large');
assert.doesNotMatch(widgetSource, /\.systemLarge/,
  'systemLarge remains out of Phase 3 scope');

assert.match(widgetSource, /Text\("YOUR NEXT WAVE"\)/);
assert.match(widgetSource, /Text\(nextWave\.eyebrow/);
assert.match(widgetSource, /Text\(nextWave\.title\)/);
assert.match(widgetSource, /Text\(nextWave\.targetLabel\)/);
assert.match(widgetSource, /Text\(nextWave\.detail\)/);
assert.match(widgetSource, /nextWaveView\(nextWave\)[\s\S]*?\.privacySensitive\(\)/,
  'recommendation content must be privacy-sensitive');
assert.match(widgetSource, /current suggestion/,
  'a stale or unavailable recommendation must render an honest recovery message');
assert.match(widgetSource, /case \.fullColor:/);
assert.match(widgetSource, /case \.accented:/);
assert.match(widgetSource, /case \.vibrant:/);
assert.match(widgetSource, /\.widgetAccentable\(\)/);
assert.match(widgetSource, /\.containerBackground\(for:\s*\.widget\)/);
assert.doesNotMatch(widgetSource, /\bButton\s*\(|\bToggle\s*\(|AppIntent/,
  'Phase 3 remains read-only');

assert.match(readme, /`systemMedium`[^\n]*Next Wave/i,
  'README must identify the implemented medium Next Wave surface');
assert.match(architecture, /Implemented `systemMedium` widget/,
  'architecture reference must document the implemented medium surface');
assert.match(architecture, /freshUntil/,
  'architecture reference must document recommendation-specific freshness');

console.log('systemMedium WidgetKit regression checks passed');
