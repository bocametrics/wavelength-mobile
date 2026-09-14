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
  hydrate:'Adjust for heat and activity',
  strength:'Use bodyweight or bands',
  cardio:'Run, bike, or do intervals',
  supplements:'Follow your usual routine',
  medication:'Follow your prescribed directions',
  sunscreen:'Shade, clothing, hat, or sunscreen',
};

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const habits = extractDefaultHabits(html);
  const byId = Object.fromEntries(habits.map(habit => [habit.id, habit]));

  for (const [id, expected] of Object.entries(expectedNotes)) {
    assert.equal(byId[id].note, expected, `${label}: ${id} uses the concise reviewed card summary`);
  }
  assert.ok(habits.every(habit => habit.note.length <= 42), `${label}: shipped card summaries stay within the 42-character authoring budget`);
  assert.match(html, /const HABIT_CARD_NOTE_MAX = 42;/, `${label}: the card-summary authoring limit is explicit`);
  assert.match(html, /class="eh-note" maxlength="\$\{HABIT_CARD_NOTE_MAX\}"/, `${label}: Manage applies the shared card-summary limit`);
  assert.match(html, /class="eh-note-count"[^>]*>\$\{[^}]*\.length\} \/ \$\{HABIT_CARD_NOTE_MAX\}</, `${label}: Manage shows a live description counter`);
  assert.match(html, /note\.length > HABIT_CARD_NOTE_MAX && note !== originalNote/, `${label}: edited over-limit legacy descriptions fail closed`);
  assert.match(html, /Use 42 characters or fewer for the card description/, `${label}: the description error explains the limit`);
  assert.match(html, /input\.nextElementSibling\.textContent = `\$\{input\.value\.length\} \/ \$\{HABIT_CARD_NOTE_MAX\}`/, `${label}: the counter updates without injecting user content`);
}

console.log('typography content regression tests passed for mobile and desktop');
