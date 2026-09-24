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

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const renderCategoriesPage = extractFunction(html, 'renderCategoriesPage');
  const makeCategoryRow = extractFunction(html, 'makeCategoryRow');
  const renderManageCategoryPage = extractFunction(html, 'renderManageCategoryPage');
  const renderCategoryOptions = extractFunction(html, 'renderCategoryOptions');
  const attachGripReorder = extractFunction(html, 'attachGripReorder');

  assert.match(html, /id="manageBtn"[^>]*aria-label="Manage habits"[\s\S]*id="manageCategoriesBtn"[^>]*aria-label="Manage categories"/,
    `${label}: Home groups icon-only habit and category management controls above the cards`);
  assert.doesNotMatch(html, /class="manage-categories-btn"/,
    `${label}: the category filter rail no longer contains a trailing management plus`);
  assert.match(html, /id="newCategoryBtn"[^>]*>\+ Add a Category<\/button>/,
    `${label}: Categories uses the approved Add a Category copy`);

  assert.match(html, /id="categoriesBack"[^>]*aria-label="Back"[^>]*>[\s\S]*<svg/,
    `${label}: Categories uses an icon-only accessible Back control`);
  assert.match(html, /id="manageCategoryBack"[^>]*aria-label="Back"[^>]*>[\s\S]*<svg/,
    `${label}: Manage Category uses the same icon-only accessible Back control`);
  assert.doesNotMatch(renderCategoriesPage, /allRow|All habits|categoryId.*all/,
    `${label}: Categories does not render the virtual All aggregate as a management card`);
  assert.doesNotMatch(makeCategoryRow, /category-row-meta|habit count|HABITS\.filter/,
    `${label}: category cards do not render habit-count subtitles`);
  assert.match(html, /id="archivedCategoriesGroup"[^>]*hidden[\s\S]*id="archivedCategoriesHeading"[\s\S]*Archived · <span id="archivedCategoriesCount">0<\/span>[\s\S]*id="archivedCategoriesList"/,
    `${label}: archived categories render inline beneath an explicit count heading`);
  assert.doesNotMatch(html, /id="archivedCategoriesView"|id="archivedCategoriesBtn"/,
    `${label}: there is no separate Archived Categories page or link`);
  assert.match(renderCategoriesPage, /archivedCategoriesGroup[\s\S]*archivedCategoriesCount[\s\S]*makeArchivedCategoryRow/,
    `${label}: Categories renders archived cards in the inline partition`);
  assert.match(html, /class="archived-category-row[^"]*"[\s\S]*class="restore-category-btn"/,
    `${label}: archived category cards use an explicit Restore control`);

  assert.match(html, /id="categoryOptionsBtn"[^>]*aria-label="Category options"[\s\S]*<svg/,
    `${label}: Manage Category exposes an icon-only options menu`);
  assert.doesNotMatch(html, /id="categoryActions"|class="archive-category-btn"/,
    `${label}: the old bottom archive area is removed`);
  assert.match(html, /id="categoryOptionsSheet"[\s\S]*id="editCategoryOption"[\s\S]*id="categoryRemovalOption"/,
    `${label}: category actions live in a focused options sheet`);
  assert.match(renderCategoryOptions, /isShippedCategory[\s\S]*Archive category[\s\S]*Delete category[\s\S]*Move .* first/,
    `${label}: options distinguish shipped archive from custom deletion and explain the empty-category gate`);
  assert.match(html, /id="categoryRemovalDialog"[\s\S]*id="categoryRemovalConfirm"[\s\S]*id="categoryRemovalCancel"/,
    `${label}: archive and delete require an in-app confirmation dialog`);
  assert.match(html, /function deleteManagedCategory\([\s\S]*deleteCategoryDefinition[\s\S]*saveCategoryState/,
    `${label}: confirmed custom deletion persists through the validated category model`);

  assert.match(html, /const GRIP_LONG_PRESS_MS = 250;/,
    `${label}: touch reordering has a deliberate long-press threshold`);
  assert.match(attachGripReorder, /setTimeout[\s\S]*GRIP_LONG_PRESS_MS[\s\S]*setPointerCapture[\s\S]*clientY/,
    `${label}: drag activates after the long press and remains vertically driven`);
  assert.match(attachGripReorder, /ArrowUp.*ArrowDown/s,
    `${label}: keyboard reordering remains supported`);
  assert.match(html, /\.category-grip-marker[\s\S]*grid-template-columns:\s*repeat\(2,\s*3px\)[\s\S]*grid-template-rows:\s*repeat\(3,\s*3px\)/,
    `${label}: category and habit grips use a recognizable compact six-dot drag marker`);
  assert.match(html, /\.category-drag-proxy[\s\S]*position:\s*fixed[\s\S]*pointer-events:\s*none[\s\S]*box-shadow:/,
    `${label}: a long press lifts a full-card proxy that can track the finger vertically`);

  assert.match(html, /\.category-row-name,[\s\S]*\.manage-habit-row-name[\s\S]*font-size:\s*1rem[\s\S]*font-weight:\s*500/,
    `${label}: management titles match the 16px/500 Home habit identity`);
  assert.match(html, /\.manage-habit-row-meta[\s\S]*font-size:\s*0\.875rem/,
    `${label}: management descriptions match the 14px Home summary scale`);
  assert.match(html, /\.category-row-copy,[\s\S]*\.manage-habit-row-copy\s*\{[\s\S]*display:\s*grid[\s\S]*gap:/,
    `${label}: title and description occupy distinct rows with explicit spacing`);
  assert.match(renderManageCategoryPage, /manage-habit-row-name[\s\S]*manage-habit-row-meta/,
    `${label}: Manage Habit cards retain separate title and description elements`);

  assert.match(html, /@media \(max-width: 600px\)[\s\S]*scrollbar-width:\s*none[\s\S]*overflow-x:\s*clip/,
    `${label}: mobile app surfaces suppress webpage scrollbars and horizontal movement without breaking sticky headers`);
  assert.match(html, /\.management-header\s*\{[\s\S]*position:\s*sticky[\s\S]*env\(safe-area-inset-top\)/,
    `${label}: management headers remain sticky beneath the safe area`);
}

console.log('category management UX regression tests passed for mobile and desktop');
