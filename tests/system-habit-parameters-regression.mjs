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

function loadSystemFunctions(html) {
  const definitions = html.match(/const SYSTEM_HABIT_PARAMETER_DEFS\s*=\s*\{[\s\S]*?\n\};/);
  assert.ok(definitions, 'system habit parameter definitions are missing');
  const names = [
    'parseSystemClockTime',
    'formatSystemClockTime',
    'normalizeSystemHabitParams',
    'parseLegacySystemHabitTitle',
    'formatSystemHabitTitle',
    'deriveSystemHabitContext',
    'buildRuntimeHabits',
    'normalizeCustomHabitOverrides',
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

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const {
    parseSystemClockTime,
    formatSystemClockTime,
    normalizeSystemHabitParams,
    parseLegacySystemHabitTitle,
    formatSystemHabitTitle,
    deriveSystemHabitContext,
    buildRuntimeHabits,
    normalizeCustomHabitOverrides,
  } = loadSystemFunctions(html);

  assert.equal(parseSystemClockTime('23:30'), 1410, `${label}: canonical bedtime parses to minutes`);
  assert.equal(formatSystemClockTime('23:30'), '11:30 PM', `${label}: canonical bedtime renders naturally`);
  assert.deepEqual(
    plain(normalizeSystemHabitParams('sleep', { targetTime:'23:30' }, true)),
    { targetTime:'23:30' },
    `${label}: sleep accepts a structured target time`,
  );
  assert.deepEqual(
    plain(parseLegacySystemHabitTitle('sleep', 'In bed by 11:30 PM')),
    { targetTime:'23:30' },
    `${label}: recognized legacy bedtime title migrates without parsing arbitrary prose`,
  );
  assert.deepEqual(
    plain(parseLegacySystemHabitTitle('wake', 'Wake at 7:30 AM')),
    { targetTime:'07:30' },
    `${label}: recognized legacy wake title migrates like bedtime`,
  );
  assert.equal(
    parseLegacySystemHabitTitle('sleep', 'Sleep when the moon feels right'),
    null,
    `${label}: unrecognized legacy titles are not guessed`,
  );
  for (const nearMiss of ['In Bed By 11:30 PM', 'In bed by 11:30 pm', 'In bed by 11:30PM', ' In bed by 11:30 PM', 'In bed by  11:30 PM']) {
    assert.equal(parseLegacySystemHabitTitle('sleep', nearMiss), null,
      `${label}: legacy migration rejects non-exact title form ${JSON.stringify(nearMiss)}`);
  }
  for (const nearMiss of ['Wake At 7:30 AM', 'Wake at 7:30 am', 'Wake at 7:30AM', ' Wake at 7:30 AM', 'Wake at  7:30 AM']) {
    assert.equal(parseLegacySystemHabitTitle('wake', nearMiss), null,
      `${label}: wake migration rejects non-exact title form ${JSON.stringify(nearMiss)}`);
  }
  assert.equal(
    formatSystemHabitTitle('sleep', { targetTime:'23:30' }),
    'In bed by 11:30 PM',
    `${label}: generated sleep title and structured value cannot drift`,
  );

  const titleCases = [
    ['wake', { targetTime:'07:00' }, 'Wake at 7:00 AM'],
    ['hydrate', { amount:20 }, 'Drink 20 oz water'],
    ['stretch', { durationMinutes:15 }, '15-minute mobility'],
    ['strength', { durationMinutes:30 }, 'Strength for 30+ min'],
    ['cardio', { durationMinutes:20 }, 'Cardio for 20 min'],
    ['meditate', { durationMinutes:15 }, 'Meditate for 15 min'],
    ['learn', { durationMinutes:30 }, 'Read or learn for 30 min'],
    ['dinner', { targetTime:'19:30' }, 'Finish dinner by 7:30 PM'],
    ['winddown', { durationMinutes:45 }, 'No screens for 45 min before bed'],
    ['gratitude', { count:5 }, 'Name 5 good things'],
  ];
  for (const [habitId, params, expected] of titleCases) {
    assert.equal(formatSystemHabitTitle(habitId, params), expected, `${label}: ${habitId} uses natural generated copy`);
  }
  assert.deepEqual(
    plain(normalizeSystemHabitParams('hydrate', { amount:24 }, true)),
    { amount:24 },
    `${label}: quantity parameters remain numeric`,
  );
  assert.deepEqual(
    plain(normalizeSystemHabitParams('gratitude', { count:5 }, true)),
    { count:5 },
    `${label}: count parameters remain whole numbers`,
  );
  assert.throws(
    () => normalizeSystemHabitParams('meditate', { durationMinutes:0 }, true),
    /invalid duration/i,
    `${label}: invalid system durations fail closed`,
  );
  assert.throws(
    () => normalizeSystemHabitParams('sleep', { targetTime:'11:30 PM' }, true),
    /invalid time/i,
    `${label}: stored clock values use canonical 24-hour form`,
  );
  assert.throws(
    () => normalizeSystemHabitParams('sleep', { targetTime:'00:30' }, true),
    /invalid time/i,
    `${label}: bedtime rejects midnight-crossing values outside the supported evening window`,
  );
  assert.deepEqual(
    plain(normalizeSystemHabitParams('sleep', { targetTime:'23:59' }, true)),
    { targetTime:'23:59' },
    `${label}: latest supported bedtime remains valid`,
  );

  assert.deepEqual(
    plain(normalizeCustomHabitOverrides(
      { sleep:{ text:'In bed by 11:30 PM', weight:2 } },
      [{ id:'sleep', text:'In bed by 10 PM', weight:2 }],
      true,
    )),
    { sleep:{ params:{ targetTime:'23:30' } } },
    `${label}: legacy bedtime text migrates to params while obsolete weight is discarded`,
  );
  assert.deepEqual(
    plain(normalizeCustomHabitOverrides(
      { wake:{ text:'Wake at 7:30 AM' } },
      [{ id:'wake', text:'Wake at 6:30 AM' }],
      true,
    )),
    { wake:{ params:{ targetTime:'07:30' } } },
    `${label}: a version-2 wake title migrates instead of becoming a frozen override`,
  );
  assert.deepEqual(
    plain(normalizeCustomHabitOverrides(
      { sleep:{ text:'Sleep when the moon feels right' } },
      [{ id:'sleep', text:'In bed by 10 PM' }],
      true,
    )),
    { sleep:{ text:'Sleep when the moon feels right' } },
    `${label}: unrecognized legacy system titles survive migration unchanged`,
  );
  assert.equal(
    buildRuntimeHabits(
      [{ id:'sleep', text:'In bed by 10:00 PM', context:{} }],
      { sleep:{ text:'Sleep when the moon feels right' } },
    )[0].text,
    'Sleep when the moon feels right',
    `${label}: grandfathered unrecognized titles survive runtime construction as read-only text`,
  );
  assert.deepEqual(
    plain(normalizeCustomHabitOverrides(
      { sleep:{ params:{ targetTime:'23:30' } } },
      [{ id:'sleep', text:'In bed by 10 PM' }],
      true,
    )),
    { sleep:{ params:{ targetTime:'23:30' } } },
    `${label}: structured system parameters pass strict backup validation`,
  );
  assert.deepEqual(
    plain(normalizeCustomHabitOverrides(
      { sleep:{ params:{ targetTime:'22:00' } } },
      [{ id:'sleep', text:'In bed by 10 PM' }],
      true,
    )),
    {},
    `${label}: default-equivalent parameters are suppressed from storage`,
  );
  assert.throws(
    () => normalizeCustomHabitOverrides(
      { sleep:{ params:{ targetTime:'tomorrow' } } },
      [{ id:'sleep', text:'In bed by 10 PM' }],
      true,
    ),
    /invalid time/i,
    `${label}: malformed imported system parameters fail closed`,
  );
  assert.match(html, /const SYSTEM_HABIT_IDS = new Set\(DEFAULT_HABITS\.map\(h => h\.id\)\);/,
    `${label}: every shipped default has an explicit system identity independent of parameters`);
  assert.match(html, /const isSystem = SYSTEM_HABIT_IDS\.has\(h\.id\);[\s\S]*?\$\{isSystem \? `<div class="eh-system-title">/,
    `${label}: every system habit title renders locked, not only parameterized habits`);
  assert.match(html, /\$\{isSystem \? `<div class="eh-system-anchor">System anchor · /,
    `${label}: system anchors render as visible read-only summaries`);
  assert.match(html, /<div class="eh-rhythm-block" \$\{isSystem \? 'hidden' : ''\}>/,
    `${label}: system rhythm editors are withheld from the active UI`);
  assert.match(html, /const existingOverrides = loadCustomHabits\(\) \|\| \{\};[\s\S]*?const hasGrandfatheredTitle = hasParams[\s\S]*?parseLegacySystemHabitTitle\(id, existingText\) === null;[\s\S]*?else if \(hasGrandfatheredTitle\) changes\.text = existingText;/,
    `${label}: Manage saves retain only existing unrecognized parameterized-system titles`);

  const paramsById = {
    sleep:{ targetTime:'23:30' },
    winddown:{ durationMinutes:30 },
  };
  assert.deepEqual(
    plain(deriveSystemHabitContext('sleep', { setting:'indoor', duration:30 }, paramsById)),
    { start:1380, idealStart:1395, urgencyStart:1400, end:1410, setting:'indoor', duration:30 },
    `${label}: sleep recommendation window moves to the edited bedtime`,
  );
  assert.deepEqual(
    plain(deriveSystemHabitContext('winddown', { setting:'indoor', duration:30 }, paramsById)),
    {
      start:1320, idealStart:1365, urgencyStart:1380, end:1410, setting:'indoor', duration:30,
      timelyDetail:'Your wind-down window before bed is open.', urgentDetail:'Bedtime is approaching.',
    },
    `${label}: screen-free timing follows the same bedtime`,
  );

  const defaults = [
    { id:'winddown', text:'No screens 30 min before bed', context:{ setting:'indoor', duration:30 } },
    { id:'sleep', text:'In bed by 10 PM', context:{ setting:'indoor', duration:30 } },
  ];
  const runtime = buildRuntimeHabits(defaults, {
    sleep:{ params:{ targetTime:'23:30' } },
  });
  assert.equal(runtime.find(habit => habit.id === 'sleep').text, 'In bed by 11:30 PM', `${label}: runtime sleep title uses the saved parameter`);
  assert.equal(runtime.find(habit => habit.id === 'sleep').context.end, 1410, `${label}: runtime sleep eligibility closes at 11:30 PM`);
  assert.equal(runtime.find(habit => habit.id === 'winddown').context.urgencyStart, 1380, `${label}: runtime screen-free urgency begins 30 minutes before bedtime`);

  const durationContext = deriveSystemHabitContext(
    'meditate',
    { start:360, idealStart:720, end:1350, setting:'either', duration:10 },
    { meditate:{ durationMinutes:20 } },
  );
  assert.equal(durationContext.duration, 20, `${label}: a duration parameter updates Next Wave fit calculations`);
  const dinnerContext = deriveSystemHabitContext(
    'dinner',
    { setting:'indoor', duration:30 },
    { dinner:{ targetTime:'19:30' } },
  );
  assert.deepEqual(
    plain(dinnerContext),
    {
      start:990, idealStart:1050, urgencyStart:1110, end:1170, setting:'indoor', duration:30,
      timelyDetail:'Your dinner window is open.', urgentDetail:'Your dinner window is closing.',
    },
    `${label}: a dinner cutoff moves its full recommendation window without stale 7 PM copy`,
  );
}

console.log('system habit parameter regression tests passed for mobile and desktop');
