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

function loadFunctions(html) {
  const names = [
    'dateKey',
    'normalizeHabitDays',
    'isHabitScheduledOn',
    'getScheduledHabits',
    'getDailyHabitStats',
    'normalizeNativeNotificationSettings',
    'getNextWaveNotificationRequests',
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

const plain = value => JSON.parse(JSON.stringify(value));

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const { normalizeNativeNotificationSettings, getNextWaveNotificationRequests } = loadFunctions(html);

  assert.deepEqual(plain(normalizeNativeNotificationSettings(null)), { enabled:false, time:'09:00' },
    `${label}: native reminders default off without prompting`);
  assert.deepEqual(plain(normalizeNativeNotificationSettings({ enabled:true, time:'07:30' })), { enabled:true, time:'07:30' },
    `${label}: a valid local reminder time is retained`);
  assert.deepEqual(plain(normalizeNativeNotificationSettings({ enabled:true, time:'24:00' })), { enabled:true, time:'09:00' },
    `${label}: malformed native reminder times fail to the bounded default`);

  const habits = [{ id:'daily' }];
  const now = new Date(2026, 7, 30, 8, 0, 0, 0);
  const settings = { enabled:true, time:'09:00' };
  const requests = getNextWaveNotificationRequests(settings, habits, {}, {}, now, 14);
  assert.equal(requests.length, 14, `${label}: the native bridge receives a bounded two-week horizon`);
  assert.equal(requests[0].id, 120260830, `${label}: notification IDs are deterministic 32-bit date identifiers`);
  assert.equal(requests[0].title, 'Your next wave is ready');
  assert.equal(requests[0].body, 'Open Wavelength for one useful next step.');
  assert.equal(requests[0].schedule.at.getTime(), new Date(2026, 7, 30, 9, 0, 0, 0).getTime());
  assert.deepEqual(plain(requests[0].extra), { route:'home' }, `${label}: tapping a reminder carries only a local Home route`);

  const afterReminder = getNextWaveNotificationRequests(settings, habits, {}, {}, new Date(2026, 7, 30, 10), 14);
  assert.equal(afterReminder.length, 13, `${label}: today's reminder is omitted after its chosen time`);
  const doneToday = { '2026-08-30':{ daily:true } };
  const completedToday = getNextWaveNotificationRequests(settings, habits, doneToday, {}, now, 14);
  assert.equal(completedToday.length, 13, `${label}: today's reminder is omitted when every scheduled habit is complete`);
  assert.deepEqual(plain(getNextWaveNotificationRequests({ enabled:false, time:'09:00' }, habits, {}, {}, now, 14)), [],
    `${label}: disabled reminders schedule nothing`);
  assert.deepEqual(plain(getNextWaveNotificationRequests(settings, [], {}, {}, now, 14)), [],
    `${label}: dates without habits schedule nothing`);

  assert.match(html, /id="nativeNotificationCard"[^>]*hidden/,
    `${label}: the native notification Settings card is hidden in browser builds`);
  assert.match(html, /id="nextWaveNotificationsEnabled"[^>]*type="checkbox"[^>]*role="switch"/,
    `${label}: reminder consent uses an accessible explicit switch`);
  assert.match(html, /id="nextWaveNotificationTime"[^>]*type="time"[^>]*value="09:00"/,
    `${label}: reminder time uses a native bounded time control`);
  assert.match(html, /function setupNativeNotifications\(\)[\s\S]*addEventListener\('change'[\s\S]*requestPermissions\(\)/,
    `${label}: notification permission is requested from an explicit Settings change`);
  assert.doesNotMatch(extractFunction(html, 'createBackupPayload'), /nativeNotification|reminder/i,
    `${label}: device notification permission and preference are excluded from portable backup v5`);
}

console.log('native notification regression tests passed for mobile and desktop');
