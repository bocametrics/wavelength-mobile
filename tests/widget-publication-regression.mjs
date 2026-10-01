import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

process.env.TZ = 'America/New_York';
const here = path.dirname(fileURLToPath(import.meta.url));
const builds = [
  ['mobile', path.resolve(here, '../index.html')],
  ['desktop', path.resolve(here, '../../friday_app_2026-07-12.html')],
];

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /publishWidgetSnapshot\(now,\s*suggestion\);\s*scheduleNextWaveContextRefresh\(now\);/,
    `${label}: rendering the authoritative Next Wave state publishes before scheduling its refresh`);

  const calls = [];
  const now = new Date('2026-09-30T12:00:00');
  const context = {
    Date, Intl, Promise,
    window:{ WavelengthNative:{ isNative:true, widgets:{ publish:snapshot => { calls.push(snapshot); return Promise.resolve({ bytesWritten:1 }); } } } },
    HABITS:[
      { id:'daily', icon:'🌊', text:'Daily habit', targetLabel:'', measurement:'check' },
      { id:'other-day', icon:'🌙', text:'Not today', targetLabel:'', measurement:'check', days:[4] },
    ],
    state:{ done:{ '2026-09-30':{} }, progress:{ '2026-09-30':{} } },
    userOrder:['other-day','daily'],
    rhythmWeatherData:{ hourlyForecastFetchedAt:now.getTime() },
    FORECAST_COPY_MAX_AGE_MS:90 * 60 * 1000,
    COMPLETION_CUE_WINDOW_MS:15 * 60 * 1000,
    recentCompletionCue:null,
    recentNextWaveProgressCue:null,
    getPreferenceWindowsMap:() => ({}),
    getNextWaveRefreshDelay:() => 15 * 60 * 1000,
  };
  vm.createContext(context);
  const names = [
    'dateKey', 'normalizeHabitDays', 'isHabitScheduledOn', 'getScheduledHabits',
    'normalizeMeasurementConfig', 'getHabitProgress', 'isHabitProgressComplete',
    'buildWidgetSnapshot', 'getWidgetSnapshotExpiry', 'getWidgetSuggestionFreshUntil',
    'getWidgetTransientCueDeadline', 'publishWidgetSnapshot',
  ];
  vm.runInContext(`${names.map(name => extractFunction(html, name)).join('\n')}\nthis.publishWidgetSnapshot = publishWidgetSnapshot;`, context);

  const suggestion = {
    reason:'forecast-conditions', icon:'🌊', eyebrow:'Suggested now', habitId:'daily',
    title:'Daily habit', targetLabel:'', detail:'Rain chance 60%',
  };
  Object.defineProperty(suggestion, 'forecastEvidence', { value:{ acquiredAt:now.getTime() }, enumerable:false });
  const snapshot = context.publishWidgetSnapshot(now, suggestion);
  await Promise.resolve();

  assert.equal(calls.length, 1, `${label}: one native publication occurs`);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), JSON.parse(JSON.stringify(snapshot)), `${label}: published bytes match returned snapshot`);
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.dayKey, '2026-09-30');
  assert.equal(snapshot.expiresAt, '2026-10-01T04:00:00.000Z');
  assert.equal(snapshot.nextRefreshAt, '2026-09-30T16:15:00.000Z');
  assert.equal(snapshot.nextWave.state, 'forecast-conditions');
  assert.equal(snapshot.nextWave.freshUntil, '2026-09-30T16:15:00.000Z');
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.habits.map(habit => habit.id))), ['daily'], `${label}: only habits scheduled today are shared`);

  context.getNextWaveRefreshDelay = () => 2 * 60 * 60 * 1000;
  context.recentCompletionCue = {
    habitId:'meal',
    dateKey:'2026-09-30',
    completedAt:now.getTime() - 5 * 60 * 1000,
  };
  const completionCueSnapshot = context.publishWidgetSnapshot(now, {
    reason:'completion-cue', eyebrow:'An easy next step', habitId:'daily',
    title:'Daily habit', targetLabel:'', detail:'Meal is done. Choose a helpful next step.',
  });
  assert.equal(completionCueSnapshot.nextRefreshAt, '2026-09-30T16:10:00.000Z',
    `${label}: persisted refresh metadata expires with the 15-minute completion cue`);
  assert.equal(completionCueSnapshot.nextWave.freshUntil, '2026-09-30T16:10:00.000Z',
    `${label}: completion-cue recommendation fails closed if the app is suspended`);

  context.recentCompletionCue = null;
  context.recentNextWaveProgressCue = {
    habitId:'daily',
    dateKey:'2026-09-30',
    actedAt:now.getTime() - 30 * 60 * 1000,
  };
  const progressCueSnapshot = context.publishWidgetSnapshot(now, {
    reason:'progress-pause', eyebrow:'Progress made', habitId:'',
    title:'Nice work taking a step.', targetLabel:'', detail:'Give it some room before the next nudge.',
  });
  assert.equal(progressCueSnapshot.nextRefreshAt, '2026-09-30T16:30:00.000Z',
    `${label}: persisted refresh metadata expires with the 60-minute progress cue`);
  assert.equal(progressCueSnapshot.nextWave.freshUntil, '2026-09-30T16:30:00.000Z',
    `${label}: progress-pause recommendation fails closed if the app is suspended`);

  const browserResult = context.publishWidgetSnapshot(now, suggestion, { isNative:false, widgets:null });
  assert.equal(browserResult, null, `${label}: browser/PWA publication is a no-op`);
  assert.equal(calls.length, 3, `${label}: browser/PWA does not touch native storage`);
}

console.log('widget live publication regression checks passed');
