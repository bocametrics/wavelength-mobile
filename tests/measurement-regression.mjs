import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const builds = [
  ['mobile', path.resolve(here, '../index.html')],
  ['desktop', path.resolve(here, 'fixtures/friday_app_2026-07-12.html')],
];

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const signatureEnd = source.indexOf(') {', start);
  assert.notEqual(signatureEnd, -1, `${name} signature does not terminate`);
  const brace = signatureEnd + 2;
  let depth = 0;
  let quote = null;
  let escaped = false;
  let templateExpressionDepth = 0;
  for (let i = brace; i < source.length; i++) {
    const char = source[i];
    if (escaped) { escaped = false; continue; }
    if (quote && char === '\\') { escaped = true; continue; }
    if (quote) {
      if (char === quote && (quote !== '`' || templateExpressionDepth === 0)) quote = null;
      else if (quote === '`' && char === '$' && source[i + 1] === '{') { templateExpressionDepth++; i++; }
      else if (quote === '`' && char === '}' && templateExpressionDepth > 0) templateExpressionDepth--;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function loadFunctions(html) {
  const names = [
    'normalizeMeasurementConfig',
    'isConciseRhythmNote',
    'normalizeRhythmConfig',
    'normalizeEnvironmentalReading',
    'normalizeHabitDays',
    'normalizeCustomHabitOverrides',
    'getHabitProgress',
    'adjustHabitProgress',
    'isHabitProgressComplete',
    'dateKey',
    'isHabitScheduledOn',
    'getScheduledHabits',
    'getDailyHabitStats',
    'isValidDateKey',
    'normalizeProgressByDate',
    'normalizeStoredState',
    'updateMeasuredHabitState',
    'getMeasurementDisplay',
    'reconcileMeasuredDay',
    'calculateLongestScheduledStreak',
    'calculateCurrentStreak',
    'resetHabitDay',
    'reconcileMeasurementTypeChanges',
    'getAqiCategory',
    'getRhythmAnchorText',
    'parseSystemClockTime',
    'formatSystemClockTime',
    'normalizeSystemHabitParams',
    'parseLegacySystemHabitTitle',
    'formatSystemHabitTitle',
    'deriveSystemHabitContext',
    'buildRuntimeHabits',
    ];
  const rhythmPrelude = html.match(/const RHYTHM_TYPES\s*=\s*[^;]+;[\s\S]*?const RHYTHM_LABELS\s*=\s*\{[\s\S]*?\};/);
  assert.ok(rhythmPrelude, 'rhythm constants are missing');
  const systemPrelude = html.match(/const SYSTEM_HABIT_PARAMETER_DEFS\s*=\s*\{[\s\S]*?\n\};/);
  assert.ok(systemPrelude, 'system habit parameter definitions are missing');
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${rhythmPrelude[0]}\n${systemPrelude[0]}\n${names.map(name => extractFunction(html, name)).join('\n')}\n` +
    `globalThis.exports = { ${names.join(', ')} };`,
    context,
  );
  return context.exports;
}

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const {
    normalizeMeasurementConfig,
    normalizeRhythmConfig,
    normalizeEnvironmentalReading,
    normalizeCustomHabitOverrides,
    getHabitProgress,
    adjustHabitProgress,
    isHabitProgressComplete,
    getDailyHabitStats,
    isValidDateKey,
    normalizeProgressByDate,
    normalizeStoredState,
    updateMeasuredHabitState,
    getMeasurementDisplay,
    reconcileMeasuredDay,
    calculateLongestScheduledStreak,
    calculateCurrentStreak,
    resetHabitDay,
    reconcileMeasurementTypeChanges,
    getRhythmAnchorText,
    parseSystemClockTime,
    formatSystemClockTime,
    normalizeSystemHabitParams,
    parseLegacySystemHabitTitle,
    formatSystemHabitTitle,
    deriveSystemHabitContext,
    buildRuntimeHabits,
  } = loadFunctions(html);
  const plain = value => JSON.parse(JSON.stringify(value));

  assert.deepEqual(
    plain(normalizeMeasurementConfig({})),
    { type:'check', target:1, step:1, unit:'' },
    `${label}: legacy habits default to check-once measurement`,
  );
  assert.deepEqual(
    plain(normalizeMeasurementConfig({ measurement:'count', target:3 })),
    { type:'count', target:3, step:1, unit:'' },
    `${label}: count habits use whole-number goals and one-count increments`,
  );
  assert.deepEqual(
    plain(normalizeMeasurementConfig({ measurement:'amount', target:64, step:12, unit:'oz' })),
    { type:'amount', target:64, step:12, unit:'oz' },
    `${label}: amount habit keeps target, increment, and unit`,
  );
  assert.deepEqual(
    plain(normalizeMeasurementConfig({ measurement:'amount', target:0.000001, step:0.0000001, unit:'g' })),
    { type:'check', target:1, step:1, unit:'' },
    `${label}: unusable sub-cent amount precision is rejected`,
  );
  assert.deepEqual(
    plain(normalizeMeasurementConfig({ measurement:'amount', target:1, step:0.01, unit:'g' })),
    { type:'amount', target:1, step:0.01, unit:'g' },
    `${label}: two-decimal amount precision remains supported`,
  );
  assert.deepEqual(
    plain(normalizeMeasurementConfig({ measurement:'amount', target:-4, step:0, unit:'' })),
    { type:'check', target:1, step:1, unit:'' },
    `${label}: malformed legacy measurement settings fall back safely`,
  );

  const defaults = [{ id:'water' }, { id:'pushups' }];
  assert.equal(normalizeEnvironmentalReading(8.4), 8.4, `${label}: environmental readings retain decimal precision`);
  assert.equal(normalizeEnvironmentalReading(-12.5), -12.5, `${label}: negative temperatures remain valid by default`);
  assert.equal(normalizeEnvironmentalReading(-1, 0), null, `${label}: a nonnegative domain rejects negative readings`);
  for (const invalidReading of [null, undefined, '8.4', true, NaN, Infinity]) {
    assert.equal(
      normalizeEnvironmentalReading(invalidReading),
      null,
      `${label}: environmental readings reject null, coercible, and nonfinite values`,
    );
  }
  assert.deepEqual(
    plain(normalizeRhythmConfig({ type:'uv-above', threshold:8.2, note:'Move indoors' })),
    { type:'uv-above', threshold:8.2, note:'Move indoors' },
    `${label}: valid decimal rhythm thresholds retain decision precision`,
  );
  for (const malformedThreshold of ['50', true, null]) {
    assert.equal(
      normalizeRhythmConfig({ type:'aqi-below', threshold:malformedThreshold }),
      null,
      `${label}: rhythm thresholds reject coerced nonnumber values`,
    );
    assert.throws(
      () => normalizeCustomHabitOverrides({ water:{ rhythm:{ type:'aqi-below', threshold:malformedThreshold } } }, defaults, true),
      /rhythm|threshold/i,
      `${label}: strict imports reject malformed rhythm threshold types`,
    );
  }
  const legacyRhythms = plain(normalizeCustomHabitOverrides({
    hydrate:{ rhythm:{ type:'temp-above', threshold:85, note:'Extra water; electrolytes after hours of sweating' } },
    beach:{ rhythm:{ type:'aqi-below', threshold:100, note:'More favorable window for outdoor movement' } },
    sunscreen:{ rhythm:{ type:'uv-above', threshold:3, note:'Sun protection matters now' } },
  }, [{ id:'hydrate' }, { id:'beach' }, { id:'sunscreen' }], false));
  assert.deepEqual(legacyRhythms, {
    hydrate:{ rhythm:{ type:'temp-above', threshold:85, note:'Drink extra water' } },
    beach:{ rhythm:{ type:'aqi-below', threshold:100 } },
    sunscreen:{ rhythm:{ type:'uv-above', threshold:3, note:'Use sun protection' } },
  }, `${label}: exact former default notes migrate before concise-note validation`);
  for (const denseNote of [
    'Hydrate; avoid heat — now',
    'Anchor: move indoors',
    'AQI is at most 50',
    'Temperature exceeds 90',
    'UV reached 3',
    'X'.repeat(61),
  ]) {
    assert.equal(
      normalizeRhythmConfig({ type:'temp-above', threshold:85, note:denseNote }, true),
      null,
      `${label}: strict rhythm validation rejects dense note copy`,
    );
    assert.deepEqual(
      plain(normalizeRhythmConfig({ type:'temp-above', threshold:85, note:denseNote }, false)),
      { type:'temp-above', threshold:85 },
      `${label}: local legacy data keeps its anchor while dropping only an invalid note`,
    );
    assert.throws(
      () => normalizeCustomHabitOverrides({ water:{ rhythm:{ type:'temp-above', threshold:85, note:denseNote } } }, defaults, true),
      /rhythm|note/i,
      `${label}: strict imports reject dense rhythm notes`,
    );
  }
  assert.equal(
    getRhythmAnchorText({ type:'aqi-below', threshold:50 }, { feel:92 }),
    'US AQI cue at or below 50',
    `${label}: a forecast-only partial result keeps the AQI threshold visible`,
  );
  assert.equal(
    getRhythmAnchorText({ type:'uv-above', threshold:3 }, { aqi:43 }),
    'UV cue at 3 or higher',
    `${label}: an AQI-only partial result keeps the UV threshold visible`,
  );
  assert.equal(
    getRhythmAnchorText({ type:'temp-below', threshold:50 }, { feel:null }),
    'Cold cue below 50°F',
    `${label}: null feels-like data never becomes a favorable zero reading`,
  );
  assert.equal(
    getRhythmAnchorText({ type:'aqi-below', threshold:49.6 }, { aqi:49.5 }),
    '🍃 AQI 49.5 · Good air quality',
    `${label}: AQI labels preserve the exact decimal and explain the reading instead of the threshold math`,
  );
  assert.equal(
    getRhythmAnchorText({ type:'aqi-below', threshold:100 }, { aqi:78 }),
    '🍃 AQI 78 · Moderate air quality',
    `${label}: AQI copy names the standard category when the cue is active`,
  );
  assert.equal(
    getRhythmAnchorText({ type:'aqi-below', threshold:100 }, { aqi:121 }),
    'AQI 121 · Unhealthy for sensitive groups',
    `${label}: AQI copy remains useful when the configured cue is not active`,
  );
  assert.equal(
    getRhythmAnchorText({ type:'aqi-below', threshold:100 }, { aqi:-1 }),
    'US AQI cue at or below 100',
    `${label}: negative AQI is invalid rather than favorable`,
  );
  for (const [aqi, category] of [
    [50, 'Good air quality'], [50.1, 'Moderate air quality'],
    [100, 'Moderate air quality'], [100.1, 'Unhealthy for sensitive groups'],
    [150, 'Unhealthy for sensitive groups'], [150.1, 'Unhealthy air quality'],
    [200, 'Unhealthy air quality'], [200.1, 'Very unhealthy air quality'],
    [300, 'Very unhealthy air quality'], [300.1, 'Hazardous air quality'],
  ]) {
    assert.equal(
      getRhythmAnchorText({ type:'aqi-below', threshold:500 }, { aqi }),
      `🍃 AQI ${aqi} · ${category}`,
      `${label}: AQI ${aqi} uses the correct category boundary`,
    );
  }
  assert.equal(
    getRhythmAnchorText({ type:'temp-above', threshold:85, note:'Drink extra water' }, { feel:96.2 }),
    '🔥 Feels like 96.2°F · Drink extra water',
    `${label}: active heat copy leads with the reading and a concise action`,
  );
  assert.equal(
    getRhythmAnchorText({ type:'temp-above', threshold:85 }, { feel:78 }),
    'Feels like 78°F · Below heat cue',
    `${label}: inactive heat copy avoids restating threshold math`,
  );
  assert.equal(
    getRhythmAnchorText({ type:'temp-below', threshold:50, note:'Add a warm layer' }, { feel:42 }),
    '❄️ Feels like 42°F · Add a warm layer',
    `${label}: active cold copy leads with the reading and a concise action`,
  );
  assert.equal(
    getRhythmAnchorText({ type:'temp-below', threshold:50 }, { feel:55 }),
    'Feels like 55°F · Above cold cue',
    `${label}: inactive cold copy avoids restating threshold math`,
  );
  assert.equal(
    getRhythmAnchorText({ type:'uv-above', threshold:3, note:'Use sun protection' }, { uv:3.9 }),
    '☀️ UV 3.9 · Use sun protection',
    `${label}: UV copy uses the same concise reading-and-action pattern`,
  );
  assert.equal(
    getRhythmAnchorText({ type:'uv-above', threshold:3 }, { uv:2.1 }),
    'UV 2.1 · Below sun cue',
    `${label}: inactive UV copy avoids threshold narration`,
  );
  assert.equal(
    getRhythmAnchorText({ type:'sunrise' }, { sunrise:'6:58 AM' }),
    '🌅 Sunrise 6:58 AM · Get morning light',
    `${label}: sunrise copy is concise and action-led`,
  );
  assert.equal(
    getRhythmAnchorText({ type:'sunset' }, { sunset:'7:44 PM' }),
    '🌇 Sunset 7:44 PM · Start winding down',
    `${label}: sunset copy is concise and action-led`,
  );
  for (const text of [
    getRhythmAnchorText({ type:'temp-above', threshold:85, note:'Drink extra water' }, { feel:96.2 }),
    getRhythmAnchorText({ type:'uv-above', threshold:3, note:'Use sun protection' }, { uv:3.9 }),
    getRhythmAnchorText({ type:'aqi-below', threshold:100 }, { aqi:42 }),
  ]) {
    assert.doesNotMatch(text, /—|;|is at most|exceeds|reached/, `${label}: live rhythm copy avoids dense comparison prose`);
  }
  assert.deepEqual(
    plain(normalizeCustomHabitOverrides({
      water: { measurement:'amount', target:64, step:12, unit:'oz' },
      pushups: { measurement:'count', target:20 },
    }, defaults, true)),
    {
      water: { measurement:'amount', target:64, step:12, unit:'oz' },
      pushups: { measurement:'count', target:20 },
    },
    `${label}: valid measurement overrides survive strict backup validation`,
  );
  assert.throws(
    () => normalizeCustomHabitOverrides({ water: { measurement:'amount', target:64, step:12, unit:'' } }, defaults, true),
    /measurement|unit/i,
    `${label}: amount imports require a unit`,
  );
  assert.throws(
    () => normalizeCustomHabitOverrides({ water:{ measurement:'amount', target:1, step:0.001, unit:'g' } }, defaults, true),
    /measurement/i,
    `${label}: imported amounts cannot exceed supported display precision`,
  );
  for (const invalidAmount of [
    { measurement:'amount', target:'64', step:12, unit:'oz' },
    { measurement:'amount', target:true, step:1, unit:'oz' },
    { measurement:'amount', target:64, step:'12', unit:'oz' },
    { measurement:'amount', target:64, step:true, unit:'oz' },
    { measurement:'amount', target:64, step:12, unit:true },
    { measurement:'amount', target:64, step:12, unit:7 },
  ]) {
    assert.throws(
      () => normalizeCustomHabitOverrides({ water:invalidAmount }, defaults, true),
      /measurement/i,
      `${label}: strict imports reject nonnumeric Amount goal and increment types`,
    );
  }
  assert.throws(
    () => normalizeCustomHabitOverrides({ pushups: { measurement:'count', target:2.5 } }, defaults, true),
    /measurement|whole-number|target/i,
    `${label}: count imports require a whole-number target`,
  );
  assert.deepEqual(
    plain(normalizeCustomHabitOverrides({ water: { text:'Hydrate', measurement:'amount', target:-1, step:0, unit:'' } }, defaults, false)),
    { water: { text:'Hydrate' } },
    `${label}: malformed legacy measurement fields are omitted without losing valid edits`,
  );

  const water = { id:'water', measurement:'amount', target:64, step:12, unit:'oz' };
  const pushups = { id:'pushups', measurement:'count', target:3 };
  assert.equal(getHabitProgress({ water:true }, {}, water), 64, `${label}: a legacy completed check migrates as a completed measured goal`);
  assert.equal(getHabitProgress({}, { water:24 }, water), 24, `${label}: stored numeric progress takes precedence`);
  assert.equal(getHabitProgress({}, { water:-5 }, water), 0, `${label}: invalid negative progress is ignored`);
  assert.equal(adjustHabitProgress(60, water, 1), 72, `${label}: amount increments may cross the target by one configured serving`);
  assert.equal(adjustHabitProgress(72, water, 1), 72, `${label}: completed amounts stop incrementing`);
  assert.equal(adjustHabitProgress(72, water, -1), 60, `${label}: subtract reverses one full amount increment`);
  assert.equal(adjustHabitProgress(0, water, -1), 0, `${label}: measured progress cannot go below zero`);
  assert.equal(adjustHabitProgress(2, pushups, 1), 3, `${label}: count habits increment by one`);
  assert.equal(isHabitProgressComplete(water, 60), false, `${label}: amount habits remain incomplete below target`);
  assert.equal(isHabitProgressComplete(water, 72), true, `${label}: amount habits complete at or above target`);
  assert.equal(isHabitProgressComplete(pushups, 3), true, `${label}: count habits complete at target`);

  const day = new Date(2026, 7, 27, 12);
  const measuredHabits = [
    { id:'check' },
    pushups,
    water,
    { id:'other-day', measurement:'count', target:2, days:[5] },
  ];
  const doneByDate = { '2026-08-27': { check:true, water:true } };
  const progressByDate = { '2026-08-27': { pushups:2, water:72, 'other-day':2 } };
  let stats = getDailyHabitStats(doneByDate, measuredHabits, day, 5, progressByDate);
  assert.deepEqual(
    { scheduled:stats.scheduledCount, done:stats.doneCount, target:stats.target, pct:stats.pct },
    { scheduled:3, done:2, target:3, pct:67 },
    `${label}: daily totals count completed habits, not individual increments`,
  );
  progressByDate['2026-08-27'].pushups = 3;
  doneByDate['2026-08-27'].pushups = true;
  stats = getDailyHabitStats(doneByDate, measuredHabits, day, 5, progressByDate);
  assert.equal(stats.doneCount, 3, `${label}: reaching a measured goal completes exactly one habit`);
  assert.equal(
    getDailyHabitStats({ '2026-08-27': { pushups:true } }, [pushups], day).doneCount,
    1,
    `${label}: legacy measured completions remain complete without numeric progress`,
  );

  const validationHabits = [
    { id:'water', measurement:'amount', target:64, step:12, unit:'oz' },
    { id:'pushups', measurement:'count', target:20 },
    { id:'check' },
  ];
  assert.equal(isValidDateKey('2026-08-27'), true, `${label}: real calendar dates are accepted`);
  assert.equal(isValidDateKey('2026-99-99'), false, `${label}: impossible calendar dates are rejected`);
  assert.deepEqual(
    plain(normalizeProgressByDate({ '2026-08-27': { water:24, pushups:2 } }, validationHabits, true)),
    { '2026-08-27': { water:24, pushups:2 } },
    `${label}: valid numeric progress survives strict validation`,
  );
  assert.throws(
    () => normalizeProgressByDate({ '2026-08-27': { water:-1 } }, validationHabits, true),
    /progress/i,
    `${label}: imported progress cannot be negative`,
  );
  assert.throws(
    () => normalizeProgressByDate({ '2026-08-27': { unknown:2 } }, validationHabits, true),
    /unknown habit/i,
    `${label}: imported progress cannot target unknown habits`,
  );
  assert.throws(
    () => normalizeProgressByDate({ '2026-99-99':{ water:12 } }, validationHabits, true),
    /date/i,
    `${label}: imported progress rejects impossible calendar dates`,
  );
  assert.throws(
    () => normalizeProgressByDate({ '2026-08-27':{ check:1 } }, validationHabits, true),
    /check/i,
    `${label}: Check once habits cannot carry numeric progress`,
  );
  assert.throws(
    () => normalizeProgressByDate({ '2026-08-27':{ pushups:1.5 } }, validationHabits, true),
    /count/i,
    `${label}: Count progress must remain whole-numbered`,
  );
  assert.throws(
    () => normalizeProgressByDate({ '2026-08-27':{ water:12.345 } }, validationHabits, true),
    /amount|precision/i,
    `${label}: Amount progress cannot exceed supported precision`,
  );
  assert.deepEqual(
    plain(normalizeProgressByDate({ bad:{ water:2 }, '2026-08-27':{ water:12, unknown:3, pushups:-1, check:1 } }, validationHabits, false)),
    { '2026-08-27': { water:12 } },
    `${label}: malformed legacy progress is omitted while valid entries survive`,
  );
  const legacyState = normalizeStoredState({ done:{ '2026-08-27':{ water:true } } }, defaults, false);
  assert.deepEqual(plain(legacyState.progress), {}, `${label}: old state without progress loads unchanged`);
  assert.deepEqual(plain(legacyState.done), { '2026-08-27':{ water:true } }, `${label}: old Boolean completion history is preserved`);
  assert.throws(
    () => normalizeStoredState({ done:{}, streak:'4' }, validationHabits, true),
    /streak/i,
    `${label}: strict imports reject malformed streak metadata`,
  );
  assert.throws(
    () => normalizeStoredState({ done:{}, week:[] }, validationHabits, true),
    /week/i,
    `${label}: strict imports reject malformed weekly metadata`,
  );
  const historicalSnapshot = normalizeStoredState({
    done:{ '2026-08-26':{ water:true } },
    progress:{ '2026-08-26':{ water:60 } },
  }, [{ ...validationHabits[0], target:80 }], true);
  assert.equal(historicalSnapshot.done['2026-08-26'].water, true, `${label}: strict imports preserve explicit historical completion snapshots across later goal edits`);

  const mutableDone = {};
  const mutableProgress = {};
  let change = updateMeasuredHabitState(mutableDone, mutableProgress, [water], day, 'water', 1);
  assert.deepEqual(plain(change), { progress:12, complete:false, changed:true }, `${label}: first amount increment is recorded without completing the habit`);
  for (let i = 0; i < 5; i++) change = updateMeasuredHabitState(mutableDone, mutableProgress, [water], day, 'water', 1);
  assert.equal(change.progress, 72, `${label}: repeated amount increments may cross the target`);
  assert.equal(change.complete, true, `${label}: crossing the amount target marks the habit complete`);
  assert.equal(mutableDone['2026-08-27'].water, true, `${label}: measured completion synchronizes the legacy done map`);
  change = updateMeasuredHabitState(mutableDone, mutableProgress, [water], day, 'water', -1);
  assert.equal(change.progress, 60, `${label}: subtract removes one configured amount increment`);
  assert.equal(change.complete, false, `${label}: dropping below target unmarks completion`);
  assert.equal(Object.hasOwn(mutableDone['2026-08-27'], 'water'), false, `${label}: legacy done map is cleared below target`);
  assert.equal(updateMeasuredHabitState(mutableDone, mutableProgress, [{ id:'check' }], day, 'check', 1), null, `${label}: check-once habits stay on the existing toggle path`);

  assert.deepEqual(
    plain(getMeasurementDisplay(pushups, 2)),
    { summary:'2 / 3', incrementLabel:'+1', pct:67 },
    `${label}: count progress has a concise card display`,
  );
  assert.deepEqual(
    plain(getMeasurementDisplay(water, 24)),
    { summary:'24 / 64 oz', incrementLabel:'+12 oz', pct:38 },
    `${label}: amount progress includes its unit and increment`,
  );
  assert.deepEqual(
    plain(getMeasurementDisplay(water, 72)),
    { summary:'72 / 64 oz', incrementLabel:'+12 oz', pct:100 },
    `${label}: progress display caps only its visual percentage, not the recorded amount`,
  );

  const changedDone = { '2026-08-27':{ water:true } };
  const changedProgress = { '2026-08-27':{ water:72 } };
  reconcileMeasuredDay(changedDone, changedProgress, [{ ...water, target:80 }], day);
  assert.equal(Object.hasOwn(changedDone['2026-08-27'], 'water'), false, `${label}: raising a goal immediately unmarks insufficient progress`);
  reconcileMeasuredDay(changedDone, changedProgress, [water], day);
  assert.equal(changedDone['2026-08-27'].water, true, `${label}: lowering a goal immediately restores completion from recorded progress`);
  assert.equal(changedProgress['2026-08-27'].water, 72, `${label}: goal edits never rewrite the recorded amount`);

  const measuredHistory = {
    '2026-08-25':{ pushups:3 },
    '2026-08-26':{ pushups:3 },
    '2026-08-27':{ pushups:2 },
  };
  const measuredDoneHistory = {
    '2026-08-25':{ pushups:true },
    '2026-08-26':{ pushups:true },
  };
  assert.equal(
    calculateCurrentStreak(measuredDoneHistory, [pushups], day, 1, measuredHistory),
    2,
    `${label}: incomplete measured progress today preserves the completed measured streak through yesterday`,
  );
  assert.equal(
    calculateLongestScheduledStreak(measuredDoneHistory, [pushups], day, 1, measuredHistory),
    2,
    `${label}: longest streak scans measured dates while honoring saved completion snapshots`,
  );
  const historicalGoalEdit = getDailyHabitStats(
    { '2026-08-26':{ water:true } },
    [{ ...water, target:80 }],
    new Date(2026, 7, 26, 12),
    1,
    { '2026-08-26':{ water:72 } },
  );
  assert.equal(historicalGoalEdit.doneCount, 1, `${label}: a saved historical completion survives later goal increases`);

  const resetState = {
    done:{ '2026-08-26':{ water:true }, '2026-08-27':{ water:true } },
    progress:{ '2026-08-26':{ water:72 }, '2026-08-27':{ water:24 } },
  };
  assert.equal(resetHabitDay(resetState, day), '2026-08-27', `${label}: reset resolves one supplied date key`);
  assert.deepEqual(plain(resetState), {
    done:{ '2026-08-26':{ water:true } },
    progress:{ '2026-08-26':{ water:72 } },
  }, `${label}: reset clears completion and progress for exactly the same date`);

  const convertedDone = { '2026-08-27':{ water:true, check:true } };
  const convertedProgress = {
    '2026-08-26':{ water:60 },
    '2026-08-27':{ water:72 },
  };
  reconcileMeasurementTypeChanges(
    convertedDone,
    convertedProgress,
    [water, { id:'check' }],
    [{ id:'water', measurement:'count', target:3 }, { id:'check', measurement:'amount', target:8, step:2, unit:'oz' }],
    day,
  );
  assert.equal(Object.hasOwn(convertedProgress, '2026-08-26'), false, `${label}: a type change purges incompatible numeric history on earlier dates`);
  assert.deepEqual(plain(convertedProgress['2026-08-27'] || {}), { check:8 }, `${label}: Amount-to-Count clears incompatible progress while Check-to-Amount materializes its completed target`);
  assert.equal(Object.hasOwn(convertedDone['2026-08-27'], 'water'), false, `${label}: Amount-to-Count conversion clears incompatible completion`);
  assert.equal(convertedDone['2026-08-27'].check, true, `${label}: Check-once conversion preserves an existing completion snapshot`);
  reconcileMeasuredDay(
    convertedDone,
    convertedProgress,
    [{ id:'check', measurement:'amount', target:10, step:2, unit:'oz' }],
    day,
  );
  assert.equal(convertedProgress['2026-08-27'].check, 8, `${label}: a later goal edit keeps the amount established at conversion`);
  assert.equal(Object.hasOwn(convertedDone['2026-08-27'], 'check'), false, `${label}: raising the converted measured goal recalculates today from materialized progress`);

  const resetDefaultsDone = {
    '2026-08-26':{ water:true },
    '2026-08-27':{ water:true },
  };
  const resetDefaultsProgress = {
    '2026-08-26':{ water:72 },
    '2026-08-27':{ water:24 },
  };
  reconcileMeasurementTypeChanges(resetDefaultsDone, resetDefaultsProgress, [water], [{ id:'water' }], day);
  assert.deepEqual(plain(resetDefaultsProgress), {}, `${label}: restoring Check-once defaults removes all incompatible measured progress`);
  assert.doesNotThrow(
    () => normalizeStoredState({ done:resetDefaultsDone, progress:resetDefaultsProgress }, [{ id:'water' }], true),
    `${label}: reset-default state remains valid for strict backup import`,
  );

  assert.match(html, /class=["']eh-measurement["']/, `${label}: Manage rows need a measurement type selector`);
  assert.doesNotMatch(html, /<span class=["']habit-badge["']>/, `${label}: daily cards must not display unused weight metadata`);
  assert.doesNotMatch(html, /class=["']eh-weight["']/, `${label}: Manage no longer exposes the obsolete weight selector`);
  assert.match(html, /class=["']eh-system-title["']/, `${label}: system habits show a locked generated title`);
  assert.match(html, /value=["']check["'][^>]*>Check once</, `${label}: Manage supports check-once habits`);
  assert.match(html, /value=["']count["'][^>]*>Count</, `${label}: Manage supports count habits`);
  assert.match(html, /value=["']amount["'][^>]*>Amount</, `${label}: Manage supports amount habits`);
  assert.match(html, /class=["']eh-target["']/, `${label}: measured habits expose a target input`);
  assert.match(html, /class=["']eh-step["']/, `${label}: amount habits expose an increment input`);
  assert.match(html, /class=["']eh-unit["']/, `${label}: amount habits expose a unit input`);
  assert.match(html, /class=["']progress-step progress-minus["']/, `${label}: measured cards need a subtract control`);
  assert.match(html, /class=["']progress-step progress-plus["']/, `${label}: measured cards need an add control`);
  assert.match(html, /class=["']progress-stepper["'][^>]*>[\s\S]*?progress-plus[\s\S]*?progress-minus/, `${label}: plus button sits above minus in the stepper`);
  assert.match(html, /\.progress-stepper\s*\{[^}]*transform:\s*translateY\(-2px\)/, `${label}: stepper is optically centered above the bottom progress bar`);
  assert.match(html, /class=["']progress-chip["']/, `${label}: measured cards display progress in a compact inline chip`);
  assert.match(html, /class=["']progress-step-copy["']/, `${label}: measured cards explain the per-tap increment outside the button`);
  assert.match(html, /class=["']progress-edge["']/, `${label}: measured cards place progress on the card bottom edge`);
  assert.match(html, /class=["']progress-stepper["']/, `${label}: measured controls use a dedicated trailing rail`);
  assert.doesNotMatch(html, /<div class=["']progress-meter["']/, `${label}: measured cards must not render the wrapping meter row`);
  assert.match(html, /\.habit\s*\{[^}]*height:\s*104px[^}]*min-height:\s*104px/s, `${label}: every habit card uses the same fixed height`);
  assert.match(html, /id=["']reorderBtn["'][^>]*aria-pressed=["']false["']/, `${label}: the list exposes an accessible Reorder-mode toggle`);
  assert.match(html, /let reorderMode = false;/, `${label}: tracking mode is the default`);
  assert.match(html, /classList\.toggle\(['"]reorder-mode['"], reorderMode\)/, `${label}: list rendering exposes Reorder mode to CSS`);
  assert.match(html, /if \(reorderMode\) return;/, `${label}: card completion is disabled while reordering`);
  assert.match(html, /\.move-btns\s*\{[^}]*display:\s*none/s, `${label}: arrows are hidden in tracking mode`);
  assert.match(html, /\.drag-handle\s*\{[^}]*display:\s*none/s, `${label}: grips are hidden in tracking mode`);
  assert.match(html, /\.habits\.reorder-mode \.move-btns\s*\{[^}]*display:\s*flex/s, `${label}: arrows appear only in Reorder mode`);
  assert.match(html, /\.habits\.reorder-mode \.drag-handle\s*\{[^}]*display:\s*grid/s, `${label}: grips appear only in Reorder mode`);
  assert.match(html, /\.habits\.reorder-mode \.progress-stepper,[\s\S]*?display:\s*none;/, `${label}: measurement controls leave the rail in Reorder mode`);
  assert.match(html, /\.move-btn\s*\{[^}]*min-width:\s*40px[^}]*min-height:\s*40px/s, `${label}: Reorder arrows use mobile-sized targets`);
  assert.match(html, /\.drag-handle\s*\{[^}]*min-width:\s*32px[^}]*min-height:\s*44px/s, `${label}: Reorder grip has a deliberate hold target`);
  assert.match(html, /\.progress-stepper\s*\{[^}]*grid-template-rows:\s*40px 40px/s, `${label}: measured controls use a vertical 40px rail`);
  assert.match(html, /\.progress-step\s*\{[^}]*min-height:\s*40px/s, `${label}: measured card controls need mobile-sized targets`);
  assert.match(html, /\.habit-text\s*\{[^}]*white-space:\s*nowrap;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;/s, `${label}: habit titles stay on one line and ellipsize`);
  assert.match(html, /\.habit-note\s*\{[^}]*white-space:\s*nowrap;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;/s, `${label}: habit descriptions stay on one line and ellipsize`);
  assert.match(html, /\.rhythm-anchor-label\s*\{[^}]*white-space:\s*nowrap;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;/s, `${label}: anchor labels stay on one line and ellipsize`);
  assert.match(html, /class=["']eh-text["'] maxlength=["']48["']/, `${label}: Manage keeps new habit titles concise`);
  assert.match(html, /class=["']eh-note["'] maxlength=["']80["']/, `${label}: Manage keeps new habit descriptions concise`);
  assert.match(html, /const resetDate = new Date\(\);\s*resetHabitDay\(state, resetDate\);/, `${label}: Reset today captures one date for completion and progress`);
  assert.match(html, /RHYTHM_TYPES.*'sunrise'.*'sunset'.*'temp-above'.*'uv-above'.*'aqi-below'/s, `${label}: rhythm anchor types include sunrise, sunset, temp, UV, and air quality`);
  assert.match(html, /class=["']eh-rhythm["']/, `${label}: Manage modal exposes a rhythm anchor selector`);
  assert.match(html, /class=["']eh-rhythm-note["']/, `${label}: Manage modal exposes an optional rhythm note field`);
  assert.match(html, /\.eh-rhythm-field\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/, `${label}: hidden rhythm threshold fields stay hidden despite the field display rule`);
  assert.match(html, /\.eh-rhythm-note\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/, `${label}: No anchor hides its inapplicable note field`);
  assert.match(html, /function updateRhythmRow\(row\)[\s\S]*noteInput\.hidden = type === 'none'/, `${label}: changing the anchor toggles its note field`);
  assert.match(html, /class=["']eh-rhythm-field eh-rhythm-threshold-field["'][\s\S]*?<input class=["']eh-rhythm-threshold["']/, `${label}: rhythm threshold wrapper and input use distinct selectors`);
  assert.match(html, /class=["']eh-rhythm-note["'][^>]*maxlength=["']60["']/, `${label}: rhythm notes are capped at one concise clause in Manage`);
  assert.match(html, /querySelectorAll\(['"]\.eh-rhythm-threshold, \.eh-rhythm-note['"]\)[\s\S]*addEventListener\(['"]input['"][\s\S]*classList\.remove\(['"]measurement-error['"]\)/, `${label}: correcting rhythm fields clears validation styling`);
  assert.match(html, /class=["']rhythm-anchor-label["']/, `${label}: habit cards render a rhythm anchor label when anchored`);
  assert.match(html, /function updateRhythmAnchors/, `${label}: live weather data updates rhythm anchor labels on cards`);
  assert.match(html, /air-quality-api\.open-meteo\.com\/v1\/air-quality[^`]*current=us_aqi/, `${label}: air-quality anchors use Open-Meteo's live AQI feed`);
  assert.match(html, /normalizeEnvironmentalReading\(d\.current\.us_aqi,\s*0\)/, `${label}: live AQI ingestion rejects negative values`);
  assert.match(html, /updateRhythmAnchors\(\{ \.\.\.rhythmWeatherData, aqi, aqiObservedAt \}, now\)/, `${label}: live AQI merges into the existing rhythm context with a timestamp`);
  assert.match(html, /function renderHabits\(now = new Date\(\)\)[\s\S]*if \(rhythmWeatherData\) updateRhythmAnchors\(rhythmWeatherData, now\);[\s\S]*?\n\}/, `${label}: card rerenders restore live rhythm labels with the render transaction timestamp`);
  assert.match(html, /function renderInsights\(now = new Date\(\)\)[\s\S]*const generation = \+\+rhythmWeatherGeneration/, `${label}: environmental refresh uses a generation guard to reject superseded responses`);
  assert.match(html, /if \(generation !== rhythmWeatherGeneration \|\| activeDateKey !== dateKey\(new Date\(\)\)\) return/, `${label}: superseded environmental responses are discarded`);
  assert.match(html, /function refreshForDateRollover\(now = new Date\(\)\)[\s\S]*rhythmWeatherData = null[\s\S]*rhythmWeatherGeneration\+\+/, `${label}: rollover clears all environmental channels and bumps the generation`);
  assert.match(html, /function toggleHabit\(id\) \{\s*const now = new Date\(\);\s*if \(!ensureCurrentRenderedDate\(now\)\) return;\s*const todayKey = dateKey\(now\);[\s\S]*renderHabits\(now\)/, `${label}: toggle threads its transaction timestamp through the rerender`);
  assert.match(html, /function adjustMeasuredHabit\(id, direction\) \{\s*const now = new Date\(\);\s*if \(!ensureCurrentRenderedDate\(now\)\) return;\s*const key = dateKey\(now\);[\s\S]*renderHabits\(now\)/, `${label}: measured adjustments thread the transaction timestamp through the rerender`);
  assert.match(html, /case 'uv-above':[\s\S]*!Number\.isFinite\(data\.uv\)[\s\S]*UV cue at \$\{rhythm\.threshold\} or higher[\s\S]*data\.uv >= rhythm\.threshold/, `${label}: partial forecast data keeps the configured UV threshold visible`);
  assert.match(html, /case 'aqi-below':[\s\S]*!Number\.isFinite\(data\.aqi\)[\s\S]*US AQI cue at or below \$\{rhythm\.threshold\}[\s\S]*data\.aqi <= rhythm\.threshold/, `${label}: partial air-quality data keeps the configured AQI threshold visible`);
  assert.match(html, /normalizeRhythmConfig/, `${label}: rhythm config is normalized for validation and rendering`);
  assert.match(html, /JSON\.stringify\(rhythm\)\s*!==\s*JSON\.stringify\(defaultRhythm\)/, `${label}: Manage does not persist rhythm overrides identical to shipped defaults`);
  assert.match(html, /getElementById\('modalReset'\)[\s\S]*previousHabits[\s\S]*reconcileMeasurementTypeChanges[\s\S]*saveState\(\)[\s\S]*renderHabits\(resetDate\)/, `${label}: Reset defaults reconciles measured state and saves before rendering with the reset timestamp`);
  assert.match(html, /getDailyHabitStats\(state\.done \|\| \{\}, HABITS, [^;]+state\.progress \|\| \{\}\)/, `${label}: rendered totals pass measured progress to shared calculations`);
  if (label === 'mobile') {
    assert.match(html, /const importedHabits = DEFAULT_HABITS\.map/, `${label}: backup import merges custom measurements before validating progress`);
    assert.match(html, /const importedState = normalizeStoredState\(payload\.state, importedHabits, true\)/, `${label}: backup import validates measured progress against imported habit types`);
    assert.match(html, /reconcileMeasuredDay\(importedState\.done, importedState\.progress, importedHabits, importDate\);[\s\S]*localStorage\.setItem\(STORAGE_KEY/, `${label}: backup import reconciles today before its first state write`);
  }
}

console.log('measurement configuration regression tests passed for mobile and desktop');
