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
    'parseDisplayClockMinutes',
    'getDaylightState',
    'getEffectiveRecommendationContext',
    'getHabitRecommendationFit',
    'getHabitAdaptiveSuggestion',
    'getNextWaveRefreshDelay',
    'getNextWaveSuggestion',
  ];
  const rhythmPrelude = html.match(/const RHYTHM_TYPES\s*=\s*[^;]+;/);
  assert.ok(rhythmPrelude, 'rhythm constants are missing');
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${rhythmPrelude[0]}\n${names.map(name => extractFunction(html, name)).join('\n')}\n` +
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

const atTime = (hour, minute = 0) => new Date(2026, 7, 31, hour, minute, 0, 0);
const doneFor = (date, ids) => ({
  [`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`]: Object.fromEntries(ids.map(id => [id, true])),
});
const plain = value => JSON.parse(JSON.stringify(value));

const contextualHabits = [
  {
    id:'beach', cat:'movement', icon:'🌊', text:'Outdoor walk or movement', note:'Walk or roll',
    rhythm:{ type:'aqi-below', threshold:100 },
    context:{ start:390, idealStart:480, urgencyStart:1110, end:1260, setting:'outdoor', daylight:'required', duration:20,
      goal:'Move every day', adaptations:{ afterDark:{ title:'Keep your movement habit indoors tonight.', detail:'Try 10 minutes of gentle indoor movement.' } } },
  },
  {
    id:'meditate', cat:'mind', icon:'🧠', text:'Meditate 10 min', note:'Breath focus',
    context:{ start:360, idealStart:720, end:1350, setting:'either', duration:10 },
  },
  {
    id:'winddown', cat:'evening', icon:'🌙', text:'No screens 30 min before bed', note:'Settle down',
    context:{ start:1230, idealStart:1275, urgencyStart:1290, end:1320, setting:'indoor', duration:30,
      timelyDetail:'Your wind-down window before bed is open.', urgentDetail:'Bedtime is approaching.' },
  },
];

const dinner = {
  id:'dinner', cat:'fuel', icon:'🍳', text:'Early dinner (before 7)', note:'Finish with enough time to wind down',
  context:{ start:960, idealStart:1020, urgencyStart:1080, end:1140, setting:'indoor', duration:30,
    timelyDetail:'Your before-7 dinner window is open.', urgentDetail:'Your before-7 dinner window is closing.' },
};

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const { getEffectiveRecommendationContext, getHabitRecommendationFit, getNextWaveRefreshDelay, getNextWaveSuggestion } = loadFunctions(html);
  const productionHabits = loadDefaultHabits(html);
  const beach = contextualHabits[0];
  const winddown = contextualHabits[2];

  assert.deepEqual(
    plain(getHabitRecommendationFit(winddown, atTime(19, 21), { isDay:1 })),
    { eligible:false, reason:'early', phase:'unavailable', nextBoundary:1230 },
    `${label}: the pre-bed habit is not eligible at 7:21 PM`,
  );
  assert.equal(
    getHabitRecommendationFit(winddown, atTime(20, 30), { isDay:0 }).eligible,
    true,
    `${label}: the wind-down window opens at 8:30 PM`,
  );
  assert.deepEqual(
    plain(getHabitRecommendationFit(beach, atTime(20), { isDay:0 })),
    { eligible:false, reason:'dark', phase:'unavailable', nextBoundary:null },
    `${label}: an outdoor habit is ineligible after dark`,
  );
  assert.equal(
    getHabitRecommendationFit(beach, atTime(19), { isDay:1 }).eligible,
    true,
    `${label}: the same outdoor habit remains eligible while daylight is present`,
  );
  assert.equal(
    getHabitRecommendationFit(beach, atTime(20), { isDay:1, sunrise:'6:58 AM', sunset:'7:30 PM' }).reason,
    'dark',
    `${label}: known solar times override a stale current is-day snapshot after sunset`,
  );

  assert.equal(
    getNextWaveRefreshDelay([winddown], atTime(20, 29), null),
    60050,
    `${label}: the recommendation refreshes just after the wind-down window opens`,
  );
  assert.equal(
    getNextWaveRefreshDelay([beach], atTime(19, 20), { sunrise:'6:58 AM', sunset:'7:30 PM' }),
    600050,
    `${label}: sunset becomes the next automatic recommendation boundary`,
  );

  const earlyEvening = atTime(19, 21);
  assert.equal(
    getNextWaveSuggestion(contextualHabits, doneFor(earlyEvening, ['beach']), {}, earlyEvening, { isDay:1 })?.habitId,
    'meditate',
    `${label}: a fitting Mind habit outranks an Evening habit whose window has not opened`,
  );

  const bedtimeWindow = atTime(21, 15);
  assert.deepEqual(
    plain(getNextWaveSuggestion(contextualHabits, doneFor(bedtimeWindow, ['beach']), {}, bedtimeWindow, { isDay:0 })),
    {
      habitId:'winddown', category:'evening', icon:'🌙', reason:'ideal-now', eyebrow:'Ideal now',
      title:'No screens 30 min before bed', detail:'Your wind-down window before bed is open.', action:'View habit',
    },
    `${label}: the opening wind-down window is explained rather than selected only by category`,
  );

  const dinnerClosing = atTime(18, 10);
  assert.deepEqual(
    plain(getNextWaveSuggestion([contextualHabits[0], dinner], doneFor(dinnerClosing, []), {}, dinnerClosing, { aqi:43, isDay:1 })),
    {
      habitId:'dinner', category:'fuel', icon:'🍳', reason:'window-closing', eyebrow:'Window closing',
      title:'Early dinner (before 7)', detail:'Your before-7 dinner window is closing.', action:'View habit',
    },
    `${label}: a closing meal window outranks favorable AQI as an optional outdoor opportunity`,
  );

  const afterDark = atTime(20);
  assert.equal(
    getNextWaveSuggestion(contextualHabits, doneFor(afterDark, ['winddown']), {}, afterDark, { aqi:43, isDay:0 })?.habitId,
    'meditate',
    `${label}: good AQI cannot make an after-dark outdoor walk outrank an eligible indoor habit`,
  );

  assert.deepEqual(
    plain(getNextWaveSuggestion([beach], doneFor(afterDark, []), {}, afterDark, { aqi:43, isDay:0 })),
    {
      habitId:'beach', category:'movement', icon:'🌊', reason:'after-dark-adapt', eyebrow:'Adapt tonight',
      title:'Outdoor walk or movement', detail:'Try 10 minutes of gentle indoor movement.', action:'View habit',
    },
    `${label}: an indoor version preserves the movement goal when darkness is the only blocker`,
  );

  const veryLate = atTime(23);
  assert.equal(
    getNextWaveSuggestion([beach], doneFor(veryLate, []), {}, veryLate, { aqi:43, isDay:0 }).reason,
    'not-timely',
    `${label}: the indoor alternative is not used after the movement window itself has passed`,
  );

  const tooEarly = atTime(19, 21);
  const quiet = getNextWaveSuggestion([winddown], doneFor(tooEarly, []), {}, tooEarly, { isDay:1 });
  assert.deepEqual(
    plain(quiet),
    {
      habitId:null, category:null, icon:'○', reason:'not-timely', eyebrow:'A quiet moment',
      title:'Nothing is especially timely right now.', detail:'You still have 1 habit open today.', action:null,
    },
    `${label}: no-fit state is honest instead of forcing an untimely recommendation`,
  );

  const tooLate = atTime(23);
  const lateQuiet = getNextWaveSuggestion(contextualHabits, doneFor(tooLate, []), {}, tooLate, { aqi:43, isDay:0 });
  assert.equal(lateQuiet.reason, 'not-timely', `${label}: passed windows produce the calm no-fit state`);
  assert.equal(lateQuiet.habitId, null, `${label}: passed windows do not force a habit`);

  const sunsetData = { aqi:43, isDay:1, sunrise:'6:58 AM', sunset:'7:42 PM' };
  const productionBeach = productionHabits.find(habit => habit.id === 'beach');
  const productionSleep = productionHabits.find(habit => habit.id === 'sleep');
  const productionFloss = productionHabits.find(habit => habit.id === 'floss');
  const productionMobility = productionHabits.find(habit => habit.id === 'stretch');
  const productionHydration = productionHabits.find(habit => habit.id === 'hydrate');
  const productionSunscreen = productionHabits.find(habit => habit.id === 'sunscreen');
  const productionDaylight = productionHabits.find(habit => habit.id === 'daylight');
  const completedExcept = (date, openIds) => doneFor(date, productionHabits
    .filter(habit => !openIds.includes(habit.id))
    .map(habit => habit.id));

  assert.equal(getHabitRecommendationFit(productionMobility, atTime(9), { isDay:1 }).phase, 'ideal',
    `${label}: mobility is ideal during its default preferred window`);
  assert.equal(getHabitRecommendationFit(productionMobility, atTime(13), { isDay:1 }).phase, 'flexible',
    `${label}: mobility remains flexible after its default preferred window`);
  assert.equal(getHabitRecommendationFit(productionMobility, atTime(21, 9), { isDay:0 }).phase, 'late',
    `${label}: mobility enters its gentle late form near the end of its eligible window`);

  const eveningPreference = {
    eligibleStart:840,
    idealStart:1080,
    idealEnd:1200,
    lateStart:1320,
    eligibleEnd:1380,
  };
  assert.deepEqual(
    plain(getEffectiveRecommendationContext(productionMobility, eveningPreference)),
    {
      ...plain(productionMobility.context),
      start:840,
      idealStart:1080,
      idealEnd:1200,
      lateStart:1320,
      end:1380,
    },
    `${label}: a future personal window replaces timing defaults without changing habit identity or category`,
  );
  assert.deepEqual(
    plain(getEffectiveRecommendationContext(productionMobility, { ...eveningPreference, idealEnd:1390 })),
    plain(productionMobility.context),
    `${label}: malformed future preference windows fail closed as one atomic override`,
  );
  assert.equal(getHabitRecommendationFit(productionMobility, atTime(17), { isDay:1 }, eveningPreference).phase, 'available',
    `${label}: a personalized habit can be available before its ideal window`);
  assert.equal(getHabitRecommendationFit(productionMobility, atTime(19), { isDay:0 }, eveningPreference).phase, 'ideal',
    `${label}: a personalized evening preference determines the ideal phase`);
  assert.equal(getHabitRecommendationFit(productionMobility, atTime(21), { isDay:0 }, eveningPreference).phase, 'flexible',
    `${label}: a personalized evening preference determines the flexible phase`);
  assert.equal(getHabitRecommendationFit(productionMobility, atTime(22, 30), { isDay:0 }, eveningPreference).phase, 'late',
    `${label}: a personalized evening preference determines the late phase`);
  assert.equal(getHabitRecommendationFit(productionMobility, atTime(23), { isDay:0 }, eveningPreference).eligible, false,
    `${label}: a personalized eligibility boundary closes the recommendation window`);
  assert.equal(
    getHabitRecommendationFit({ ...productionMobility, cat:'movement' }, atTime(21, 9), { isDay:0 }).phase,
    'late',
    `${label}: moving mobility between browse categories does not alter recommendation timing`,
  );

  const mobilityIdeal = getNextWaveSuggestion(
    productionHabits, completedExcept(atTime(9), ['stretch']), {}, atTime(9), { isDay:1 }, null,
  );
  assert.deepEqual(
    plain(mobilityIdeal),
    {
      habitId:'stretch', category:'morning', icon:'🧘', reason:'ideal-now', eyebrow:'Ideal now',
      title:'10-min mobility', detail:'This is a good time for it.', action:'View habit',
    },
    `${label}: mobility keeps its habit title during its ideal window`,
  );
  const mobilityFlexible = getNextWaveSuggestion(
    productionHabits, completedExcept(atTime(13), ['stretch']), {}, atTime(13), { isDay:1 }, null,
  );
  assert.deepEqual(
    plain(mobilityFlexible),
    {
      habitId:'stretch', category:'morning', icon:'🧘', reason:'still-fits', eyebrow:'Still fits today',
      title:'10-min mobility', detail:'A mobility session can still work later in the day.', action:'View habit',
    },
    `${label}: mobility is framed as flexible after its preferred window`,
  );
  const mobilityLate = getNextWaveSuggestion(
    productionHabits, completedExcept(atTime(21, 9), ['stretch']), {}, atTime(21, 9), { isDay:0 }, null,
  );
  assert.deepEqual(
    plain(mobilityLate),
    {
      habitId:'stretch', category:'morning', icon:'🧘', reason:'late-form', eyebrow:'Keep it gentle',
      title:'10-min mobility', detail:'A lighter session can still work tonight.', action:'View habit',
    },
    `${label}: mobility keeps its title while late-form copy changes around it`,
  );

  const personalizedIdeal = getNextWaveSuggestion(
    productionHabits, completedExcept(atTime(19), ['stretch']), {}, atTime(19), { isDay:0 }, null,
    { stretch:eveningPreference },
  );
  assert.equal(personalizedIdeal.reason, 'ideal-now', `${label}: future personal windows flow through the selector`);
  assert.equal(personalizedIdeal.title, productionMobility.text, `${label}: personalization never changes habit identity`);

  const titleInvariantScenarios = [
    ['AQI adaptation', [productionBeach], atTime(12), { aqi:160, isDay:1 }, null],
    ['AQI opportunity', [productionBeach], atTime(12), { aqi:43, isDay:1 }, null],
    ['daylight cue', [productionDaylight], atTime(8), { isDay:1, sunrise:'6:58 AM', sunset:'7:42 PM' }, null],
    ['UV cue', [productionSunscreen], atTime(12), { uv:4, isDay:1 }, null],
    ['heat cue', [{ ...productionHydration, text:'Drink 24 oz water' }], atTime(12), { feel:95, isDay:1 }, null],
  ];
  for (const [scenario, habits, date, data, cue] of titleInvariantScenarios) {
    const suggestion = getNextWaveSuggestion(habits, doneFor(date, []), {}, date, data, cue);
    assert.equal(suggestion.title, habits[0].text, `${label}: ${scenario} preserves the current habit title`);
  }

  const afterBreakfast = atTime(9);
  const breakfastCue = {
    habitId:'breakfast',
    dateKey:'2026-08-31',
    completedAt:afterBreakfast.getTime() - 5 * 60 * 1000,
  };
  assert.deepEqual(
    plain(getNextWaveSuggestion(
      productionHabits,
      completedExcept(afterBreakfast, ['floss']),
      {},
      afterBreakfast,
      { isDay:1 },
      breakfastCue,
    )),
    {
      habitId:'floss', category:'hygiene', icon:'🦷', reason:'completion-cue', eyebrow:'An easy next step',
      title:'Floss',
      detail:'Breakfast is done. Take two minutes to floss.',
      action:'View habit',
    },
    `${label}: a fresh breakfast completion makes Floss the useful next step`,
  );
  const afterDinner = atTime(19);
  assert.equal(
    getNextWaveSuggestion(
      productionHabits,
      completedExcept(afterDinner, ['floss']),
      {},
      afterDinner,
      { isDay:0 },
      { habitId:'dinner', dateKey:'2026-08-31', completedAt:afterDinner.getTime() - 60 * 1000 },
    ).detail,
    'Dinner is done. Take two minutes to floss.',
    `${label}: dinner uses the same calm cue with the correct meal name`,
  );
  assert.notEqual(
    getNextWaveSuggestion(
      productionHabits,
      completedExcept(afterBreakfast, ['floss']),
      {},
      afterBreakfast,
      { isDay:1 },
      { habitId:'breakfast', dateKey:'2026-08-31', completedAt:afterBreakfast.getTime() - 16 * 60 * 1000 },
    ).reason,
    'completion-cue',
    `${label}: a meal checked more than 15 minutes ago does not masquerade as recent`,
  );
  assert.notEqual(
    getNextWaveSuggestion(
      productionHabits,
      completedExcept(afterBreakfast, ['floss', 'breakfast']),
      {},
      afterBreakfast,
      { isDay:1 },
      breakfastCue,
    ).reason,
    'completion-cue',
    `${label}: unchecking the source meal invalidates its cue`,
  );
  assert.notEqual(
    getNextWaveSuggestion(
      productionHabits,
      completedExcept(afterBreakfast, ['floss']),
      {},
      afterBreakfast,
      { isDay:1 },
      { habitId:'lunch', dateKey:'2026-08-31', completedAt:afterBreakfast.getTime() - 60 * 1000 },
    ).reason,
    'completion-cue',
    `${label}: lunch is not silently added to the approved breakfast/dinner cue`,
  );
  assert.deepEqual(Array.from(productionFloss.context.afterCompletion), ['breakfast','dinner'],
    `${label}: Floss declares its completion relationship independently of category`);

  const daylightClosing = atTime(19, 21);
  assert.equal(
    getNextWaveRefreshDelay([productionBeach], atTime(19), sunsetData),
    420050,
    `${label}: the clock refreshes when the final comfortable daylight window begins`,
  );
  assert.equal(
    getNextWaveRefreshDelay([productionBeach], daylightClosing, sunsetData),
    60050,
    `${label}: the clock refreshes when the full-duration outdoor version stops fitting`,
  );
  assert.equal(
    getNextWaveRefreshDelay([productionMobility], atTime(11, 59), null),
    60050,
    `${label}: the card refreshes when mobility leaves its ideal window`,
  );
  assert.equal(
    getNextWaveRefreshDelay([productionMobility], atTime(20, 29), null),
    60050,
    `${label}: the card refreshes when mobility enters its late form`,
  );
  assert.equal(
    getNextWaveRefreshDelay([productionMobility], atTime(19, 59), null, { stretch:eveningPreference }),
    60050,
    `${label}: future personal boundaries also schedule an immediate phase refresh`,
  );
  assert.deepEqual(
    plain(getNextWaveSuggestion(productionHabits, completedExcept(daylightClosing, ['beach']), {}, daylightClosing, sunsetData)),
    {
      habitId:'beach', category:'movement', icon:'🌊', reason:'daylight-closing', eyebrow:'Daylight closing',
      title:'Outdoor walk or movement', detail:'About 21 minutes of daylight remain.', action:'View habit',
    },
    `${label}: a barely sufficient daylight window is surfaced as closing rather than broadly favorable`,
  );

  const daylightTooShort = atTime(19, 30);
  assert.equal(
    getHabitRecommendationFit(productionBeach, daylightTooShort, sunsetData).reason,
    'daylight-short',
    `${label}: an outdoor habit is ineligible when its duration no longer fits before sunset`,
  );
  assert.equal(
    getNextWaveSuggestion(productionHabits, completedExcept(daylightTooShort, ['beach']), {}, daylightTooShort, sunsetData).reason,
    'low-light-adapt',
    `${label}: insufficient remaining daylight can preserve the movement goal indoors`,
  );

  const missedBedtime = atTime(22, 5);
  assert.equal(
    getNextWaveSuggestion(productionHabits, completedExcept(missedBedtime, ['sleep']), {}, missedBedtime, { isDay:0 }).reason,
    'not-timely',
    `${label}: the 10 PM bedtime target is not recommended after 10 PM`,
  );
  assert.equal(productionSleep.context.end, 1320, `${label}: the shipped sleep window closes at its stated 10 PM target`);

  assert.match(html, /id:'beach'[\s\S]{0,500}context:\{[^}]*setting:'outdoor'[^}]*daylight:'required'/,
    `${label}: the shipped outdoor habit declares setting and daylight context`);
  assert.match(html, /id:'beach'[\s\S]{0,700}goal:'Move every day'[\s\S]{0,300}afterDark:/,
    `${label}: the shipped movement habit separates its goal from an after-dark version`);
  assert.match(html, /id:'winddown'[\s\S]{0,500}context:\{[^}]*start:1230[^}]*idealStart:1275/,
    `${label}: the shipped wind-down habit has an explicit bedtime-relative window`);
  assert.match(html, /id:'medication'[\s\S]{0,500}context:\{[^}]*recommend:false/,
    `${label}: prescribed medication is never selected by a generic fallback`);
  assert.match(html, /function renderNextWave\(now = new Date\(\)\)[\s\S]*scheduleNextWaveContextRefresh\(now\)/,
    `${label}: every recommendation render schedules the next context boundary refresh`);
}

console.log('next wave context eligibility regression tests passed for mobile and desktop');
