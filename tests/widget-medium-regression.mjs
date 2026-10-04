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
for (const field of ['state', 'eyebrow', 'habitId', 'icon', 'title', 'targetLabel', 'detail', 'action']) {
  assert.match(widgetSource, new RegExp(`let ${field}: String`),
    `Next Wave must decode the allowlisted ${field} field`);
}
assert.match(widgetSource, /let freshUntil:\s*Date/);
assert.match(widgetSource, /let nextWave:\s*SnapshotNextWave/,
  'the widget snapshot must require its schema-v1 Next Wave object');
assert.match(widgetSource, /snapshot\.nextWave\.freshUntil\s*>=\s*snapshot\.nextRefreshAt/,
  'the app-provided refresh boundary may precede the hard recommendation freshness deadline');
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
  'the final supported family set must expose small and medium only');
assert.doesNotMatch(widgetSource, /\.systemLarge/,
  'the intentionally excluded systemLarge family must not be exposed');

assert.doesNotMatch(widgetSource, /Text\("YOUR NEXT WAVE"\)|widgetSectionHeader\("YOUR NEXT WAVE"/,
  'the external Wavelength label makes an internal medium-widget header redundant');
assert.match(widgetSource, /Text\(nextWave\.eyebrow/);
assert.match(widgetSource, /Text\(nextWave\.icon/,
  'the medium card must use the JavaScript-authored habit emoji');
assert.match(widgetSource, /Text\(nextWave\.title\)/);
assert.match(widgetSource, /Text\(nextWave\.targetLabel\)/);
assert.match(widgetSource, /Text\(nextWave\.detail\)/);
assert.match(widgetSource, /Text\(nextWave\.action\)/,
  'the medium card must finish with the JavaScript-authored action label');

const nextWaveView = widgetSource.slice(
  widgetSource.indexOf('private func nextWaveView'),
  widgetSource.indexOf('private var nextWaveUnavailableView'),
);
assert.match(nextWaveView,
  /VStack\(alignment:\s*\.leading,\s*spacing:\s*0\)[\s\S]*?Spacer\(minLength:\s*4\)[\s\S]*?HStack\(alignment:\s*\.top,[\s\S]*?Text\(nextWave\.icon\)[\s\S]*?VStack\(alignment:\s*\.leading,\s*spacing:\s*0\)[\s\S]*?Text\(nextWave\.eyebrow\)[\s\S]*?Text\(nextWave\.title\)[\s\S]*?Text\(nextWave\.detail\)[\s\S]*?Text\(nextWave\.action\)[\s\S]*?Spacer\(minLength:\s*4\)/,
  'equal bounded spacers must vertically center the emoji and content stack across the medium card');
assert.match(nextWaveView,
  /Text\(nextWave\.icon\)[\s\S]*?\.font\(\.system\(size:\s*20\)\)[\s\S]*?\.frame\(width:\s*44,\s*height:\s*44\)[\s\S]*?\.background\([\s\S]*?RoundedRectangle\(cornerRadius:\s*13,\s*style:\s*\.continuous\)/,
  'the emoji must mirror the in-app 44-point rounded-square accent tile');
assert.match(nextWaveView, /Text\(nextWave\.eyebrow\)[\s\S]*?\.textCase\(\.uppercase\)/,
  'the eyebrow must retain the in-app card’s uppercase treatment');
assert.doesNotMatch(nextWaveView, /nextWave\.state\s*==|switch\s+nextWave\.state/,
  'Quiet Moment must use the same medium-card layout as every app-authored Next Wave state');
assert.match(nextWaveView,
  /HStack\(alignment:\s*\.firstTextBaseline,\s*spacing:\s*7\)[\s\S]*?Text\(nextWave\.title\)[\s\S]*?Text\("·"\)[\s\S]*?Text\(nextWave\.targetLabel\)[\s\S]*?\.font\(\.system\(size:\s*13,\s*weight:\s*\.semibold\)\)/,
  'the title row must mirror the in-app card with a middle dot and a larger semibold target');
assert.match(nextWaveView, /Text\(nextWave\.eyebrow\)[\s\S]*?\.padding\(\.bottom,\s*5\)/,
  'the eyebrow must have the same breathing room as the in-app card');
assert.match(nextWaveView, /HStack\(alignment:\s*\.firstTextBaseline,[\s\S]*?\.padding\(\.bottom,\s*5\)/,
  'the title row must have the same breathing room as the in-app card');
assert.match(nextWaveView,
  /Text\(nextWave\.action\)[\s\S]*?\.padding\(\.horizontal,\s*14\)[\s\S]*?\.frame\(minHeight:\s*40\)[\s\S]*?\.background\([\s\S]*?Capsule\(\)[\s\S]*?\.padding\(\.top,\s*12\)/,
  'View habit must finish the stack at the in-app card’s height and spacing');
assert.match(widgetSource, /nextWaveView\(nextWave\)[\s\S]*?\.privacySensitive\(\)/,
  'recommendation content must be privacy-sensitive');
assert.match(widgetSource, /Open the app for an updated suggestion\./,
  'a stale or unavailable recommendation must render an honest recovery message');
const unavailableView = widgetSource.slice(
  widgetSource.indexOf('private var nextWaveUnavailableView'),
  widgetSource.indexOf('private func progressView'),
);
assert.match(unavailableView,
  /VStack\(alignment:\s*\.leading,\s*spacing:\s*0\)[\s\S]*?Spacer\(minLength:\s*4\)[\s\S]*?HStack\(alignment:\s*\.top,\s*spacing:\s*14\)[\s\S]*?Image\(systemName:\s*"arrow\.up\.forward\.app"\)[\s\S]*?\.frame\(width:\s*44,\s*height:\s*44\)[\s\S]*?RoundedRectangle\(cornerRadius:\s*13,\s*style:\s*\.continuous\)[\s\S]*?VStack\(alignment:\s*\.leading,\s*spacing:\s*0\)[\s\S]*?Text\("Open Wavelength"\)[\s\S]*?\.font\(\.headline\)[\s\S]*?Text\("Open the app for an updated suggestion\."\)[\s\S]*?\.font\(\.caption\)[\s\S]*?Spacer\(minLength:\s*4\)/,
  'recovery must use the approved accurate copy while mirroring the Next Wave tile-and-content composition');
assert.doesNotMatch(unavailableView, /\.font\(\.title2\)/,
  'the recovery icon must live inside the shared 44-point tile rather than act as a standalone title icon');
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
