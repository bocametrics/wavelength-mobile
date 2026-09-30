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

function loadEvaluator(html) {
  const policy = html.match(/const OPPORTUNITY_WINDOW_POLICY\s*=\s*Object\.freeze\(\{[\s\S]*?\}\);/);
  assert.ok(policy, 'OPPORTUNITY_WINDOW_POLICY is missing');
  const rhythmPrelude = html.match(/const RHYTHM_TYPES\s*=\s*[^;]+;/);
  assert.ok(rhythmPrelude, 'rhythm constants are missing');
  const names = [
    'dateKey',
    'isConciseRhythmNote',
    'normalizeRhythmConfig',
    'getEffectiveRecommendationContext',
    'evaluateOpportunityWindows',
  ];
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${policy[0]}\n${rhythmPrelude[0]}\n${names.map(name => extractFunction(html, name)).join('\n')}\n` +
    'globalThis.exports = { evaluateOpportunityWindows };',
    context,
  );
  return context.exports.evaluateOpportunityWindows;
}

const plain = value => JSON.parse(JSON.stringify(value));
const atTime = (hour, minute = 0) => new Date(2026, 8, 30, hour, minute, 0, 0);
const time = hour => `2026-09-30T${String(hour).padStart(2, '0')}:00`;

const outdoorMovement = {
  id:'beach', cat:'movement', icon:'🌊', text:'Outdoor walk or movement',
  rhythm:{ type:'aqi-below', threshold:100 },
  context:{ start:390, idealStart:480, end:1260, setting:'outdoor', daylight:'required', duration:20 },
};

function forecast(rows) {
  return {
    timezone:'America/New_York',
    entries:rows.map(([hour, apparentTemperature, uv, precipitationProbability, isDay, aqi]) => ({
      time:time(hour), apparentTemperature, uv, precipitationProbability, isDay, aqi,
    })),
  };
}

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const evaluateOpportunityWindows = loadEvaluator(html);

  const mixed = forecast([
    [16, 90, 6, 70, true, 55],
    [17, 88, 5, 60, true, 55],
    [18, 84, 2, 30, true, 45],
    [19, 84, 1, 25, true, 40],
    [20, 82, 0, 20, false, 38],
  ]);
  const evaluated = plain(evaluateOpportunityWindows(
    outdoorMovement,
    atTime(16, 7),
    { hourlyForecast:mixed, sunset:'8:00 PM' },
  ));

  assert.equal(evaluated.timezone, 'America/New_York', `${label}: the normalized forecast timezone is retained`);
  assert.equal(evaluated.candidates[0].start, '2026-09-30T16:15',
    `${label}: candidate starts round forward to the next 15-minute boundary`);
  assert.equal(evaluated.candidates[0].end, '2026-09-30T16:35',
    `${label}: the full 20-minute habit duration is represented`);
  assert.equal(evaluated.candidates.find(item => item.start.endsWith('T16:45')).precipitationProbability, 70,
    `${label}: a candidate crossing an hour uses the highest overlapping rain probability`);
  assert.equal(evaluated.candidates.find(item => item.start.endsWith('T16:45')).apparentTemperature, 90,
    `${label}: a candidate crossing an hour uses the highest overlapping apparent temperature`);
  assert.equal(evaluated.candidates[0].rainRisk, 'strong', `${label}: rain at 70% is a strong modifier`);
  assert.equal(evaluated.candidates.find(item => item.start.endsWith('T17:00')).rainRisk, 'soft',
    `${label}: rain from 50–69% is a soft modifier`);
  assert.equal(evaluated.candidates.find(item => item.start.endsWith('T18:00')).rainRisk, 'none',
    `${label}: rain below 50% is omitted as a concern`);
  assert.equal(evaluated.candidates[0].heatCue, true, `${label}: apparent temperature above 85°F activates the heat modifier`);
  assert.equal(evaluated.candidates.find(item => item.start.endsWith('T18:00')).heatCue, false,
    `${label}: the heat modifier clears after crossing the cue`);
  assert.equal(evaluated.candidates[0].uvCue, true, `${label}: UV at or above 3 remains a modifier rather than a veto`);
  assert.equal(evaluated.candidates.find(item => item.start.endsWith('T18:00')).uvCue, false,
    `${label}: the UV modifier clears below 3`);
  assert.deepEqual(evaluated.windows, [{
    start:'2026-09-30T16:15', latestStart:'2026-09-30T19:00', end:'2026-09-30T19:20',
  }], `${label}: adjacent viable starts combine into one bounded opportunity window`);
  assert.deepEqual(evaluated.betterWindow, {
    start:'2026-09-30T18:00',
    end:'2026-09-30T18:20',
    reasons:['heat','rain'],
    apparentTemperature:84,
    uv:2,
    aqi:45,
    precipitationProbability:30,
  }, `${label}: the earliest materially cooler and drier slot within three hours is identified as a better window`);

  const highAqiNow = forecast([
    [16, 82, 2, 20, true, 125],
    [17, 82, 2, 20, true, 110],
    [18, 82, 2, 20, true, 80],
    [19, 82, 1, 20, true, 70],
  ]);
  const aqiRecovery = plain(evaluateOpportunityWindows(
    outdoorMovement,
    atTime(16, 7),
    { hourlyForecast:highAqiNow, sunset:'8:00 PM' },
  ));
  assert.equal(aqiRecovery.candidates[0].start, '2026-09-30T18:00',
    `${label}: forecast AQI above the ceiling blocks only affected candidate starts`);
  assert.deepEqual(aqiRecovery.betterWindow?.reasons, ['aqi'],
    `${label}: a later acceptable AQI slot is exposed without claiming precise future air quality`);

  const missingAqi = forecast([
    [16, 82, 2, 80, true, undefined],
    [17, 82, 2, 20, true, undefined],
    [18, 82, 2, 20, true, undefined],
  ]);
  assert.deepEqual(plain(evaluateOpportunityWindows(
    outdoorMovement,
    atTime(16, 7),
    { hourlyForecast:missingAqi, sunset:'8:00 PM' },
  )).candidates, [], `${label}: an AQI-anchored outdoor habit fails closed when hourly AQI is unavailable`);

  assert.ok(!evaluated.candidates.some(item => item.start > '2026-09-30T19:00'),
    `${label}: the evaluator never reaches beyond the bounded three-hour horizon`);

  const stricterAqiHabit = {
    ...outdoorMovement,
    rhythm:{ type:'aqi-below', threshold:50 },
  };
  const stricterAqiForecast = forecast([
    [16, 82, 2, 20, true, 55],
    [17, 82, 2, 20, true, 45],
    [18, 82, 2, 20, true, 45],
    [19, 82, 2, 20, true, 45],
  ]);
  const stricterAqi = plain(evaluateOpportunityWindows(
    stricterAqiHabit,
    atTime(16, 7),
    { hourlyForecast:stricterAqiForecast, sunset:'8:00 PM' },
  ));
  assert.equal(stricterAqi.candidates[0].start, '2026-09-30T17:00',
    `${label}: a configured AQI limit stricter than 100 remains the hard ceiling`);
  assert.deepEqual(stricterAqi.betterWindow?.reasons, ['aqi'],
    `${label}: crossing the habit’s stricter AQI limit can identify a later viable window`);

  const unanchoredOutdoor = { ...outdoorMovement, rhythm:null };
  const unsafeWithoutAnchor = forecast([
    [16, 82, 2, 20, true, 101],
    [17, 82, 2, 20, true, 101],
    [18, 82, 2, 20, true, 101],
    [19, 82, 2, 20, true, 101],
  ]);
  assert.deepEqual(plain(evaluateOpportunityWindows(
    unanchoredOutdoor,
    atTime(16, 7),
    { hourlyForecast:unsafeWithoutAnchor, sunset:'8:00 PM' },
  )).candidates, [], `${label}: the AQI 100 safety ceiling still protects outdoor movement without a user anchor`);

  const sparseForecast = forecast([
    [16, 82, 2, 20, true, 40],
    [18, 82, 2, 20, true, 40],
    [19, 82, 2, 20, true, 40],
  ]);
  const sparse = plain(evaluateOpportunityWindows(
    outdoorMovement,
    atTime(16, 7),
    { hourlyForecast:sparseForecast, sunset:'8:00 PM' },
  ));
  assert.deepEqual(sparse.windows, [
    { start:'2026-09-30T16:15', latestStart:'2026-09-30T16:30', end:'2026-09-30T16:50' },
    { start:'2026-09-30T18:00', latestStart:'2026-09-30T19:00', end:'2026-09-30T19:20' },
  ], `${label}: a missing touched hour fails closed and splits rather than bridges opportunity windows`);

  const midnightHabit = {
    ...outdoorMovement,
    rhythm:null,
    context:{ start:1380, idealStart:1380, end:1440, setting:'outdoor', duration:20 },
  };
  const midnightForecast = {
    timezone:'America/New_York',
    entries:[
      { time:'2026-09-30T23:00', apparentTemperature:75, uv:0, isDay:true, aqi:30 },
      { time:'2026-10-01T00:00', apparentTemperature:75, uv:0, isDay:true, aqi:30 },
    ],
  };
  assert.deepEqual(plain(evaluateOpportunityWindows(
    midnightHabit,
    atTime(23, 50),
    { hourlyForecast:midnightForecast },
  )).candidates, [], `${label}: the remainder-of-today evaluator never crosses local midnight`);

  const noRainField = {
    timezone:'America/New_York',
    entries:[16, 17, 18, 19].map(hour => ({
      time:time(hour), apparentTemperature:82, uv:9, isDay:true, aqi:40,
    })),
  };
  const noRain = plain(evaluateOpportunityWindows(
    outdoorMovement,
    atTime(16, 7),
    { hourlyForecast:noRainField, sunset:'8:00 PM' },
  ));
  assert.ok(noRain.candidates.length > 0, `${label}: missing precipitation does not erase otherwise viable windows`);
  assert.equal(noRain.candidates[0].precipitationProbability, null,
    `${label}: missing precipitation remains unknown rather than becoming a false zero`);
  assert.equal(noRain.candidates[0].uvCue, true, `${label}: high UV never vetoes an otherwise viable outdoor window`);
  assert.equal(noRain.betterWindow, null, `${label}: missing precipitation cannot manufacture a drier-window claim`);

  const personalized = plain(evaluateOpportunityWindows(
    outdoorMovement,
    atTime(16, 7),
    { hourlyForecast:mixed, sunset:'8:00 PM' },
    { eligibleStart:960, idealStart:960, idealEnd:990, lateStart:990, eligibleEnd:1020 },
  ));
  assert.equal(personalized.candidates.at(-1).start, '2026-09-30T16:30',
    `${label}: the full duration must fit inside the personalized eligibility boundary`);

  const sunsetBound = plain(evaluateOpportunityWindows(
    outdoorMovement,
    atTime(19, 7),
    { hourlyForecast:mixed, sunset:'8:00 PM' },
  ));
  assert.equal(sunsetBound.candidates.at(-1).start, '2026-09-30T19:30',
    `${label}: minute-accurate sunset keeps the last full-duration candidate`);
  assert.ok(!sunsetBound.candidates.some(item => item.start === '2026-09-30T19:45'),
    `${label}: a candidate whose duration crosses sunset is rejected`);

  const moderateAllHorizon = forecast([
    [16, 82, 2, 60, true, 40],
    [17, 82, 2, 60, true, 40],
    [18, 82, 2, 60, true, 40],
    [19, 82, 2, 60, true, 40],
  ]);
  const moderate = plain(evaluateOpportunityWindows(
    outdoorMovement,
    atTime(16, 7),
    { hourlyForecast:moderateAllHorizon, sunset:'8:00 PM' },
  ));
  assert.equal(moderate.candidates[0].rainRisk, 'soft', `${label}: moderate rain remains a secondary modifier`);
  assert.equal(moderate.betterWindow, null,
    `${label}: a future slot is not called better when rain does not improve materially`);

  const partialSunData = {
    hourlyForecast:{
      timezone:'America/New_York',
      entries:[16, 17, 18, 19].map(hour => ({
        time:time(hour), apparentTemperature:82, uv:2, precipitationProbability:20, aqi:40,
      })),
    },
    sunrise:'6:00 AM',
    sunset:'not-a-time',
  };
  assert.deepEqual(plain(evaluateOpportunityWindows(
    outdoorMovement,
    atTime(16, 7),
    partialSunData,
  )).candidates, [], `${label}: partial solar bounds fail closed when hourly daylight fallback is missing`);
  const partialSunWithFallback = {
    ...partialSunData,
    hourlyForecast:{
      ...partialSunData.hourlyForecast,
      entries:partialSunData.hourlyForecast.entries.map(entry => ({ ...entry, isDay:true })),
    },
  };
  assert.ok(plain(evaluateOpportunityWindows(
    outdoorMovement,
    atTime(16, 7),
    partialSunWithFallback,
  )).candidates.length > 0, `${label}: hourly daylight can complete a partial solar snapshot`);

  const malformedDateLike = { getTime:() => atTime(16, 7).getTime() };
  assert.deepEqual(plain(evaluateOpportunityWindows(outdoorMovement, malformedDateLike, {
    hourlyForecast:mixed,
    sunset:'8:00 PM',
  })), {
    timezone:'America/New_York', candidates:[], windows:[], betterWindow:null,
  }, `${label}: malformed Date-like input returns a calm empty evaluation instead of throwing`);

  assert.deepEqual(plain(evaluateOpportunityWindows(outdoorMovement, atTime(16), null)), {
    timezone:null, candidates:[], windows:[], betterWindow:null,
  }, `${label}: missing forecast data produces a calm empty evaluation`);

  assert.doesNotMatch(extractFunction(html, 'getNextWaveSuggestion'), /hourlyForecast|evaluateOpportunityWindows/,
    `${label}: Phase 3 builds the evaluator without changing Next Wave selection yet`);
  assert.doesNotMatch(html, /Better window ahead|Rain chance \d|precip-adapt/,
    `${label}: Phase 3 does not publish forecast or rain copy before the separate copy milestone`);
  assert.doesNotMatch(html, /localStorage[^\n]*(hourlyForecast|opportunityWindow)|(hourlyForecast|opportunityWindow)[^\n]*localStorage/,
    `${label}: evaluator output and the full forecast remain runtime-only`);
}

console.log('Opportunity-window evaluator regression tests passed for mobile and desktop');
