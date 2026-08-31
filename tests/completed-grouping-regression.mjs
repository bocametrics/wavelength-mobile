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
    if (escaped) { escaped = false; continue; }
    if (quote && char === '\\') { escaped = true; continue; }
    if (quote) {
      if (char === quote && (quote !== '`' || templateExpressionDepth === 0)) quote = null;
      else if (quote === '`' && char === '$' && source[i + 1] === '{') { templateExpressionDepth++; i++; }
      else if (quote === '`' && char === '}' && templateExpressionDepth > 0) templateExpressionDepth--;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function loadFunctions(html) {
  const names = [
    'normalizeMeasurementConfig',
    'getHabitProgress',
    'isHabitProgressComplete',
    'partitionHabitsForTracking',
    'getCompletedHabitsAriaLabel',
  ];
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${names.map(name => extractFunction(html, name)).join('\n')}\n` +
    `globalThis.exports = { ${names.join(', ')} };`,
    context,
  );
  return context.exports;
}

const ids = habits => Array.from(habits, habit => habit.id);

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const fns = loadFunctions(html);
  const canonical = [
    { id:'wake', measurement:{ type:'check' } },
    { id:'water', measurement:{ type:'count', target:2, step:1 } },
    { id:'walk', measurement:{ type:'check' } },
    { id:'sunscreen', measurement:{ type:'check' } },
  ];

  const grouped = fns.partitionHabitsForTracking(
    canonical,
    { wake:true, water:true },
    { water:2 },
  );
  assert.deepEqual(ids(grouped.active), ['walk', 'sunscreen'],
    `${label}: incomplete habits lead while retaining canonical relative order`);
  assert.deepEqual(ids(grouped.completed), ['wake', 'water'],
    `${label}: completed habits retain canonical relative order`);
  assert.deepEqual(ids(canonical), ['wake', 'water', 'walk', 'sunscreen'],
    `${label}: tracking partition never mutates canonical user order`);

  const reopenedMeasurement = fns.partitionHabitsForTracking(
    canonical,
    { wake:true },
    { water:1 },
  );
  assert.deepEqual(ids(reopenedMeasurement.active), ['water', 'walk', 'sunscreen'],
    `${label}: measured habit returns to active when progress falls below target`);
  assert.deepEqual(ids(reopenedMeasurement.completed), ['wake'],
    `${label}: measured decrement does not disturb other completed habits`);

  const nextDay = fns.partitionHabitsForTracking(canonical, {}, {});
  assert.deepEqual(ids(nextDay.active), ['wake', 'water', 'walk', 'sunscreen'],
    `${label}: a new day naturally restores canonical order`);
  assert.deepEqual(ids(nextDay.completed), [], `${label}: a new day has no completed section`);
  assert.equal(fns.getCompletedHabitsAriaLabel(1), '1 completed habit',
    `${label}: one completed habit has a grammatical accessible name`);
  assert.equal(fns.getCompletedHabitsAriaLabel(2), '2 completed habits',
    `${label}: multiple completed habits use the plural accessible name`);

  const helperSource = extractFunction(html, 'partitionHabitsForTracking');
  assert.doesNotMatch(helperSource, /userOrder|saveOrder|localStorage/,
    `${label}: completion grouping remains view-only`);
  assert.match(html, /const grouped = partitionHabitsForTracking\(sorted, todayDone, todayProgress\)/,
    `${label}: category-filtered canonical list is partitioned only after sorting`);
  assert.match(html, /const completedMarkup = grouped\.completed\.length === 0[\s\S]*completed-divider[\s\S]*Completed · \$\{grouped\.completed\.length\}[\s\S]*renderHabitCards\(grouped\.completed\)/,
    `${label}: completed cards receive a counted divider only when the group is non-empty`);
  assert.match(html, /reorderMode\s*\?\s*renderHabitCards\(sorted\)\s*:\s*`\$\{renderHabitCards\(grouped\.active\)\}\$\{completedMarkup\}`/,
    `${label}: tracking groups completed cards while Reorder shows canonical order without a divider`);
  assert.match(html, /<h3 class="completed-divider"[^>]*aria-label="\$\{getCompletedHabitsAriaLabel\(grouped\.completed\.length\)\}"/,
    `${label}: completed group has a semantic accessible heading`);
  assert.match(html, /\.completed-divider\s*\{[^}]*color:\s*var\(--text2\)[^}]*text-transform:\s*uppercase/s,
    `${label}: completed divider uses the readable secondary-text token`);
  assert.match(html, /function setReorderMode\(enabled\)[\s\S]*renderHabits\(\)/,
    `${label}: entering Reorder rerenders the canonical view`);
}

console.log('completed grouping regression tests passed for mobile and desktop');
