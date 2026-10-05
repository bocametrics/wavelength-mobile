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

function loadCommitStorageSnapshot(source) {
  const context = { JSON };
  vm.createContext(context);
  vm.runInContext(
    `${source.match(/const IMPORT_JOURNAL_KEY\s*=\s*[^;]+;/)?.[0] || ''}\n` +
    `${extractFunction(source, 'commitStorageSnapshot')}\n` +
    'globalThis.result = commitStorageSnapshot;',
    context,
  );
  return context.result;
}

function extractStringConstant(source, name) {
  const match = source.match(new RegExp(`const ${name}\\s*=\\s*'([^']+)'\\s*;`));
  assert.ok(match, `${name} is missing or is not a string literal`);
  return match[1];
}

function makeStorage(initial, failAt = null) {
  const values = new Map(Object.entries(initial));
  let mutations = 0;
  let failed = false;
  const mutate = operation => {
    mutations += 1;
    if (!failed && mutations === failAt) {
      failed = true;
      throw new Error('injected quota failure');
    }
    operation();
  };
  return {
    values,
    getItem:key => values.has(key) ? values.get(key) : null,
    setItem:(key, value) => mutate(() => values.set(key, String(value))),
    removeItem:key => mutate(() => values.delete(key)),
  };
}

function assertOrdered(source, tokens, message) {
  let previous = -1;
  for (const token of tokens) {
    const index = source.indexOf(token);
    assert.ok(index >= 0, `${message}: missing ${token}`);
    assert.ok(index > previous, `${message}: ${token} is out of order`);
    previous = index;
  }
}

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.match(html, /const BACKUP_VERSION\s*=\s*9\s*;/,
    `${label}: habit lifecycle backups advance to version 9`);

  const exporter = extractFunction(html, 'createBackupPayload');
  assert.match(exporter, /habitCatalog\s*:\s*normalizeHabitCatalogState\(/,
    `${label}: v9 export includes one strictly normalized lifecycle catalog`);
  assert.match(exporter, /categoryState\s*:\s*normalizeCategoryState\(/,
    `${label}: v9 export retains the category document alongside the lifecycle catalog`);
  assert.match(exporter, /order\s*:\s*userOrder/,
    `${label}: v9 export retains canonical complete-catalog order`);
  assert.match(exporter, /state[\s\S]*insightHistory/,
    `${label}: v9 export retains completion, progress, and evidence documents`);

  const importer = extractFunction(html, 'importBackupFile');
  assert.match(importer, /\[1,\s*2,\s*3,\s*4,\s*5,\s*6,\s*7,\s*8,\s*BACKUP_VERSION\]\.includes\(payload\.version\)/,
    `${label}: versions 1 through 8 remain importable under v9`);
  assert.match(importer, /payload\.version === BACKUP_VERSION && !payload\.habitCatalog/,
    `${label}: a v9 document without its lifecycle catalog fails closed`);
  assert.match(importer, /const importedHabitCatalog = payload\.version === BACKUP_VERSION[\s\S]*normalizeHabitCatalogState\(payload\.habitCatalog[\s\S]*createDefaultHabitCatalogState\(dateKey\(importDate\)\)/,
    `${label}: v9 validates its catalog while v1-v8 synthesize deterministic schema-1 migration state`);
  assert.match(importer, /const importedCategoryIds[\s\S]*normalizeHabitCatalogState\(payload\.habitCatalog/,
    `${label}: custom definitions validate against the imported category identity set`);
  assert.doesNotMatch(importer, /importedHabitCatalog\.status\.length[^\n]*(?:fallback|createDefaultHabitCatalogState)/,
    `${label}: an intentionally empty archived set is not replaced during v9 import`);

  assertOrdered(importer, [
    'const importedHabitCatalog',
    'buildCompleteHabitCatalog',
    'normalizeCategoryState(payload.categoryState',
    'normalizeImportedHabitOrder',
    'normalizeStoredState',
    'normalizeInsightHistory',
    'commitStorageSnapshot',
  ], `${label}: v9 import validates every cross-reference before its atomic write`);

  assert.match(importer, /normalizeImportedHabitOrder\(\s*payload\.order,\s*payload\.version === BACKUP_VERSION \? importedCompleteHabits : DEFAULT_HABITS,?\s*\)/,
    `${label}: v9 order validates against custom and archived identities while legacy order migration stays compatible`);
  assert.match(importer, /normalizeCategoryState\(payload\.categoryState, importedCompleteHabits, true, importedActiveHabits\)/,
    `${label}: category references validate against complete and date-effective active imported catalogs`);
  assert.match(importer, /normalizeStoredState\(payload\.state, importedAllHabits, true\)/,
    `${label}: completion and numeric progress cross-reference every imported identity`);
  assert.match(importer, /normalizeInsightHistory\(payload\.insightHistory, importedAllHabits, true\)/,
    `${label}: evidence cross-references every imported identity`);
  assert.match(importer, /\[HABIT_CATALOG_KEY\]\s*:\s*JSON\.stringify\(importedHabitCatalog\)/,
    `${label}: the lifecycle catalog participates in the one journaled import snapshot`);
  const snapshotSource = importer.slice(
    importer.indexOf('const importedSnapshot = {'),
    importer.indexOf('commitStorageSnapshot(localStorage, importedSnapshot)'),
  );
  const snapshotConstantNames = [
    'STORAGE_KEY',
    'ORDER_KEY',
    'FIRST_NAME_STORAGE_KEY',
    'INSIGHT_STORAGE_KEY',
    'CATEGORY_STATE_KEY',
    'CUSTOM_HABITS_KEY',
    'HABIT_CATALOG_KEY',
  ];
  for (const constantName of snapshotConstantNames) {
    assert.match(snapshotSource, new RegExp(`\\[${constantName}\\]\\s*:`),
      `${label}: atomic import includes ${constantName}`);
  }
  assert.equal((snapshotSource.match(/^\s*\[[A-Z_]+\]\s*:/gm) || []).length, 7,
    `${label}: atomic import snapshot contains exactly seven persisted documents`);
  assert.match(importer, /commitStorageSnapshot\(localStorage, importedSnapshot\)[\s\S]*habitCatalogState = importedHabitCatalog[\s\S]*reloadHabits\(importDate\)/,
    `${label}: runtime adopts the committed lifecycle catalog before rebuilding active habits`);

  const catalogValidation = importer.indexOf('normalizeHabitCatalogState(payload.habitCatalog');
  const commit = importer.indexOf('commitStorageSnapshot(localStorage, importedSnapshot)');
  assert.ok(catalogValidation >= 0 && commit > catalogValidation,
    `${label}: malformed v9 lifecycle data is rejected before any journaled writes`);

  const commitStorageSnapshot = loadCommitStorageSnapshot(html);
  const resolvedKeys = Object.fromEntries(
    snapshotConstantNames.map(name => [name, extractStringConstant(html, name)]),
  );
  assert.deepEqual(resolvedKeys, {
    STORAGE_KEY:'wavelength_wpb',
    ORDER_KEY:'wavelength_wpb_order',
    FIRST_NAME_STORAGE_KEY:'wavelength_first_name',
    INSIGHT_STORAGE_KEY:'wavelength_insights_v1',
    CATEGORY_STATE_KEY:'wavelength_categories_v1',
    CUSTOM_HABITS_KEY:'wavelength_wpb_habits',
    HABIT_CATALOG_KEY:'wavelength_habit_catalog_v1',
  }, `${label}: the journaled snapshot resolves to the app's seven authoritative persistence keys`);
  const original = Object.fromEntries(
    Object.values(resolvedKeys).map(key => [key, `old-${key}`]),
  );
  const replacement = Object.fromEntries(
    Object.keys(original).map(key => [key, `new-${key}`]),
  );
  const journalKey = extractStringConstant(html, 'IMPORT_JOURNAL_KEY');
  for (let failAt = 1; failAt <= 9; failAt += 1) {
    const storage = makeStorage(original, failAt);
    assert.throws(() => commitStorageSnapshot(storage, replacement), /injected quota failure/,
      `${label}: mutation ${failAt} reaches the atomic import boundary`);
    assert.deepEqual(Object.fromEntries(storage.values), original,
      `${label}: mutation ${failAt} restores all seven authoritative documents`);
    assert.equal(storage.values.has(journalKey), false,
      `${label}: mutation ${failAt} leaves no completed recovery journal behind`);
  }
  const successfulStorage = makeStorage(original);
  commitStorageSnapshot(successfulStorage, replacement);
  assert.deepEqual(Object.fromEntries(successfulStorage.values), replacement,
    `${label}: successful atomic import commits all seven authoritative documents`);
  assert.equal(successfulStorage.values.has(journalKey), false,
    `${label}: successful atomic import removes its recovery journal`);
}

console.log('habit backup v9 regression tests passed for mobile and desktop');
