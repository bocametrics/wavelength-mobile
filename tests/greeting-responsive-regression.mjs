import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const builds = [
  ['mobile', path.resolve(here, '../index.html')],
  ['desktop', path.resolve(here, '../../friday_app_2026-07-12.html')],
];

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = brace; i < source.length; i++) {
    const char = source[i];
    if (escaped) { escaped = false; continue; }
    if (quote && char === '\\') { escaped = true; continue; }
    if (quote) { if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const expected = [
  [0,  'Good night',     '🌙'],
  [4,  'Good night',     '🌙'],
  [5,  'Good morning',   '☀️'],
  [11, 'Good morning',   '☀️'],
  [12, 'Good afternoon', '🌤️'],
  [16, 'Good afternoon', '🌤️'],
  [17, 'Good evening',   '🌙'],
  [23, 'Good evening',   '🌙'],
];

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${extractFunction(html, 'getGreetingForHour')}\nglobalThis.fn = getGreetingForHour;`, context);

  for (const [hour, text, icon] of expected) {
    const result = context.fn(hour);
    assert.equal(result.text, text, `${label}: hour ${hour} greeting text`);
    assert.equal(result.icon, icon, `${label}: hour ${hour} greeting icon`);
  }

  const updateGreeting = extractFunction(html, 'updateGreeting');
  assert.match(updateGreeting, /getGreetingForHour\(h\)/, `${label}: rendered greeting must use the shared time mapping`);
  assert.doesNotMatch(updateGreeting, /doneCount|todayDone/, `${label}: greeting icon must not depend on habit completion`);

  assert.match(
    html,
    /@media\s*\(max-width:\s*600px\)\s*\{[\s\S]*?\.streak-flame\s*\{\s*display:\s*none;\s*\}/,
    `${label}: mobile breakpoint must suppress the left streak icon`,
  );
}

console.log('greeting and mobile streak layout regression tests passed for mobile and desktop');
