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

function loadTrendFunctions(html) {
  const names = [
    'dateKey',
    'normalizeMeasurementConfig',
    'getHabitProgress',
    'isHabitProgressComplete',
    'normalizeHabitDays',
    'isHabitScheduledOn',
    'getScheduledHabits',
    'getDailyHabitStats',
    'getWeekDates',
    'getElapsedWeekSummary',
    'getLast30DayTrend',
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

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const fns = loadTrendFunctions(html);
  const habits = [
    { id:'wake' },
    { id:'walk' },
  ];
  const now = new Date(2026, 7, 31, 12);
  const done = {
    '2026-08-24': { wake:true },
    '2026-08-25': { wake:true, walk:true },
    '2026-08-31': { wake:true },
    '2026-09-01': { wake:true, walk:true },
  };

  const week = fns.getElapsedWeekSummary(done, habits, now, {});
  assert.equal(JSON.stringify(week), JSON.stringify({ doneCount:1, scheduledCount:2, pct:50, dayCount:1 }),
    `${label}: Monday's weekly rate excludes future Tuesday through Sunday`);

  const trend = fns.getLast30DayTrend(done, habits, now, {});
  assert.equal(trend.points.length, 30, `${label}: rolling trend always spans 30 calendar days`);
  assert.equal(trend.points.find(point => point.key === '2026-08-23').pct, null,
    `${label}: dates before first stored activity are gaps, not zeroes`);
  assert.equal(trend.points.find(point => point.key === '2026-08-24').pct, 50,
    `${label}: each plotted point uses that day's eligible-habit denominator`);
  assert.equal(trend.points.find(point => point.key === '2026-08-26').pct, 0,
    `${label}: an elapsed eligible day after tracking began can truthfully show zero`);
  assert.equal(trend.points.find(point => point.key === '2026-08-31').pct, 50,
    `${label}: today's partial completion appears in the trend`);
  assert.equal(trend.trackedDays, 8, `${label}: tracked-day disclosure spans Aug 24 through Aug 31`);
  assert.equal(trend.averagePct, 25, `${label}: summary is weighted across tracked eligible habits`);
  assert.equal(trend.totalDone, 4, `${label}: future stored records are excluded from the rolling window`);
  assert.equal(trend.totalPossible, 16, `${label}: only elapsed tracked dates contribute to the denominator`);

  const createdAt = new Date(2026, 7, 24, 8).getTime();
  const noFirstDayCompletion = fns.getLast30DayTrend(
    { '2026-08-25': { wake:true } }, habits, now, {}, createdAt,
  );
  assert.equal(noFirstDayCompletion.points.find(point => point.key === '2026-08-24').pct, 0,
    `${label}: the stored creation date preserves a real first day with zero completions`);
  assert.equal(noFirstDayCompletion.trackedDays, 8,
    `${label}: tracking age does not depend on the first completion record`);

  assert.match(html, /document\.getElementById\('dateLabel'\)\.textContent = `Week \$\{weekNum\} · \$\{now\.getFullYear\(\)\}`/,
    `${label}: header metadata shows the year instead of repeating the month`);
  assert.match(html, /<div class="weekly last-30-card">[\s\S]*<h3>Last 30 days<\/h3>[\s\S]*id="last30Stats"[\s\S]*id="last30Chart"/,
    `${label}: a separate Last 30 Days card and chart are present`);
  assert.ok(html.indexOf('id="weekGrid"') < html.indexOf('id="last30Chart"'),
    `${label}: Last 30 Days follows the unchanged weekly card`);
  assert.match(html, /<svg[^>]*id="last30Chart"[^>]*role="img"[^>]*aria-labelledby="last30ChartTitle"/,
    `${label}: the trend chart has an accessible text alternative`);
  assert.match(html, /function updateWeekly\(now = new Date\(\)\)[\s\S]*getElapsedWeekSummary\(state\.done \|\| \{\}, HABITS, now, state\.progress \|\| \{\}\)/,
    `${label}: weekly display uses the elapsed-day summary helper`);
  assert.match(html, /<text class="trend-axis-label"[^>]*>\$\{pct\}%<\/text>/,
    `${label}: Y-axis labels identify completion percentages explicitly`);
  assert.match(html, /function renderLast30Days\(now = new Date\(\)\)/,
    `${label}: the 30-day card has a dedicated renderer`);
  assert.match(html, /renderLast30Days\(now\)/,
    `${label}: the trend refreshes with the same captured render timestamp`);
}

console.log('last 30 days and elapsed-week regression tests passed for mobile and desktop');
