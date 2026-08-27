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

  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let templateExpressionDepth = 0;

  for (let i = brace; i < source.length; i++) {
    const char = source[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote && char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote && (quote !== '`' || templateExpressionDepth === 0)) quote = null;
      else if (quote === '`' && char === '$' && source[i + 1] === '{') {
        templateExpressionDepth++;
        i++;
      } else if (quote === '`' && char === '}' && templateExpressionDepth > 0) {
        templateExpressionDepth--;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(start, i + 1);
  }

  throw new Error(`Could not extract ${name}`);
}

function loadStreakFunctions(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const source = [
    extractFunction(html, 'dateKey'),
    extractFunction(html, 'normalizeHabitDays'),
    extractFunction(html, 'isHabitScheduledOn'),
    extractFunction(html, 'getScheduledHabits'),
    extractFunction(html, 'getDailyHabitStats'),
    extractFunction(html, 'calculateCurrentStreak'),
    extractFunction(html, 'getStreakStatusCopy'),
    'globalThis.exports = { calculateCurrentStreak, getStreakStatusCopy };',
  ].join('\n');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context, { filename: htmlPath });
  return context.exports;
}

const ids = Array.from({ length: 20 }, (_, i) => `h${i + 1}`);
const completed = count => Object.fromEntries(ids.slice(0, count).map(id => [id, true]));
const today = new Date(2026, 7, 26, 12, 0, 0); // Wednesday, August 26

for (const [label, htmlPath] of builds) {
  const { calculateCurrentStreak, getStreakStatusCopy } = loadStreakFunctions(htmlPath);

  const pendingToday = {
    '2026-08-24': completed(8),
    '2026-08-25': completed(11),
    '2026-08-26': completed(3),
  };
  assert.equal(
    calculateCurrentStreak(pendingToday, ids, today),
    2,
    `${label}: an unfinished current day must not erase the qualifying streak through yesterday`,
  );
  assert.equal(
    getStreakStatusCopy(2, 3),
    'Complete 2 more habits today to extend your streak to 3 days',
    `${label}: pending-day copy should describe extending the existing streak`,
  );

  const securedToday = { ...pendingToday, '2026-08-26': completed(5) };
  assert.equal(
    calculateCurrentStreak(securedToday, ids, today),
    3,
    `${label}: today should join the streak once the five-habit target is reached`,
  );
  assert.equal(
    getStreakStatusCopy(3, 5),
    '✅ 3-day streak secured!',
    `${label}: secured-day copy should reflect the full current streak`,
  );

  const missedYesterday = {
    '2026-08-24': completed(8),
    '2026-08-25': completed(4),
    '2026-08-26': completed(3),
  };
  assert.equal(
    calculateCurrentStreak(missedYesterday, ids, today),
    0,
    `${label}: a missed prior day should leave no active streak`,
  );
  assert.equal(
    getStreakStatusCopy(0, 3),
    'Complete 2 more habits today to start a streak',
    `${label}: zero-streak copy must not claim there is a streak to keep alive`,
  );
}

console.log('streak regression tests passed for mobile and desktop');
