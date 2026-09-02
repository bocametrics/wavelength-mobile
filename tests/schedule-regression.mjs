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

function loadScheduleFunctions(html) {
  const names = [
    'dateKey',
    'escapeHtml',
    'normalizeCustomHabitOverrides',
    'normalizeMeasurementConfig',
    'getHabitProgress',
    'isHabitProgressComplete',
    'normalizeHabitDays',
    'isHabitScheduledOn',
    'getScheduledHabits',
    'getDailyHabitStats',
    'calculateCurrentStreak',
    'calculateLongestScheduledStreak',
    'resolveLongestStreak',
    'getStreakStatusCopy',
    'parseSystemClockTime',
    'formatSystemClockTime',
    'normalizeSystemHabitParams',
    'parseLegacySystemHabitTitle',
    'formatSystemHabitTitle',
    'deriveSystemHabitContext',
    'buildRuntimeHabits',
    ];
  const context = {};
  vm.createContext(context);
  const systemPrelude = html.match(/const SYSTEM_HABIT_PARAMETER_DEFS\s*=\s*\{[\s\S]*?\n\};/);
  assert.ok(systemPrelude, 'system habit parameter definitions are missing');
  vm.runInContext(
    `${systemPrelude[0]}\n${names.map(name => extractFunction(html, name)).join('\n')}\n` +
    `globalThis.exports = { ${names.join(', ')} };`,
    context,
  );
  return context.exports;
}

const monday = new Date(2026, 7, 24, 12);
const tuesday = new Date(2026, 7, 25, 12);
const wednesday = new Date(2026, 7, 26, 12);
const friday = new Date(2026, 7, 21, 12);

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const fns = loadScheduleFunctions(html);

  assert.equal(
    fns.escapeHtml('<img src=x onerror="alert(1)">&'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;',
    `${label}: stored habit markup must render as text`,
  );

  const customDefaults = [{ id: 'wake' }, { id: 'cardio' }];
  const validOverrides = fns.normalizeCustomHabitOverrides(
    { cardio: { text: 'Intervals', weight: 2, days: [5, 1, 3, 3] } },
    customDefaults,
    true,
  );
  assert.equal(
    JSON.stringify(validOverrides),
    JSON.stringify({ cardio: { text: 'Intervals', days: [1, 3, 5] } }),
    `${label}: valid imported overrides are whitelisted and normalized`,
  );
  assert.throws(
    () => fns.normalizeCustomHabitOverrides({ wake: { days: [] } }, customDefaults, true),
    /at least one valid day/i,
    `${label}: imports cannot bypass the nonempty schedule invariant`,
  );
  assert.throws(
    () => fns.normalizeCustomHabitOverrides({ wake: { icon: '<svg onload=alert(1)>' } }, customDefaults, true),
    /unsupported field/i,
    `${label}: imports cannot override structural/rendered fields`,
  );
  const repairedLocal = fns.normalizeCustomHabitOverrides(
    { wake: { text: 'Early start', days: [9] } },
    customDefaults,
    false,
  );
  assert.equal(
    JSON.stringify(repairedLocal),
    JSON.stringify({ wake: { text: 'Early start' } }),
    `${label}: invalid legacy local schedules safely fall back to every day`,
  );

  assert.equal(fns.normalizeHabitDays(undefined).join(','), '0,1,2,3,4,5,6', `${label}: old/default habits run every day`);
  assert.equal(fns.normalizeHabitDays([5, 1, 1, 9, -1]).join(','), '1,5', `${label}: weekday values are validated and deduplicated`);

  const habits = [
    { id: 'daily' },
    { id: 'cardio', days: [1, 3, 5] },
    { id: 'strength', days: [2, 4, 6] },
    { id: 'sunday', days: [0] },
  ];
  assert.equal(fns.getScheduledHabits(habits, monday).map(h => h.id).join(','), 'daily,cardio', `${label}: Monday filters the visible library`);
  assert.equal(fns.getScheduledHabits(habits, tuesday).map(h => h.id).join(','), 'daily,strength', `${label}: Tuesday filters the visible library`);

  const introducedHabit = { id:'daylight', activeFrom:'2026-08-28' };
  assert.equal(fns.isHabitScheduledOn(introducedHabit, new Date(2026, 7, 27, 12)), false, `${label}: a newly shipped default is absent from pre-introduction history`);
  assert.equal(fns.isHabitScheduledOn(introducedHabit, new Date(2026, 7, 28, 12)), true, `${label}: a newly shipped default begins on its introduction date`);

  const done = { '2026-08-24': { daily: true, strength: true } };
  let stats = fns.getDailyHabitStats(done, habits, monday);
  assert.deepEqual(
    { scheduled: stats.scheduledCount, done: stats.doneCount, target: stats.target, pct: stats.pct },
    { scheduled: 2, done: 1, target: 2, pct: 50 },
    `${label}: unscheduled completions must not inflate today's calculations`,
  );

  const updatedHabits = habits.map(h => h.id === 'cardio' ? { ...h, days: [3, 5] } : h);
  stats = fns.getDailyHabitStats(done, updatedHabits, monday);
  assert.deepEqual(
    { scheduled: stats.scheduledCount, done: stats.doneCount, target: stats.target, pct: stats.pct },
    { scheduled: 1, done: 1, target: 1, pct: 100 },
    `${label}: unselecting Monday must immediately recalculate denominator, target, and percent`,
  );

  const mwfHabits = [
    { id: 'move', days: [1, 3, 5] },
    { id: 'recover', days: [1, 3, 5] },
  ];
  const completeBoth = { move: true, recover: true };
  const scheduledHistory = {
    '2026-08-21': completeBoth,
    '2026-08-24': completeBoth,
    '2026-08-26': {},
  };
  assert.equal(fns.getDailyHabitStats(scheduledHistory, mwfHabits, tuesday).target, 0, `${label}: unscheduled days are rest days`);
  assert.equal(fns.calculateCurrentStreak(scheduledHistory, mwfHabits, wednesday), 2, `${label}: rest days neither extend nor break a pending streak`);
  assert.equal(
    fns.calculateCurrentStreak({ ...scheduledHistory, '2026-08-26': completeBoth }, mwfHabits, wednesday),
    3,
    `${label}: completing Wednesday extends across intervening rest days`,
  );
  assert.equal(
    fns.calculateCurrentStreak({ '2026-08-21': completeBoth, '2026-08-24': {}, '2026-08-26': {} }, mwfHabits, wednesday),
    0,
    `${label}: a missed scheduled day still breaks the active streak`,
  );
  assert.equal(
    fns.calculateLongestScheduledStreak({ ...scheduledHistory, '2026-08-26': completeBoth }, mwfHabits, wednesday),
    3,
    `${label}: longest streak counts qualifying scheduled days across rest days`,
  );
  const weeklyHabit = [{ id: 'weekly', days: [1] }];
  const weeklyHistory = {};
  const firstMonday = new Date(2024, 0, 1, 12);
  let lastMonday = firstMonday;
  for (let week = 0; week < 120; week++) {
    const date = new Date(firstMonday);
    date.setDate(firstMonday.getDate() + (week * 7));
    weeklyHistory[fns.dateKey(date)] = { weekly: true };
    lastMonday = date;
  }
  const followingTuesday = new Date(lastMonday);
  followingTuesday.setDate(lastMonday.getDate() + 1);
  assert.equal(
    fns.calculateCurrentStreak(weeklyHistory, weeklyHabit, followingTuesday),
    120,
    `${label}: sparse schedules must scan all relevant history instead of truncating at 730 calendar days`,
  );
  assert.equal(fns.resolveLongestStreak(7, 5), 7, `${label}: displayed longest uses recalculated current-schedule values`);
  assert.equal(fns.getStreakStatusCopy(2, 0, 0), 'No habits scheduled today — your streak is resting', `${label}: rest-day status copy`);

  assert.match(html, /class=["']eh-days["']/, `${label}: Manage rows need weekday controls`);
  assert.match(html, /data-day=["']\$\{day\.value\}["']/, `${label}: weekday buttons need machine-readable day values`);
  assert.match(html, /role=["']checkbox["']/, `${label}: weekday toggles need accessible checkbox semantics`);
  assert.match(html, /normalizeHabitDays\(h\.days\)/, `${label}: missing schedules must render as all days selected`);
  assert.match(html, /\.eh-day\s*\{[^}]*min-height:\s*40px/s, `${label}: weekday toggles need mobile-sized targets`);
  assert.match(html, /\.edit-habit\.schedule-error\s*\{[^}]*var\(--danger-border\)/s, `${label}: invalid schedules need a visible semantic error outline`);
  assert.match(html, /getDailyHabitStats\(state\.done[^;]+/, `${label}: rendered calculations must use shared daily stats`);
  if (label === 'mobile') {
    assert.match(html, /importBackupFile[\s\S]*normalizeCustomHabitOverrides\(payload\.customHabits \|\| \{\}, DEFAULT_HABITS, true\)/, `${label}: backup import must strictly validate custom habit overrides before writing storage`);
  }
  assert.match(html, /habit-text">\$\{escapeHtml\(h\.text\)\}/, `${label}: habit names inserted into HTML must be escaped`);
  assert.match(html, /habit-note">\$\{escapeHtml\(h\.note\)\}/, `${label}: habit notes inserted into HTML must be escaped`);
  assert.match(html, /ghost\.textContent\s*=/, `${label}: drag ghost content must not use innerHTML`);
  assert.match(html, /state\.longestStreak\s*=\s*resolveLongestStreak\(historicalBest, streak\)/, `${label}: longest streak must recalculate under the current schedule`);
  assert.doesNotMatch(html, /const TODAY_KEY\s*=/, `${label}: daily actions must not freeze the date at page load`);
  assert.match(html, /function toggleHabit\(id\) \{\s*const now = new Date\(\);\s*if \(!ensureCurrentRenderedDate\(now\)\) return;\s*const todayKey = dateKey\(now\);[\s\S]*getDailyHabitStats\(state\.done \|\| \{\}, HABITS, now, 5, state\.progress \|\| \{\}\)/, `${label}: habit toggles capture one interaction timestamp for the key and statistics`);
}

console.log('weekday schedule regression tests passed for mobile and desktop');
