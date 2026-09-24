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
  const attachGripReorder = extractFunction(html, 'attachGripReorder');
  const normalizeCategoryEmoji = extractFunction(html, 'normalizeCategoryEmoji');
  const requestLeaveCategoryEditor = extractFunction(html, 'requestLeaveCategoryEditor');
  const openCategoryEditorPage = extractFunction(html, 'openCategoryEditorPage');

  assert.match(html, /html\[data-management-open="true"\]\s+body\s*\{[^}]*padding-top:\s*0;/s,
    `${label}: management screens own the top safe area without inherited body padding`);
  assert.match(html, /\.management-header h1\s*\{[^}]*font-size:\s*1\.0625rem;[^}]*font-weight:\s*600;[^}]*line-height:\s*1\.2;/s,
    `${label}: compact management headings use an explicit 17px native hierarchy`);
  assert.match(html, /\.management-header\s*\{[^}]*grid-template-columns:\s*44px minmax\(0,\s*1fr\) 44px;/s,
    `${label}: management headers reserve equal 44px tracks around the centered title`);
  assert.match(html, /\.category-row\s*,[\s\S]*?width:\s*100%;[\s\S]*?padding:\s*10px 12px;/,
    `${label}: category rows explicitly fill the shared content column`);
  assert.match(html, /\.category-row-name,[\s\S]*?font-size:\s*1rem;[\s\S]*?font-weight:\s*500;/,
    `${label}: category titles match the 16px/500 Home habit identity`);

  assert.match(html, /\.start-category-btn\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*50px;[^}]*font:\s*600 1rem\/1\.2 inherit;/s,
    `${label}: Add a Category aligns to the list at the global 16px control scale`);
  assert.match(html, /\.start-category-btn:active[\s\S]*\.start-category-btn:focus-visible/,
    `${label}: Add a Category has explicit pressed and keyboard-focus feedback`);
  assert.match(html, /@media \(hover:\s*hover\)[\s\S]*\.start-category-btn:hover/,
    `${label}: Add a Category hover styling is limited to hover-capable devices`);

  assert.match(html, /id="categoryEditorBack"[^>]*aria-label="Back"[^>]*>[\s\S]*?<svg/,
    `${label}: the category editor uses the shared icon-only Back control`);
  assert.match(html, /id="categoryEditorHeading">New Category<\/h1>\s*<span aria-hidden="true"><\/span>/,
    `${label}: the editor header reserves a balanced empty action slot`);
  assert.doesNotMatch(html, /<div class="management-header">[\s\S]{0,500}id="categoryEditorSave"/,
    `${label}: the category editor no longer uses a competing header Save action`);
  assert.match(html, /id="categoryIconHeading"[^>]*>Category icon<\/[^>]+>[\s\S]*id="categoryIconChoices"[\s\S]*id="categoryEmojiInput"[\s\S]*id="categoryEditorSave"[^>]*>Add Category<\/button>/,
    `${label}: icon selection, native-keyboard emoji input, and the primary form action follow the content flow`);
  assert.match(html, /<span>Choose another emoji<\/span>[\s\S]*id="categoryEmojiInput"/,
    `${label}: the full-keyboard emoji path is named explicitly`);
  assert.doesNotMatch(openCategoryEditorPage, /categoryNameInput[^\n]*focus\(|categoryEmojiInput[^\n]*focus\(/,
    `${label}: opening the Category editor does not summon the keyboard automatically`);
  assert.match(html, /\.category-editor-field input,[\s\S]*?font:\s*500 1rem\/1\.25 inherit;/,
    `${label}: category inputs render at 16px to prevent iOS focus zoom`);
  assert.match(html, /\.category-editor-primary\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*52px;[^}]*font:\s*600 1rem\/1\.2 inherit;/s,
    `${label}: the editor ends with one prominent thumb-reachable primary action`);
  assert.match(html, /\.category-editor-primary:disabled[\s\S]*\.category-editor-primary:active[\s\S]*\.category-editor-primary:focus-visible/,
    `${label}: the form action exposes disabled, pressed, and focus-visible states`);

  assert.match(normalizeCategoryEmoji, /Intl\.Segmenter[\s\S]*grapheme[\s\S]*Extended_Pictographic[\s\S]*Regional_Indicator/,
    `${label}: custom emoji validation preserves one complete emoji grapheme including flags`);
  assert.match(html, /const CATEGORY_SCHEMA_VERSION = 2;/,
    `${label}: arbitrary emoji persistence uses an explicit migrated category schema`);
  assert.match(html, /const BACKUP_VERSION = 7;/,
    `${label}: backups version the expanded category icon contract`);
  assert.match(html, /\[1, 2, 3, 4, 5, 6, BACKUP_VERSION\]/,
    `${label}: version 6 backups remain import-compatible after the version 7 bump`);
  assert.match(html, /function getCategoryIcon\([\s\S]*normalizeCategoryEmoji[\s\S]*CATEGORY_ICON_MAP/,
    `${label}: every category surface resolves custom emoji with a curated fallback`);

  assert.match(requestLeaveCategoryEditor, /categoryEditorDirty[\s\S]*Discard unsaved changes\?[\s\S]*return false/,
    `${label}: category drafts are protected before leaving the editor`);
  assert.match(html, /categoryNameInput[\s\S]*addEventListener\('input',[\s\S]*categoryEmojiInput[\s\S]*addEventListener\('input'/,
    `${label}: name and emoji edits update form validity and dirty state live`);

  assert.match(attachGripReorder, /category-drag-proxy[\s\S]*category-drag-placeholder[\s\S]*clientY[\s\S]*translate3d/,
    `${label}: touch drag uses a full-card vertical proxy that follows the pointer`);
  assert.match(attachGripReorder, /getBoundingClientRect[\s\S]*requestAnimationFrame[\s\S]*transition/,
    `${label}: neighboring category cards animate between prospective positions`);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.category-drag-proxy[\s\S]*transition:\s*none/,
    `${label}: continuous drag motion has a reduced-motion fallback`);
  assert.match(html, /\.category-grip-marker\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*3px\);[^}]*grid-template-rows:\s*repeat\(3,\s*3px\);/s,
    `${label}: the six-dot grip reads as reordering rather than an overflow menu`);
}

console.log('Category page polish regression tests passed for mobile and desktop');
