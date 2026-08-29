import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const builds = [
  ['mobile', path.resolve(here, '../index.html')],
  ['desktop', path.resolve(here, 'fixtures/friday_app_2026-07-12.html')],
];

function extractDefaultHabits(source) {
  const start = source.indexOf('const DEFAULT_HABITS = [');
  assert.notEqual(start, -1, 'DEFAULT_HABITS is missing');
  const end = source.indexOf('\n];', start);
  assert.notEqual(end, -1, 'DEFAULT_HABITS does not terminate');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end + 3)}\nglobalThis.result = DEFAULT_HABITS;`, context);
  return JSON.parse(JSON.stringify(context.result));
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} does not terminate`);
}

function loadOverrideFunctions(source) {
  const rhythmPrelude = source.match(/const RHYTHM_TYPES\s*=\s*[^;]+;[\s\S]*?const RHYTHM_LABELS\s*=\s*\{[\s\S]*?\};/);
  assert.ok(rhythmPrelude, 'rhythm constants are missing');
  const names = ['normalizeMeasurementConfig', 'normalizeHabitDays', 'normalizeCustomHabitOverrides', 'normalizeRhythmConfig', 'reconcileHabitOrder', 'normalizeImportedHabitOrder', 'getAqiCategory', 'getRhythmAnchorText'];
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${rhythmPrelude[0]}\n${names.map(name => extractFunction(source, name)).join('\n')}\n` +
    `globalThis.exports = { ${names.join(', ')} };`,
    context,
  );
  return context.exports;
}

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const habits = extractDefaultHabits(html);
  const byId = Object.fromEntries(habits.map(habit => [habit.id, habit]));
  const { normalizeCustomHabitOverrides, normalizeRhythmConfig, reconcileHabitOrder, normalizeImportedHabitOrder, getRhythmAnchorText } = loadOverrideFunctions(html);

  assert.equal(habits.length, 22, `${label}: the reviewed library includes daylight and supplements additions`);
  assert.equal(new Set(habits.map(habit => habit.id)).size, habits.length, `${label}: default habit IDs stay unique`);

  const publicCopy = habits.map(habit => `${habit.text} ${habit.note}`).join(' ');
  assert.doesNotMatch(publicCopy, /Florida|WPB|West Palm|coloring book|markets, bio/i, `${label}: default habit copy is location and project agnostic`);
  assert.equal(byId.beach.text, 'Outdoor walk or movement', `${label}: the beach-specific habit becomes universally usable`);
  assert.equal(byId.medication.note, 'Follow your prescribed timing and instructions', `${label}: medication copy never assumes it should be taken with food`);
  assert.equal(byId.supplements.cat, 'fuel', `${label}: supplements live in Fuel`);
  assert.equal(byId.supplements.text, 'Take supplements', `${label}: supplements are distinct from prescribed medication`);
  assert.equal(byId.supplements.note, 'Follow your personal supplement routine', `${label}: supplements avoid dosage or medical-timing advice`);
  assert.equal(byId.supplements.activeFrom, '2026-08-28', `${label}: supplements do not rewrite pre-release history`);
  assert.doesNotMatch(`${byId.supplements.text} ${byId.supplements.note}`, /medication|prescrib/i, `${label}: supplement copy stays distinct from medicine`);
  assert.ok(habits.every(habit => habit.text.length <= 48), `${label}: default titles fit the concise Manage limit`);
  assert.ok(habits.every(habit => habit.note.length <= 80), `${label}: default descriptions fit the concise Manage limit`);
  assert.equal(byId.sleep.note, 'Protect at least 7 hours for sleep', `${label}: sleep copy uses a general adult minimum rather than local sunrise`);
  assert.equal(byId.gratitude.note, 'Notice what went well today', `${label}: gratitude copy avoids an unsupported neurological claim`);

  assert.deepEqual(byId.hydrate.rhythm, {
    type: 'temp-above',
    threshold: 85,
    note: 'Drink extra water',
  }, `${label}: hydration adapts to local feels-like heat`);
  assert.deepEqual(byId.beach.rhythm, {
    type: 'aqi-below',
    threshold: 100,
  }, `${label}: outdoor movement adapts to local US AQI`);
  assert.deepEqual(byId.sunscreen.rhythm, {
    type: 'uv-above',
    threshold: 3,
    note: 'Use sun protection',
  }, `${label}: sun protection adapts to local UV`);
  assert.deepEqual(byId.daylight.rhythm, { type: 'sunrise' }, `${label}: the one new habit follows local sunrise`);
  assert.equal(byId.daylight.text, 'Get outdoor light after waking', `${label}: morning light is the one useful anchored addition`);
  assert.equal(byId.daylight.activeFrom, '2026-08-28', `${label}: the new default does not rewrite pre-release history`);

  const anchoredIds = habits.filter(habit => habit.rhythm).map(habit => habit.id).sort();
  assert.deepEqual(anchoredIds, ['beach', 'daylight', 'hydrate', 'sunscreen'], `${label}: anchors stay limited to habits with a natural environmental cue`);

  const optOut = JSON.parse(JSON.stringify(normalizeCustomHabitOverrides({ hydrate:{ rhythm:null } }, habits, true)));
  assert.deepEqual(optOut, { hydrate:{ rhythm:null } }, `${label}: explicit No anchor survives strict normalization`);
  assert.equal(normalizeRhythmConfig({ ...byId.hydrate, ...optOut.hydrate }.rhythm), null, `${label}: explicit No anchor overrides the shipped heat cue`);
  assert.match(html, /const defaultRhythm = normalizeRhythmConfig\(def\.rhythm\);[\s\S]*rhythmType === 'none' && defaultRhythm[\s\S]*changes\.rhythm = null/, `${label}: Manage persists No anchor when the default has an anchor`);

  const prior21Order = habits.filter(habit => habit.id !== 'supplements').map(habit => habit.id).reverse();
  const legacy20Order = habits.filter(habit => habit.id !== 'daylight' && habit.id !== 'supplements').map(habit => habit.id).reverse();
  assert.deepEqual(
    JSON.parse(JSON.stringify(reconcileHabitOrder(prior21Order, habits))),
    [...prior21Order, 'supplements'],
    `${label}: supplements append without resetting the current custom order`,
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(reconcileHabitOrder(legacy20Order, habits))),
    [...legacy20Order, 'daylight', 'supplements'],
    `${label}: both additions append to an older custom order in release order`,
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(reconcileHabitOrder(['wake', 'wake', 'retired-id'], habits))),
    ['wake', ...habits.map(habit => habit.id).filter(id => id !== 'wake')],
    `${label}: order migration removes duplicates and retired IDs before appending missing defaults`,
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(normalizeImportedHabitOrder(prior21Order, habits))),
    [...prior21Order, 'supplements'],
    `${label}: a 21-habit backup imports with supplements appended`,
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(normalizeImportedHabitOrder(legacy20Order, habits))),
    [...legacy20Order, 'daylight', 'supplements'],
    `${label}: a 20-habit backup imports with both released IDs appended`,
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(normalizeImportedHabitOrder(habits.map(habit => habit.id), habits))),
    habits.map(habit => habit.id),
    `${label}: a complete current backup order imports unchanged`,
  );
  assert.throws(() => normalizeImportedHabitOrder(['wake'], habits), /not compatible/i, `${label}: backup order rejects an arbitrary one-ID subset`);
  assert.throws(() => normalizeImportedHabitOrder(prior21Order.filter(id => id !== 'medication'), habits), /not compatible/i, `${label}: backup order rejects a 20-ID set missing supplements plus a legacy habit`);
  assert.throws(() => normalizeImportedHabitOrder(legacy20Order.slice(1), habits), /not compatible/i, `${label}: backup order rejects a 19-ID subset missing a legacy habit`);
  assert.throws(() => normalizeImportedHabitOrder(['wake', 'wake'], habits), /not compatible/i, `${label}: backup order rejects duplicate IDs`);
  assert.throws(() => normalizeImportedHabitOrder(['wake', 'future-id'], habits), /not compatible/i, `${label}: backup order rejects unknown IDs`);
  if (label === 'mobile') {
    assert.match(html, /const importedOrder = normalizeImportedHabitOrder\(payload\.order, DEFAULT_HABITS\)/, `${label}: backup import uses strict compatible-order migration`);
    assert.match(html, /localStorage\.setItem\(ORDER_KEY, JSON\.stringify\(importedOrder\)\)/, `${label}: backup import stores the reconciled order`);
  }

  assert.equal(
    getRhythmAnchorText(byId.sunscreen.rhythm, { uv:3 }),
    '☀️ UV 3 · Use sun protection',
    `${label}: the CDC UV 3 cutoff is inclusive`,
  );
  assert.equal(
    getRhythmAnchorText(byId.beach.rhythm, { aqi:100 }),
    '🍃 AQI 100 · Moderate air quality',
    `${label}: the satisfactory AQI 100 cutoff is inclusive`,
  );
  assert.equal(
    getRhythmAnchorText(byId.beach.rhythm, { aqi:101 }),
    'AQI 101 · Unhealthy for sensitive groups',
    `${label}: AQI above the default cutoff names the relevant category without implying favorable conditions`,
  );
  assert.equal(
    getRhythmAnchorText(byId.hydrate.rhythm, { feel:82 }),
    'Feels like 82°F · Below heat cue',
    `${label}: a cool-day hydration anchor reports context without implying the habit must wait`,
  );
  assert.equal(getRhythmAnchorText(byId.hydrate.rhythm, null), 'Heat cue above 85°F', `${label}: denied location keeps the hydration threshold visible`);
  assert.equal(getRhythmAnchorText(byId.beach.rhythm, null), 'US AQI cue at or below 100', `${label}: denied location keeps the AQI threshold visible`);
  assert.equal(getRhythmAnchorText(byId.sunscreen.rhythm, null), 'UV cue at 3 or higher', `${label}: denied location keeps the UV threshold visible`);
  assert.match(html, /const rhythm = normalizeRhythmConfig\(h\.rhythm\);[\s\S]*rhythm-anchor-label[\s\S]*getRhythmAnchorText\(rhythm, rhythmWeatherData\)/, `${label}: initial card render uses the same complete fallback helper as live updates`);
  assert.doesNotMatch(html, /rhythm-anchor-label[^`]*RHYTHM_LABELS\[normalizeRhythmConfig\(h\.rhythm\)\.type\]/, `${label}: initial card render does not bypass threshold-aware fallback copy`);
  assert.match(html, /'uv-above': 'When UV index reaches'/, `${label}: Manage describes the inclusive UV comparison accurately`);
  assert.match(html, /'aqi-below': 'When US AQI is at most'/, `${label}: Manage describes the inclusive AQI comparison accurately`);

  assert.match(html, /id=["']insightsHeading["'][^>]*>🌊 Your next wave</, `${label}: Next Wave heading stays habit-focused before and after location permission`);
  assert.doesNotMatch(html, /insightSunrise|insightHeat|Your \$\{loc\.city\} rhythm/, `${label}: the retired weather dashboard does not return`);
  assert.doesNotMatch(html, /const DEFAULT_LOC|const MONTHLY_CLIMATE|const FLORIDA_FACTS/, `${label}: denied location never falls back to invented West Palm Beach conditions`);
}

console.log('default habit and location regression tests passed for mobile and desktop');
