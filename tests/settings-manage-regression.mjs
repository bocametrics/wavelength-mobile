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

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const settingsStart = html.indexOf('id="settingsView"');
  const dockStart = html.indexOf('class="app-dock"');
  const editorStart = html.indexOf('id="habitEditorView"');

  assert.ok(settingsStart > html.indexOf('id="insightsView"'), `${label}: Settings follows Insights`);
  assert.ok(settingsStart < dockStart, `${label}: Settings is a primary view before the dock`);
  assert.match(html, /id="navSettings"[^>]*role="tab"[^>]*aria-controls="settingsView"[^>]*data-view="settings"/,
    `${label}: Settings is a tab-controlled dock destination`);
  assert.match(html, /id="settingsView"[^>]*role="tabpanel"[^>]*aria-labelledby="navSettings"[^>]*hidden[^>]*inert/,
    `${label}: Settings starts as an inert hidden tab panel`);
  assert.match(html, /id="firstNameInput"[^>]*type="text"[^>]*maxlength="30"[^>]*placeholder="Your name"/i,
    `${label}: Settings has the bounded First Name field`);
  assert.match(html, /const viewScrollPositions = \{ home:0, insights:0, settings:0 \}/,
    `${label}: Settings keeps its own scroll position`);
  assert.match(html, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
    `${label}: dock supports three equal destinations`);
  assert.match(html, /id="exportBtn"[\s\S]*id="importBtn"[\s\S]*id="importFile"/,
    `${label}: Settings owns backup and import controls`);
  assert.doesNotMatch(html, /installCard|install-card|setupInstallTip|INSTALL_DISMISS_KEY|Install Wavelength on your iPhone/,
    `${label}: the retired install prompt has no markup, styling, or runtime setup`);
  const editorMarkup = html.slice(editorStart, html.indexOf('<section class="management-view" id="categoryEditorView"', editorStart));
  assert.doesNotMatch(editorMarkup, /appearance-tools|data-tools|exportBtn|importBtn/,
    `${label}: focused habit editing excludes Settings tools`);

  const context = {};
  vm.createContext(context);
  vm.runInContext(`${extractFunction(html, 'normalizeFirstName')}\nglobalThis.normalize = normalizeFirstName;`, context);
  assert.equal(context.normalize('  Ada  '), 'Ada', `${label}: First Name is trimmed before saving`);
  assert.equal(context.normalize('x'.repeat(31)), 'x'.repeat(30), `${label}: First Name is capped at 30 characters`);
  assert.equal(context.normalize(null), '', `${label}: non-string First Name imports safely as empty`);

  const greetingContext = {
    firstName: 'Ada',
    DEFAULT_FIRST_NAME: 'Friend',
    document: { getElementById: () => ({ textContent:'' }) },
  };
  vm.createContext(greetingContext);
  vm.runInContext(`${extractFunction(html, 'getGreetingForHour')}\n${extractFunction(html, 'updateGreeting')}\nglobalThis.update = updateGreeting;`, greetingContext);
  const greeting = greetingContext.document.getElementById();
  greetingContext.document.getElementById = () => greeting;
  greetingContext.update(new Date(2026, 8, 5, 9));
  assert.equal(greeting.textContent, 'Good morning, Ada ☀️', `${label}: greeting adds the saved First Name safely`);
  greetingContext.firstName = '';
  greetingContext.update(new Date(2026, 8, 5, 9));
  assert.equal(greeting.textContent, 'Good morning, Friend ☀️', `${label}: an empty First Name uses the friendly display fallback`);

  const backup = extractFunction(html, 'createBackupPayload');
  assert.match(html, /const BACKUP_VERSION = 7;/,
    `${label}: First Name and category backups identify the version-7 schema`);
  assert.match(backup, /firstName\s*:\s*firstName/,
    `${label}: backup payload includes First Name`);
  const importer = extractFunction(html, 'importBackupFile');
  assert.match(importer, /\[1, 2, 3, 4, 5, 6, BACKUP_VERSION\]\.includes\(payload\.version\)/,
    `${label}: backup import preserves versions 1 through 6`);
  assert.match(importer, /const importedFirstName = normalizeFirstName\(payload\.firstName\)/,
    `${label}: import accepts a missing First Name as empty`);
  assert.match(importer, /\[FIRST_NAME_STORAGE_KEY\]:importedFirstName \|\| null/,
    `${label}: atomic import persists a name but leaves no empty-name key for legacy backups`);

  const renderManage = extractFunction(html, 'renderManageCategoryPage');
  assert.match(renderManage, /isAll \? HABITS : HABITS\.filter\(habit => habit\.cat === managedCategoryId\)/,
    `${label}: Manage Category includes every assigned habit independently of today's schedule`);
  assert.match(renderManage, /isAll \? 'Manage All Habits' : `Manage \$\{category\.name\}`/,
    `${label}: Manage titles identify All or the selected real category`);
  assert.match(extractFunction(html, 'openManageCategoryPage'), /managedCategoryId = categoryId[\s\S]*manageCategory = categoryId/,
    `${label}: Home and Categories share one scoped full-page Manage implementation`);

  const mergeContext = {};
  vm.createContext(mergeContext);
  vm.runInContext(`${extractFunction(html, 'mergeVisibleManageOverrides')}\nglobalThis.merge = mergeVisibleManageOverrides;`, mergeContext);
  const merged = JSON.parse(JSON.stringify(mergeContext.merge(
    { wake:{ note:'Preserve me' }, floss:{ note:'Old floss' } },
    { floss:{ note:'New floss' } },
    ['floss'],
  )));
  assert.deepEqual(merged, { wake:{ note:'Preserve me' }, floss:{ note:'New floss' } },
    `${label}: saving a scoped category preserves overrides for non-rendered habits`);
  assert.deepEqual(JSON.parse(JSON.stringify(mergeContext.merge(
    { wake:{ note:'Preserve me' }, floss:{ note:'Old floss' } }, {}, ['floss'],
  ))), { wake:{ note:'Preserve me' } },
  `${label}: resetting a visible habit removes only that habit's override`);
  assert.match(extractFunction(html, 'saveHabitEditorForm'), /mergeVisibleManageOverrides\(existingOverrides, visibleOverrides, visibleIds\)/,
    `${label}: focused Manage save preserves unrelated habit overrides`);
  assert.match(html, /getElementById\('manageBtn'\)\.addEventListener\('click', \(\) => openManageCategoryPage\(currentCat, 'home'\)\)/,
    `${label}: Manage starts from the active Home category without sharing mutable scope`);
  assert.doesNotMatch(renderManage, /currentCat\s*=\s*'all'/,
    `${label}: aggregate Manage never changes the Home category`);

  const resetContext = {};
  vm.createContext(resetContext);
  vm.runInContext(`${extractFunction(html, 'removeVisibleManageOverrides')}\nglobalThis.resetScope = removeVisibleManageOverrides;`, resetContext);
  assert.deepEqual(JSON.parse(JSON.stringify(resetContext.resetScope(
    { wake:{ note:'Keep morning' }, floss:{ note:'Reset hygiene' }, sunscreen:{ note:'Reset too' } },
    ['floss', 'sunscreen'],
  ))), { wake:{ note:'Keep morning' } },
  `${label}: scoped reset preserves overrides for invisible categories`);
}

console.log('settings, first-name backup, and scoped Manage regression tests passed for mobile and desktop');
