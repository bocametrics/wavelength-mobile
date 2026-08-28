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
  const brace = source.indexOf('{', start);
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
  ];
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${names.map(name => extractFunction(html, name)).join('\n')}\n` +
    `globalThis.exports = { ${names.join(', ')} };`,
    context,
  );
  return context.exports;
}

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const {
    normalizeMeasurementConfig,
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
  assert.match(html, /value=["']check["'][^>]*>Check once</, `${label}: Manage supports check-once habits`);
  assert.match(html, /value=["']count["'][^>]*>Count</, `${label}: Manage supports count habits`);
  assert.match(html, /value=["']amount["'][^>]*>Amount</, `${label}: Manage supports amount habits`);
  assert.match(html, /class=["']eh-target["']/, `${label}: measured habits expose a target input`);
  assert.match(html, /class=["']eh-step["']/, `${label}: amount habits expose an increment input`);
  assert.match(html, /class=["']eh-unit["']/, `${label}: amount habits expose a unit input`);
  assert.match(html, /class=["']progress-step progress-minus["']/, `${label}: measured cards need a subtract control`);
  assert.match(html, /class=["']progress-step progress-plus["']/, `${label}: measured cards need an add control`);
  assert.match(html, /\.progress-step\s*\{[^}]*min-height:\s*40px/s, `${label}: measured card controls need mobile-sized targets`);
  assert.match(html, /const resetDate = new Date\(\);\s*resetHabitDay\(state, resetDate\);/, `${label}: Reset today captures one date for completion and progress`);
  assert.match(html, /getElementById\('modalReset'\)[\s\S]*previousHabits[\s\S]*reconcileMeasurementTypeChanges[\s\S]*saveState\(\)[\s\S]*renderHabits\(\)/, `${label}: Reset defaults reconciles measured state and saves before rendering`);
  assert.match(html, /getDailyHabitStats\(state\.done \|\| \{\}, HABITS, [^;]+state\.progress \|\| \{\}\)/, `${label}: rendered totals pass measured progress to shared calculations`);
  if (label === 'mobile') {
    assert.match(html, /const importedHabits = DEFAULT_HABITS\.map/, `${label}: backup import merges custom measurements before validating progress`);
    assert.match(html, /const importedState = normalizeStoredState\(payload\.state, importedHabits, true\)/, `${label}: backup import validates measured progress against imported habit types`);
    assert.match(html, /reconcileMeasuredDay\(importedState\.done, importedState\.progress, importedHabits, importDate\);[\s\S]*localStorage\.setItem\(STORAGE_KEY/, `${label}: backup import reconciles today before its first state write`);
  }
}

console.log('measurement configuration regression tests passed for mobile and desktop');
