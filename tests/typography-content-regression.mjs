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

const expectedNotes = {
  daylight:'Step outside for 10 minutes',
  affirm:'Choose words that encourage you',
  hydrate:'Set an amount that works for you',
  strength:'Use bodyweight or bands',
  beach:'Walk, roll, hike, swim or paddle',
  cardio:'Run, bike, dance or do intervals',
  learn:'Practice, recall or research',
  goals:'Name the outcomes that matter',
  breakfast:'Choose what suits your morning',
  supplements:'Follow your usual routine',
  medication:'Follow prescribed directions',
  dinner:'Leave time to wind down for bed',
  sunscreen:'Shade, clothing, hat, sunscreen',
  sleep:"Allow a full night's sleep",
};

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const habits = extractDefaultHabits(html);
  const byId = Object.fromEntries(habits.map(habit => [habit.id, habit]));

  assert.equal(byId.affirm.text, 'Say an affirmation',
    `${label}: affirmation names the action without embedding a category or time of day`);

  for (const [id, expected] of Object.entries(expectedNotes)) {
    assert.equal(byId[id].note, expected, `${label}: ${id} uses the concise reviewed card summary`);
  }
  assert.ok(habits.every(habit => habit.text.length <= 30), `${label}: shipped titles stay within the 30-character authoring budget`);
  assert.equal(byId.sunscreen.text, 'Use sun protection outdoors', `${label}: outdoor protection title keeps its action and setting within the new budget`);
  assert.ok(habits.every(habit => habit.note.length <= 32), `${label}: shipped card summaries stay within the 32-character authoring budget`);
  assert.match(html, /const HABIT_CARD_NOTE_MAX = 32;/, `${label}: the new card-summary authoring limit is explicit`);
  assert.match(html, /id="habitNoteInput"[^>]*maxlength="32"/, `${label}: new descriptions use the new authoring limit`);
  assert.match(html, /class="eh-note-count"[^>]*>\$\{[^}]*\.length\} \/ \$\{HABIT_CARD_NOTE_MAX\}</, `${label}: Manage shows a live description counter`);
  assert.match(html, /note\.length > HABIT_CARD_NOTE_MAX && note !== originalNote/, `${label}: editing a legacy description enforces the new budget only if changed`);
  assert.match(html, /Use 32 characters or fewer for the card description/, `${label}: the description error explains the new limit`);
  assert.match(html, /\.textContent = `\$\{[^\n]*\.length\} \/ \$\{HABIT_CARD_NOTE_MAX\}`/, `${label}: counter updates use text content, not user-supplied HTML`);
  assert.match(html, /body\s*\{[\s\S]*?font-family:\s*-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;/,
    `${label}: the app explicitly uses the native system font stack`);
  assert.doesNotMatch(html, /@import\s+url\(['"]https:\/\/fonts\.googleapis\.com\//,
    `${label}: no invalid external font import leaves the app dependent on a fallback`);
  assert.match(html, /@media\s*\(max-width:\s*600px\)\s*\{[\s\S]*?\.habit\s*\{[\s\S]*?grid-template-columns:\s*26px 24px minmax\(0, 1fr\) auto;/,
    `${label}: mobile habit tracks match the rendered icon and checkbox sizes`);
  assert.match(html, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.habit-target\s*\{[^}]*font-size:\s*0\.875rem;[^}]*font-weight:\s*500;/,
    `${label}: mobile habit targets remain visually secondary to the 16px name`);
}

console.log('typography content regression tests passed for mobile and desktop');
