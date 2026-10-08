import assert from 'node:assert/strict';
import fs from 'node:fs';
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

function assertOrdered(source, tokens, message) {
  let previous = -1;
  for (const token of tokens) {
    const index = source.indexOf(token, previous + 1);
    assert.ok(index >= 0, `${message}: missing ${token}`);
    assert.ok(index > previous, `${message}: ${token} is out of order`);
    previous = index;
  }
}

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');

  // One shared two-action component serves Home and scoped Manage surfaces.
  const renderHabitLifecycleActions = extractFunction(html, 'renderHabitLifecycleActions');
  assert.match(renderHabitLifecycleActions, />Add a new habit<\/button>/,
    `${label}: lifecycle actions use the approved primary entry-point copy`);
  assert.match(renderHabitLifecycleActions, />Add an archived habit<\/button>/,
    `${label}: lifecycle actions use the approved archived entry-point copy`);
  assert.doesNotMatch(renderHabitLifecycleActions, /Restore an archived habit|\.\.\.|…/,
    `${label}: lifecycle entry points stay sentence case and omit ellipses`);
  assert.match(renderHabitLifecycleActions, /class="habit-lifecycle-icon habit-lifecycle-plus"[^>]*aria-hidden="true"/,
    `${label}: the create action uses a decorative plus icon`);
  assert.match(renderHabitLifecycleActions, /class="habit-lifecycle-icon habit-lifecycle-restore"[^>]*aria-hidden="true"/,
    `${label}: the archived action uses a decorative restore icon`);
  assert.doesNotMatch(renderHabitLifecycleActions, /aria-label="[^"]*[Pp]lus/,
    `${label}: the visual plus is not announced in the accessible name`);
  assert.doesNotMatch(renderHabitLifecycleActions, /manage-habit-row|data-habit-id|drag-handle|manage-habit-grip/,
    `${label}: lifecycle actions cannot become habit rows or reorder targets`);

  assert.match(html, /\.habit-lifecycle-primary\s*\{[\s\S]*?min-height:\s*64px[\s\S]*?border:\s*1px solid[\s\S]*?border-radius:\s*var\(--radius-sm\)/,
    `${label}: the primary create card is compact, solid-bordered, and aligned with habit cards`);
  assert.match(html, /\.habit-lifecycle-secondary\s*\{[\s\S]*?min-height:\s*44px/,
    `${label}: the archived action keeps a 44px touch target`);
  assert.match(html, /\.habit-lifecycle-actions\s*\{[^}]*gap:\s*4px/,
    `${label}: the archived action stays optically close to the create card`);
  assert.match(html, /#manageHabitLifecycleActions\s*\{[^}]*margin-top:\s*8px/,
    `${label}: Manage separates lifecycle actions from the final habit by the normal list gap`);
  assert.doesNotMatch(html, /\.habit-lifecycle-(?:primary|actions)[^{]*\{[^}]*border[^;}]*dashed/s,
    `${label}: lifecycle actions never use a dashed drop-target treatment`);
  assert.match(html, /\.habits\.reorder-mode \.habit-lifecycle-actions\s*\{[^}]*display:\s*none/s,
    `${label}: Home hides lifecycle actions while reordering`);

  const renderHabits = extractFunction(html, 'renderHabits');
  const shouldShowHabitEmptyStateSource = extractFunction(html, 'shouldShowHabitEmptyState');
  const shouldShowHabitEmptyState = Function(`${shouldShowHabitEmptyStateSource}; return shouldShowHabitEmptyState;`)();
  assert.equal(shouldShowHabitEmptyState('cat_custom', [], []), false,
    `${label}: a newly created empty category does not render a placeholder card`);
  assert.equal(shouldShowHabitEmptyState('cat_custom', [{ id:'later', cat:'cat_custom' }], []), true,
    `${label}: a category with an assigned off-schedule habit can explain that nothing is scheduled today`);
  assert.equal(shouldShowHabitEmptyState('all', [], []), true,
    `${label}: All retains its quiet-day empty state`);
  assert.match(renderHabits, /renderHabitLifecycleActions\(currentCat,\s*'home'\)/,
    `${label}: Home renders the shared action group with its current category scope`);
  assertOrdered(renderHabits, [
    'renderHabitCards(grouped.active)',
    'renderHabitLifecycleActions(currentCat',
    'completedMarkup',
  ], `${label}: Home places lifecycle actions after incomplete cards and before Completed`);
  assert.match(renderHabits, /shouldShowHabitEmptyState\(currentCat,\s*HABITS,\s*sorted\)/,
    `${label}: Home distinguishes empty categories from assigned habits that are merely off schedule`);
  assert.doesNotMatch(renderHabits, /`No \$\{currentCat|`\$\{currentCat\} habits scheduled/,
    `${label}: internal category IDs can never enter the empty-state copy`);

  assert.match(html, /id="manageCategoryList"[^>]*><\/div>\s*<div class="habit-lifecycle-actions" id="manageHabitLifecycleActions"/,
    `${label}: Manage owns an action host outside its reorderable habit list`);
  const renderManageCategoryPage = extractFunction(html, 'renderManageCategoryPage');
  assert.match(renderManageCategoryPage, /manageHabitLifecycleActions[\s\S]*renderHabitLifecycleActions\(managedCategoryId,\s*'manage'\)/,
    `${label}: scoped Manage renders the shared lifecycle actions after its list`);

  // Routes retain enough origin and mode state for browser/native Back restoration.
  assert.match(html, /let habitEditorMode = 'edit';/,
    `${label}: Habit Editor tracks create versus edit mode explicitly`);
  assert.match(html, /let habitEditorOrigin = 'manage';/,
    `${label}: Habit Editor tracks its launch origin explicitly`);
  assert.match(html, /let archivedHabitScope = 'all';/,
    `${label}: Archived habits tracks its category scope explicitly`);
  const getManagementRoute = extractFunction(html, 'getManagementRoute');
  for (const routeField of ['habitEditorMode', 'habitEditorOrigin', 'archivedHabitScope']) {
    assert.match(getManagementRoute, new RegExp(`\\b${routeField}\\b`),
      `${label}: management history includes ${routeField}`);
  }
  const restoreManagementRoute = extractFunction(html, 'restoreManagementRoute');
  assert.match(restoreManagementRoute, /route\.habitEditorMode[\s\S]*route\.habitEditorOrigin[\s\S]*route\.archivedHabitScope/,
    `${label}: route restoration reinstates editor mode, origin, and archived scope`);
  assert.match(restoreManagementRoute, /route\.viewId === 'archivedHabitsView'[\s\S]*renderArchivedHabitsPage/,
    `${label}: browser and native Back can restore the archived-habits view`);

  // Create mode reuses the editor with approved defaults and an explicit All-category choice.
  const createCustomHabitDraft = extractFunction(html, 'createCustomHabitDraft');
  assert.match(createCustomHabitDraft, /cat:\s*categoryId === 'all' \? '' : categoryId/,
    `${label}: All Habits creation does not silently select a category`);
  assert.match(createCustomHabitDraft, /icon:\s*'⭐'/,
    `${label}: new custom habits default to the star icon`);
  assert.match(createCustomHabitDraft, /text:\s*''[\s\S]*note:\s*''[\s\S]*activeFrom:\s*date[\s\S]*days:\s*\[0,\s*1,\s*2,\s*3,\s*4,\s*5,\s*6\][\s\S]*measurement:\s*'check'/,
    `${label}: create mode defaults to blank copy, today, every day, and Check once`);
  assert.match(html, /function buildCompleteHabitCatalog\([\s\S]*context:\{ recommend:false \}/,
    `${label}: custom habits remain recommendation-disabled in the runtime catalog`);

  const openNewHabitEditorPage = extractFunction(html, 'openNewHabitEditorPage');
  assert.match(openNewHabitEditorPage, /habitEditorMode = 'create'[\s\S]*habitEditorOrigin = safeOrigin[\s\S]*habitEditorHeading[^\n]*New Habit[\s\S]*habitEditorSave[^\n]*Add habit/,
    `${label}: Add a new habit opens the existing editor shell with create-mode labels`);
  assert.match(html, /id="habitNameInput"[^>]*maxlength="48"[^>]*required/,
    `${label}: custom habit name is required and limited to 48 characters`);
  assert.match(html, /id="habitNoteInput"[^>]*maxlength="42"/,
    `${label}: custom habit description is optional and limited to 42 characters`);
  assert.match(html, /id="habitCategoryInput"[\s\S]*<option value="">Choose a category<\/option>/,
    `${label}: create mode exposes the required category placeholder`);
  assert.match(html, /id="habitRhythmInput"[\s\S]*<option value="none">No anchor<\/option>/,
    `${label}: create mode defaults the rhythm control to No anchor`);
  assert.match(html, /for="\$\{habitEditorMode === 'create' \? 'habitMeasurementInput' : `measurement-\$\{escapeHtml\(h\.id\)\}`\}"[\s\S]*id="habitMeasurementInput"/,
    `${label}: create-mode measurement label targets the rendered select ID`);
  assert.match(html, /for="\$\{habitEditorMode === 'create' \? 'habitRhythmInput' : `rhythm-\$\{escapeHtml\(h\.id\)\}`\}"[\s\S]*id="habitRhythmInput"/,
    `${label}: create-mode rhythm label targets the rendered select ID`);
  assert.match(html, /id="habitEditorSave"[\s\S]*updateHabitEditorValidity/,
    `${label}: create-mode validity controls the shared save action`);

  const saveNewCustomHabit = extractFunction(html, 'saveNewCustomHabit');
  assert.match(saveNewCustomHabit, /normalizeNewCustomHabitDraft/,
    `${label}: create save reuses the strict custom-definition normalizer`);
  assert.match(saveNewCustomHabit, /customDefinitions:\s*\[\.\.\.habitCatalogState\.customDefinitions,\s*createdHabit\]/,
    `${label}: create save appends the new stable definition without replacing retained identities`);
  assert.match(saveNewCustomHabit, /reconcileCompleteHabitOrder\(\[\.\.\.userOrder,\s*createdHabit\.id\]/,
    `${label}: create save appends the new identity to canonical complete order`);
  assert.match(saveNewCustomHabit, /commitStorageSnapshot\(localStorage,\s*\{[\s\S]*\[HABIT_CATALOG_KEY\][\s\S]*\[CATEGORY_STATE_KEY\][\s\S]*\[ORDER_KEY\][\s\S]*\}\)/,
    `${label}: catalog, category state, and canonical order commit atomically`);
  assert.match(saveNewCustomHabit, /commitStorageSnapshot[\s\S]*habitCatalogState = nextHabitCatalog[\s\S]*categoryState = nextCategoryState[\s\S]*reloadHabits\(createDate\)[\s\S]*userOrder = loadOrder\(ALL_HABITS\)/,
    `${label}: successful create rebuilds persisted runtime state before rendering`);
  assert.match(saveNewCustomHabit, /commitStorageSnapshot[\s\S]*reloadHabits\(createDate\)[\s\S]*queueNativeNotificationSync\(\)/,
    `${label}: a successful create refreshes native reminder requests after rebuilding active habits`);

  const saveHabitEditorPage = extractFunction(html, 'saveHabitEditorPage');
  assert.match(saveHabitEditorPage, /habitEditorMode === 'create'[\s\S]*saveNewCustomHabit[\s\S]*showToast\('✓ Habit added'\)[\s\S]*returnFromHabitEditor/,
    `${label}: create mode saves once, announces success, and returns through the origin-aware path`);
  const returnFromHabitEditor = extractFunction(html, 'returnFromHabitEditor');
  assert.match(returnFromHabitEditor, /history\.state\?\.\[MANAGEMENT_HISTORY_KEY\][\s\S]*viewId === 'habitEditorView'[\s\S]*history\.back\(\)/,
    `${label}: a successful save consumes the editor route instead of leaving a stale editor in browser history`);
  assert.match(returnFromHabitEditor, /habitEditorOrigin === 'home'[\s\S]*closeManagementFlow[\s\S]*renderManageCategoryPage[\s\S]*showManagementView\('manageCategoryView'/,
    `${label}: create save returns to the exact Home or scoped Manage origin`);
  const requestLeaveHabitEditor = extractFunction(html, 'requestLeaveHabitEditor');
  assert.match(requestLeaveHabitEditor, /habitEditorDirty[\s\S]*Discard unsaved changes\?[\s\S]*returnFromHabitEditor/,
    `${label}: create and edit drafts share the existing dirty-leave guard`);

  const saveExistingCustomHabit = extractFunction(html, 'saveExistingCustomHabit');
  assert.match(saveExistingCustomHabit, /normalizeExistingCustomHabitDraft[\s\S]*customDefinitions:\s*habitCatalogState\.customDefinitions\.map[\s\S]*commitStorageSnapshot\(localStorage,\s*\{[\s\S]*\[HABIT_CATALOG_KEY\][\s\S]*\[CATEGORY_STATE_KEY\]/,
    `${label}: editing a custom habit atomically updates its retained definition and category state`);
  assert.match(saveExistingCustomHabit, /previousHabits[\s\S]*nextState[\s\S]*reconcileMeasurementTypeChanges\(nextState\.done,\s*nextState\.progress,\s*previousHabits[\s\S]*reconcileMeasuredDay\(nextState\.done,\s*nextState\.progress[\s\S]*nextInsightHistory[\s\S]*commitStorageSnapshot\(localStorage,\s*\{[\s\S]*\[STORAGE_KEY\][\s\S]*\[INSIGHT_STORAGE_KEY\][\s\S]*\}\)[\s\S]*state = nextState[\s\S]*insightHistory = nextInsightHistory/,
    `${label}: custom measurement edits reconcile state and evidence inside the same atomic commit`);
  assert.match(saveHabitEditorPage, /habitEditorMode === 'create'[\s\S]*saveNewCustomHabit[\s\S]*isCustomHabitId\(editingHabitId\)[\s\S]*saveExistingCustomHabit/,
    `${label}: existing custom habits save through the catalog-backed edit path`);

  // Edit mode exposes neutral reversible archival with exact confirmation copy.
  assert.match(html, /id="habitEditorArchive"[^>]*class="(?![^"]*danger)[^"]*"[^>]*>Archive habit<\/button>/,
    `${label}: edit mode exposes a neutral Archive habit action`);
  assert.match(html, /id="habitArchiveDialog"[^>]*aria-labelledby="habitArchiveHeading"[\s\S]*id="habitArchiveHeading"[\s\S]*id="habitArchiveMessage"[^>]*>It will stop appearing in your daily habits\. Your history will be kept\.<[\s\S]*id="habitArchiveConfirm"[^>]*>Archive habit<\/button>[\s\S]*id="habitArchiveCancel"[^>]*>Cancel<\/button>/,
    `${label}: archive confirmation uses the approved reversible wording and actions`);
  const openHabitArchiveDialog = extractFunction(html, 'openHabitArchiveDialog');
  assert.match(openHabitArchiveDialog, /`Archive “\$\{habit\.text\}”\?`/,
    `${label}: archive confirmation names the selected habit with curly quotes`);
  assert.doesNotMatch(openHabitArchiveDialog, /danger|delete|permanent/i,
    `${label}: habit archival is not presented as destructive deletion`);
  const renderHabitEditorForm = extractFunction(html, 'renderHabitEditorForm');
  assert.match(renderHabitEditorForm, /habitEditorMode === 'edit'[\s\S]*habitEditorArchive/,
    `${label}: Archive appears only while editing an existing habit`);
  assert.match(renderHabitEditorForm, /DEFAULT_HABITS[\s\S]*habitEditorReset/,
    `${label}: Reset habit defaults remains restricted to shipped habits`);
  const archiveEditedHabit = extractFunction(html, 'archiveEditedHabit');
  assert.match(archiveEditedHabit, /assertHabitCatalogStorageIntegrity[\s\S]*setHabitActiveOnDate/,
    `${label}: archival refuses to overwrite malformed or externally changed retained catalog data`);
  assert.match(archiveEditedHabit, /setHabitActiveOnDate\([\s\S]*editingHabitId,\s*false,\s*archiveDate[\s\S]*saveHabitCatalogState[\s\S]*habitCatalogState = nextHabitCatalog[\s\S]*reloadHabits\(archiveNow\)/,
    `${label}: archival records today's inactive transition and rebuilds active runtime state only after persistence`);
  assert.match(archiveEditedHabit, /reloadHabits\(archiveNow\)[\s\S]*queueNativeNotificationSync\(\)[\s\S]*renderCategoryTabs\(\)[\s\S]*renderHabits\(archiveNow\)[\s\S]*returnFromHabitEditor/,
    `${label}: archival refreshes reminders, widgets, Home, and the exact Manage return path`);
  assert.match(archiveEditedHabit, /showToast\('✓ Habit archived'\)/,
    `${label}: successful archival is announced without destructive language`);
  assert.doesNotMatch(archiveEditedHabit, /removeItem|delete\s+state|delete\s+insightHistory|splice\s*\(/,
    `${label}: archival never deletes completion, progress, evidence, definition, or order data`);

  // Archived habits is an accessible, origin-aware full-screen view.
  assert.match(html, /<section class="management-view" id="archivedHabitsView" aria-labelledby="archivedHabitsHeading"[^>]*hidden inert>[\s\S]*<h1 id="archivedHabitsHeading">Archived habits<\/h1>[\s\S]*Add a habit to start tracking\.[\s\S]*id="archivedHabitsList"/,
    `${label}: Archived habits has the approved full-screen landmark, heading, and intro`);
  assert.match(html, /id="viewAllArchivedHabits"[^>]*>View all archived habits<\/button>/,
    `${label}: scoped archived views can reveal the complete archived catalog`);
  const renderArchivedHabitsPage = extractFunction(html, 'renderArchivedHabitsPage');
  assert.match(renderArchivedHabitsPage, /No archived habits yet[\s\S]*Habits you archive will appear here\./,
    `${label}: the rendered All archived empty state uses the approved copy`);
  assert.match(renderArchivedHabitsPage, /No archived habits in \$\{escapeHtml\(scopeName\)\}<\/div>/,
    `${label}: scoped archived empty state uses the exact dynamic copy without extra punctuation`);
  assert.match(renderArchivedHabitsPage, /userOrder\.indexOf[\s\S]*archivedHabitScope/,
    `${label}: archived rows retain canonical order and category scope`);
  assert.match(renderArchivedHabitsPage, /getCategoryDisplayName[\s\S]*getScheduleSummary[\s\S]*>Add<\/button>/,
    `${label}: archived rows show retained category, schedule, and an explicit Add control`);
  assert.match(renderArchivedHabitsPage, /archivedElsewhere[\s\S]*viewAllArchivedHabits\.hidden = !archivedElsewhere[\s\S]*archivedHabitScope = 'all'/,
    `${label}: View all appears only for archived habits outside the current scope and changes only that scope`);
  assert.match(renderArchivedHabitsPage, /isHabitActiveOnDate\(habitCatalogState,\s*habit\.id,\s*archiveDate\) === false[\s\S]*data-archived-habit-id/,
    `${label}: the list derives today's inactive retained identities without deleting catalog data`);
  const openArchivedHabitsPage = extractFunction(html, 'openArchivedHabitsPage');
  assert.match(openArchivedHabitsPage, /safeOrigin[\s\S]*archivedHabitScope = safeCategoryId[\s\S]*beginManagementFlow[\s\S]*renderArchivedHabitsPage[\s\S]*showManagementView\('archivedHabitsView'/,
    `${label}: archived navigation preserves a safe Home or Manage origin and category scope`);

  const restoreArchivedHabit = extractFunction(html, 'restoreArchivedHabit');
  assert.match(restoreArchivedHabit, /assertHabitCatalogStorageIntegrity[\s\S]*getActiveCategoryDefinitions\(categoryState\)[\s\S]*activeCategories\.length === 0[\s\S]*showToast\('Create or restore a category before adding this habit\.'\)/,
    `${label}: restore fails closed on malformed catalog data and explains the zero-active-category recovery path`);
  assert.match(restoreArchivedHabit, /category\.archived[\s\S]*restoreHabitCategoryDialog/,
    `${label}: restoring from an archived category requires an active-category choice`);
  assert.match(restoreArchivedHabit, /setHabitActiveOnDate[\s\S]*saveHabitCatalogState[\s\S]*renderArchivedHabitsPage/,
    `${label}: direct restoration persists lifecycle state and keeps the archived screen open`);
  assert.match(restoreArchivedHabit, /showToast\(`Habit added to \$\{[^}]+\}\.`\)/,
    `${label}: direct restoration announces the retained category`);
  assert.match(restoreArchivedHabit, /saveHabitCatalogState[\s\S]*habitCatalogState = nextHabitCatalog[\s\S]*reloadHabits\(restoreNow\)[\s\S]*queueNativeNotificationSync\(\)[\s\S]*renderArchivedHabitsPage/,
    `${label}: direct restoration persists before rebuilding and keeps the archived screen open`);
  assert.match(html, /id="restoreHabitCategoryDialog"[\s\S]*Choose an active category to add it\.[\s\S]*id="restoreHabitCategoryInput"[\s\S]*id="restoreHabitCategoryConfirm"[^>]*>Add habit<\/button>[\s\S]*id="restoreHabitCategoryCancel"/,
    `${label}: archived-category restoration uses a focused active-category chooser`);
  const confirmRestoreHabitCategory = extractFunction(html, 'confirmRestoreHabitCategory');
  assert.match(confirmRestoreHabitCategory, /assertHabitCatalogStorageIntegrity[\s\S]*setHabitCategoryAssignment/,
    `${label}: archived-category confirmation cannot overwrite malformed retained catalog data`);
  assert.match(confirmRestoreHabitCategory, /setHabitCategoryAssignment[\s\S]*setHabitActiveOnDate[\s\S]*commitStorageSnapshot\(localStorage,\s*\{[\s\S]*\[HABIT_CATALOG_KEY\][\s\S]*\[CATEGORY_STATE_KEY\][\s\S]*\}\)[\s\S]*habitCatalogState = nextHabitCatalog[\s\S]*categoryState = nextCategoryState/,
    `${label}: archived-category restoration atomically reassigns and reactivates before mutating globals`);
  assert.match(confirmRestoreHabitCategory, /reloadHabits\(restoreNow\)[\s\S]*queueNativeNotificationSync\(\)[\s\S]*renderArchivedHabitsPage[\s\S]*showToast\(`Habit added to \$\{[^}]+\}\.`\)/,
    `${label}: reassigned restoration stays on the list and announces the chosen category`);
  assert.match(html, /id="toast"[^>]*(?:role="status"[^>]*aria-live="polite"|aria-live="polite"[^>]*role="status")/,
    `${label}: lifecycle confirmations use a polite status live region`);

  // Event bindings connect both launch surfaces and all reversible lifecycle controls.
  const bindHabitLifecycleActions = extractFunction(html, 'bindHabitLifecycleActions');
  assert.match(bindHabitLifecycleActions, /data-habit-lifecycle-action="create"[\s\S]*openNewHabitEditorPage/,
    `${label}: create entry points open create mode`);
  assert.match(bindHabitLifecycleActions, /data-habit-lifecycle-action="archived"[\s\S]*openArchivedHabitsPage/,
    `${label}: archived entry points open the scoped archived view`);
  assert.match(html, /habitEditorArchive[^\n]*addEventListener\('click',\s*openHabitArchiveDialog\)/,
    `${label}: editor archive action opens confirmation`);
  assert.match(html, /habitArchiveConfirm[^\n]*addEventListener\('click',\s*archiveEditedHabit\)/,
    `${label}: archive confirmation records the lifecycle transition`);
  assert.match(html, /archivedHabitsBack[^\n]*addEventListener\('click'[\s\S]*restoreHabitCategoryConfirm[^\n]*addEventListener\('click',\s*confirmRestoreHabitCategory\)/,
    `${label}: archived Back and category-confirm controls are bound`);
  const focusArchivedHabitsLaunch = extractFunction(html, 'focusArchivedHabitsLaunch');
  assert.match(focusArchivedHabitsLaunch, /requestAnimationFrame[\s\S]*data-habit-lifecycle-action="archived"[\s\S]*\.focus\(\)/,
    `${label}: archived exit restores focus to the originating lifecycle action after rerender`);
  assert.match(focusArchivedHabitsLaunch, /\.find\([\s\S]*categoryId[\s\S]*\|\|[\s\S]*\[0\]/,
    `${label}: focus restoration falls back to the sole rerendered launch action after View all changes archived scope`);
  const closeManagementFlow = extractFunction(html, 'closeManagementFlow');
  assert.match(closeManagementFlow, /archivedHabitsView[\s\S]*focusArchivedHabitsLaunch/,
    `${label}: returning from Home Archived habits restores launch focus`);
  assert.match(restoreManagementRoute, /archivedHabitsView[\s\S]*focusArchivedHabitsLaunch/,
    `${label}: toolbar, Escape, and browser Back restore focus for Manage Archived habits`);
}

console.log('habit lifecycle UI regression contracts passed for mobile and desktop');
