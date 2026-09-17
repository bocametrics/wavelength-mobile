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

function extractDefaultHabits(source) {
  const start = source.indexOf('const DEFAULT_HABITS = [');
  assert.notEqual(start, -1, 'DEFAULT_HABITS is missing');
  const end = source.indexOf('\n];', start);
  assert.notEqual(end, -1, 'DEFAULT_HABITS does not terminate');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end + 3)}\nglobalThis.result = DEFAULT_HABITS;`, context);
  return JSON.parse(JSON.stringify(context.result));
}

function loadTargetFunctions(html) {
  const definitions = html.match(/const SYSTEM_HABIT_PARAMETER_DEFS\s*=\s*\{[\s\S]*?\n\};/);
  assert.ok(definitions, 'system habit parameter definitions are missing');
  const names = [
    'parseSystemClockTime',
    'formatSystemClockTime',
    'normalizeSystemHabitParams',
    'parseLegacySystemHabitTitle',
    'formatSystemHabitTarget',
    'deriveSystemHabitContext',
    'buildRuntimeHabits',
    'normalizeMeasurementConfig',
    'normalizeHabitDays',
  ];
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${definitions[0]}\n${names.map(name => extractFunction(html, name)).join('\n')}\n` +
    `globalThis.exports = { ${names.join(', ')} };`,
    context,
  );
  return context.exports;
}

const plain = value => JSON.parse(JSON.stringify(value));

const expectedIdentities = {
  wake:'Wake', hydrate:'Drink water', stretch:'Mobility', strength:'Strength', cardio:'Cardio',
  meditate:'Meditate', learn:'Focused learning', dinner:'Finish dinner', winddown:'Wind down',
  gratitude:'Name good things', sleep:'In bed', journal:'Journal',
  breakfast:'Have a balanced breakfast', lunch:'Have a balanced lunch',
};

const expectedCrosswalkNotes = {
  hydrate:'Set an amount that works for you',
  cardio:'Run, bike, dance, or do intervals',
  learn:'Practice, recall, or focused research',
  journal:'One insight, sentence, or page',
  breakfast:'Choose what works for your morning',
  lunch:'Choose what works for your day',
  dinner:'Leave time to wind down before bed',
  winddown:'Dim lights and put screens away',
  sleep:"Make room for a full night's sleep",
};

const targetCases = [
  ['wake', { targetTime:'07:00' }, 'at 7:00 AM'],
  ['hydrate', { amount:20 }, '20 oz'],
  ['stretch', { durationMinutes:15 }, '15 min'],
  ['strength', { durationMinutes:30 }, '30+ min'],
  ['cardio', { durationMinutes:20 }, '20 min'],
  ['meditate', { durationMinutes:15 }, '15 min'],
  ['learn', { durationMinutes:30 }, '30 min'],
  ['dinner', { targetTime:'19:30' }, 'by 7:30 PM'],
  ['winddown', { durationMinutes:45 }, '45 min'],
  ['gratitude', { count:5 }, '5 things'],
  ['sleep', { targetTime:'23:30' }, 'by 11:30 PM'],
];

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const defaults = extractDefaultHabits(html);
  const byId = Object.fromEntries(defaults.map(habit => [habit.id, habit]));
  const {
    normalizeSystemHabitParams,
    parseLegacySystemHabitTitle,
    formatSystemHabitTarget,
    deriveSystemHabitContext,
    buildRuntimeHabits,
    normalizeMeasurementConfig,
    normalizeHabitDays,
  } = loadTargetFunctions(html);

  for (const [id, expected] of Object.entries(expectedIdentities)) {
    assert.equal(byId[id].text, expected, `${label}: ${id} stores a stable identity without its adjustable target`);
  }
  for (const [id, expected] of Object.entries(expectedCrosswalkNotes)) {
    assert.equal(byId[id].note, expected, `${label}: ${id} uses the approved crosswalk description`);
  }
  for (const [id, params, expected] of targetCases) {
    assert.equal(formatSystemHabitTarget(id, params), expected, `${label}: ${id} formats an independent target label`);
  }
  const legacyTitleCases = [
    ['hydrate', 'Drink 24 oz water', { amount:24 }],
    ['stretch', '15-minute mobility', { durationMinutes:15 }],
    ['strength', 'Strength for 30+ min', { durationMinutes:30 }],
    ['cardio', 'Cardio for 20 min', { durationMinutes:20 }],
    ['meditate', 'Meditate for 15 min', { durationMinutes:15 }],
    ['learn', 'Read or learn for 30 min', { durationMinutes:30 }],
    ['dinner', 'Finish dinner by 7:30 PM', { targetTime:'19:30' }],
    ['winddown', 'No screens for 45 min before bed', { durationMinutes:45 }],
    ['gratitude', 'Name 5 good things', { count:5 }],
  ];
  for (const [id, retiredText, expected] of legacyTitleCases) {
    assert.deepEqual(plain(parseLegacySystemHabitTitle(id, retiredText)), expected,
      `${label}: ${id} migrates the exact retired generated title to structured params`);
  }
  assert.deepEqual(
    plain(normalizeSystemHabitParams('meditate', {}, true)),
    { durationMinutes:5 },
    `${label}: meditation starts with the approved five-minute target`,
  );

  const runtime = buildRuntimeHabits([
    { id:'meditate', text:'Meditate', context:{} },
    { id:'gratitude', text:'Name good things', context:{} },
  ], {
    meditate:{ params:{ durationMinutes:15 } },
    gratitude:{ params:{ count:5 } },
  });
  assert.deepEqual(
    plain(runtime.map(habit => ({ id:habit.id, text:habit.text, targetLabel:habit.targetLabel }))),
    [
      { id:'meditate', text:'Meditate', targetLabel:'15 min' },
      { id:'gratitude', text:'Name good things', targetLabel:'5 things' },
    ],
    `${label}: runtime identity and target cannot drift or collapse back into one title`,
  );

  const wakeRelativeParams = {
    wake:{ targetTime:'08:00' },
    meditate:{ durationMinutes:5 },
  };
  assert.deepEqual(
    plain(deriveSystemHabitContext('daylight', {
      start:360, idealStart:390, urgencyStart:540, end:660,
      setting:'outdoor', daylight:'required', duration:10,
    }, wakeRelativeParams)),
    {
      start:480, idealStart:480, idealEnd:540, urgencyStart:600, end:660,
      setting:'outdoor', daylight:'required', duration:10,
    },
    `${label}: daylight follows the editable Wake target while retaining its 11 AM close`,
  );
  assert.deepEqual(
    plain(deriveSystemHabitContext('hydrate', {
      start:300, idealStart:360, end:1260, setting:'either', duration:2,
    }, wakeRelativeParams)),
    { start:480, idealStart:480, idealEnd:600, end:600, setting:'either', duration:2 },
    `${label}: hydration uses a two-hour after-wake window`,
  );
  assert.deepEqual(
    plain(deriveSystemHabitContext('meditate', {
      start:360, idealStart:720, end:1350, setting:'either', duration:10,
    }, wakeRelativeParams)),
    { start:480, idealStart:480, idealEnd:510, end:1350, setting:'either', duration:5 },
    `${label}: meditation is ideal for 30 minutes after Wake and stays flexible later`,
  );
  const lateWakeDaylight = deriveSystemHabitContext('daylight', {
    start:360, idealStart:390, urgencyStart:540, end:660,
    setting:'outdoor', daylight:'required', duration:10,
  }, { wake:{ targetTime:'11:30' } });
  assert.equal(lateWakeDaylight.start, 690, `${label}: a late Wake target never creates a pre-wake light window`);
  assert.equal(lateWakeDaylight.end, 750, `${label}: a late Wake target still receives one hour for daylight`);

  assert.deepEqual(byId.beach.context.afterCompletion, ['lunch'], `${label}: movement follows Lunch without competing with the breakfast/dinner floss cue`);
  assert.deepEqual(byId.floss.context.afterCompletion, ['breakfast','dinner'], `${label}: the existing floss cue sources remain unchanged`);
  assert.equal(byId.beach.context.completionCue.eyebrow, 'A good time to move', `${label}: movement has reviewed cue framing`);
  assert.equal(byId.beach.context.completionCue.detail, '{source} is done. A 5–10 minute walk can fit here.', `${label}: movement cue offers a short version without adding a habit`);
  assert.equal(byId.beach.context.completionCue.requiresEligibility, true, `${label}: the movement cue respects time, daylight, and context eligibility`);
  assert.equal(byId.supplements.context.recommend, false, `${label}: supplements remain excluded from Next Wave`);
  assert.equal(byId.medication.context.recommend, false, `${label}: medication remains excluded from Next Wave`);

  assert.equal(normalizeMeasurementConfig(byId.journal).type, 'check', `${label}: Journal remains check once`);
  assert.equal(normalizeMeasurementConfig(byId.gratitude).type, 'check', `${label}: Gratitude remains check once`);
  assert.deepEqual(plain(normalizeHabitDays(byId.strength.days)), [0,1,2,3,4,5,6], `${label}: Strength stays available every day`);
  assert.deepEqual(plain(normalizeHabitDays(byId.cardio.days)), [0,1,2,3,4,5,6], `${label}: Cardio stays available every day`);

  assert.match(html, /class="habit-name">\$\{escapeHtml\(h\.text\)\}<\/span>/,
    `${label}: Home renders stable identity separately`);
  assert.match(html, /class="habit-target"[^>]*>\$\{escapeHtml\(h\.targetLabel\)\}<\/span>/,
    `${label}: Home renders the adjustable target as a separate escaped qualifier`);
  assert.match(html, /id="nextWaveTarget"/,
    `${label}: Next Wave reserves a separate target element`);
  assert.match(html, /target\.textContent\s*=\s*suggestion\.targetLabel\s*\|\|\s*''/,
    `${label}: Next Wave updates the target without rewriting the identity`);
  assert.match(html, /cueConfig\.requiresEligibility[\s\S]*?eligibleHabits\.includes\(habit\)/,
    `${label}: generalized completion cues can require ordinary eligibility`);
  assert.match(html, /cueConfig\.detail\.replace\('\{source\}', sourceLabel\)/,
    `${label}: completion-cue copy is data-driven rather than floss-hardcoded`);
  assert.match(html, /class="eh-system-name">/,
    `${label}: Manage locks the stable system identity separately`);
  assert.match(html, /class="eh-system-target"/,
    `${label}: Manage previews the adjustable target separately`);
  assert.match(html, /\.habit-target\s*\{[\s\S]*?color:\s*var\(--text2\)/,
    `${label}: the target has a secondary visual treatment that does not rely on title text`);
}

console.log('habit target qualifier regression tests passed for mobile and desktop');
