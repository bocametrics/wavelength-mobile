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

function loadNormalization(html) {
  const maxPoints = html.match(/const MAX_HOURLY_FORECAST_POINTS\s*=\s*50;/);
  assert.ok(maxPoints, 'the hourly forecast must have a defensive 50-point ceiling');
  const names = [
    'normalizeEnvironmentalReading',
    'normalizeHourlyForecastTimestamp',
    'normalizeHourlyForecast',
  ];
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${maxPoints[0]}\n${names.map(name => extractFunction(html, name)).join('\n')}\n` +
    `globalThis.exports = { ${names.join(', ')} };`,
    context,
  );
  return context.exports;
}

const plain = value => JSON.parse(JSON.stringify(value));

function hourlyTimes(count, day = 30) {
  return Array.from({ length:count }, (_, index) => {
    const date = new Date(Date.UTC(2026, 8, day, index));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}:00`;
  });
}

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const { normalizeHourlyForecastTimestamp, normalizeHourlyForecast } = loadNormalization(html);

  assert.equal(normalizeHourlyForecastTimestamp('2026-09-30T08:00'), '2026-09-30T08:00',
    `${label}: a canonical local hourly timestamp is retained`);
  for (const badTimestamp of [
    '2026-9-30T08:00', '2026-09-31T08:00', '2026-09-30T24:00',
    '2026-09-30T08:30', '2026-09-30T08:00Z', '', null, 123,
  ]) {
    assert.equal(normalizeHourlyForecastTimestamp(badTimestamp), null,
      `${label}: malformed hourly timestamp ${String(badTimestamp)} is rejected`);
  }

  const weather = {
    timezone:'America/New_York',
    hourly:{
      time:['2026-09-30T08:00', '2026-09-30T09:00', '2026-09-30T10:00'],
      apparent_temperature:[80, 81.5, 82],
      uv_index:[1, 2.25, 3],
      is_day:[1, 1, 1],
      precipitation_probability:[20, 65, 80],
    },
  };
  const aqi = {
    timezone:'America/New_York',
    hourly:{
      time:['2026-09-30T09:00', '2026-09-30T08:00', '2026-09-30T11:00'],
      us_aqi:[55, 45, 65],
    },
  };
  assert.deepEqual(plain(normalizeHourlyForecast(weather, aqi)), {
    timezone:'America/New_York',
    entries:[
      { time:'2026-09-30T08:00', apparentTemperature:80, uv:1, isDay:true, precipitationProbability:20, aqi:45 },
      { time:'2026-09-30T09:00', apparentTemperature:81.5, uv:2.25, isDay:true, precipitationProbability:65, aqi:55 },
      { time:'2026-09-30T10:00', apparentTemperature:82, uv:3, isDay:true, precipitationProbability:80 },
      { time:'2026-09-30T11:00', aqi:65 },
    ],
  }, `${label}: weather and AQI join by timestamp rather than array position`);

  const malformedFields = {
    timezone:'America/New_York',
    hourly:{
      time:['2026-09-30T08:00', '2026-09-30T09:00', '2026-09-30T10:00'],
      apparent_temperature:[75, 76],
      uv_index:[-1, 4, '5'],
      is_day:[1, 2, 0],
      precipitation_probability:[101, 50, -1],
    },
  };
  assert.deepEqual(plain(normalizeHourlyForecast(malformedFields, null)), {
    timezone:'America/New_York',
    entries:[
      { time:'2026-09-30T08:00', isDay:true },
      { time:'2026-09-30T09:00', uv:4, precipitationProbability:50 },
      { time:'2026-09-30T10:00', isDay:false },
    ],
  }, `${label}: malformed field arrays and readings are rejected without discarding valid fields`);

  const duplicateWeather = {
    timezone:'America/New_York',
    hourly:{
      time:['2026-09-30T08:00', '2026-09-30T08:00'],
      apparent_temperature:[70, 99],
    },
  };
  assert.deepEqual(plain(normalizeHourlyForecast(duplicateWeather, aqi)), {
    timezone:'America/New_York',
    entries:[
      { time:'2026-09-30T08:00', aqi:45 },
      { time:'2026-09-30T09:00', aqi:55 },
      { time:'2026-09-30T11:00', aqi:65 },
    ],
  }, `${label}: an ambiguous weather timestamp rejects only that channel`);

  const malformedWeather = {
    timezone:'America/New_York',
    hourly:{ time:['2026-09-30T08:30'], apparent_temperature:[72] },
  };
  assert.deepEqual(plain(normalizeHourlyForecast(malformedWeather, aqi)), {
    timezone:'America/New_York',
    entries:[
      { time:'2026-09-30T08:00', aqi:45 },
      { time:'2026-09-30T09:00', aqi:55 },
      { time:'2026-09-30T11:00', aqi:65 },
    ],
  }, `${label}: a malformed weather channel does not discard valid hourly AQI`);

  const alternateTimezoneAqi = {
    timezone:'America/Chicago',
    hourly:{ time:['2026-09-30T08:00'], us_aqi:[38] },
  };
  assert.deepEqual(plain(normalizeHourlyForecast(malformedWeather, alternateTimezoneAqi)), {
    timezone:'America/Chicago',
    entries:[{ time:'2026-09-30T08:00', aqi:38 }],
  }, `${label}: a malformed primary channel cannot impose its timezone on a valid peer channel`);
  assert.deepEqual(plain(normalizeHourlyForecast({
    timezone:'America/New_York', hourly:{ time:[], apparent_temperature:[] },
  }, alternateTimezoneAqi)), {
    timezone:'America/Chicago',
    entries:[{ time:'2026-09-30T08:00', aqi:38 }],
  }, `${label}: an empty primary channel cannot impose its timezone on a valid peer channel`);
  assert.deepEqual(plain(normalizeHourlyForecast({
    timezone:'America/New_York', hourly:{ time:['2026-09-30T08:00'] },
  }, alternateTimezoneAqi)), {
    timezone:'America/Chicago',
    entries:[{ time:'2026-09-30T08:00', aqi:38 }],
  }, `${label}: a timestamp-only primary channel cannot suppress a valid peer channel`);
  assert.deepEqual(plain(normalizeHourlyForecast({
    timezone:'America/New_York',
    hourly:{
      time:['2026-09-30T08:00'],
      apparent_temperature:['80'], uv_index:[-1], is_day:[2], precipitation_probability:[101],
    },
  }, alternateTimezoneAqi)), {
    timezone:'America/Chicago',
    entries:[{ time:'2026-09-30T08:00', aqi:38 }],
  }, `${label}: an all-invalid primary channel cannot suppress a valid peer channel`);

  assert.deepEqual(plain(normalizeHourlyForecast({
    timezone:'America/New_York',
    hourly:{
      time:['2026-09-30T08:00'],
      apparent_temperature:['80'], uv_index:[-1], is_day:[2], precipitation_probability:[101],
    },
  }, null)), {
    timezone:null,
    entries:[],
  }, `${label}: an hour with no valid readings is omitted from the normalized timeline`);

  const mismatchedAqi = {
    timezone:'America/Chicago',
    hourly:{ time:['2026-09-30T08:00'], us_aqi:[12] },
  };
  assert.deepEqual(plain(normalizeHourlyForecast(weather, mismatchedAqi)), {
    timezone:'America/New_York',
    entries:[
      { time:'2026-09-30T08:00', apparentTemperature:80, uv:1, isDay:true, precipitationProbability:20 },
      { time:'2026-09-30T09:00', apparentTemperature:81.5, uv:2.25, isDay:true, precipitationProbability:65 },
      { time:'2026-09-30T10:00', apparentTemperature:82, uv:3, isDay:true, precipitationProbability:80 },
    ],
  }, `${label}: hourly channels with different local timezones are never joined`);

  const times = hourlyTimes(60);
  const bounded = normalizeHourlyForecast({
    timezone:'UTC',
    hourly:{ time:times, apparent_temperature:times.map((_, index) => index) },
  }, null);
  assert.equal(bounded.entries.length, 50, `${label}: a malformed oversized response is bounded to 50 entries`);
  assert.equal(bounded.entries[0].time, times[0], `${label}: bounding keeps the earliest hourly entry`);
  assert.equal(bounded.entries[49].time, times[49], `${label}: bounding keeps chronological order`);

  assert.match(html,
    /hourly=apparent_temperature,uv_index,is_day,precipitation_probability[^`]*forecast_days=2/,
    `${label}: the weather request asks for exactly two bounded days of hourly context`);
  assert.match(html,
    /hourly=us_aqi[^`]*forecast_days=2/,
    `${label}: the air-quality request asks for exactly two bounded days of hourly AQI`);
  assert.match(html,
    /Promise\.allSettled\(\[forecastRequest, aqiRequest\]\)[\s\S]*normalizeHourlyForecast\([^)]*\)[\s\S]*hourlyForecastFetchedAt:\s*Date\.now\(\)/,
    `${label}: hourly normalization waits for both independent channels to settle and carries acquisition time`);
  assert.match(extractFunction(html, 'getNextWaveSuggestion'), /getForecastAwareOutdoorSuggestion/,
    `${label}: Phase 4 consumes the Phase 2 hourly timeline through the bounded forecast helper`);
  assert.match(html, /Rain chance|Better window ahead/,
    `${label}: Phase 4 may expose probability-aware copy from normalized hourly data`);
  assert.doesNotMatch(html, /precip-adapt|best time|it(?:'|’)s raining/i,
    `${label}: forecast copy never turns precipitation into an anchor or observed-rain claim`);
  assert.doesNotMatch(html, /localStorage[^\n]*hourlyForecast|hourlyForecast[^\n]*localStorage/,
    `${label}: the full hourly forecast remains runtime-only`);
}

console.log('Hourly weather normalization regression tests passed');
