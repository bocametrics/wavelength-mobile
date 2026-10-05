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

function extractConst(source, name) {
  const match = source.match(new RegExp(`const ${name}\\s*=\\s*[^;]+;`));
  assert.ok(match, `${name} is missing`);
  return match[0];
}

function loadLifecycleFunctions(source) {
  const constants = [
    'HABIT_CATALOG_SCHEMA_VERSION',
    'HABIT_CATALOG_KEY',
    'MAX_CUSTOM_HABITS',
  ];
  const dependencyConstants = ['RHYTHM_TYPES'];
  const names = [
    'createDefaultHabitCatalogState',
    'normalizeHabitIcon',
    'normalizeCustomHabitDefinition',
    'normalizeHabitCatalogState',
    'loadHabitCatalogState',
    'saveHabitCatalogState',
    'createCustomHabitId',
    'buildCompleteHabitCatalog',
    'isHabitActiveOnDate',
    'getHabitsActiveOnDate',
    'setHabitActiveOnDate',
    'reconcileCompleteHabitOrder',
  ];
  const context = {
    // Keep the lifecycle model test independent from unrelated runtime derivation.
    buildRuntimeHabits(defaults, overrides = {}) {
      return defaults.map(habit => ({ ...habit, ...(overrides[habit.id] || {}) }));
    },
  };
  vm.createContext(context);
  const dependencyNames = [
    'normalizeCategoryEmoji',
    'normalizeHabitDays',
    'normalizeMeasurementConfig',
    'normalizePreferenceWindow',
    'isConciseRhythmNote',
    'normalizeRhythmConfig',
    'isValidDateKey',
  ];
  const availableDependencies = dependencyNames
    .filter(name => source.includes(`function ${name}(`))
    .map(name => extractFunction(source, name));
  vm.runInContext(
    `${constants.map(name => extractConst(source, name)).join('\n')}\n` +
    `${dependencyConstants.map(name => extractConst(source, name)).join('\n')}\n` +
    `${availableDependencies.join('\n')}\n` +
    `${names.map(name => extractFunction(source, name)).join('\n')}\n` +
    `globalThis.exports = { ${constants.join(', ')}, ${names.join(', ')} };`,
    context,
  );
  return context.exports;
}

function loadStoredStateFunctions(source) {
  const names = [
    'isValidDateKey',
    'normalizeMeasurementConfig',
    'normalizeProgressByDate',
    'normalizeStoredState',
  ];
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${names.map(name => extractFunction(source, name)).join('\n')}\n` +
    `globalThis.exports = { ${names.join(', ')} };`,
    context,
  );
  return context.exports;
}

const plain = value => JSON.parse(JSON.stringify(value));
const migrationDate = '2026-10-05';
const activeCategoryIds = ['morning', 'movement', 'mind', 'fuel', 'hygiene', 'evening'];

function customDefinition(overrides = {}) {
  return {
    id:'habit_11111111-1111-4111-8111-111111111111',
    cat:'morning',
    icon:'⭐',
    text:'Walk after lunch',
    note:'Take a short reset outside',
    activeFrom:migrationDate,
    days:[0,1,2,3,4,5,6],
    measurement:'check',
    ...overrides,
  };
}

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const defaults = extractDefaultHabits(html);
  const byId = Object.fromEntries(defaults.map(habit => [habit.id, habit]));
  const { normalizeStoredState } = loadStoredStateFunctions(html);
  const {
    HABIT_CATALOG_SCHEMA_VERSION,
    HABIT_CATALOG_KEY,
    MAX_CUSTOM_HABITS,
    createDefaultHabitCatalogState,
    normalizeHabitIcon,
    normalizeCustomHabitDefinition,
    normalizeHabitCatalogState,
    loadHabitCatalogState,
    saveHabitCatalogState,
    createCustomHabitId,
    buildCompleteHabitCatalog,
    isHabitActiveOnDate,
    getHabitsActiveOnDate,
    setHabitActiveOnDate,
    reconcileCompleteHabitOrder,
  } = loadLifecycleFunctions(html);

  assert.equal(HABIT_CATALOG_SCHEMA_VERSION, 1, `${label}: habit lifecycle catalog begins at schema 1`);
  assert.equal(HABIT_CATALOG_KEY, 'wavelength_habit_catalog_v1', `${label}: lifecycle data uses an isolated storage key`);
  assert.equal(MAX_CUSTOM_HABITS, 100, `${label}: custom habit count is bounded`);

  const initial = plain(createDefaultHabitCatalogState(migrationDate));
  assert.deepEqual(initial, {
    schemaVersion:1,
    customDefinitions:[],
    status:[{
      habitId:'medication',
      initialActive:true,
      changes:[{ date:migrationDate, active:false }],
    }],
  }, `${label}: first lifecycle migration archives Medication without deleting it`);
  assert.equal(byId.medication.text, 'Take medication as prescribed',
    `${label}: migration targets the stable Medication identity`);

  const firstLoadWrites = [];
  const emptyStorage = {
    getItem:() => null,
    setItem:(key, value) => firstLoadWrites.push([key, value]),
  };
  assert.deepEqual(
    plain(loadHabitCatalogState(defaults, activeCategoryIds, migrationDate, emptyStorage)),
    initial,
    `${label}: first load returns the deterministic Medication migration`,
  );
  assert.equal(firstLoadWrites.length, 1,
    `${label}: first load persists the migration immediately so its date cannot drift`);
  assert.equal(firstLoadWrites[0][0], HABIT_CATALOG_KEY,
    `${label}: first migration writes only the isolated lifecycle key`);
  assert.deepEqual(JSON.parse(firstLoadWrites[0][1]), initial,
    `${label}: persisted first migration matches the validated in-memory state`);

  const restoredOnMigrationDate = plain(setHabitActiveOnDate(
    initial, 'medication', true, migrationDate, defaults,
  ));
  assert.deepEqual(restoredOnMigrationDate.status, [],
    `${label}: restoring Medication on migration day removes the now-redundant transition`);
  const savedValues = new Map([[HABIT_CATALOG_KEY, firstLoadWrites[0][1]]]);
  const persistentStorage = {
    getItem:key => savedValues.get(key) ?? null,
    setItem:(key, value) => savedValues.set(key, value),
  };
  saveHabitCatalogState(restoredOnMigrationDate, defaults, activeCategoryIds, migrationDate, persistentStorage);
  assert.deepEqual(
    plain(loadHabitCatalogState(defaults, activeCategoryIds, '2026-10-06', persistentStorage)),
    restoredOnMigrationDate,
    `${label}: a restored Medication state reloads without being archived again`,
  );

  let malformedWrites = 0;
  const malformedStorage = {
    getItem:() => '{"schemaVersion":1,"customDefinitions":"broken"}',
    setItem:() => { malformedWrites += 1; },
  };
  assert.deepEqual(
    plain(loadHabitCatalogState(defaults, activeCategoryIds, migrationDate, malformedStorage)),
    initial,
    `${label}: malformed local lifecycle data falls back safely`,
  );
  assert.equal(malformedWrites, 0,
    `${label}: malformed local lifecycle data is not silently overwritten`);

  const readOnlyStorage = {
    getItem:() => null,
    setItem:() => { throw new Error('Quota exceeded'); },
  };
  assert.deepEqual(
    plain(loadHabitCatalogState(defaults, activeCategoryIds, migrationDate, readOnlyStorage)),
    initial,
    `${label}: first migration remains usable when lifecycle storage cannot be written`,
  );

  assert.equal(isHabitActiveOnDate(initial, 'medication', '2026-10-04'), true,
    `${label}: Medication remains historically active before migration`);
  assert.equal(isHabitActiveOnDate(initial, 'medication', migrationDate), false,
    `${label}: Medication is archived on the migration date`);
  assert.equal(isHabitActiveOnDate(initial, 'medication', '2026-10-06'), false,
    `${label}: Medication remains archived after migration`);
  assert.equal(isHabitActiveOnDate(initial, 'floss', migrationDate), true,
    `${label}: unrelated shipped habits remain active`);

  assert.equal(normalizeHabitIcon('⭐'), '⭐', `${label}: one emoji is a valid custom habit icon`);
  assert.equal(normalizeHabitIcon('👨‍👩‍👧‍👦'), '👨‍👩‍👧‍👦', `${label}: one joined emoji grapheme remains intact`);
  assert.equal(normalizeHabitIcon('⭐🌿'), '', `${label}: multiple emoji are rejected`);
  assert.equal(normalizeHabitIcon('star'), '', `${label}: plain text is not a habit icon`);

  const validCustom = plain(normalizeCustomHabitDefinition(
    customDefinition(), defaults, activeCategoryIds, true,
  ));
  assert.deepEqual(validCustom, customDefinition(), `${label}: a canonical custom definition round-trips exactly`);
  assert.deepEqual(
    plain(normalizeCustomHabitDefinition(customDefinition({
      id:'habit_22222222-2222-4222-8222-222222222222',
      measurement:'count',
      target:3,
    }), defaults, activeCategoryIds, true)),
    customDefinition({
      id:'habit_22222222-2222-4222-8222-222222222222',
      measurement:'count',
      target:3,
    }),
    `${label}: custom Count tracking preserves a positive whole-number goal`,
  );
  assert.deepEqual(
    plain(normalizeCustomHabitDefinition(customDefinition({
      id:'habit_33333333-3333-4333-8333-333333333333',
      measurement:'amount',
      target:64,
      step:12,
      unit:'oz',
    }), defaults, activeCategoryIds, true)),
    customDefinition({
      id:'habit_33333333-3333-4333-8333-333333333333',
      measurement:'amount',
      target:64,
      step:12,
      unit:'oz',
    }),
    `${label}: custom Amount tracking preserves target, increment, and unit`,
  );

  assert.throws(() => normalizeCustomHabitDefinition(customDefinition({ id:'wake' }), defaults, activeCategoryIds, true),
    /habit id|unique|collision/i, `${label}: a custom definition cannot reuse a shipped ID`);
  assert.throws(() => normalizeCustomHabitDefinition(customDefinition({ id:'custom-unsafe' }), defaults, activeCategoryIds, true),
    /habit id/i, `${label}: custom IDs must use the opaque habit_ namespace`);
  assert.throws(() => normalizeCustomHabitDefinition(customDefinition({ cat:'all' }), defaults, activeCategoryIds, true),
    /category/i, `${label}: All is never a custom habit destination`);
  assert.throws(() => normalizeCustomHabitDefinition(customDefinition({ icon:'⭐🌿' }), defaults, activeCategoryIds, true),
    /emoji|icon/i, `${label}: a custom habit accepts exactly one emoji icon`);
  assert.throws(() => normalizeCustomHabitDefinition(customDefinition({ text:'' }), defaults, activeCategoryIds, true),
    /name|title|text/i, `${label}: a custom habit requires a name`);
  assert.throws(() => normalizeCustomHabitDefinition(customDefinition({ text:'x'.repeat(49) }), defaults, activeCategoryIds, true),
    /48|name|title|text/i, `${label}: custom habit names keep the 48-character mobile limit`);
  assert.throws(() => normalizeCustomHabitDefinition(customDefinition({ note:'x'.repeat(43) }), defaults, activeCategoryIds, true),
    /42|description|note/i, `${label}: custom descriptions keep the 42-character card limit`);
  assert.throws(() => normalizeCustomHabitDefinition(customDefinition({ days:[] }), defaults, activeCategoryIds, true),
    /day|schedule/i, `${label}: a custom habit must repeat on at least one day`);
  assert.throws(() => normalizeCustomHabitDefinition(customDefinition({ measurement:'count', target:1.5 }), defaults, activeCategoryIds, true),
    /count|whole|target|measurement/i, `${label}: Count goals must be positive whole numbers`);
  assert.throws(() => normalizeCustomHabitDefinition(customDefinition({ measurement:'amount', target:64, step:12, unit:'' }), defaults, activeCategoryIds, true),
    /amount|unit|measurement/i, `${label}: Amount tracking requires a unit`);
  assert.throws(() => normalizeCustomHabitDefinition(customDefinition({ rhythm:{ type:'unknown-anchor' } }), defaults, activeCategoryIds, true),
    /rhythm|anchor/i, `${label}: custom habit rhythm rejects unknown anchor types`);
  assert.throws(() => normalizeCustomHabitDefinition(customDefinition({ rhythm:{ type:'uv-above', threshold:-1 } }), defaults, activeCategoryIds, true),
    /rhythm|threshold|anchor/i, `${label}: custom habit rhythm rejects invalid thresholds`);
  assert.throws(() => normalizeCustomHabitDefinition(customDefinition({ rhythm:{ type:'uv-above', threshold:3, note:'x'.repeat(61) } }), defaults, activeCategoryIds, true),
    /rhythm|note|anchor/i, `${label}: custom habit rhythm keeps cue copy bounded`);
  assert.throws(() => normalizeCustomHabitDefinition(customDefinition({ rhythm:{ type:'uv-above', threshold:3, nested:{ unsafe:true } } }), defaults, activeCategoryIds, true),
    /rhythm|field|anchor/i, `${label}: custom habit rhythm rejects unsupported nested data`);
  assert.throws(() => normalizeCustomHabitDefinition(customDefinition({ preferenceWindow:{ idealStart:600, idealEnd:540 } }), defaults, activeCategoryIds, true),
    /preference|window|ideal/i, `${label}: custom preference windows reject reversed bounds`);
  assert.throws(() => normalizeCustomHabitDefinition(customDefinition({ preferenceWindow:{ idealStart:480, idealEnd:540, unsafe:true } }), defaults, activeCategoryIds, true),
    /preference|window|field/i, `${label}: custom preference windows reject unsupported fields`);
  const timedCustom = customDefinition({
    rhythm:{ type:'uv-above', threshold:3, note:'Use sun protection' },
    preferenceWindow:{ idealStart:480, idealEnd:540 },
  });
  assert.deepEqual(
    plain(normalizeCustomHabitDefinition(timedCustom, defaults, activeCategoryIds, true)),
    timedCustom,
    `${label}: canonical rhythm and preference-window settings round-trip exactly`,
  );

  const normalized = plain(normalizeHabitCatalogState({
    schemaVersion:1,
    customDefinitions:[customDefinition()],
    status:[
      { habitId:'medication', initialActive:true, changes:[
        { date:'2026-10-05', active:false },
        { date:'2026-10-05', active:true },
        { date:'2026-10-05', active:false },
        { date:'2026-10-07', active:false },
        { date:'2026-10-08', active:true },
        { date:'2026-10-09', active:true },
      ] },
    ],
  }, defaults, activeCategoryIds, migrationDate, true));
  assert.deepEqual(normalized.status, [{
    habitId:'medication',
    initialActive:true,
    changes:[
      { date:'2026-10-05', active:false },
      { date:'2026-10-08', active:true },
    ],
  }], `${label}: lifecycle normalization keeps one final transition per date and removes adjacent no-ops`);

  const tooMany = Array.from({ length:MAX_CUSTOM_HABITS + 1 }, (_, index) => customDefinition({
    id:`habit_${index.toString(16).padStart(8, '0')}`,
    text:`Habit ${index}`,
  }));
  assert.throws(() => normalizeHabitCatalogState({
    schemaVersion:1,
    customDefinitions:tooMany,
    status:[],
  }, defaults, activeCategoryIds, migrationDate, true), /100|count|many|limit/i,
  `${label}: strict imports reject an unbounded custom catalog`);
  assert.throws(() => normalizeHabitCatalogState({
    schemaVersion:1,
    customDefinitions:[customDefinition(), customDefinition()],
    status:[],
  }, defaults, activeCategoryIds, migrationDate, true), /duplicate|unique/i,
  `${label}: strict imports reject duplicate custom IDs`);
  assert.throws(() => normalizeHabitCatalogState({
    schemaVersion:1,
    customDefinitions:[],
    status:[{ habitId:'missing', initialActive:true, changes:[{ date:migrationDate, active:false }] }],
  }, defaults, activeCategoryIds, migrationDate, true), /unknown|habit/i,
  `${label}: lifecycle transitions cannot reference an unknown habit`);
  assert.throws(() => normalizeHabitCatalogState({
    schemaVersion:1,
    customDefinitions:[],
    status:[{ habitId:'floss', initialActive:true, changes:[{ date:'2026-02-30', active:false }] }],
  }, defaults, activeCategoryIds, migrationDate, true), /date/i,
  `${label}: lifecycle transitions require real local dates`);

  const generatedTokens = [
    '11111111-1111-4111-8111-111111111111',
    '44444444-4444-4444-8444-444444444444',
  ];
  const generatedId = createCustomHabitId(
    [...defaults, customDefinition()],
    () => generatedTokens.shift(),
  );
  assert.equal(generatedId, 'habit_44444444-4444-4444-8444-444444444444',
    `${label}: ID generation retries collisions and returns an opaque stable ID`);

  const complete = plain(buildCompleteHabitCatalog(
    defaults,
    { wake:{ note:'Keep the custom wake note' } },
    { schemaVersion:1, customDefinitions:[customDefinition()], status:[] },
  ));
  assert.equal(complete.length, defaults.length + 1, `${label}: complete catalog combines shipped and custom habits`);
  assert.equal(complete.find(habit => habit.id === 'wake').note, 'Keep the custom wake note',
    `${label}: shipped overrides remain intact in the complete catalog`);
  const builtCustom = complete.find(habit => habit.id === customDefinition().id);
  assert.deepEqual(builtCustom.context, { recommend:false },
    `${label}: a new custom habit cannot receive invented Next Wave timing`);
  assert.equal(builtCustom.targetLabel, '', `${label}: a new custom habit has no invented system target`);

  const customCatalog = {
    schemaVersion:1,
    customDefinitions:[customDefinition()],
    status:initial.status,
  };
  const allHabits = plain(buildCompleteHabitCatalog(defaults, {}, customCatalog));
  const beforeMigration = plain(getHabitsActiveOnDate(allHabits, customCatalog, '2026-10-04'));
  const onMigration = plain(getHabitsActiveOnDate(allHabits, customCatalog, migrationDate));
  assert.ok(beforeMigration.some(habit => habit.id === 'medication'),
    `${label}: the historical active subset keeps Medication before archive`);
  assert.ok(!beforeMigration.some(habit => habit.id === customDefinition().id),
    `${label}: a newly created custom habit does not appear before activeFrom`);
  assert.ok(!onMigration.some(habit => habit.id === 'medication'),
    `${label}: the current active subset excludes archived Medication`);
  assert.ok(onMigration.some(habit => habit.id === customDefinition().id),
    `${label}: a custom habit becomes eligible on its creation date`);

  const restored = plain(setHabitActiveOnDate(customCatalog, 'medication', true, '2026-10-07', allHabits));
  assert.equal(isHabitActiveOnDate(restored, 'medication', '2026-10-06'), false,
    `${label}: restore does not rewrite the archived interval`);
  assert.equal(isHabitActiveOnDate(restored, 'medication', '2026-10-07'), true,
    `${label}: restore reactivates the same identity on its effective date`);
  assert.deepEqual(restored.customDefinitions, customCatalog.customDefinitions,
    `${label}: restore does not duplicate or rewrite custom definitions`);

  const retainedCompletionState = {
    done:{ '2026-10-07':{ medication:true } },
    progress:{},
    streak:4,
    longestStreak:9,
    week:{},
    created:1,
  };
  const retainedSnapshot = plain(retainedCompletionState);
  setHabitActiveOnDate(customCatalog, 'medication', true, '2026-10-07', allHabits);
  assert.deepEqual(retainedCompletionState, retainedSnapshot,
    `${label}: restoring a habit never deletes or rewrites its stored completion`);

  const archivedAmountDefinition = customDefinition({
    id:'habit_55555555-5555-4555-8555-555555555555',
    measurement:'amount',
    target:64,
    step:8,
    unit:'oz',
  });
  const completeWithArchivedAmount = plain(buildCompleteHabitCatalog(defaults, {}, {
    schemaVersion:1,
    customDefinitions:[archivedAmountDefinition],
    status:[{
      habitId:archivedAmountDefinition.id,
      initialActive:true,
      changes:[{ date:migrationDate, active:false }],
    }],
  }));
  const normalizedRetainedState = plain(normalizeStoredState({
    done:{ [migrationDate]:{ medication:true } },
    progress:{ [migrationDate]:{ [archivedAmountDefinition.id]:24 } },
    streak:1,
    longestStreak:2,
    week:{},
    created:1,
  }, completeWithArchivedAmount, true));
  assert.equal(normalizedRetainedState.done[migrationDate].medication, true,
    `${label}: completion normalization retains archived shipped-habit IDs`);
  assert.equal(normalizedRetainedState.progress[migrationDate][archivedAmountDefinition.id], 24,
    `${label}: progress normalization retains archived custom-habit IDs`);

  const sameDayFinal = plain(setHabitActiveOnDate(restored, 'medication', false, '2026-10-07', allHabits));
  assert.deepEqual(sameDayFinal.status, initial.status,
    `${label}: same-day archive after restore collapses to the final archived state`);
  assert.throws(() => setHabitActiveOnDate(customCatalog, 'missing', false, migrationDate, allHabits), /unknown|habit/i,
    `${label}: archive cannot invent an unknown habit`);

  const customId = customDefinition().id;
  const savedOrder = ['floss', 'medication', customId, 'wake', 'floss', 'retired-id'];
  const reconciled = plain(reconcileCompleteHabitOrder(savedOrder, allHabits));
  assert.deepEqual(reconciled.slice(0, 4), ['floss', 'medication', customId, 'wake'],
    `${label}: local order reconciliation preserves active, archived, and custom identities`);
  assert.equal(new Set(reconciled).size, allHabits.length,
    `${label}: reconciled order contains every complete-catalog ID exactly once`);
  assert.deepEqual(new Set(reconciled), new Set(allHabits.map(habit => habit.id)),
    `${label}: reconciled order drops retired IDs and appends every missing known ID`);

  const resetContext = {
    localStorage:{ setItem(key, value) { this.saved = [key, value]; } },
    renderHabits() {},
    showToast() {},
  };
  vm.createContext(resetContext);
  vm.runInContext(
    `const ORDER_KEY = 'order';\n` +
    `let ALL_HABITS = ${JSON.stringify(allHabits)};\n` +
    `let HABITS = ALL_HABITS.filter(habit => habit.id !== 'medication');\n` +
    `let userOrder = ['floss','medication','wake'];\n` +
    `${extractFunction(html, 'saveOrder')}\n` +
    `${extractFunction(html, 'resetOrder')}\n` +
    `resetOrder(); globalThis.result = { userOrder, saved:localStorage.saved };`,
    resetContext,
  );
  assert.deepEqual(
    plain(resetContext.result.userOrder),
    allHabits.map(habit => habit.id),
    `${label}: resetting order retains archived IDs in their complete-catalog slots`,
  );

  const rolloverCalls = [];
  const rolloverContext = {
    dateKey:value => value.key,
    reloadHabits:value => rolloverCalls.push(`reload:${value.key}`),
    updateDateDisplay:value => rolloverCalls.push(`date:${value.key}`),
    renderHabits:value => rolloverCalls.push(`habits:${value.key}`),
    renderInsights:value => rolloverCalls.push(`insights:${value.key}`),
    rhythmWeatherController:null,
    rhythmWeatherData:{ stale:true },
    rhythmWeatherGeneration:0,
    rhythmWeatherRefreshPromise:{ stale:true },
    lastRenderedDateKey:'2026-10-05',
  };
  vm.createContext(rolloverContext);
  vm.runInContext(
    `${extractFunction(html, 'refreshForDateRollover')}\n` +
    `globalThis.changed = refreshForDateRollover({ key:'2026-10-06' });`,
    rolloverContext,
  );
  assert.equal(rolloverContext.changed, true, `${label}: a new local date triggers rollover`);
  assert.deepEqual(
    rolloverCalls,
    ['reload:2026-10-06','date:2026-10-06','habits:2026-10-06','insights:2026-10-06'],
    `${label}: rollover refreshes the date-effective active catalog before rendering`,
  );

  assert.match(html, /let ALL_HABITS\s*=\s*\[\]/,
    `${label}: runtime exposes a complete catalog for history validation`);
  assert.match(html, /let HABITS\s*=\s*\[\]/,
    `${label}: runtime retains a distinct current active catalog`);
  assert.match(html, /HABITS\s*=\s*getHabitsActiveOnDate\(ALL_HABITS,\s*habitCatalogState,\s*[^)]+\)/,
    `${label}: current behavior derives active habits from the complete catalog`);
  assert.match(html, /state = loadState\(ALL_HABITS\)/,
    `${label}: completion and progress state validate against archived as well as active habits`);
  assert.match(html, /loadInsightHistory\(ALL_HABITS, state\)/,
    `${label}: prospective evidence loads against the complete habit catalog`);
  assert.match(extractFunction(html, 'saveInsightHistory'), /normalizeInsightHistory\(insightHistory, ALL_HABITS\.length \? ALL_HABITS : DEFAULT_HABITS, false\)/,
    `${label}: saving prospective evidence cannot drop records for archived habits`);
}

console.log('habit lifecycle model regression tests passed for mobile and desktop');
