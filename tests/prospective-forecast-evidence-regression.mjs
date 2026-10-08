import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const buildPaths = [
  ['mobile', path.resolve(here, '../index.html')],
  ['shared', path.resolve(here, '../../friday_app_2026-07-12.html')],
  ['fixture', path.resolve(here, 'fixtures/friday_app_2026-07-12.html')],
];
const builds = buildPaths.map(([label, file]) => [label, fs.readFileSync(file, 'utf8')]);
const html = builds[0][1];

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

function loadOpportunityFunctions(source) {
  const opportunityPolicy = source.match(/const OPPORTUNITY_WINDOW_POLICY\s*=\s*Object\.freeze\(\{[\s\S]*?\}\);/);
  const freshnessPolicy = source.match(/const FORECAST_COPY_MAX_AGE_MS\s*=\s*[^;]+;/);
  const rhythmPrelude = source.match(/const RHYTHM_TYPES\s*=\s*[^;]+;/);
  assert.ok(opportunityPolicy, 'OPPORTUNITY_WINDOW_POLICY is missing');
  assert.ok(freshnessPolicy, 'FORECAST_COPY_MAX_AGE_MS is missing');
  assert.ok(rhythmPrelude, 'rhythm constants are missing');
  const names = [
    'dateKey',
    'isConciseRhythmNote',
    'normalizeRhythmConfig',
    'getEffectiveRecommendationContext',
    'evaluateOpportunityWindows',
    'isHourlyForecastFresh',
    'formatForecastClock',
    'getForecastAwareOutdoorSuggestion',
  ];
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${opportunityPolicy[0]}\n${freshnessPolicy[0]}\n${rhythmPrelude[0]}\n` +
    `${names.map(name => extractFunction(source, name)).join('\n')}\n` +
    `globalThis.exports = { ${names.join(', ')} };`,
    context,
  );
  return context.exports;
}

function loadInsightFunctions(source) {
  const start = source.indexOf("const INSIGHT_STORAGE_KEY =");
  const end = source.indexOf('function normalizeProgressByDate', start);
  assert.notEqual(start, -1, 'insight constants are missing');
  assert.notEqual(end, -1, 'insight function boundary is missing');
  const names = [
    'normalizeInsightHistory',
    'getInsightExposureSnapshot',
    'recordInsightSuggestion',
    'markInsightViewed',
    'recordInsightCompletion',
    'getConditionInsightCards',
    'getWavesRiddenCard',
  ];
  for (const name of names) assert.notEqual(source.indexOf(`function ${name}(`, start), -1, `${name} is missing`);
  const context = {
    dateKey(date) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    },
  };
  vm.createContext(context);
  vm.runInContext(
    `${source.slice(start, end)}\n` +
    `globalThis.exports = { ${names.join(', ')}, INSIGHT_HISTORY_VERSION };`,
    context,
  );
  return context.exports;
}

function loadRefreshPolicy(source) {
  const constants = [
    source.match(/const ENVIRONMENT_SOFT_REFRESH_MS\s*=\s*[^;]+;/)?.[0],
    source.match(/const FORECAST_COPY_MAX_AGE_MS\s*=\s*[^;]+;/)?.[0],
  ];
  assert.ok(constants[0], 'ENVIRONMENT_SOFT_REFRESH_MS is missing');
  const fn = extractFunction(source, 'shouldRefreshEnvironmentalData');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${constants.filter(Boolean).join('\n')}\n${fn}\nglobalThis.result = shouldRefreshEnvironmentalData;`, context);
  return context.result;
}

const plain = value => JSON.parse(JSON.stringify(value));
const clone = value => JSON.parse(JSON.stringify(value));
const atTime = (hour, minute = 0) => new Date(2026, 8, 30, hour, minute, 0, 0);
const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const time = hour => `2026-09-30T${String(hour).padStart(2, '0')}:00`;
const outdoorMovement = {
  id:'beach', text:'Outdoor walk or movement', measurement:{ type:'check' },
  rhythm:{ type:'aqi-below', threshold:100 },
  context:{ start:390, idealStart:480, end:1260, setting:'outdoor', daylight:'required', duration:20 },
};

function weather(now, rows, extra = {}) {
  return {
    sunrise:'6:00 AM', sunset:'8:00 PM', isDay:true,
    hourlyForecastFetchedAt:now.getTime(),
    hourlyForecast:{
      timezone:localTimezone,
      entries:rows.map(([hour, rain, feel = 82, uv = 2, aqi = 40]) => ({
        time:time(hour), precipitationProbability:rain, apparentTemperature:feel, uv, aqi, isDay:true,
      })),
    },
    ...extra,
  };
}

const habits = [
  outdoorMovement,
  { id:'sunscreen', text:'Sun protection before outdoor time', measurement:{type:'check'}, rhythm:{type:'uv-above', threshold:3} },
  { id:'hydrate', text:'Drink water', measurement:{type:'amount'}, rhythm:{type:'temp-above', threshold:85} },
];

function observedRecord(overrides = {}) {
  const shownAt = atTime(9, 18).getTime();
  return {
    evidenceType:'observed', habitId:'sunscreen', reason:'uv-protect', shownAt, lastShownAt:shownAt,
    observedAt:shownAt - 1000, habitLabel:'Sun protection before outdoor time', measurementType:'check',
    ruleVersion:1, rule:{channel:'weather',reading:'uv',operator:'>=',threshold:3},
    conditions:{uv:4}, sources:{weather:'open-meteo'},
    ...overrides,
  };
}

function forecastRecord(overrides = {}) {
  const shownAt = atTime(10, 18).getTime();
  return {
    evidenceType:'forecast', habitId:'beach', reason:'forecast-window', shownAt, lastShownAt:shownAt,
    habitLabel:'Outdoor walk or movement', measurementType:'check',
    forecast:{
      acquiredAt:shownAt - 1000,
      timezone:localTimezone,
      policyVersion:1,
      kind:'comparison',
      baseline:{
        start:'2026-09-30T10:30', end:'2026-09-30T10:50',
        readings:{precipitationProbability:90},
      },
      candidate:{
        start:'2026-09-30T11:00', end:'2026-09-30T11:20',
        readings:{precipitationProbability:30},
      },
      materialReasons:['rain'],
      limits:{rainSoftThreshold:50, rainStrongThreshold:70, rainMaterialDrop:30},
      sources:{weather:'open-meteo'},
    },
    ...overrides,
  };
}

function loadCardContextResolver(source) {
  const policy = source.match(/const OPPORTUNITY_WINDOW_POLICY\s*=\s*Object\.freeze\(\{[\s\S]*?\}\);/);
  const freshness = source.match(/const FORECAST_COPY_MAX_AGE_MS\s*=\s*[^;]+;/);
  const rhythmTypes = source.match(/const RHYTHM_TYPES\s*=\s*[^;]+;/);
  assert.ok(policy, 'OPPORTUNITY_WINDOW_POLICY is missing');
  assert.ok(freshness, 'FORECAST_COPY_MAX_AGE_MS is missing');
  assert.ok(rhythmTypes, 'RHYTHM_TYPES is missing');
  const names = [
    'dateKey',
    'isConciseRhythmNote',
    'normalizeRhythmConfig',
    'parseDisplayClockMinutes',
    'getDaylightState',
    'getEffectiveRecommendationContext',
    'evaluateOpportunityWindows',
    'isHourlyForecastFresh',
    'getFreshEnvironmentalSnapshot',
    'formatForecastClock',
    'getAqiCategory',
    'getRhythmAnchorText',
    'resolveHabitCardContext',
  ];
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${policy[0]}\n${freshness[0]}\n${rhythmTypes[0]}\n` +
    `const RHYTHM_LABELS = {sunrise:'Within 1 hr of sunrise', sunset:'Within 1 hr of sunset', 'temp-above':'Heat-aware', 'temp-below':'Cold-aware', 'uv-above':'UV-aware', 'aqi-below':'Air-quality aware'};\n` +
    `${names.map(name => extractFunction(source, name)).join('\n')}\n` +
    'globalThis.result = resolveHabitCardContext;',
    context,
  );
  return context.result;
}

const daylightHabit = {
  id:'daylight', text:'Get outdoor light after waking', measurement:{type:'check'}, rhythm:{type:'sunrise'},
  context:{start:360, idealStart:390, end:660, setting:'outdoor', daylight:'required', duration:20},
};
const sunscreenHabit = {
  id:'sunscreen', text:'Sun protection before outdoor time', measurement:{type:'check'}, rhythm:{type:'uv-above', threshold:3},
  context:{start:360, idealStart:420, end:1080, setting:'outdoor', daylight:'required', duration:2},
};
const cardioHabit = {
  id:'cardio', text:'Cardio', measurement:{type:'check'}, rhythm:{type:'temp-above', threshold:85},
  context:{start:360, idealStart:480, end:1200, setting:'either', duration:20},
};

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('all three shared builds remain byte-identical', () => {
  assert.equal(builds[1][1], builds[0][1], 'shared desktop build differs from index.html');
  assert.equal(builds[2][1], builds[0][1], 'test fixture differs from index.html');
});

test('09:30 current candidate uses the 09:00 row and rain thresholds are exact', () => {
  const { evaluateOpportunityWindows, getForecastAwareOutdoorSuggestion } = loadOpportunityFunctions(html);
  const now = atTime(9, 18);
  for (const [rain, risk, detail] of [
    [70, 'strong', 'Rain chance 70% · Keep plans flexible.'],
    [50, 'soft', 'Rain chance 50%'],
    [49, 'none', null],
  ]) {
    const data = weather(now, [[9, rain], [10, rain], [11, rain], [12, rain]]);
    const current = evaluateOpportunityWindows(outdoorMovement, now, data).candidates.find(item => item.start.endsWith('T09:30'));
    assert.equal(current?.precipitationProbability, rain, `09:30 must use the 09:00 row at ${rain}%`);
    assert.equal(current?.rainRisk, risk, `${rain}% maps to ${risk}`);
    const suggestion = getForecastAwareOutdoorSuggestion(outdoorMovement, now, data);
    if (detail === null) assert.notEqual(suggestion?.reason, 'forecast-conditions', 'rain below 50% is ignored');
    else assert.equal(suggestion?.detail, detail, `${rain}% uses the approved rain copy`);
  }
});

test('future rain rows do not leak backward and crossing-hour candidates use the conservative maximum', () => {
  const { evaluateOpportunityWindows } = loadOpportunityFunctions(html);
  const morning = evaluateOpportunityWindows(outdoorMovement, atTime(9, 18), weather(atTime(9, 18), [
    [9, 20], [10, 90], [11, 50], [12, 50],
  ]));
  assert.equal(morning.candidates.find(item => item.start.endsWith('T09:30'))?.precipitationProbability, 20,
    '90%@10 and 50%@11 must not affect a 09:30–09:50 candidate');
  assert.equal(morning.candidates.find(item => item.start.endsWith('T10:45'))?.precipitationProbability, 90,
    '10:45–11:05 must conservatively use max(90, 50)');
  const transition = evaluateOpportunityWindows(outdoorMovement, atTime(10, 18), weather(atTime(10, 18), [
    [10, 90], [11, 50], [12, 50], [13, 50],
  ]));
  assert.equal(transition.betterWindow, null, '90%→50% is not materially better because the later slot must be below 50%');
});

test('one pure card-context resolver powers initial render and refresh', () => {
  extractFunction(html, 'resolveHabitCardContext');
  const renderHabits = extractFunction(html, 'renderHabits');
  const refreshAnchors = extractFunction(html, 'updateRhythmAnchors');
  assert.match(renderHabits, /resolveHabitCardContext\(/,
    'initial habit-card markup uses the pure card-context resolver');
  assert.match(refreshAnchors, /resolveHabitCardContext\(/,
    'environmental refresh uses the same pure card-context resolver');
  assert.equal((renderHabits.match(/class=\\?"rhythm-anchor-label\\?"/g) || []).length, 1,
    'each habit keeps exactly one existing rhythm-anchor-label slot');
  assert.match(renderHabits, /aria-label=\\?"\$\{escapeHtml\([^}]*ariaLabel[^}]*\)\}\\?"/,
    'initial compact card copy exposes its full accessible label separately');
  assert.match(refreshAnchors, /setAttribute\(['"]aria-label['"],\s*[^)]*ariaLabel/,
    'refreshed compact card copy updates the full accessible label');
});

test('outdoor movement card combines safe observed AQI with current-candidate rain', () => {
  const resolve = loadCardContextResolver(html);
  const now = atTime(9, 18);
  for (const rain of [60, 90]) {
    const context = plain(resolve(outdoorMovement, now, weather(now, [
      [9, rain], [10, rain], [11, rain], [12, rain],
    ], {aqi:31, aqiObservedAt:now.getTime() - 1000})));
    assert.equal(context.text, `AQI 31 · Rain ${rain}%`, `${rain}% rain appears in the one compact movement-card line`);
    assert.equal(context.ariaLabel, `AQI 31 · Rain chance ${rain}%`, `${rain}% rain has a full accessible label`);
  }
});

test('outdoor daylight card surfaces current-candidate rain instead of sunrise alone', () => {
  const resolve = loadCardContextResolver(html);
  const now = atTime(9, 18);
  const context = plain(resolve(daylightHabit, now, weather(now, [
    [9, 60], [10, 60], [11, 60], [12, 60],
  ], {sunrise:'6:00 AM', weatherObservedAt:now.getTime() - 1000})));
  assert.match(context.text, /Rain 60%/, 'true outdoor daylight shows compact rain context');
  assert.match(context.ariaLabel, /Rain chance 60%/, 'true outdoor daylight exposes full rain probability accessibly');
  assert.doesNotMatch(context.text, /Rain chance/, 'visible daylight line stays compact');
});

test('card forecast modifiers preserve safety and habit-scope precedence', () => {
  const resolve = loadCardContextResolver(html);
  const now = atTime(9, 18);
  const rainy = weather(now, [[9, 90], [10, 90], [11, 90], [12, 90]], {
    aqi:31, aqiObservedAt:now.getTime() - 1000,
    uv:6, weatherObservedAt:now.getTime() - 1000,
  });
  const unsafe = plain(resolve(outdoorMovement, now, {...rainy, aqi:121}));
  assert.match(unsafe.text, /AQI 121/, 'observed unsafe AQI remains visible');
  assert.doesNotMatch(unsafe.text, /Rain/, 'unsafe AQI/indoor adaptation wins over rain');
  const sunscreen = plain(resolve(sunscreenHabit, now, rainy));
  assert.match(sunscreen.text, /UV 6/, 'fresh observed UV wins for sunscreen');
  assert.doesNotMatch(sunscreen.text, /Rain/, 'sunscreen remains UV-only');
  const cardio = plain(resolve(cardioHabit, now, rainy));
  assert.doesNotMatch(cardio.text, /Rain/, 'Cardio/either is excluded from outdoor forecast modifiers');
  assert.equal(resolve({...outdoorMovement, rhythm:null}, now, rainy), null,
    'rhythm:null remains excluded and does not create a card slot');
});

test('movement card may name a materially drier later window compactly', () => {
  const resolve = loadCardContextResolver(html);
  const now = atTime(9, 18);
  const context = plain(resolve(outdoorMovement, now, weather(now, [
    [9, 90], [10, 90], [11, 30], [12, 30],
  ], {aqi:31, aqiObservedAt:now.getTime() - 1000})));
  assert.match(context.text, /AQI 31/, 'safe observed AQI remains in the compact movement line');
  assert.match(context.text, /(?:Drier|Rain <50%|Rain 30%).*(?:11:00|11 AM)/i,
    'compact card may name the first materially drier later window');
  assert.match(context.ariaLabel, /rain chance.*(?:drops|below|30%)/i,
    'accessible card label explains the materially drier forecast');
});

test('invalid forecast card context fails closed to the base anchor', () => {
  const resolve = loadCardContextResolver(html);
  const now = atTime(9, 18);
  const baseData = {aqi:31, aqiObservedAt:now.getTime() - 1000};
  const base = plain(resolve(outdoorMovement, now, baseData));
  const valid = weather(now, [[9, 90], [10, 90], [11, 90], [12, 90]], baseData);
  const stale = {...valid, hourlyForecastFetchedAt:now.getTime() - (90 * 60 * 1000 + 1)};
  const future = {...valid, hourlyForecastFetchedAt:now.getTime() + 1};
  const mismatch = clone(valid);
  mismatch.hourlyForecast.timezone = localTimezone === 'America/Los_Angeles' ? 'America/New_York' : 'America/Los_Angeles';
  const missingAqi = clone(valid);
  missingAqi.hourlyForecast.entries.forEach(entry => { delete entry.aqi; });
  for (const [label, data] of [['stale', stale], ['future', future], ['timezone-mismatched', mismatch], ['missing-AQI', missingAqi]]) {
    assert.deepEqual(plain(resolve(outdoorMovement, now, data)), base, `${label} evaluator data reverts to the base anchor`);
  }
});

test('card rain never skips a missing immediate next candidate', () => {
  const resolve = loadCardContextResolver(html);
  const now = atTime(9, 18);
  const observedOnly = {aqi:31, aqiObservedAt:now.getTime() - 1000};
  const base = plain(resolve(outdoorMovement, now, observedOnly));
  const missingCurrentHour = weather(now, [[10, 60], [11, 60], [12, 60]], observedOnly);
  const resolved = plain(resolve(outdoorMovement, now, missingCurrentHour));
  assert.deepEqual(resolved, base,
    'missing 09:00 data must not promote the first later evaluable candidate into current card rain context');
  assert.doesNotMatch(resolved.text, /Rain/, 'a future candidate cannot masquerade as the immediate 09:30 candidate');
});

test('timer refresh actively clears expired per-card forecast text', () => {
  const scheduler = extractFunction(html, 'scheduleNextWaveContextRefresh');
  assert.match(scheduler, /refreshRhythmAnchorLabels|updateRhythmAnchors/,
    'foreground timer rewrites card labels when forecast copy expires');
  assert.match(scheduler, /shouldRefreshEnvironmentalData/,
    'timer clearing and fetch decisions share the bounded refresh policy');
});

test('compact forecast context preserves the fixed one-line card geometry', () => {
  const habitRule = html.match(/\.habit\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(habitRule, /height:\s*104px/,
    'habit cards retain their established fixed 104px height');
  const anchorRule = html.match(/\.rhythm-anchor-label\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(anchorRule, /white-space:\s*nowrap/,
    'forecast card context remains in the existing one-line slot');
  assert.match(anchorRule, /text-overflow:\s*ellipsis/,
    'the established overflow guard remains available for legacy custom labels');
  for (const theme of ['light', 'dark']) {
    assert.match(html, new RegExp(`html\\[data-theme=["']${theme}["']\\]`), `${theme} theme participates in the shared 390px geometry contract`);
  }
});

test('refresh policy keeps 30-minute soft refresh separate from 90-minute copy expiry', () => {
  assert.match(html, /const ENVIRONMENT_SOFT_REFRESH_MS\s*=\s*30\s*\*\s*60\s*\*\s*1000\s*;/,
    'foreground environmental data has a 30-minute soft refresh policy');
  assert.match(html, /const FORECAST_COPY_MAX_AGE_MS\s*=\s*90\s*\*\s*60\s*\*\s*1000\s*;/,
    'visible forecast copy retains the existing 90-minute hard expiry');
  const delay = extractFunction(html, 'getNextWaveRefreshDelay');
  assert.match(delay, /ENVIRONMENT_SOFT_REFRESH_MS/,
    'the foreground timer schedules the soft refresh deadline instead of waiting for hard expiry');
  const scheduler = extractFunction(html, 'scheduleNextWaveContextRefresh');
  assert.match(scheduler, /shouldRefreshEnvironmentalData[\s\S]*renderInsights/,
    'the foreground timer fetches when the soft refresh deadline is due');
});

test('card forecast modifiers honor the stored preference window', () => {
  const resolver = extractFunction(html, 'resolveHabitCardContext');
  assert.match(resolver, /preferenceWindow\s*=\s*null/,
    'the pure card resolver accepts one validated preference window');
  assert.match(resolver, /getEffectiveRecommendationContext\(habit,\s*preferenceWindow\)/,
    'card eligibility resolves the same effective context as Next Wave');
  assert.match(resolver, /evaluateOpportunityWindows\(habit,\s*now,\s*snapshot,\s*preferenceWindow\)/,
    'card candidates apply the same stored window as Next Wave');
  for (const caller of ['renderHabits', 'updateRhythmAnchors', 'refreshRhythmAnchorLabels']) {
    assert.match(extractFunction(html, caller), /resolveHabitCardContext\([^)]*preference/i,
      `${caller} passes the stored habit preference to the shared resolver`);
  }
});

test('refresh decision retries missing, unsettled, failed, and soft-due snapshots', () => {
  const shouldRefresh = loadRefreshPolicy(html);
  const now = atTime(12);
  const settled = age => ({
    hourlyForecastFetchedAt:now.getTime() - age,
    hourlyForecast:{timezone:localTimezone, entries:[{time:'2026-09-30T12:00', precipitationProbability:20}]},
  });
  assert.equal(shouldRefresh(null, now, -1, 0), true, 'missing initial data retries');
  assert.equal(shouldRefresh({}, now, 0, 0), true, 'a settled attempt with no usable snapshot retries');
  assert.equal(shouldRefresh({refreshFailedAt:now.getTime() - 1000}, now, 0, 0), true, 'a failed initial attempt retries');
  assert.equal(shouldRefresh(settled(29 * 60 * 1000), now, 4, 4), false, 'usable data younger than 30 minutes is not due');
  assert.equal(shouldRefresh(settled(30 * 60 * 1000), now, 4, 4), true, 'usable data is soft-due at 30 minutes');
  assert.equal(shouldRefresh(settled(1), now, 3, 4), true, 'an unsettled generation is not a usable settled snapshot');
});

test('environmental refresh is single-flight and generation guarded', () => {
  const refresh = extractFunction(html, 'renderInsights');
  assert.match(html, /let rhythmWeatherRefreshPromise\s*=\s*null\s*;/,
    'environmental refresh tracks one shared in-flight promise');
  assert.match(refresh, /rhythmWeatherRefreshPromise[\s\S]*(?:return|await)\s+rhythmWeatherRefreshPromise/,
    'concurrent refresh callers join the same in-flight request');
  assert.match(refresh, /generation\s*!==\s*rhythmWeatherGeneration/,
    'late results remain protected by a generation guard');
  assert.match(refresh, /finally[\s\S]*rhythmWeatherRefreshPromise\s*=\s*null/,
    'single-flight state clears after success or failure');
});

test('online, resume, and pageshow recover missing or soft-due snapshots', () => {
  assert.match(html, /addEventListener\('online'[\s\S]{0,500}shouldRefreshEnvironmentalData[\s\S]{0,300}renderInsights/,
    'online recovery refetches when environmental data is unusable or soft-due');
  assert.match(html, /visibilitychange[\s\S]{0,700}shouldRefreshEnvironmentalData[\s\S]{0,300}renderInsights/,
    'foreground resume refetches when environmental data is unusable or soft-due');
  assert.match(html, /pageshow[\s\S]{0,700}shouldRefreshEnvironmentalData[\s\S]{0,300}renderInsights/,
    'pageshow refetches when environmental data is unusable or soft-due');
});

test('explicit location denial is remembered and does not repeatedly prompt', async () => {
  const start = html.indexOf("const LOC_CACHE_KEY =");
  const end = html.indexOf('function fmtClock', start);
  assert.notEqual(start, -1, 'location state block is missing');
  assert.notEqual(end, -1, 'location state block does not terminate');
  const context = {window:{}, navigator:{}, localStorage:{getItem:() => null, setItem:() => {}}, fetch:() => Promise.reject(new Error('unused'))};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nglobalThis.getCoordinates = getCurrentCoordinates;`, context);
  let prompts = 0;
  const deniedGeolocation = {
    getCurrentPosition(success, failure) {
      prompts += 1;
      failure({code:1, PERMISSION_DENIED:1});
    },
  };
  assert.equal(await context.getCoordinates(null, deniedGeolocation), null, 'explicit denial returns location-neutral data');
  assert.equal(await context.getCoordinates(null, deniedGeolocation), null, 'later coordinate lookup remains location-neutral');
  assert.equal(prompts, 1, 'an explicit denial is not prompted a second time in the session');
});

test('environmental network requests have a bounded timeout', () => {
  const timeout = html.match(/const ENVIRONMENT_REQUEST_TIMEOUT_MS\s*=\s*([^;]+);/);
  assert.ok(timeout, 'ENVIRONMENT_REQUEST_TIMEOUT_MS is missing');
  const value = vm.runInNewContext(timeout[1]);
  assert.ok(Number.isFinite(value) && value >= 1000 && value <= 30000,
    'environmental request timeout must be between 1 and 30 seconds');
  const refresh = extractFunction(html, 'renderInsights');
  assert.match(refresh, /ENVIRONMENT_REQUEST_TIMEOUT_MS[\s\S]*(?:abort|AbortSignal|clearTimeout)/,
    'the bounded timeout is applied to environmental fetches');
});

test('stale observed anchor labels are actively restored to neutral fallback copy', () => {
  const refreshLabels = extractFunction(html, 'refreshRhythmAnchorLabels');
  assert.match(refreshLabels, /getFreshEnvironmentalSnapshot/,
    'anchor refresh filters stale observed values');
  assert.match(refreshLabels, /label\.textContent\s*=\s*getRhythmAnchorText/,
    'every anchored card is rewritten, including neutral fallback text');
  const refresh = extractFunction(html, 'renderInsights');
  assert.match(refresh, /refreshRhythmAnchorLabels/,
    'settled or failed refreshes rewrite stale labels instead of retaining them');
});

test('insight schema v2 is an explicit observed|forecast tagged union', () => {
  assert.match(html, /const INSIGHT_HISTORY_VERSION\s*=\s*2\s*;/, 'insight history advances to schema v2');
  assert.match(html, /const OBSERVED_INSIGHT_REASONS\s*=\s*new Set\([^;]+;/,
    'observed evidence reasons remain explicit');
  assert.match(html, /const FORECAST_INSIGHT_REASONS\s*=\s*new Set\([^;]*(?:forecast-window)[^;]*(?:forecast-conditions)[^;]*(?:forecast-uv)[^;]*;/,
    'forecast evidence reasons are explicit and bounded');
  assert.match(html, /evidenceType[^\n]*(?:observed|forecast)/,
    'records carry an observed or forecast discriminator');
});

test('v1 observed insight records migrate deterministically to v2', () => {
  const { normalizeInsightHistory } = loadInsightFunctions(html);
  const legacy = observedRecord();
  delete legacy.evidenceType;
  const migrated = plain(normalizeInsightHistory({
    version:1,
    days:{'2026-09-30':{recommendations:[legacy], completions:{}}},
  }, habits, true));
  assert.equal(migrated.version, 2, 'v1 history migrates to schema v2');
  const record = migrated.days['2026-09-30'].recommendations[0];
  assert.equal(record.evidenceType, 'observed', 'migrated v1 records are tagged observed');
  assert.equal(record.observedAt, legacy.observedAt, 'migration preserves the real observation timestamp');
  assert.equal(Object.hasOwn(record, 'forecast'), false, 'migration never invents forecast evidence');
});

test('strict v2 validation accepts a bounded forecast snapshot', () => {
  const { normalizeInsightHistory } = loadInsightFunctions(html);
  const raw = {version:2, days:{'2026-09-30':{recommendations:[forecastRecord()], completions:{}}}};
  const normalized = plain(normalizeInsightHistory(raw, habits, true));
  const record = normalized.days['2026-09-30'].recommendations[0];
  assert.equal(record.evidenceType, 'forecast');
  assert.deepEqual(record.forecast, forecastRecord().forecast,
    'forecast snapshot retains only acquisition, timezone, policy, window, relevant readings/reasons/limits, and sources');
  const serialized = JSON.stringify(record);
  assert.doesNotMatch(serialized, /(?:latitude|longitude|\blat\b|\blon\b|city|hourlyForecast|entries)/i,
    'forecast evidence never stores location or the full timeline');
  assert.equal(Object.hasOwn(record, 'observedAt'), false, 'forecast arm forbids observedAt');
  assert.equal(Object.hasOwn(record, 'conditions'), false, 'forecast arm forbids observed conditions');
  assert.equal(Object.hasOwn(record, 'rule'), false, 'forecast arm forbids an observed cue rule');
});

test('forecast evidence is captured only for final settled Home output', () => {
  assert.match(html, /function renderNextWave\([\s\S]*!document\.getElementById\('homeView'\)\.hidden[\s\S]*rhythmWeatherReadyGeneration\s*===\s*rhythmWeatherGeneration[\s\S]*recordInsightSuggestion/,
    'forecast evidence requires visible Home and the final settled generation');
  assert.match(html, /FORECAST_INSIGHT_REASONS[\s\S]*recordInsightSuggestion/,
    'the recorder explicitly admits only the three forecast reasons');
});

test('same forecast fingerprint dedupes while a changed episode appends', () => {
  const opportunity = loadOpportunityFunctions(html);
  const insights = loadInsightFunctions(html);
  const now = atTime(10, 18);
  const firstData = weather(now, [[10, 90], [11, 30], [12, 30], [13, 30]]);
  const firstSuggestion = opportunity.getForecastAwareOutdoorSuggestion(outdoorMovement, now, firstData);
  assert.equal(firstSuggestion?.reason, 'forecast-window', 'fixture produces a forecast-window suggestion');
  const exposure = insights.getInsightExposureSnapshot(firstSuggestion, habits);
  const history = {version:2, days:{}};
  assert.equal(insights.recordInsightSuggestion(history, {...firstSuggestion, habitId:'beach', action:'View habit'}, firstData, now, exposure), true,
    'first forecast episode records');
  const later = new Date(now.getTime() + 5 * 60 * 1000);
  assert.equal(insights.recordInsightSuggestion(history, {...firstSuggestion, habitId:'beach', action:'View habit'}, firstData, later, exposure), true,
    'same forecast fingerprint refreshes lastShownAt');
  const day = history.days['2026-09-30'];
  assert.equal(day.recommendations.length, 1, 'same forecast fingerprint does not inflate episode count');
  assert.equal(day.recommendations[0].lastShownAt, later.getTime(), 'dedupe updates lastShownAt');
  const changedAt = new Date(now.getTime() + 10 * 60 * 1000);
  const changedData = weather(changedAt, [[10, 90], [11, 20], [12, 20], [13, 20]]);
  const changedSuggestion = opportunity.getForecastAwareOutdoorSuggestion(outdoorMovement, changedAt, changedData);
  const changedExposure = insights.getInsightExposureSnapshot(changedSuggestion, habits);
  assert.equal(insights.recordInsightSuggestion(history, {...changedSuggestion, habitId:'beach', action:'View habit'}, changedData, changedAt, changedExposure), true,
    'changed forecast fingerprint records a new episode');
  assert.equal(day.recommendations.length, 2, 'changed forecast episode is retained separately');
});

test('a new acquisition timestamp creates a distinct forecast episode', () => {
  const { recordInsightSuggestion } = loadInsightFunctions(html);
  const now = atTime(10, 18);
  const first = forecastRecord();
  const second = clone(first);
  second.shownAt = now.getTime() + 60 * 1000;
  second.lastShownAt = second.shownAt;
  second.forecast.acquiredAt += 60 * 1000;
  const history = {version:2, days:{'2026-09-30':{recommendations:[first], completions:{}}}};
  const exposure = {habitLabel:'Outdoor walk or movement', measurementType:'check', evidenceType:'forecast', forecast:second.forecast};
  assert.equal(recordInsightSuggestion(history, {
    habitId:'beach', reason:'forecast-window', action:'View habit', forecastEvidence:second.forecast,
  }, {}, new Date(second.shownAt), exposure), true, 'separately acquired forecast records');
  assert.equal(history.days['2026-09-30'].recommendations.length, 2,
    'acquiredAt participates in the canonical forecast fingerprint');
  assert.equal(history.days['2026-09-30'].recommendations[1].forecast.acquiredAt, second.forecast.acquiredAt,
    'the new episode retains its own acquisition timestamp');
});

test('AQI forecast evidence uses the habit effective safety limit', () => {
  const opportunity = loadOpportunityFunctions(html);
  const insights = loadInsightFunctions(html);
  const now = atTime(10, 18);
  const strictHabit = {...outdoorMovement, rhythm:{type:'aqi-below', threshold:50}};
  const data = weather(now, [[10, 20, 82, 2, 55], [11, 20, 82, 2, 45], [12, 20, 82, 2, 45], [13, 20, 82, 2, 45]]);
  const suggestion = opportunity.getForecastAwareOutdoorSuggestion(strictHabit, now, data);
  assert.equal(suggestion?.reason, 'forecast-window', 'fixture produces a lower-threshold AQI recovery');
  assert.deepEqual(suggestion.forecastEvidence.limits, {aqiSafetyCeiling:50},
    'evidence captures min(configured threshold, fixed ceiling), not the fixed ceiling alone');
  const exposure = insights.getInsightExposureSnapshot(suggestion, [strictHabit]);
  const history = {version:2, days:{}};
  assert.equal(insights.recordInsightSuggestion(history, {...suggestion, habitId:'beach', action:'View habit'}, data, now, exposure), true,
    'visible lower-threshold AQI copy records evidence');
  assert.doesNotThrow(() => insights.normalizeInsightHistory(history, [strictHabit], true),
    'strict normalization accepts evidence generated from a supported stricter habit threshold');
});

test('view and reversible completion attach only to the latest episode', () => {
  const { markInsightViewed, recordInsightCompletion } = loadInsightFunctions(html);
  const first = forecastRecord();
  const second = forecastRecord({shownAt:first.shownAt + 1000, lastShownAt:first.lastShownAt + 1000});
  second.forecast = {
    ...second.forecast,
    acquiredAt:first.forecast.acquiredAt + 1000,
    candidate:{...second.forecast.candidate, readings:{precipitationProbability:20}},
  };
  const history = {version:2, days:{'2026-09-30':{recommendations:[first, second], completions:{}}}};
  const viewedAt = new Date(second.shownAt + 1000);
  assert.equal(markInsightViewed(history, 'beach', viewedAt), true);
  assert.equal(Object.hasOwn(first, 'viewedAt'), false, 'an older episode is not marked viewed');
  assert.equal(second.viewedAt, viewedAt.getTime(), 'latest episode receives the view');
  assert.equal(recordInsightCompletion(history, 'beach', viewedAt, true), true);
  assert.equal(Object.hasOwn(first, 'completedAt'), false, 'an older episode is not credited with completion');
  assert.equal(second.completedAt, viewedAt.getTime(), 'latest episode receives completion');
  assert.equal(recordInsightCompletion(history, 'beach', viewedAt, false), true);
  assert.equal(Object.hasOwn(second, 'completedAt'), false, 'uncompletion reverses latest episode follow-through');
  assert.equal(Object.hasOwn(history.days['2026-09-30'].completions, 'beach'), false,
    'uncompletion reverses the day completion ledger');
});

test('strict forecast validation fails closed on invalid acquisition and union arms', () => {
  const { normalizeInsightHistory } = loadInsightFunctions(html);
  const reject = (record, pattern, message) => assert.throws(() => normalizeInsightHistory({
    version:2, days:{'2026-09-30':{recommendations:[record], completions:{}}},
  }, habits, true), pattern, message);
  const future = forecastRecord();
  future.forecast.acquiredAt = future.shownAt + 1;
  reject(future, /future|acquisition/i, 'future acquisition fails closed');
  const stale = forecastRecord();
  stale.forecast.acquiredAt = stale.shownAt - (90 * 60 * 1000 + 1);
  reject(stale, /stale|acquisition/i, 'stale acquisition fails closed');
  const missingReading = forecastRecord();
  delete missingReading.forecast.candidate.readings.precipitationProbability;
  reject(missingReading, /reading|rain/i, 'missing claimed rain reading fails closed');
  const wrongSource = forecastRecord();
  wrongSource.forecast.sources.weather = 'other-provider';
  reject(wrongSource, /source/i, 'source mismatch fails closed');
  const unknown = forecastRecord();
  unknown.forecast.secret = true;
  reject(unknown, /unsupported|unknown/i, 'unknown forecast fields fail closed');
  const mixedForecast = forecastRecord({observedAt:forecastRecord().shownAt - 1});
  reject(mixedForecast, /forecast.*observed|arm/i, 'forecast arm rejects observed fields');
  const mixedObserved = observedRecord({forecast:forecastRecord().forecast});
  reject(mixedObserved, /observed.*forecast|arm/i, 'observed arm rejects forecast fields');
  const impossibleTiming = forecastRecord();
  impossibleTiming.forecast.baseline = {
    ...impossibleTiming.forecast.baseline,
    start:'2026-09-30T00:00', end:'2026-09-30T00:01',
  };
  impossibleTiming.forecast.candidate = {
    ...impossibleTiming.forecast.candidate,
    start:'2026-09-30T23:00', end:'2026-09-30T23:59',
  };
  reject(impossibleTiming, /baseline|candidate|interval|horizon|duration|timing/i,
    'strict validation rejects intervals that could not have generated the displayed noon copy');
});

test('strict validation rejects view attribution on an older forecast episode', () => {
  const { normalizeInsightHistory } = loadInsightFunctions(html);
  const older = forecastRecord({viewedAt:forecastRecord().shownAt + 500});
  const newer = forecastRecord({shownAt:older.shownAt + 1000, lastShownAt:older.lastShownAt + 1000});
  newer.forecast = {...newer.forecast, acquiredAt:older.forecast.acquiredAt + 1000};
  assert.throws(() => normalizeInsightHistory({
    version:2,
    days:{'2026-09-30':{recommendations:[older, newer], completions:{}}},
  }, habits, true), /view|latest|episode/i,
  'only the latest same-habit episode may retain View habit attribution');
});

test('timezone mismatch fails closed before forecast evidence can be captured', () => {
  const { getForecastAwareOutdoorSuggestion } = loadOpportunityFunctions(html);
  const now = atTime(10, 18);
  const data = weather(now, [[10, 90], [11, 30], [12, 30]]);
  data.hourlyForecast.timezone = localTimezone === 'America/Los_Angeles' ? 'America/New_York' : 'America/Los_Angeles';
  assert.equal(getForecastAwareOutdoorSuggestion(outdoorMovement, now, data), null,
    'forecast from a different timezone cannot become copy or evidence');
});

test('observed condition cards ignore forecast evidence', () => {
  const { getConditionInsightCards } = loadInsightFunctions(html);
  const days = {};
  for (let index = 0; index < 10; index += 1) {
    const date = new Date(2026, 7, 10 + index, 9);
    const key = `2026-08-${String(10 + index).padStart(2, '0')}`;
    const observed = observedRecord({shownAt:date.getTime(), lastShownAt:date.getTime(), observedAt:date.getTime() - 1});
    const forecast = forecastRecord({
      habitId:'sunscreen', reason:'forecast-uv', shownAt:date.getTime() + 1, lastShownAt:date.getTime() + 1,
      habitLabel:'Sun protection before outdoor time',
      forecast:{
        acquiredAt:date.getTime(), timezone:localTimezone, policyVersion:1, kind:'hour',
        candidate:{start:`${key}T09:00`, end:`${key}T09:02`, readings:{uv:4}},
        materialReasons:['uv'], limits:{uvCueThreshold:3}, sources:{weather:'open-meteo'},
      },
    });
    days[key] = {recommendations:[forecast, ...(index < 9 ? [observed] : [])], completions:{}};
  }
  assert.deepEqual(plain(getConditionInsightCards({version:2, days}, 10, new Date(2026, 7, 30, 12))), [],
    'ten forecast UV cues cannot turn nine observed UV dates into an observed-condition card');
});

test('Waves ridden wording distinguishes current conditions from forecasts', () => {
  const { getWavesRiddenCard } = loadInsightFunctions(html);
  const observedAt = new Date(2026, 7, 28, 9).getTime();
  const forecastAt = new Date(2026, 7, 29, 9).getTime();
  const observed = observedRecord({shownAt:observedAt, lastShownAt:observedAt, observedAt:observedAt - 1, completedAt:observedAt + 1000});
  const forecast = forecastRecord({shownAt:forecastAt, lastShownAt:forecastAt, completedAt:forecastAt + 1000});
  forecast.forecast = {
    ...forecast.forecast,
    acquiredAt:forecastAt - 1,
    baseline:{...forecast.forecast.baseline, start:'2026-08-29T09:30', end:'2026-08-29T09:50'},
    candidate:{...forecast.forecast.candidate, start:'2026-08-29T10:00', end:'2026-08-29T10:20'},
  };
  const card = getWavesRiddenCard({version:2, days:{
    '2026-08-28':{recommendations:[observed], completions:{sunscreen:observedAt + 1000}},
    '2026-08-29':{recommendations:[forecast], completions:{beach:forecastAt + 1000}},
  }}, new Date(2026, 7, 30, 12));
  assert.equal(card?.days, 2, 'observed and forecast follow-through both count without conflation');
  assert.match(`${card?.title || ''} ${card?.detail || ''}`, /current conditions/i,
    'Waves ridden names current-condition evidence');
  assert.match(`${card?.title || ''} ${card?.detail || ''}`, /forecasts/i,
    'Waves ridden separately names forecast evidence without technical cue wording');
  assert.doesNotMatch(`${card?.title || ''} ${card?.detail || ''}`, /\bcues?\b/i,
    'Waves ridden never exposes internal cue terminology');
});

test('daily evidence cap refuses new episodes instead of evicting prior evidence', () => {
  const { recordInsightSuggestion } = loadInsightFunctions(html);
  const now = atTime(12);
  const recommendations = Array.from({length:12}, (_, index) => observedRecord({
    shownAt:now.getTime() - 20000 + index,
    lastShownAt:now.getTime() - 20000 + index,
    observedAt:now.getTime() - 21000 + index,
  }));
  const history = {version:2, days:{'2026-09-30':{recommendations, completions:{}}}};
  const before = clone(history);
  const recorded = recordInsightSuggestion(history, {
    habitId:'hydrate', reason:'heat-hydrate', action:'View habit',
  }, {feel:96, weatherObservedAt:now.getTime() - 1000}, now, {
    habitLabel:'Drink water', measurementType:'amount', ruleVersion:1,
    rule:{channel:'weather',reading:'feel',operator:'>',threshold:85},
  });
  assert.equal(recorded, false, 'the thirteenth daily episode is not recorded');
  assert.deepEqual(plain(history), before, 'the cap cannot evict earlier evidence and change what the day proves');
});

test('backup schema v9 exports v2 evidence', () => {
  assert.match(html, /const BACKUP_VERSION\s*=\s*9\s*;/, 'portable backup schema advances to version 9');
  assert.match(extractFunction(html, 'createBackupPayload'), /normalizeInsightHistory[\s\S]*insightHistory/,
    'v9 export validates schema-v2 insight evidence');
});

test('backup v9 accepts versions 1 through 8 and migrates v1 insight history', () => {
  const importer = extractFunction(html, 'importBackupFile');
  assert.match(importer, /\[1,\s*2,\s*3,\s*4,\s*5,\s*6,\s*7,\s*8,\s*BACKUP_VERSION\]\.includes\(payload\.version\)/,
    'version 1 through version 8 backups remain accepted by v9');
  assert.match(importer, /normalizeInsightHistory\(payload\.insightHistory,\s*importedAllHabits,\s*true\)/,
    'legacy schema-v1 insight histories migrate against active and archived identities');
});

test('malformed v9 backup evidence is rejected before the atomic storage commit', () => {
  const importer = extractFunction(html, 'importBackupFile');
  const validation = importer.indexOf('normalizeInsightHistory(payload.insightHistory, importedAllHabits, true)');
  const commit = importer.indexOf('commitStorageSnapshot(localStorage, importedSnapshot)');
  assert.ok(validation >= 0, 'v9 strictly validates insight history');
  assert.ok(commit > validation, 'all v9 evidence validation completes before the one atomic storage commit');
});

test('full hourly timeline and location remain runtime-only', () => {
  assert.doesNotMatch(html, /localStorage[^\n]*(hourlyForecast|opportunityWindow)|(hourlyForecast|opportunityWindow)[^\n]*localStorage/,
    'the full hourly timeline and opportunity evaluator output are never persisted');
  const recorder = extractFunction(html, 'recordInsightSuggestion');
  assert.doesNotMatch(recorder, /(?:\.lat\b|\.lon\b|\.city\b|hourlyForecast\s*:|entries\s*:)/,
    'evidence recorder never serializes coordinates, city, or full hourly entries');
});

const failures = [];
let passed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({name, message:error?.message || String(error)});
    console.error(`FAIL ${name}: ${error?.message || error}`);
  }
}

console.log(`Phase 5 prospective forecast evidence contract: ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error('Failing assertions:');
  failures.forEach(({name, message}) => console.error(`- ${name}: ${message}`));
  process.exitCode = 1;
}
