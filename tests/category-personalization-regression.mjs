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

function extractConst(source, name, terminator = ';') {
  const start = source.indexOf(`const ${name} =`);
  assert.notEqual(start, -1, `${name} is missing`);
  const end = source.indexOf(terminator, start);
  assert.notEqual(end, -1, `${name} does not terminate`);
  return source.slice(start, end + terminator.length);
}

function loadCategoryFunctions(html) {
  const start = html.indexOf('const CATEGORY_SCHEMA_VERSION =');
  const end = html.indexOf('\ntry {\n  recoverStorageSnapshot(localStorage);', start);
  assert.notEqual(start, -1, 'category model start is missing');
  assert.notEqual(end, -1, 'category model end is missing');
  const names = [
    'createDefaultCategoryState',
    'normalizeCategoryEmoji',
    'getCategoryIcon',
    'normalizeCategoryState',
    'getActiveCategoryDefinitions',
    'getEffectiveCategoryId',
    'applyCategoryStateToHabits',
    'setHabitCategoryAssignment',
    'moveCategoryInOrder',
    'reorderActiveCategoryIds',
    'reorderHabitIdsWithinCategory',
    'setCategoryArchived',
    'addCategoryDefinition',
    'updateCategoryDefinition',
    'deleteCategoryDefinition',
    'loadCategoryState',
    'saveCategoryState',
    'commitStorageSnapshot',
    'recoverStorageSnapshot',
  ];
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nglobalThis.exports = { ${names.join(', ')}, CATEGORY_ICON_MAP, DEFAULT_CATEGORY_DEFINITIONS };`, context);
  return context.exports;
}

const plain = value => JSON.parse(JSON.stringify(value));
const defaultHabitCats = [
  ['wake','morning'], ['affirm','morning'], ['strength','movement'],
  ['meditate','mind'], ['breakfast','fuel'], ['floss','hygiene'], ['sleep','evening'],
].map(([id, cat]) => ({ id, cat }));

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const {
    createDefaultCategoryState,
    normalizeCategoryEmoji,
    getCategoryIcon,
    normalizeCategoryState,
    getActiveCategoryDefinitions,
    getEffectiveCategoryId,
    applyCategoryStateToHabits,
    setHabitCategoryAssignment,
    moveCategoryInOrder,
    reorderActiveCategoryIds,
    reorderHabitIdsWithinCategory,
    setCategoryArchived,
    addCategoryDefinition,
    updateCategoryDefinition,
    deleteCategoryDefinition,
    loadCategoryState,
    saveCategoryState,
    commitStorageSnapshot,
    recoverStorageSnapshot,
    CATEGORY_ICON_MAP,
    DEFAULT_CATEGORY_DEFINITIONS,
  } = loadCategoryFunctions(html);

  assert.deepEqual(
    plain(DEFAULT_CATEGORY_DEFINITIONS.map(category => category.id)),
    ['morning','movement','mind','fuel','hygiene','evening'],
    `${label}: shipped real category IDs remain stable`,
  );
  assert.equal(Object.hasOwn(CATEGORY_ICON_MAP, 'all'), false, `${label}: All is virtual rather than a persisted category icon`);

  const defaults = plain(createDefaultCategoryState());
  assert.deepEqual(defaults, {
    schemaVersion:2,
    catalogVersion:1,
    definitions:[
      { id:'morning', name:'Morning', iconKey:'sunrise', archived:false },
      { id:'movement', name:'Movement', iconKey:'movement', archived:false },
      { id:'mind', name:'Mind', iconKey:'mind', archived:false },
      { id:'fuel', name:'Fuel', iconKey:'fuel', archived:false },
      { id:'hygiene', name:'Hygiene', iconKey:'hygiene', archived:false },
      { id:'evening', name:'Evening', iconKey:'evening', archived:false },
    ],
    order:['morning','movement','mind','fuel','hygiene','evening'],
    assignments:[],
  }, `${label}: category defaults contain only real categories and sparse assignments`);

  assert.deepEqual(
    plain(normalizeCategoryState(defaults, defaultHabitCats, true)),
    defaults,
    `${label}: strict category normalization round-trips the default document`,
  );
  const legacyV1Categories = { ...defaults, schemaVersion:1 };
  assert.deepEqual(
    plain(normalizeCategoryState(legacyV1Categories, defaultHabitCats, true)),
    defaults,
    `${label}: schema-v1 category documents migrate in place without losing identity or order`,
  );
  assert.equal(normalizeCategoryEmoji('👨‍👩‍👧‍👦'), '👨‍👩‍👧‍👦', `${label}: compound family emoji remains one grapheme`);
  assert.equal(normalizeCategoryEmoji('👍🏽'), '👍🏽', `${label}: skin-tone modifiers remain attached to one emoji grapheme`);
  assert.equal(normalizeCategoryEmoji('🇦🇷'), '🇦🇷', `${label}: regional-indicator flags are accepted`);
  assert.equal(normalizeCategoryEmoji('1️⃣'), '1️⃣', `${label}: keycap emoji are accepted as one grapheme`);
  assert.equal(normalizeCategoryEmoji('two emojis ⭐🌿'), '', `${label}: text and multiple emoji are rejected`);
  assert.deepEqual(
    getActiveCategoryDefinitions(defaults).map(category => category.id),
    defaults.order,
    `${label}: active category navigation follows the stored order`,
  );

  const moved = plain(setHabitCategoryAssignment(defaults, 'affirm', 'mind', defaultHabitCats));
  assert.deepEqual(moved.assignments, [{ habitId:'affirm', categoryId:'mind' }],
    `${label}: a category move is stored as a sparse habit assignment`);
  assert.equal(getEffectiveCategoryId(defaultHabitCats.find(habit => habit.id === 'affirm'), moved), 'mind',
    `${label}: moved habits resolve to the selected real category`);
  const timedHabit = { id:'affirm', cat:'morning', text:'Say an affirmation', context:{ start:360, idealStart:420, end:660 } };
  const movedTimedHabit = plain(applyCategoryStateToHabits([timedHabit], moved))[0];
  assert.equal(movedTimedHabit.cat, 'mind', `${label}: runtime navigation category changes`);
  assert.deepEqual(movedTimedHabit.context, timedHabit.context, `${label}: category moves do not rewrite Next Wave context`);
  assert.deepEqual(
    plain(setHabitCategoryAssignment(moved, 'affirm', 'morning', defaultHabitCats)).assignments,
    [],
    `${label}: returning to the shipped category removes the sparse override`,
  );
  assert.throws(() => setHabitCategoryAssignment(defaults, 'affirm', 'all', defaultHabitCats), /active real category/,
    `${label}: All is never an assignment destination`);

  assert.deepEqual(
    plain(moveCategoryInOrder(defaults, 'evening', 'morning').order),
    ['evening','morning','movement','mind','fuel','hygiene'],
    `${label}: category order changes independently of category identity`,
  );
  const mixedOrder = ['wake','strength','affirm','meditate','sleep'];
  assert.deepEqual(
    plain(reorderHabitIdsWithinCategory(mixedOrder, defaultHabitCats, 'morning', ['affirm','wake'])),
    ['affirm','strength','wake','meditate','sleep'],
    `${label}: scoped habit reorder replaces only slots belonging to that category`,
  );
  assert.throws(() => reorderHabitIdsWithinCategory(mixedOrder, defaultHabitCats, 'morning', ['wake']), /exactly once/,
    `${label}: scoped reorder rejects incomplete habit sets`);
  assert.throws(() => setCategoryArchived(defaults, 'morning', true, defaultHabitCats), /must be empty/,
    `${label}: categories containing habits cannot be archived`);

  const withoutFuelHabits = defaultHabitCats.filter(habit => habit.cat !== 'fuel');
  const archivedFuel = plain(setCategoryArchived(defaults, 'fuel', true, withoutFuelHabits));
  assert.equal(archivedFuel.definitions.find(category => category.id === 'fuel').archived, true,
    `${label}: an empty real category can be archived without deleting it`);
  assert.equal(getActiveCategoryDefinitions(archivedFuel).some(category => category.id === 'fuel'), false,
    `${label}: archived categories leave active navigation but remain restorable`);
  assert.deepEqual(
    plain(reorderActiveCategoryIds(archivedFuel, ['evening','morning','movement','mind','hygiene'], withoutFuelHabits).order),
    ['evening','morning','movement','fuel','mind','hygiene'],
    `${label}: active category reorder preserves archived category slots`,
  );
  assert.equal(
    plain(setCategoryArchived(archivedFuel, 'fuel', false, withoutFuelHabits)).definitions.find(category => category.id === 'fuel').archived,
    false,
    `${label}: archived categories can be restored with the same ID`,
  );

  const added = plain(addCategoryDefinition(defaults, 'cat_12345678', 'Recovery', 'recovery', defaultHabitCats));
  assert.deepEqual(added.definitions.at(-1),
    { id:'cat_12345678', name:'Recovery', iconKey:'recovery', archived:false },
    `${label}: custom categories append with an immutable opaque ID and curated icon`);
  assert.equal(added.order.at(-1), 'cat_12345678', `${label}: a new category appends to navigation order`);
  const emojiCategoryState = plain(addCategoryDefinition(
    defaults,
    'cat_87654321',
    'Family',
    'star',
    defaultHabitCats,
    '👨‍👩‍👧‍👦',
  ));
  const emojiCategory = emojiCategoryState.definitions.at(-1);
  assert.deepEqual(
    emojiCategory,
    { id:'cat_87654321', name:'Family', iconKey:'star', emoji:'👨‍👩‍👧‍👦', archived:false },
    `${label}: a custom category persists one complete native-keyboard emoji without changing its stable ID`,
  );
  assert.equal(getCategoryIcon(emojiCategory), '👨‍👩‍👧‍👦', `${label}: custom emoji wins over the curated fallback`);
  assert.equal(getCategoryIcon(added.definitions.at(-1)), '🌿', `${label}: curated icon keys retain their existing rendering`);
  assert.throws(
    () => addCategoryDefinition(defaults, 'cat_87654321', 'Family', 'star', defaultHabitCats, '⭐🌿'),
    /one emoji/,
    `${label}: multiple custom emoji fail closed`,
  );
  const renamed = plain(updateCategoryDefinition(added, 'cat_12345678', 'Rest & Restore', 'heart', defaultHabitCats));
  assert.deepEqual(renamed.definitions.find(category => category.id === 'cat_12345678'),
    { id:'cat_12345678', name:'Rest & Restore', iconKey:'heart', archived:false },
    `${label}: category editing changes name and icon without changing ID`);
  assert.throws(() => addCategoryDefinition(defaults, 'cat_12345678', 'All', 'star', defaultHabitCats), /unique and cannot be All/,
    `${label}: custom categories cannot impersonate the virtual All aggregate`);
  assert.throws(() => addCategoryDefinition(defaults, 'cat_12345678', 'morning', 'star', defaultHabitCats), /unique and cannot be All/,
    `${label}: category names are case-insensitively unique`);
  assert.throws(() => addCategoryDefinition(defaults, 'cat_12345678', '<b>Focus</b>', 'focus', defaultHabitCats), /plain text/,
    `${label}: category names reject markup-like punctuation`);
  assert.throws(() => addCategoryDefinition(defaults, 'cat_12345678', 'Focus', 'unknown', defaultHabitCats), /icon/,
    `${label}: category icons come from the curated cross-platform set`);
  assert.throws(() => updateCategoryDefinition(defaults, 'missing', 'Focus', 'focus', defaultHabitCats), /real category/,
    `${label}: category editing cannot invent or mutate unknown IDs`);
  assert.throws(() => deleteCategoryDefinition(defaults, 'morning', defaultHabitCats), /custom category/,
    `${label}: shipped categories can never be permanently deleted`);
  const customWithHabit = plain(setHabitCategoryAssignment(added, 'affirm', 'cat_12345678', defaultHabitCats));
  assert.throws(() => deleteCategoryDefinition(customWithHabit, 'cat_12345678', defaultHabitCats), /must be empty/,
    `${label}: a custom category must be empty before deletion`);
  const deleted = plain(deleteCategoryDefinition(added, 'cat_12345678', defaultHabitCats));
  assert.equal(deleted.definitions.some(category => category.id === 'cat_12345678'), false,
    `${label}: deleting an empty custom category removes its definition`);
  assert.equal(deleted.order.includes('cat_12345678'), false,
    `${label}: deleting an empty custom category removes its ordering slot`);

  const writes = [];
  const emptyStorage = {
    getItem:key => null,
    setItem:(key, value) => writes.push([key, value]),
  };
  assert.deepEqual(plain(loadCategoryState(defaultHabitCats, emptyStorage)), defaults,
    `${label}: missing category storage initializes deterministic defaults`);
  saveCategoryState(renamed, defaultHabitCats, emptyStorage);
  assert.equal(writes.length, 1, `${label}: category settings persist as one validated document`);
  assert.equal(writes[0][0], 'wavelength_categories_v1', `${label}: categories use an isolated storage key`);
  assert.deepEqual(JSON.parse(writes[0][1]), renamed, `${label}: persisted categories round-trip exactly`);

  let malformedWrites = 0;
  const malformedStorage = {
    getItem:key => '{"schemaVersion":1,"definitions":"broken"}',
    setItem:() => { malformedWrites += 1; },
    removeItem:() => { malformedWrites += 1; },
  };
  assert.deepEqual(plain(loadCategoryState(defaultHabitCats, malformedStorage)), defaults,
    `${label}: malformed local category state falls back safely`);
  assert.equal(malformedWrites, 0,
    `${label}: malformed raw category data is preserved rather than silently overwritten`);
  assert.match(html, /const CATEGORY_STATE_KEY = 'wavelength_categories_v1';/,
    `${label}: category persistence stays separate from habit overrides`);
  assert.match(html, /let categoryState = loadCategoryState\(DEFAULT_HABITS\);/,
    `${label}: runtime category state loads independently of habit overrides`);
  assert.match(html, /HABITS = applyCategoryStateToHabits\(buildRuntimeHabits\(DEFAULT_HABITS, overrides \|\| \{\}\), categoryState\);/,
    `${label}: runtime habits receive navigation assignments after habit/context construction`);
  assert.match(html, /const BACKUP_VERSION = 7;/,
    `${label}: portable backups advance to schema v7 for arbitrary category emoji`);
  assert.match(html, /categoryState:normalizeCategoryState\(categoryState, DEFAULT_HABITS, true\)/,
    `${label}: v7 backups contain one normalized category document`);
  assert.match(html, /payload\.version >= 6 && !payload\.categoryState/,
    `${label}: v6+ imports require category state while older backups migrate defaults`);
  assert.match(html, /const importedCategoryState = payload\.version >= 6[\s\S]*normalizeCategoryState\(payload\.categoryState, DEFAULT_HABITS, true\)[\s\S]*createDefaultCategoryState\(\)/,
    `${label}: legacy v1-v5 backups receive deterministic shipped categories`);

  const makeStorage = (initial, failAt = null) => {
    const values = new Map(Object.entries(initial));
    let writes = 0;
    return {
      values,
      getItem:key => values.has(key) ? values.get(key) : null,
      setItem:(key, value) => {
        writes += 1;
        if (writes === failAt) throw new Error('injected quota failure');
        values.set(key, String(value));
      },
      removeItem:key => { values.delete(key); },
    };
  };
  const committedStorage = makeStorage({ state:'old', name:'David' });
  commitStorageSnapshot(committedStorage, { state:'new', order:'new-order', name:null });
  assert.deepEqual(Object.fromEntries(committedStorage.values), { state:'new', order:'new-order' },
    `${label}: a successful import snapshot commits all writes and removals together`);

  const failedStorage = makeStorage({ state:'old', order:'old-order', name:'David' }, 3);
  assert.throws(() => commitStorageSnapshot(failedStorage, { state:'new', order:'new-order', name:null }), /injected quota failure/,
    `${label}: injected storage failures surface to the import boundary`);
  assert.deepEqual(Object.fromEntries(failedStorage.values), { state:'old', order:'old-order', name:'David' },
    `${label}: a failed import restores every previous value`);

  const interruptedStorage = makeStorage({ state:'new', wavelength_import_journal_v1:JSON.stringify({
    previous:[['state','old'],['order','old-order'],['name',null]],
  }) });
  recoverStorageSnapshot(interruptedStorage);
  assert.deepEqual(Object.fromEntries(interruptedStorage.values), { state:'old', order:'old-order' },
    `${label}: startup recovery rolls an interrupted import back to its complete prior snapshot`);
  assert.match(html, /try \{\s*recoverStorageSnapshot\(localStorage\);\s*\} catch \(error\) \{\s*localStorage\.removeItem\(IMPORT_JOURNAL_KEY\);\s*\}/,
    `${label}: malformed recovery metadata cannot prevent app startup`);
  assert.match(html, /commitStorageSnapshot\(localStorage, importedSnapshot\)/,
    `${label}: backup import uses the journaled storage transaction`);
  assert.match(html, /id="categoryTabRail"/, `${label}: Home has a dynamically rendered category rail`);
  assert.match(html, /id="manageBtn"[^>]*aria-label="Manage habits"[\s\S]*id="manageCategoriesBtn"[^>]*aria-label="Manage categories"/,
    `${label}: Home has adjacent accessible habit and category management controls`);
  assert.match(html, /id="categoriesView"[^>]*hidden[^>]*inert/, `${label}: category management is a full-screen app view`);
  assert.match(html, /id="manageCategoryView"[^>]*hidden[^>]*inert/, `${label}: scoped habit management is a full-screen app view`);
  assert.match(html, /id="habitEditorView"[^>]*hidden[^>]*inert/, `${label}: each habit has a focused full-screen editor`);
  assert.doesNotMatch(html, /id="reorderBtn"/, `${label}: Home no longer exposes a separate Reorder action`);
  assert.doesNotMatch(html, /id="reorderHint"/, `${label}: Home no longer exposes reorder-mode guidance`);
  assert.match(html, /function renderCategoryTabs\(\)[\s\S]*textContent[\s\S]*CATEGORY_ICON_MAP/,
    `${label}: dynamic category tabs use textContent for user-controlled names and curated icons`);
  assert.doesNotMatch(extractFunction(html, 'renderCategoriesPage'), /allRow|All habits/,
    `${label}: Categories omits the virtual All aggregate from its editable cards`);
  assert.match(extractFunction(html, 'makeCategoryRow'), /name\.textContent = category\.name/,
    `${label}: category cards render user-controlled names with textContent`);
  assert.match(html, /document\.documentElement\.dataset\.managementOpen = 'true'/,
    `${label}: management views hide primary app chrome through explicit app state`);
  assert.match(html, /class="eh-category"[\s\S]*getActiveCategoryDefinitions\(categoryState\)/,
    `${label}: the focused habit editor offers only active real category destinations`);
  assert.match(html, /function openHabitEditorPage\(habitId\)[\s\S]*renderHabitEditorForm\(habitId\)/,
    `${label}: selecting a habit renders one focused full-page form`);
  assert.match(html, /function saveHabitEditorPage\(\)[\s\S]*saveHabitEditorForm\(\)[\s\S]*renderManageCategoryPage\(\)/,
    `${label}: focused Save applies the draft before returning to the scoped list`);
  assert.match(html, /setHabitCategoryAssignment\(nextCategoryState, id, categoryId, DEFAULT_HABITS\)/,
    `${label}: habit moves are persisted in the isolated category document`);
  assert.match(html, /id="categoryEditorView"[^>]*hidden[^>]*inert/, `${label}: category creation and editing use a focused full-screen page`);
  assert.match(html, /id="archivedCategoriesGroup"[^>]*hidden[\s\S]*id="archivedCategoriesList"/,
    `${label}: archived categories remain recoverable from an inline hidden-when-empty partition`);
  assert.match(html, /id="categoryNameInput"[^>]*maxlength="24"/, `${label}: category names enforce the reviewed mobile limit`);
  assert.match(html, /function saveCategoryEditor\(\)[\s\S]*updateCategoryDefinition[\s\S]*addCategoryDefinition[\s\S]*saveCategoryState/,
    `${label}: category create and rename/icon edits use validated category operations`);
  assert.match(extractFunction(html, 'renderCategoryOptions'), /removal\.disabled = habitCount !== 0[\s\S]*Move .* first/,
    `${label}: category archive or deletion remains unavailable until every habit has moved out`);
  assert.match(html, /function restoreArchivedCategory\(categoryId\)[\s\S]*setCategoryArchived[\s\S]*saveCategoryState/,
    `${label}: archived categories restore with their stable IDs`);
  assert.doesNotMatch(html, /Move all habits to:/, `${label}: category archive never offers a misleading bulk move`);
  assert.doesNotMatch(html, /Move habits and archive|Move and archive/, `${label}: archive copy never implies habits are archived`);
  assert.match(html, /function attachGripReorder\(container, rowSelector, gripSelector, onCommit\)/,
    `${label}: reordering starts from an explicit grip controller`);
  assert.match(html, /attachGripReorder\(list, '\.category-row\[data-category-id\]', '\.category-grip'/,
    `${label}: Categories binds drag only to real-category grips`);
  assert.match(html, /attachGripReorder\(list, '\.manage-habit-row\[data-habit-id\]', '\.manage-habit-grip'/,
    `${label}: scoped Manage binds drag only to habit grips`);
  assert.match(html, /reorderHabitIdsWithinCategory\(userOrder, HABITS, managedCategoryId, reorderedIds\)/,
    `${label}: rendered habit drag preserves out-of-category canonical slots`);
}

console.log('category personalization regression tests passed for mobile and desktop');
