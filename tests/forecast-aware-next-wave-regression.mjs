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
  const opportunityPolicy = html.match(/const OPPORTUNITY_WINDOW_POLICY\s*=\s*Object\.freeze\(\{[\s\S]*?\}\);/);
  assert.ok(opportunityPolicy, 'OPPORTUNITY_WINDOW_POLICY is missing');
  const freshnessPolicy = html.match(/const FORECAST_COPY_MAX_AGE_MS\s*=\s*[^;]+;/);
  assert.ok(freshnessPolicy, 'FORECAST_COPY_MAX_AGE_MS is missing');
  const rhythmPrelude = html.match(/const RHYTHM_TYPES\s*=\s*[^;]+;/);
  assert.ok(rhythmPrelude, 'rhythm constants are missing');
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
    'parseDisplayClockMinutes',
    'getDaylightState',
    'getEffectiveRecommendationContext',
    'evaluateOpportunityWindows',
    'getHabitRecommendationFit',
    'getHabitAdaptiveSuggestion',
    'isHourlyForecastFresh',
    'getFreshEnvironmentalSnapshot',
    'formatForecastClock',
    'getForecastAwareOutdoorSuggestion',
    'getNextWaveRefreshDelay',
    'createNextWaveProgressCue',
    'isNextWaveProgressCueActive',
    'getNextWaveSuggestion',
  ];
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${opportunityPolicy[0]}\n${freshnessPolicy[0]}\n${rhythmPrelude[0]}\n` +
    `${names.map(name => extractFunction(html, name)).join('\n')}\n` +
    `globalThis.exports = { ${names.join(', ')} };`,
    context,
  );
  return context.exports;
}

function loadDefaultHabits(html) {
  const match = html.match(/const DEFAULT_HABITS = (\[[\s\S]*?\n\]);/);
  assert.ok(match, 'default habits are missing');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${match[0]}\nglobalThis.defaults = DEFAULT_HABITS;`, context);
  return context.defaults;
}

function executeScheduleExpiryProbe(html) {
  const context = {
    nextWaveContextTimer:null,
    HABITS:[],
    rhythmWeatherData:{ hourlyForecastFetchedAt:1 },
    getPreferenceWindowsMap:() => ({}),
    getNextWaveRefreshDelay:() => 50,
    clearTimeout:() => {},
    setTimeout(callback, delay) {
      context.callback = callback;
      context.delay = delay;
      return 1;
    },
    isHourlyForecastFresh:() => false,
    renderInsights:() => { context.insightsRenders += 1; },
    renderNextWave:() => { context.nextWaveRenders += 1; },
    insightsRenders:0,
    nextWaveRenders:0,
  };
  vm.createContext(context);
  vm.runInContext(`${extractFunction(html, 'scheduleNextWaveContextRefresh')}\nscheduleNextWaveContextRefresh(new Date());`, context);
  assert.equal(context.delay, 50, 'the production scheduler installs its bounded refresh callback');
  assert.equal(typeof context.callback, 'function', 'the production scheduler exposes an executable timer callback');
  context.callback();
  return { insightsRenders:context.insightsRenders, nextWaveRenders:context.nextWaveRenders };
}

const plain = value => JSON.parse(JSON.stringify(value));
const atTime = (hour, minute = 0, second = 0) => new Date(2026, 8, 30, hour, minute, second, 0);
const time = hour => `2026-09-30T${String(hour).padStart(2, '0')}:00`;
const doneFor = (date, ids) => ({
  [`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`]:
    Object.fromEntries(ids.map(id => [id, true])),
});

function weatherData(now, rows, extra = {}) {
  return {
    sunrise:'6:58 AM',
    sunset:'8:00 PM',
    isDay:true,
    hourlyForecastFetchedAt:now.getTime(),
    hourlyForecast:{
      timezone:'America/New_York',
      entries:rows.map(([hour, apparentTemperature, uv, precipitationProbability, isDay, aqi]) => ({
        time:time(hour), apparentTemperature, uv, precipitationProbability, isDay, aqi,
      })),
    },
    ...extra,
  };
}

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const {
    evaluateOpportunityWindows,
    getForecastAwareOutdoorSuggestion,
    getFreshEnvironmentalSnapshot,
    isHourlyForecastFresh,
    getNextWaveRefreshDelay,
    getNextWaveSuggestion,
  } = loadFunctions(html);
  const habits = loadDefaultHabits(html);
  const beach = habits.find(habit => habit.id === 'beach');
  const daylight = habits.find(habit => habit.id === 'daylight');
  const sunscreen = habits.find(habit => habit.id === 'sunscreen');
  const cardio = habits.find(habit => habit.id === 'cardio');
  const dinner = habits.find(habit => habit.id === 'dinner');
  const floss = habits.find(habit => habit.id === 'floss');
  const now = atTime(16, 7);
  const baseRows = [
    [16, 82, 2, 20, true, 43],
    [17, 82, 2, 20, true, 43],
    [18, 82, 2, 20, true, 43],
    [19, 82, 2, 20, true, 43],
  ];
  const baseData = weatherData(now, baseRows, { aqi:43 });

  assert.ok(evaluateOpportunityWindows(daylight, atTime(8, 7), weatherData(atTime(8, 7), [
    [8, 80, 2, 20, true, 40], [9, 81, 3, 20, true, 40], [10, 82, 4, 20, true, 40],
  ])).candidates.length > 0, `${label}: morning daylight participates because it is truly outdoor`);
  assert.ok(evaluateOpportunityWindows(sunscreen, atTime(8, 7), weatherData(atTime(8, 7), [
    [8, 80, 4, 20, true, 40], [9, 81, 4, 20, true, 40], [10, 82, 4, 20, true, 40],
  ])).candidates.length > 0, `${label}: sun protection participates despite living in Hygiene`);
  assert.deepEqual(plain(evaluateOpportunityWindows(cardio, now, baseData).candidates), [],
    `${label}: an either-setting habit is not silently treated as outdoor`);

  const rainImproves = weatherData(now, [
    [16, 82, 2, 80, true, 43],
    [17, 82, 2, 80, true, 43],
    [18, 82, 2, 30, true, 43],
    [19, 82, 2, 30, true, 43],
  ], { aqi:43 });
  assert.deepEqual(plain(getNextWaveSuggestion([beach], {}, {}, now, rainImproves)), {
    habitId:'beach', category:'movement', icon:'🌊', reason:'forecast-window', eyebrow:'Better window ahead',
    title:'Outdoor walk or movement', targetLabel:'',
    detail:'Rain chance drops to 30% around 6:00 PM.', action:'View habit',
  }, `${label}: movement names a materially drier later window without calling it the best time`);

  const coolerAndDrier = weatherData(now, [
    [16, 90, 2, 80, true, 43],
    [17, 90, 2, 80, true, 43],
    [18, 84, 2, 30, true, 43],
    [19, 84, 2, 30, true, 43],
  ], { aqi:43 });
  assert.equal(getNextWaveSuggestion([beach], {}, {}, now, coolerAndDrier).detail,
    'Feels like 84°F · Rain chance 30% around 6:00 PM.',
    `${label}: a combined material improvement stays concise without dropping either reason`);

  const airRecovery = weatherData(now, [
    [16, 82, 2, 20, true, 121],
    [17, 82, 2, 20, true, 121],
    [18, 82, 2, 20, true, 43],
    [19, 82, 2, 20, true, 43],
  ]);
  assert.equal(getNextWaveSuggestion([beach], {}, {}, now, airRecovery).detail,
    'Air may be more favorable around 6:00 PM.',
    `${label}: a forecast-only AQI recovery avoids claiming a precise future category`);

  const morning = atTime(7, 7);
  const coolerMorning = weatherData(morning, [
    [7, 92, 2, 20, true, 40],
    [8, 84, 2, 20, true, 40],
    [9, 84, 2, 20, true, 40],
    [10, 84, 2, 20, true, 40],
  ]);
  assert.deepEqual(plain(getNextWaveSuggestion([daylight], {}, {}, morning, coolerMorning)), {
    habitId:'daylight', category:'morning', icon:'🌤️', reason:'forecast-window', eyebrow:'Better window ahead',
    title:'Get outdoor light after waking', targetLabel:'',
    detail:'Feels like 84°F around 8:00 AM.', action:'View habit',
  }, `${label}: morning light can use a materially cooler later window before urgency begins`);

  const laterThanMorningCue = atTime(8, 7);
  const tooLateToDefer = weatherData(laterThanMorningCue, [
    [8, 92, 2, 20, true, 40],
    [9, 92, 2, 20, true, 40],
    [10, 84, 2, 20, true, 40],
    [11, 84, 2, 20, true, 40],
  ]);
  assert.deepEqual(plain(getNextWaveSuggestion([daylight], {}, {}, laterThanMorningCue, tooLateToDefer)), {
    habitId:'daylight', category:'morning', icon:'🌤️', reason:'sunrise-light', eyebrow:'Suggested now',
    title:'Get outdoor light after waking', targetLabel:'',
    detail:'Sunrise today · 6:58 AM', action:'View habit',
  }, `${label}: a later weather improvement cannot defer morning light beyond its urgency boundary`);

  const sunTime = atTime(8, 7);
  const forecastUv = weatherData(sunTime, [
    [8, 80, 4, 20, true, undefined],
    [9, 81, 4, 20, true, undefined],
    [10, 82, 4, 20, true, undefined],
  ], { uv:null });
  assert.deepEqual(plain(getNextWaveSuggestion([sunscreen], {}, {}, sunTime, forecastUv)), {
    habitId:'sunscreen', category:'hygiene', icon:'🧴', reason:'forecast-uv', eyebrow:'Suggested now',
    title:'Sun protection before outdoor time', targetLabel:'',
    detail:'Forecast UV 4 · Protect before going out.', action:'View habit',
  }, `${label}: sun protection can use a fresh hourly UV forecast without treating two minutes as outdoor exposure`);
  assert.deepEqual(plain(getNextWaveSuggestion([sunscreen], {}, {}, sunTime, { ...forecastUv, uv:4 })), {
    habitId:'sunscreen', category:'hygiene', icon:'🧴', reason:'uv-protect', eyebrow:'Suggested now',
    title:'Sun protection before outdoor time', targetLabel:'',
    detail:'UV 4 · Protection matters now', action:'View habit',
  }, `${label}: a live UV reading keeps the established current-condition copy`);
  assert.deepEqual(plain(getNextWaveSuggestion([sunscreen, beach], {}, {}, sunTime, {
    ...forecastUv,
    aqi:43,
  })), {
    habitId:'beach', category:'movement', icon:'🌊', reason:'aqi-opportunity', eyebrow:'Suggested now',
    title:'Outdoor walk or movement', targetLabel:'', detail:'Good air quality · AQI 43', action:'View habit',
  }, `${label}: sunscreen forecast copy cannot displace the selector's fresh observed AQI opportunity`);

  const softRain = weatherData(now, baseRows.map(row => [row[0], 82, 2, 60, true, 43]), { aqi:43 });
  assert.equal(getNextWaveSuggestion([beach], {}, {}, now, softRain).detail, 'Rain chance 60%',
    `${label}: a soft rain probability stays a secondary modifier`);
  const strongRain = weatherData(now, baseRows.map(row => [row[0], 82, 2, 75, true, 43]), { aqi:43 });
  assert.equal(getNextWaveSuggestion([beach], {}, {}, now, strongRain).detail,
    'Rain chance 75% · Keep plans flexible.',
    `${label}: strong rain probability remains honest and does not claim observed rain`);
  const hot = weatherData(now, baseRows.map(row => [row[0], 90, 2, 20, true, 43]), { aqi:43 });
  assert.equal(getNextWaveSuggestion([beach], {}, {}, now, hot).detail, 'Feels like 90°F · Keep it easy.',
    `${label}: movement gets a concise heat modifier`);
  const hotMorning = weatherData(atTime(8, 7), [
    [8, 90, 2, 20, true, 43], [9, 90, 2, 20, true, 43], [10, 90, 2, 20, true, 43],
  ]);
  assert.equal(getNextWaveSuggestion([daylight], {}, {}, atTime(8, 7), hotMorning).detail,
    'Feels like 90°F · Keep it brief.',
    `${label}: morning-light heat copy respects the shorter exposure habit`);
  const hotAndWet = weatherData(now, baseRows.map(row => [row[0], 90, 2, 75, true, 43]), { aqi:43 });
  assert.equal(getNextWaveSuggestion([beach], {}, {}, now, hotAndWet).detail,
    'Feels like 90°F · Rain chance 75%.',
    `${label}: current heat and rain show at most two concise forecast facts`);
  const highUv = weatherData(now, baseRows.map(row => [row[0], 82, 6, 20, true, 43]), { aqi:43 });
  assert.equal(getNextWaveSuggestion([beach], {}, {}, now, highUv).detail, 'UV 6 · Protection still matters.',
    `${label}: movement can carry UV context after the separate protection habit is no longer open`);

  const stale = { ...rainImproves, hourlyForecastFetchedAt:now.getTime() - (91 * 60 * 1000) };
  assert.equal(isHourlyForecastFresh(rainImproves, now), true,
    `${label}: a just-acquired hourly forecast is fresh`);
  assert.equal(isHourlyForecastFresh(stale, now), false,
    `${label}: forecast copy expires after its bounded freshness window`);
  const staleCurrent = {
    ...rainImproves,
    hourlyForecastFetchedAt:now.getTime() - (91 * 60 * 1000),
    uv:4,
    aqi:121,
    feel:96,
    weatherObservedAt:now.getTime() - (91 * 60 * 1000),
    aqiObservedAt:now.getTime() - (91 * 60 * 1000),
  };
  assert.deepEqual(plain(getFreshEnvironmentalSnapshot(staleCurrent, now)), {
    hourlyForecast:staleCurrent.hourlyForecast,
    hourlyForecastFetchedAt:staleCurrent.hourlyForecastFetchedAt,
  }, `${label}: weather and air readings expire with the forecast instead of surviving as stale current guidance`);
  assert.deepEqual(plain(getFreshEnvironmentalSnapshot({
    uv:4, feel:96, isDay:true, sunrise:'6:58 AM', sunset:'8:00 PM',
    weatherObservedAt:now.getTime() + 60 * 1000,
    aqi:43, aqiObservedAt:now.getTime(),
  }, now)), { aqi:43, aqiObservedAt:now.getTime() },
  `${label}: future weather observations fail closed without discarding fresh AQI`);
  assert.deepEqual(plain(getFreshEnvironmentalSnapshot({
    uv:4, weatherObservedAt:now.getTime(),
    aqi:121, aqiObservedAt:now.getTime() + 60 * 1000,
  }, now)), { uv:4, weatherObservedAt:now.getTime() },
  `${label}: future AQI observations fail closed without discarding fresh weather`);
  assert.notEqual(getNextWaveSuggestion([sunscreen], {}, {}, sunTime, {
    ...forecastUv,
    uv:4,
    weatherObservedAt:sunTime.getTime() - (91 * 60 * 1000),
    hourlyForecastFetchedAt:sunTime.getTime() - (91 * 60 * 1000),
  }).reason, 'uv-protect', `${label}: stale live UV cannot keep publishing current protection guidance`);
  assert.notEqual(getNextWaveSuggestion([beach], {}, {}, now, staleCurrent).reason, 'aqi-adapt',
    `${label}: stale current AQI cannot keep publishing an indoor adaptation`);
  assert.deepEqual(plain(getNextWaveSuggestion([beach], {}, {}, now, stale)), {
    habitId:'beach', category:'movement', icon:'🌊', reason:'aqi-opportunity', eyebrow:'Suggested now',
    title:'Outdoor walk or movement', targetLabel:'', detail:'Good air quality · AQI 43', action:'View habit',
  }, `${label}: stale hourly data falls back to exact current-condition behavior`);
  assert.deepEqual(plain(getNextWaveSuggestion([beach], {}, {}, now, { aqi:43, isDay:true })), {
    habitId:'beach', category:'movement', icon:'🌊', reason:'aqi-opportunity', eyebrow:'Suggested now',
    title:'Outdoor walk or movement', targetLabel:'', detail:'Good air quality · AQI 43', action:'View habit',
  }, `${label}: missing hourly data never suppresses the existing useful fallback`);
  assert.notEqual(getNextWaveSuggestion([{ ...beach, rhythm:null }], {}, {}, now, rainImproves).reason,
    'forecast-window', `${label}: explicit anchor opt-out suppresses visible forecast language`);

  const dinnerTime = atTime(18, 10);
  const dinnerForecast = weatherData(dinnerTime, [
    [18, 82, 2, 80, true, 43], [19, 82, 2, 30, true, 43], [20, 82, 1, 30, false, 43],
  ], { aqi:43 });
  assert.equal(getNextWaveSuggestion([beach, dinner], {}, {}, dinnerTime, dinnerForecast).habitId, 'dinner',
    `${label}: a closing dinner window still outranks forecast copy`);

  const cueTime = atTime(16, 7);
  const breakfastCue = {
    habitId:'breakfast', dateKey:'2026-09-30', completedAt:cueTime.getTime() - 60 * 1000,
  };
  assert.equal(getNextWaveSuggestion(
    [beach, floss], doneFor(cueTime, ['breakfast']), {}, cueTime, rainImproves, breakfastCue,
  ).reason, 'completion-cue', `${label}: a fresh completion cue still outranks forecast copy`);

  const poorAir = weatherData(now, [
    [16, 82, 2, 20, true, 121], [17, 82, 2, 20, true, 121],
    [18, 82, 2, 20, true, 43], [19, 82, 2, 20, true, 43],
  ], { aqi:121 });
  assert.equal(getNextWaveSuggestion([beach], {}, {}, now, poorAir).reason, 'aqi-adapt',
    `${label}: the immediate poor-air adaptation outranks a forecast recovery`);

  assert.deepEqual(plain(getForecastAwareOutdoorSuggestion(beach, now, stale)), null,
    `${label}: the forecast helper itself rejects stale data`);
  assert.deepEqual(plain(getForecastAwareOutdoorSuggestion(beach, now, {
    ...rainImproves,
    hourlyForecast:{ ...rainImproves.hourlyForecast, timezone:'America/Los_Angeles' },
  })), null, `${label}: forecast copy fails closed when the device and forecast timezones differ`);
  assert.equal(getNextWaveRefreshDelay([beach], atTime(16, 7, 30), baseData), 450050,
    `${label}: fresh forecast copy refreshes just after the next quarter-hour candidate boundary`);

  assert.doesNotMatch(html, /const CONTEXT_INSIGHT_REASONS = new Set\([^\n]*(forecast-window|forecast-conditions|forecast-uv)/,
    `${label}: forecast copy does not masquerade as observed-condition evidence`);
  assert.doesNotMatch(html, /localStorage[^\n]*(hourlyForecast|betterWindow)|(hourlyForecast|betterWindow)[^\n]*localStorage/,
    `${label}: forecast timelines and opportunity output remain runtime-only`);
  assert.match(html, /visibilitychange[\s\S]{0,400}renderInsights\(visibilityNow\)/,
    `${label}: resuming with stale forecast data can trigger a refetch`);
  assert.match(html, /pageshow[\s\S]{0,300}renderInsights\(pageShowNow\)/,
    `${label}: pageshow recovery can refresh stale forecast data`);
  assert.match(extractFunction(html, 'scheduleNextWaveContextRefresh'), /isHourlyForecastFresh[\s\S]*renderInsights\(/,
    `${label}: the foreground forecast-expiry timer refetches instead of merely rerendering stale readings`);
  assert.deepEqual(executeScheduleExpiryProbe(html), { insightsRenders:1, nextWaveRenders:0 },
    `${label}: crossing the production timer callback refetches stale environmental data`);
}

console.log('Forecast-aware Next Wave copy regression tests passed for mobile and desktop');
