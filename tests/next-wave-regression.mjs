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

function loadFunctions(html) {
  const names = [
    'normalizeMeasurementConfig',
    'getHabitProgress',
    'isHabitProgressComplete',
    'dateKey',
    'normalizeHabitDays',
    'isHabitScheduledOn',
    'getScheduledHabits',
    'isConciseRhythmNote',
    'normalizeRhythmConfig',
    'getAqiCategory',
    'mergeRhythmWeatherData',
    'getNextDateRolloverDelay',
    'getNextWaveSuggestion',
  ];
  const rhythmPrelude = html.match(/const RHYTHM_TYPES\s*=\s*[^;]+;/);
  assert.ok(rhythmPrelude, 'rhythm constants are missing');
  const generationPrelude = html.match(/let rhythmWeatherGeneration\s*=\s*0;/);
  assert.ok(generationPrelude, 'rhythm weather generation counter is missing');
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${rhythmPrelude[0]}\n${names.map(name => extractFunction(html, name)).join('\n')}\n` +
    `globalThis.exports = { ${names.join(', ')} };`,
    context,
  );
  return context.exports;
}

const baseHabits = [
  { id:'daylight', cat:'morning', icon:'🌤️', text:'Get outdoor light after waking', note:'Morning light', rhythm:{ type:'sunrise' } },
  { id:'hydrate', cat:'morning', icon:'💧', text:'Drink 16 oz water', note:'Water first', measurement:'amount', target:48, step:16, unit:'oz', rhythm:{ type:'temp-above', threshold:85, note:'Drink extra water' } },
  { id:'beach', cat:'movement', icon:'🌊', text:'Outdoor walk or movement', note:'Walk or roll', rhythm:{ type:'aqi-below', threshold:100 } },
  { id:'sunscreen', cat:'hygiene', icon:'🧴', text:'Sun protection before outdoor time', note:'Protect your skin', rhythm:{ type:'uv-above', threshold:3, note:'Use sun protection' } },
  { id:'meditate', cat:'mind', icon:'🧠', text:'Meditate 10 min', note:'Breath focus' },
  { id:'winddown', cat:'evening', icon:'🌙', text:'No screens 30 min before bed', note:'Settle down' },
];

const atHour = hour => new Date(2026, 7, 28, hour, 0, 0, 0);
const doneFor = (date, ids) => ({
  [`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`]: Object.fromEntries(ids.map(id => [id, true])),
});
const plain = value => JSON.parse(JSON.stringify(value));

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const { getNextWaveSuggestion, mergeRhythmWeatherData, getNextDateRolloverDelay } = loadFunctions(html);

  const morning = atHour(8);
  const emptyDone = doneFor(morning, []);

  assert.deepEqual(
    plain(getNextWaveSuggestion(baseHabits, emptyDone, {}, morning, { aqi:121, uv:4, feel:96, sunrise:'6:58 AM' })),
    {
      habitId:'beach', category:'movement', icon:'🌊', eyebrow:'Adapt today',
      title:"If you're sensitive to air quality, move indoors today.",
      detail:'Unhealthy for sensitive groups · AQI 121', action:'View habit',
    },
    `${label}: unfavorable AQI adapts an incomplete outdoor habit before other cues`,
  );

  assert.equal(
    getNextWaveSuggestion(baseHabits, emptyDone, {}, morning, { aqi:160, uv:1 })?.title,
    'Move today’s activity indoors.',
    `${label}: unhealthy AQI gives a direct indoor adaptation`,
  );

  assert.deepEqual(
    plain(getNextWaveSuggestion(baseHabits, emptyDone, {}, morning, { aqi:43, uv:4, feel:96, sunrise:'6:58 AM' })),
    {
      habitId:'sunscreen', category:'hygiene', icon:'🧴', eyebrow:'Suggested now',
      title:'Use sun protection before heading out.', detail:'UV 4 · Sun protection matters now', action:'View habit',
    },
    `${label}: active UV protection takes priority before an outdoor recommendation`,
  );

  assert.deepEqual(
    plain(getNextWaveSuggestion(baseHabits, doneFor(morning, ['sunscreen']), {}, morning, { aqi:43, uv:4, feel:96, sunrise:'6:58 AM' })),
    {
      habitId:'daylight', category:'morning', icon:'🌤️', eyebrow:'Suggested now',
      title:'Step outside for your morning light.', detail:'Sunrise today · 6:58 AM', action:'View habit',
    },
    `${label}: morning light is offered near the start of the day when still incomplete`,
  );

  assert.deepEqual(
    plain(getNextWaveSuggestion(baseHabits, doneFor(morning, ['sunscreen','daylight']), {}, morning, { aqi:43, uv:4, feel:96, sunrise:'6:58 AM' })),
    {
      habitId:'beach', category:'movement', icon:'🌊', eyebrow:'Suggested now',
      title:'Now is a good time for your outdoor walk.', detail:'Good air quality · AQI 43', action:'View habit',
    },
    `${label}: favorable AQI connects directly to the incomplete outdoor habit`,
  );

  assert.equal(
    getNextWaveSuggestion(baseHabits, doneFor(morning, ['sunscreen','daylight']), {}, morning, { aqi:78, uv:1 })?.title,
    'Outdoor movement could fit now.',
    `${label}: moderate AQI uses appropriately cautious opportunity copy`,
  );

  assert.deepEqual(
    plain(getNextWaveSuggestion(baseHabits, doneFor(morning, ['sunscreen','daylight','beach']), {}, morning, { aqi:43, uv:4, feel:96 })),
    {
      habitId:'hydrate', category:'morning', icon:'💧', eyebrow:'Suggested now',
      title:'Have your next glass of water.', detail:'Feels like 96°F', action:'View habit',
    },
    `${label}: heat amplifies an incomplete hydration habit after higher priorities are covered`,
  );

  assert.equal(
    getNextWaveSuggestion(baseHabits, doneFor(morning, ['sunscreen','daylight','beach']), { '2026-08-28':{ hydrate:48 } }, morning, { feel:96 })?.habitId,
    'meditate',
    `${label}: measured habits at target are not recommended again`,
  );

  assert.deepEqual(
    plain(getNextWaveSuggestion(baseHabits, doneFor(morning, ['daylight']), {}, morning, null)),
    {
      habitId:'hydrate', category:'morning', icon:'💧', eyebrow:'A simple next step',
      title:'Start with your water habit.', detail:'A calm way to begin the day.', action:'View habit',
    },
    `${label}: missing location still yields a helpful morning habit rather than technical fallback copy`,
  );

  const afternoon = atHour(14);
  assert.deepEqual(
    plain(getNextWaveSuggestion(baseHabits, doneFor(afternoon, ['daylight','hydrate','beach','sunscreen']), {}, afternoon, null)),
    {
      habitId:'meditate', category:'mind', icon:'🧠', eyebrow:'Your next small win',
      title:'Meditate 10 min', detail:'One open habit that fits this part of your day.', action:'View habit',
    },
    `${label}: a time-relevant incomplete habit becomes the fallback`,
  );

  const evening = atHour(20);
  assert.equal(
    getNextWaveSuggestion(baseHabits, doneFor(evening, ['daylight','hydrate','beach','sunscreen','meditate']), {}, evening, null)?.habitId,
    'winddown',
    `${label}: evening fallback prefers an evening habit`,
  );

  const allDone = doneFor(afternoon, baseHabits.map(habit => habit.id));
  assert.deepEqual(
    plain(getNextWaveSuggestion(baseHabits, allDone, {}, afternoon, { aqi:43, uv:4, feel:96 })),
    {
      habitId:null, category:null, icon:'✓', eyebrow:'You’re caught up',
      title:'Today’s habits are complete.', detail:'You followed through on every scheduled habit.', action:null,
    },
    `${label}: completed habits are never recommended and all-done copy is calm`,
  );

  const monday = new Date(2026, 7, 31, 8, 0, 0, 0);
  const weekendBeach = baseHabits.map(habit => habit.id === 'beach' ? { ...habit, days:[0,6] } : habit);
  assert.notEqual(
    getNextWaveSuggestion(weekendBeach, doneFor(monday, ['sunscreen','daylight']), {}, monday, { aqi:43, uv:1 })?.habitId,
    'beach',
    `${label}: an unscheduled habit is never recommended`,
  );

  const optedOutBeach = baseHabits.map(habit => habit.id === 'beach' ? { ...habit, rhythm:null } : habit);
  assert.notEqual(
    getNextWaveSuggestion(optedOutBeach, doneFor(morning, ['sunscreen','daylight']), {}, morning, { aqi:43, uv:1 })?.title,
    'Now is a good time for your outdoor walk.',
    `${label}: explicit No anchor prevents environmental opportunity copy`,
  );

  const optedOutDaylight = baseHabits.map(habit => habit.id === 'daylight' ? { ...habit, rhythm:null } : habit);
  const daylightOptOutSuggestion = getNextWaveSuggestion(
    optedOutDaylight,
    doneFor(morning, ['sunscreen']),
    {},
    morning,
    { sunrise:'7:00 AM', uv:1 },
  );
  assert.notEqual(daylightOptOutSuggestion?.title, 'Step outside for your morning light.', `${label}: explicit daylight No anchor suppresses sunrise opportunity copy`);
  assert.doesNotMatch(daylightOptOutSuggestion?.detail || '', /Sunrise/, `${label}: daylight No anchor suppresses sunrise detail`);

  const loose150 = baseHabits.map(habit => habit.id === 'beach' ? { ...habit, rhythm:{ type:'aqi-below', threshold:150 } } : habit);
  const loose200 = baseHabits.map(habit => habit.id === 'beach' ? { ...habit, rhythm:{ type:'aqi-below', threshold:200 } } : habit);
  const outdoorReady = doneFor(morning, ['sunscreen','daylight']);
  assert.equal(
    getNextWaveSuggestion(loose150, outdoorReady, {}, morning, { aqi:121, uv:1 })?.title,
    "If you're sensitive to air quality, move indoors today.",
    `${label}: a loose custom threshold cannot override AQI sensitivity guidance`,
  );
  assert.equal(
    getNextWaveSuggestion(loose200, outdoorReady, {}, morning, { aqi:160, uv:1 })?.title,
    'Move today’s activity indoors.',
    `${label}: a loose custom threshold cannot create an outdoor opportunity in unhealthy air`,
  );

  const aqiMatrix = [
    [50, 'Now is a good time for your outdoor walk.', 'Good air quality · AQI 50'],
    [50.1, 'Outdoor movement could fit now.', 'Moderate air quality · AQI 50.1'],
    [100, 'Outdoor movement could fit now.', 'Moderate air quality · AQI 100'],
    [100.1, "If you're sensitive to air quality, move indoors today.", 'Unhealthy for sensitive groups · AQI 100.1'],
    [150, "If you're sensitive to air quality, move indoors today.", 'Unhealthy for sensitive groups · AQI 150'],
    [150.1, 'Move today’s activity indoors.', 'Unhealthy air quality · AQI 150.1'],
  ];
  for (const [aqi, title, detail] of aqiMatrix) {
    const suggestion = getNextWaveSuggestion(baseHabits, outdoorReady, {}, morning, { aqi, uv:1 });
    assert.equal(suggestion?.title, title, `${label}: AQI ${aqi} recommendation title`);
    assert.equal(suggestion?.detail, detail, `${label}: AQI ${aqi} recommendation detail`);
  }
  const negativeAqiSuggestion = getNextWaveSuggestion(baseHabits, outdoorReady, {}, morning, { aqi:-0.1, uv:1 });
  assert.doesNotMatch(negativeAqiSuggestion?.title || '', /outdoor walk|move indoors/i, `${label}: negative AQI cannot create environmental advice`);
  assert.doesNotMatch(negativeAqiSuggestion?.detail || '', /AQI/, `${label}: negative AQI stays out of supporting detail`);

  const strict50 = baseHabits.map(habit => habit.id === 'beach' ? { ...habit, rhythm:{ type:'aqi-below', threshold:50 } } : habit);
  const strictSuggestion = getNextWaveSuggestion(strict50, outdoorReady, {}, morning, { aqi:78, uv:1 });
  assert.notEqual(strictSuggestion?.title, 'Outdoor movement could fit now.', `${label}: a stricter custom threshold suppresses the moderate-air opportunity`);
  assert.doesNotMatch(strictSuggestion?.detail || '', /AQI/, `${label}: a stricter custom threshold does not imply unsafe air below AQI 101`);

  const noScheduled = baseHabits.map(habit => ({ ...habit, days:[1] }));
  assert.deepEqual(
    plain(getNextWaveSuggestion(noScheduled, emptyDone, {}, morning, { aqi:43, uv:4, feel:96 })),
    {
      habitId:null, category:null, icon:'○', eyebrow:'A quiet day',
      title:'No habits are scheduled today.', detail:'Use the space in whatever way feels restorative.', action:null,
    },
    `${label}: a no-scheduled day has a calm state and no action`,
  );

  assert.deepEqual(
    plain(mergeRhythmWeatherData(mergeRhythmWeatherData(null, { feel:96, uv:4 }), { aqi:43 })),
    { feel:96, uv:4, aqi:43 },
    `${label}: forecast-first context merge preserves AQI`,
  );
  assert.deepEqual(
    plain(mergeRhythmWeatherData(mergeRhythmWeatherData(null, { aqi:43 }), { feel:96, uv:4 })),
    { aqi:43, feel:96, uv:4 },
    `${label}: AQI-first context merge preserves forecast data`,
  );
  assert.equal(getNextDateRolloverDelay(new Date(2026, 7, 28, 23, 59, 59, 900)), 150, `${label}: rollover timer reaches just after local midnight`);
  assert.equal(getNextDateRolloverDelay(new Date(2026, 7, 28, 12, 0, 0, 0)), 43200050, `${label}: rollover timer uses the next local date`);

  assert.match(html, /function refreshForDateRollover\(/, `${label}: a stale open app can refresh when the date changes`);
  assert.match(html, /function scheduleNextDateRollover\(/, `${label}: the app schedules its next local-day refresh`);
  assert.match(html, /visibilitychange[\s\S]*refreshForDateRollover/, `${label}: foreground recovery checks for a missed rollover`);
  assert.match(html, /pageshow[\s\S]*refreshForDateRollover/, `${label}: restored pages check for a missed rollover`);
  assert.match(
    html,
    /function toggleHabit\(id\) \{\s*const now = new Date\(\);\s*const todayKey = dateKey\(now\);[\s\S]*getDailyHabitStats\(state\.done \|\| \{\}, HABITS, now, 5, state\.progress \|\| \{\}\)/,
    `${label}: toggleHabit uses one timestamp for mutation and statistics`,
  );

  assert.match(html, /function renderInsights\(now = new Date\(\)\)[\s\S]*const generation = \+\+rhythmWeatherGeneration/, `${label}: renderInsights uses a generation guard`);
  assert.match(html, /if \(generation !== rhythmWeatherGeneration\) return/, `${label}: superseded environmental responses are discarded before mutating shared state`);
  assert.match(html, /function refreshForDateRollover\(now = new Date\(\)\)[\s\S]*rhythmWeatherData = \{[\s\S]*feel:[\s\S]*uv:[\s\S]*aqi:[\s\S]*rhythmWeatherGeneration\+\+/, `${label}: rollover clears stale day-specific environmental data and bumps the generation`);
  assert.match(html, /function toggleHabit\(id\) \{\s*const now = new Date\(\);\s*const todayKey = dateKey\(now\);[\s\S]*renderHabits\(now\)/, `${label}: toggle threads its transaction timestamp through the rerender`);

  assert.match(html, /title\.textContent = suggestion\.title/, `${label}: recommendation titles render as text, not HTML`);
  assert.match(html, /detail\.textContent = suggestion\.detail/, `${label}: recommendation details render as text, not HTML`);
  assert.match(html, /id=["']nextWaveTitle["']/, `${label}: the Next Wave card exposes a primary action title`);
  assert.match(html, /id=["']nextWaveDetail["']/, `${label}: the Next Wave card keeps supporting conditions secondary`);
  assert.match(html, /id=["']nextWaveAction["']/, `${label}: the Next Wave card has a View habit action`);
  assert.match(html, /function renderNextWave\(/, `${label}: Next Wave rerenders from application state`);
  assert.match(html, /function focusNextWaveHabit\(/, `${label}: View habit can navigate to the suggested card`);
  assert.match(html, /renderHabits\(now\)[\s\S]*renderNextWave\(now\)/, `${label}: completing or changing a habit immediately advances Next Wave with the same timestamp`);
}

console.log('next wave regression tests passed for mobile and desktop');
