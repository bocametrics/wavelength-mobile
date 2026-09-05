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

function loadInsightFunctions(html) {
  const constants = html.match(/const INSIGHT_HISTORY_VERSION\s*=\s*1;[\s\S]*?const CONTEXT_INSIGHT_REASONS\s*=\s*new Set\([^;]+;/);
  assert.ok(constants, 'insight history constants are missing');
  const names = [
    'dateKey',
    'isValidDateKey',
    'normalizeInsightHistory',
    'getInsightExposureSnapshot',
    'recordInsightSuggestion',
    'markInsightViewed',
    'recordInsightCompletion',
    'clearInsightDate',
    'pruneInsightHistory',
    'getConditionInsightCards',
    'selectConditionInsightCard',
    'getAdaptiveDayCard',
  ];
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${constants[0]}\n${names.map(name => extractFunction(html, name)).join('\n')}\n` +
    `globalThis.exports = { ${names.join(', ')} };`,
    context,
  );
  return context.exports;
}

const plain = value => JSON.parse(JSON.stringify(value));

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const {
    normalizeInsightHistory,
    getInsightExposureSnapshot,
    recordInsightSuggestion,
    markInsightViewed,
    recordInsightCompletion,
    clearInsightDate,
    pruneInsightHistory,
    getConditionInsightCards,
    selectConditionInsightCard,
    getAdaptiveDayCard,
  } = loadInsightFunctions(html);

  const homeStart = html.indexOf('id="homeView"');
  const insightsStart = html.indexOf('id="insightsView"');
  const settingsStart = html.indexOf('id="settingsView"');
  const wave = html.indexOf('id="nextWaveCard"');
  const tabs = html.indexOf('id="tabs"');
  const habitList = html.indexOf('id="habitList"');
  const reset = html.indexOf('id="resetBtn"');
  const streak = html.indexOf('class="streak-bar"');
  const weekly = html.indexOf('class="weekly"');
  const dock = html.indexOf('class="app-dock"');

  assert.ok(homeStart > 0, `${label}: Home view exists`);
  assert.ok(insightsStart > homeStart, `${label}: Insights view follows Home`);
  assert.ok(settingsStart > insightsStart, `${label}: Settings view follows Insights`);
  assert.ok(homeStart < wave && wave < tabs && tabs < habitList && habitList < reset && reset < insightsStart,
    `${label}: Home is action-first with Next Wave before today's controls and habits`);
  assert.ok(insightsStart < streak && streak < weekly && weekly < dock,
    `${label}: Insights starts with Streak/Today completion, followed by This week`);

  assert.match(html, /<nav class="app-dock"[^>]*aria-label="Primary navigation"/,
    `${label}: dock is an accessible primary navigation landmark`);
  assert.match(html, /<nav class="app-dock"[^>]*role="tablist"/,
    `${label}: dock exposes tablist semantics`);
  assert.match(html, /id="navHome"[^>]*data-view="home"[^>]*aria-current="page"/,
    `${label}: Home is the default current destination`);
  assert.match(html, /id="navHome"[^>]*role="tab"[^>]*aria-controls="homeView"[^>]*aria-selected="true"/,
    `${label}: Home control identifies its panel and selected state`);
  assert.match(html, /id="navInsights"[^>]*data-view="insights"/,
    `${label}: Insights is a dock destination`);
  assert.match(html, /id="navInsights"[^>]*role="tab"[^>]*aria-controls="insightsView"[^>]*aria-selected="false"/,
    `${label}: Insights control identifies its panel and selected state`);
  assert.match(html, /id="navSettings"[^>]*data-view="settings"/,
    `${label}: Settings is a dock destination`);
  assert.match(html, /id="navSettings"[^>]*role="tab"[^>]*aria-controls="settingsView"[^>]*aria-selected="false"/,
    `${label}: Settings control identifies its panel and selected state`);
  assert.match(html, /id="homeView"[^>]*role="tabpanel"/, `${label}: Home is a tab panel`);
  assert.match(html, /id="insightsView"[^>]*role="tabpanel"[^>]*inert/, `${label}: inactive Insights begins inert`);
  assert.match(html, /id="settingsView"[^>]*role="tabpanel"[^>]*inert/, `${label}: inactive Settings begins inert`);
  assert.match(html, /id="insightsView"[^>]*hidden/,
    `${label}: Insights starts hidden so launch remains action-oriented`);
  assert.match(html, /id="settingsView"[^>]*hidden/,
    `${label}: Settings starts hidden so launch remains action-oriented`);

  assert.match(html, /\.app-dock\s*\{[^}]*position:\s*fixed[^}]*bottom:\s*calc\([^)]*env\(safe-area-inset-bottom\)/s,
    `${label}: floating dock stays above the iPhone home indicator`);
  assert.match(html, /body\s*\{[^}]*padding-bottom:\s*calc\([^}]*var\(--dock-space\)[^}]*env\(safe-area-inset-bottom\)/s,
    `${label}: page content reserves dock and safe-area space`);
  assert.match(html, /\.dock-button\s*\{[^}]*min-height:\s*48px/s,
    `${label}: dock buttons meet the mobile touch-target requirement`);

  assert.match(html, /function setActiveView\(view,[^)]*\)/,
    `${label}: navigation has one shared view-switch function`);
  assert.match(html, /const viewScrollPositions = \{ home:0, insights:0, settings:0 \}/,
    `${label}: each view retains its own scroll position`);
  assert.match(html, /function setActiveView\(view,[^)]*\)[\s\S]*\.inert =[\s\S]*aria-selected[\s\S]*viewScrollPositions\[activeView\]/,
    `${label}: switching tabs updates inert, selection, and restores destination scroll`);
  assert.match(html, /document\.getElementById\('navHome'\)\.addEventListener\('click'/,
    `${label}: Home dock action is wired`);
  assert.match(html, /document\.getElementById\('navInsights'\)\.addEventListener\('click'/,
    `${label}: Insights dock action is wired`);
  assert.match(html, /document\.getElementById\('navSettings'\)\.addEventListener\('click'/,
    `${label}: Settings dock action is wired`);
  assert.match(html, /const dockViews = \['home','insights','settings'\]/,
    `${label}: dock keyboard navigation cycles across all three views`);

  const habits = [
    { id:'sunscreen', title:'Sun protection before outdoor time', measurement:{ type:'check' }, rhythm:{ type:'uv-above', threshold:3 } },
    { id:'hydrate', title:'Drink 16 oz water', measurement:{ type:'amount' }, rhythm:{ type:'temp-above', threshold:85 } },
    { id:'beach', title:'Outdoor walk or movement', measurement:{ type:'check' }, rhythm:{ type:'aqi-below', threshold:100 } },
    { id:'daylight', title:'Get outdoor light after waking', measurement:{ type:'check' }, rhythm:{ type:'sunrise' } },
  ];
  const shown = new Date(2026, 7, 30, 9, 15, 0, 0);
  const shownLater = new Date(2026, 7, 30, 9, 45, 0, 0);
  const weatherObservedAt = shown.getTime() - 5000;
  const aqiObservedAt = shown.getTime() - 3000;
  const sunscreenExposure = plain(getInsightExposureSnapshot({ habitId:'sunscreen', reason:'uv-protect' }, habits));
  assert.deepEqual(sunscreenExposure, {
    habitLabel:'Sun protection before outdoor time', measurementType:'check', ruleVersion:1,
    rule:{ channel:'weather', reading:'uv', operator:'>=', threshold:3 },
  }, `${label}: an exposure snapshots the editable label, measurement, and cue rule`);
  const shippedStyleExposure = plain(getInsightExposureSnapshot({ habitId:'sunscreen', reason:'uv-protect' }, [{
    id:'sunscreen', text:'Sun protection before outdoor time', rhythm:{ type:'uv-above', threshold:3 },
  }]));
  assert.equal(shippedStyleExposure?.habitLabel, 'Sun protection before outdoor time',
    `${label}: shipped habits using the text field can produce an evidence snapshot`);
  const empty = plain(normalizeInsightHistory(null, habits));
  assert.deepEqual(empty, { version:1, days:{} }, `${label}: missing insight history starts empty`);

  const ignored = plain(empty);
  assert.equal(recordInsightSuggestion(ignored, {
    habitId:'hydrate', reason:'time-fallback', action:'View habit',
  }, { feel:96 }, shown), false, `${label}: non-context fallback suggestions are never evidence`);
  assert.deepEqual(ignored, empty, `${label}: ignored suggestions do not mutate history`);

  const history = plain(empty);
  assert.equal(recordInsightSuggestion(history, {
    habitId:'sunscreen', reason:'uv-protect', action:'View habit',
  }, {
    uv:4.2, aqi:43, feel:91.5, sunrise:'6:58 AM', sunset:'7:42 PM', weatherObservedAt, aqiObservedAt,
    lat:26.71, lon:-80.05, city:'Private Place',
  }, shown, sunscreenExposure), true, `${label}: a complete contextual recommendation is recorded`);
  const day = history.days['2026-08-30'];
  assert.equal(day.recommendations.length, 1, `${label}: recommendation creates one day record`);
  assert.deepEqual(plain(day.recommendations[0].conditions), {
    uv:4.2, aqi:43, feel:91.5, sunrise:'6:58 AM', sunset:'7:42 PM',
  }, `${label}: evidence keeps exact readings but no location coordinates or city`);
  assert.deepEqual(plain(day.recommendations[0].sources), {
    weather:'open-meteo', aqi:'open-meteo',
  }, `${label}: evidence records the providers used`);
  assert.equal(day.recommendations[0].habitLabel, sunscreenExposure.habitLabel,
    `${label}: the shown habit label is retained with the exposure`);
  assert.deepEqual(plain(day.recommendations[0].rule), sunscreenExposure.rule,
    `${label}: the cue rule is retained with the exposure`);
  assert.equal(day.recommendations[0].observedAt, weatherObservedAt,
    `${label}: a UV recommendation uses the weather observation timestamp, not its render time`);

  assert.equal(recordInsightSuggestion(history, {
    habitId:'sunscreen', reason:'uv-protect', action:'View habit',
  }, { uv:4.6, aqi:45, weatherObservedAt, aqiObservedAt }, shownLater, sunscreenExposure), true,
  `${label}: a cached same-day reading refreshes the existing record`);
  assert.equal(day.recommendations.length, 1, `${label}: same habit and reason dedupe within a date`);
  assert.equal(day.recommendations[0].shownAt, shown.getTime(), `${label}: dedupe preserves first shown timestamp`);
  assert.equal(day.recommendations[0].lastShownAt, shownLater.getTime(), `${label}: dedupe records the latest shown timestamp`);
  assert.equal(day.recommendations[0].conditions.uv, 4.2,
    `${label}: same-day rerenders do not overwrite the first visible exposure`);
  assert.equal(day.recommendations[0].observedAt, weatherObservedAt,
    `${label}: showing a cached snapshot again does not invent a newer observation`);

  const aqiOnly = { version:1, days:{} };
  const beachExposure = plain(getInsightExposureSnapshot({ habitId:'beach', reason:'aqi-opportunity' }, habits));
  const beachAdaptExposure = plain(getInsightExposureSnapshot({ habitId:'beach', reason:'aqi-adapt' }, habits));
  assert.equal(recordInsightSuggestion(aqiOnly, {
    habitId:'beach', reason:'aqi-opportunity', action:'View habit',
  }, { aqi:43, aqiObservedAt }, shown, beachExposure), true, `${label}: AQI-only recommendations are recordable`);
  assert.deepEqual(plain(aqiOnly.days['2026-08-30'].recommendations[0].sources), { aqi:'open-meteo' },
    `${label}: AQI-only evidence does not claim a weather observation`);
  assert.equal(aqiOnly.days['2026-08-30'].recommendations[0].observedAt, aqiObservedAt,
    `${label}: an AQI recommendation uses the AQI observation timestamp`);
  const weatherOnly = { version:1, days:{} };
  assert.equal(recordInsightSuggestion(weatherOnly, {
    habitId:'sunscreen', reason:'uv-protect', action:'View habit',
  }, { uv:7, weatherObservedAt }, shown, sunscreenExposure), true, `${label}: weather-only recommendations are recordable`);
  assert.deepEqual(plain(weatherOnly.days['2026-08-30'].recommendations[0].sources), { weather:'open-meteo' },
    `${label}: weather-only evidence does not claim an AQI observation`);

  assert.equal(markInsightViewed(history, 'sunscreen', shownLater), true, `${label}: View habit marks the latest matching recommendation`);
  assert.equal(day.recommendations[0].viewedAt, shownLater.getTime(), `${label}: view timestamp is retained`);
  assert.equal(recordInsightCompletion(history, 'sunscreen', shownLater, true), true, `${label}: completion is timestamped`);
  assert.equal(day.completions.sunscreen, shownLater.getTime(), `${label}: day completion timestamp is stored`);
  assert.equal(day.recommendations[0].completedAt, shownLater.getTime(), `${label}: matching recommendation records follow-through`);
  assert.equal(recordInsightCompletion(history, 'sunscreen', shownLater, false), true, `${label}: uncompletion reverses prospective completion evidence`);
  assert.equal(Object.hasOwn(day.completions, 'sunscreen'), false, `${label}: uncompleted habit is removed from the day ledger`);
  assert.equal(Object.hasOwn(day.recommendations[0], 'completedAt'), false, `${label}: uncompletion clears recommendation follow-through`);
  const resetHistory = plain(history);
  assert.equal(clearInsightDate(resetHistory, shownLater), true, `${label}: Reset today clears the date's exposure ledger`);
  assert.equal(Object.hasOwn(resetHistory.days, '2026-08-30'), false,
    `${label}: reset exposure cannot enter a denominator at date close`);

  const preExposure = plain(history);
  preExposure.days['2026-08-30'].completions = {};
  delete preExposure.days['2026-08-30'].recommendations[0].completedAt;
  assert.equal(recordInsightCompletion(preExposure, 'sunscreen', new Date(shown.getTime() - 1), true), true,
    `${label}: the completion projection may still record a pre-exposure transition`);
  assert.equal(Object.hasOwn(preExposure.days['2026-08-30'].recommendations[0], 'completedAt'), false,
    `${label}: a completion before the visible cue is never attributed to that cue`);

  const missingReading = plain(empty);
  assert.equal(recordInsightSuggestion(missingReading, {
    habitId:'beach', reason:'aqi-adapt', action:'View habit',
  }, { aqi:null }, shown), false, `${label}: missing AQI cannot become poor-air evidence`);
  assert.equal(recordInsightSuggestion(missingReading, {
    habitId:'hydrate', reason:'heat-hydrate', action:'View habit',
  }, { feel:'96' }, shown), false, `${label}: string readings cannot become heat evidence`);

  assert.throws(
    () => normalizeInsightHistory({ version:1, days:{ '2026-08-30':{ recommendations:[{
      habitId:'unknown', reason:'uv-protect', shownAt:shown.getTime(), lastShownAt:shown.getTime(),
      conditions:{ uv:4 }, sources:{ weather:'open-meteo', aqi:'open-meteo' },
    }], completions:{} } } }, habits, true),
    /unknown habit/i,
    `${label}: strict backup validation rejects unknown habit IDs`,
  );
  assert.throws(
    () => normalizeInsightHistory({ version:1, days:{ '2026-08-30':{ recommendations:[{
      habitId:'beach', reason:'aqi-adapt', shownAt:shown.getTime(), lastShownAt:shown.getTime(),
      habitLabel:beachAdaptExposure.habitLabel, measurementType:beachAdaptExposure.measurementType,
      ruleVersion:1, rule:beachAdaptExposure.rule,
      conditions:{ aqi:-1 }, sources:{ weather:'open-meteo', aqi:'open-meteo' },
    }], completions:{} } } }, habits, true),
    /reading/i,
    `${label}: strict backup validation rejects out-of-domain environmental readings`,
  );

  const contradictory = plain(history);
  contradictory.days['2026-08-30'].completions = {};
  contradictory.days['2026-08-30'].recommendations[0].completedAt = shownLater.getTime();
  assert.throws(
    () => normalizeInsightHistory(contradictory, habits, true),
    /completion evidence/i,
    `${label}: strict validation rejects recommendation follow-through without a matching completion`,
  );

  const oversized = { version:1, days:{} };
  for (let index = 0; index < 401; index += 1) {
    const date = new Date(2025, 0, 1 + index, 12);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    oversized.days[key] = { recommendations:[], completions:{} };
  }
  pruneInsightHistory(oversized, new Date(2026, 2, 1, 12), 400);
  assert.equal(Object.keys(oversized.days).length, 400, `${label}: local evidence stays bounded to 400 dates`);
  assert.equal(Object.hasOwn(oversized.days, '2025-01-01'), false, `${label}: pruning removes the oldest date first`);

  assert.match(html, /const INSIGHT_STORAGE_KEY = 'wavelength_insights_v1'/,
    `${label}: prospective evidence uses its own local-only storage domain`);
  assert.match(html, /let insightHistory = normalizeInsightHistory\(null, DEFAULT_HABITS\)/,
    `${label}: evidence starts empty and never backfills historical weather`);
  assert.match(html, /function saveInsightHistory\(now = new Date\(\)\)[\s\S]*pruneInsightHistory\(insightHistory, now, 400\)[\s\S]*localStorage\.setItem\(INSIGHT_STORAGE_KEY/,
    `${label}: persisted evidence is normalized and retention-bounded`);
  assert.match(html, /let rhythmWeatherReadyGeneration = -1/,
    `${label}: partial environmental responses are not ready for evidence`);
  assert.match(html, /Promise\.allSettled\(\[forecastRequest, aqiRequest\]\)[\s\S]*rhythmWeatherReadyGeneration = generation[\s\S]*renderNextWave\(now\)/,
    `${label}: recommendation evidence waits for both environmental channels to settle`);
  assert.match(html, /rhythmUpdate\.weatherObservedAt\s*=\s*Date\.now\(\)/,
    `${label}: successful forecast snapshots carry their acquisition timestamp`);
  assert.match(html, /const aqiObservedAt = Date\.now\(\)[\s\S]*updateRhythmAnchors\(\{ \.\.\.rhythmWeatherData, aqi, aqiObservedAt \}, now\)/,
    `${label}: successful AQI snapshots carry their acquisition timestamp`);
  assert.match(html, /function renderNextWave\(now = new Date\(\)\)[\s\S]*rhythmWeatherReadyGeneration === rhythmWeatherGeneration[\s\S]*recordInsightSuggestion\(insightHistory, suggestion, rhythmWeatherData, now, exposure\)/,
    `${label}: only the stable final recommendation and its cue snapshot are recorded`);
  assert.match(html, /!document\.getElementById\('homeView'\)\.hidden[\s\S]*recordInsightSuggestion/,
    `${label}: contextual evidence requires a visible Home recommendation`);
  assert.match(html, /function setActiveView\(view,[^)]*\)[\s\S]*activeView === 'home'[\s\S]*renderNextWave\(viewNow\)/,
    `${label}: returning Home reconsiders a finalized candidate only after it becomes visible`);
  assert.match(html, /visibilitychange[\s\S]*document\.visibilityState === 'visible'[\s\S]*renderNextWave\(visibilityNow\)/,
    `${label}: a finalized candidate is reconsidered when the document becomes visible`);
  assert.match(html, /let rhythmWeatherController = null[\s\S]*rhythmWeatherController\?\.abort\(\)[\s\S]*rhythmWeatherData = null/,
    `${label}: each refresh aborts its predecessor and starts from a generation-local empty snapshot`);
  assert.match(html, /fetch\([^\n]+\{ signal:rhythmWeatherController\.signal \}\)/,
    `${label}: environmental requests use the active abort signal`);
  assert.match(html, /function refreshForDateRollover\(now = new Date\(\)\)[\s\S]*rhythmWeatherData = null/,
    `${label}: midnight rollover clears all time-sensitive environmental channels`);
  assert.match(html, /function ensureCurrentRenderedDate\(now\)[\s\S]*lastRenderedDateKey !== dateKey\(now\)[\s\S]*return false/,
    `${label}: stale pre-midnight controls can be rejected before mutation`);
  assert.match(html, /function toggleHabit\(id\)[\s\S]*if \(!ensureCurrentRenderedDate\(now\)\) return/,
    `${label}: check-once toggles reject stale rendered dates`);
  assert.match(html, /function adjustMeasuredHabit\(id, direction\)[\s\S]*if \(!ensureCurrentRenderedDate\(now\)\) return/,
    `${label}: measured controls reject stale rendered dates`);
  assert.match(html, /function focusNextWaveHabit\(\)[\s\S]*markInsightViewed\(insightHistory, habitId, now\)[\s\S]*saveInsightHistory\(now\)/,
    `${label}: View habit records an explicit view timestamp`);
  assert.match(html, /function toggleHabit\(id\)[\s\S]*recordInsightCompletion\(insightHistory, id, now, false\)[\s\S]*recordInsightCompletion\(insightHistory, id, now, true\)/,
    `${label}: check-once completion and uncompletion stay reversible in the ledger`);
  assert.match(html, /function adjustMeasuredHabit\(id, direction\)[\s\S]*recordInsightCompletion\(insightHistory, id, now, change\.complete\)/,
    `${label}: measured completion synchronizes prospective evidence`);
  assert.match(html, /resetHabitDay\(state, resetDate\)[\s\S]*clearInsightDate\(insightHistory, resetDate\)[\s\S]*renderInsights\(resetDate\)/,
    `${label}: Reset today removes the date's evidence and requires a fresh finalized cue`);
  assert.match(html, /function saveManageModal\(\)[\s\S]*saveState\(\);[\s\S]*saveInsightHistory\(editDate\);[\s\S]*renderHabits\(editDate\)/,
    `${label}: Manage changes remove completion evidence invalidated by a goal edit`);

  if (label === 'mobile') {
    assert.match(html, /function createBackupPayload\(\)[\s\S]*normalizeInsightHistoryAgainstState\([\s\S]*state, false\)/,
      `${label}: backup export repairs contradictory local evidence before serializing it`);
    assert.match(html, /const BACKUP_VERSION = 4;/, `${label}: personalized backups identify the version-4 schema`);
    assert.match(html, /const backupInsightHistory = normalizeInsightHistory\(insightHistory, HABITS, false\)[\s\S]*insightHistory:\s*backupInsightHistory/,
      `${label}: version-4 backups carry validated prospective evidence`);
    assert.match(html, /!\[1, 2, 3, BACKUP_VERSION\]\.includes\(payload\.version\)/,
      `${label}: version-1 through version-3 backups remain importable`);
    assert.match(html, /payload\.version === 1\s*\?\s*normalizeInsightHistory\(null, importedHabits\)\s*:\s*normalizeInsightHistory\(payload\.insightHistory, importedHabits, true\)/,
      `${label}: legacy imports start with no fabricated insight history`);
    assert.match(html, /normalizeInsightHistoryAgainstState\(importedInsightHistory, importedState, true\)/,
      `${label}: backup evidence is cross-checked against imported completion history before writes`);
  }

  const insightSeed = { version:1, days:{} };
  for (let index = 0; index < 10; index += 1) {
    const key = `2026-08-${String(10 + index).padStart(2, '0')}`;
    const timestamp = new Date(2026, 7, 10 + index, 9).getTime();
    const completedAt = timestamp + 1000;
    insightSeed.days[key] = {
      recommendations:[{
        habitId:'sunscreen', reason:'uv-protect', shownAt:timestamp, lastShownAt:timestamp,
        observedAt:timestamp - 1000,
        habitLabel:sunscreenExposure.habitLabel, measurementType:'check', ruleVersion:1, rule:sunscreenExposure.rule,
        completedAt:index < 8 ? completedAt : undefined,
        conditions:{ uv:5 + index / 10 }, sources:{ weather:'open-meteo' },
      }],
      completions:index < 8 ? { sunscreen:completedAt } : {},
    };
  }
  assert.deepEqual(plain(getConditionInsightCards({
    version:1,
    days:Object.fromEntries(Object.entries(insightSeed.days).slice(0, 9)),
  }, 10, new Date(2026, 7, 30, 12))), [], `${label}: comparative cards remain hidden below 10 distinct closed relevant days`);

  const conditionCards = plain(getConditionInsightCards(insightSeed, 10, new Date(2026, 7, 30, 12)));
  assert.deepEqual(conditionCards, [{
    id:'sun-wise', icon:'🧴', eyebrow:'Sun-wise', relevant:10, completed:8,
    title:'You marked “Sun protection before outdoor time” complete on 8 of 10 days when Wavelength showed a UV cue.',
    detail:'Observed in your history · Based on 10 closed UV-cue dates',
  }], `${label}: UV insight limits its claim to dates when Wavelength visibly showed the cue`);

  const currentDateSeed = plain(insightSeed);
  const currentTimestamp = new Date(2026, 7, 30, 9).getTime();
  currentDateSeed.days['2026-08-30'] = {
    recommendations:[{
      habitId:'sunscreen', reason:'uv-protect', shownAt:currentTimestamp, lastShownAt:currentTimestamp,
      observedAt:currentTimestamp - 1000, habitLabel:sunscreenExposure.habitLabel,
      measurementType:'check', ruleVersion:1, rule:sunscreenExposure.rule,
      completedAt:currentTimestamp + 1000, conditions:{uv:7}, sources:{weather:'open-meteo'},
    }],
    completions:{sunscreen:currentTimestamp + 1000},
  };
  assert.equal(getConditionInsightCards(currentDateSeed, 10, new Date(2026, 7, 30, 12))[0].relevant, 10,
    `${label}: the still-open current date is excluded from comparative denominators`);
  assert.deepEqual(
    plain(selectConditionInsightCard(conditionCards, new Date(2026, 7, 30, 12))),
    conditionCards[0],
    `${label}: one eligible condition insight is selected deterministically`,
  );

  const rotationSeed = plain(insightSeed);
  rotationSeed.days['2026-08-20'] = plain(rotationSeed.days['2026-08-19']);
  rotationSeed.days['2026-08-20'].recommendations[0].shownAt += 86400000;
  rotationSeed.days['2026-08-20'].recommendations[0].lastShownAt += 86400000;
  delete rotationSeed.days['2026-08-20'].recommendations[0].completedAt;
  rotationSeed.days['2026-08-20'].completions = {};
  Object.values(rotationSeed.days).slice(0, 10).forEach((day, index) => {
    const timestamp = day.recommendations[0].shownAt + 1;
    day.recommendations.push({
      habitId:'hydrate', reason:'heat-hydrate', shownAt:timestamp, lastShownAt:timestamp, observedAt:timestamp - 1000,
      habitLabel:'Drink 16 oz water', measurementType:'amount', ruleVersion:1,
      rule:{channel:'weather',reading:'feel',operator:'>',threshold:85},
      ...(index < 6 ? { completedAt:timestamp + 1000 } : {}),
      conditions:{feel:96}, sources:{weather:'open-meteo'},
    });
    if (index < 6) day.completions.hydrate = timestamp + 1000;
  });
  const rotatingCards = plain(getConditionInsightCards(rotationSeed, 10, new Date(2026, 7, 30, 12)));
  assert.deepEqual(rotatingCards.map(card => [card.id, card.relevant]), [['sun-wise', 11], ['heatwise', 10]],
    `${label}: eligible cards retain their own exact sample sizes`);
  const rotatedIds = new Set([
    selectConditionInsightCard(rotatingCards, new Date(2026, 7, 30, 12)).id,
    selectConditionInsightCard(rotatingCards, new Date(2026, 7, 31, 12)).id,
  ]);
  assert.deepEqual([...rotatedIds].sort(), ['heatwise', 'sun-wise'],
    `${label}: daily rotation includes every eligible card, not only the largest sample`);

  const adaptiveTimestamp = new Date(2026, 7, 30, 9).getTime();
  const adaptiveCompletedAt = adaptiveTimestamp + 1000;
  const adaptiveHistory = {
    version:1,
    days:{
      '2026-08-30':{
        recommendations:[
          { habitId:'sunscreen', reason:'uv-protect', shownAt:adaptiveTimestamp, lastShownAt:adaptiveTimestamp, observedAt:adaptiveTimestamp - 1000, completedAt:adaptiveCompletedAt, habitLabel:sunscreenExposure.habitLabel, measurementType:'check', ruleVersion:1, rule:sunscreenExposure.rule, conditions:{uv:7}, sources:{weather:'open-meteo'} },
          { habitId:'hydrate', reason:'heat-hydrate', shownAt:adaptiveTimestamp, lastShownAt:adaptiveTimestamp, observedAt:adaptiveTimestamp - 1000, completedAt:adaptiveCompletedAt, habitLabel:'Drink 16 oz water', measurementType:'amount', ruleVersion:1, rule:{channel:'weather',reading:'feel',operator:'>',threshold:85}, conditions:{feel:96}, sources:{weather:'open-meteo'} },
        ],
        completions:{ sunscreen:adaptiveCompletedAt, hydrate:adaptiveCompletedAt },
      },
    },
  };
  assert.equal(getAdaptiveDayCard(adaptiveHistory, new Date(2026, 7, 30, 12)), null,
    `${label}: the still-open current date cannot produce a retrospective narrative`);
  assert.deepEqual(plain(getAdaptiveDayCard(adaptiveHistory, new Date(2026, 7, 31, 12))), {
    id:'adaptive-day', icon:'🏄', eyebrow:'Context-aware follow-through',
    title:'You completed two habits after Wavelength showed contextual cues on Aug 30.',
    detail:'“Sun protection before outdoor time” and “Drink 16 oz water” were marked complete.',
    date:'2026-08-30', completed:2,
  }, `${label}: a closed multi-exposure day becomes a literal narrative without a hidden score`);
  adaptiveHistory.days['2026-08-30'].completions = { sunscreen:adaptiveCompletedAt };
  delete adaptiveHistory.days['2026-08-30'].recommendations[1].completedAt;
  assert.equal(getAdaptiveDayCard(adaptiveHistory, new Date(2026, 7, 31, 12)), null,
    `${label}: removing one completion removes an unsupported adaptive-day story`);

  assert.match(html, /id="conditionInsightSection"[^>]*hidden/, `${label}: evidence-gated condition card starts hidden`);
  assert.match(html, /id="adaptiveDaySection"[^>]*hidden/, `${label}: narrative card starts hidden`);
  assert.match(html, /id="insightLearning"/, `${label}: Insights explains why adaptive cards are not visible yet`);
  assert.match(html, /<p>Condition-aware insights appear after 10 relevant days\. Each insight will show the sample it is based on\.<\/p>/,
    `${label}: learning copy states the threshold and future sample disclosure plainly`);
  assert.match(html, /function renderAdaptiveInsights\(now = new Date\(\)\)[\s\S]*\.textContent = selected\.title[\s\S]*\.textContent = adaptiveDay\.detail/,
    `${label}: adaptive card copy renders as text rather than HTML`);
  assert.doesNotMatch(html, /high-UV days met|poor-air days still included|You adapted well|A flexible win|Rescue Swap|Waves Ridden/,
    `${label}: reporting copy avoids generalized condition and inferred-adaptation claims`);
}

console.log('navigation and insights regression tests passed for mobile and desktop');
