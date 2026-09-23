import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const builds = [
  ['mobile', path.resolve(here, '../index.html')],
  ['desktop', path.resolve(here, 'fixtures/friday_app_2026-07-12.html')],
];

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.match(
    html,
    /<div class="section-title-copy">\s*<h2>Today's habits<\/h2>\s*<span class="section-title-separator" aria-hidden="true">·<\/span>\s*<span class="count" id="doneCount">0\/20<\/span>\s*<\/div>\s*<div class="home-habit-tools">/,
    `${label}: Today's Habits and its compact count form the left information group`,
  );
  assert.match(
    html,
    /document\.getElementById\('doneCount'\)\.textContent = `\$\{todayStats\.doneCount\}\/\$\{todayStats\.scheduledCount\}`;/,
    `${label}: the live Home count remains compact without spaces around its slash`,
  );
  assert.match(
    html,
    /\.section-title-copy\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*baseline;[^}]*gap:\s*6px;/,
    `${label}: heading, separator, and count share a compact baseline`,
  );
  assert.match(
    html,
    /\.home-habit-tools\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*gap:\s*4px;/,
    `${label}: the two Home management actions remain an evenly spaced pair`,
  );

  assert.match(
    html,
    /@media\s*\(max-width:\s*600px\)[\s\S]*?\.category-tabs\s*\{[^}]*padding-left:\s*calc\(max\(14px, env\(safe-area-inset-left\)\) \+ 4px\);[^}]*padding-right:\s*calc\(max\(14px, env\(safe-area-inset-right\)\) \+ 4px\);[^}]*scroll-padding-left:\s*calc\(max\(14px, env\(safe-area-inset-left\)\) \+ 4px\);[^}]*scroll-padding-right:\s*calc\(max\(14px, env\(safe-area-inset-right\)\) \+ 4px\);/,
    `${label}: the mobile category rail and its snapport preserve the four-pixel optical inset`,
  );

  assert.match(
    html,
    /\.next-wave-card\s*\{[^}]*background:\s*linear-gradient\(135deg, var\(--surface\), var\(--accent-faint\)\);[^}]*border:\s*1px solid var\(--accent-border\);/,
    `${label}: Next Wave shares the Insights gradient direction while keeping its blue feature border`,
  );
  assert.match(
    html,
    /\.next-wave-icon\s*\{[^}]*border-radius:\s*13px;[^}]*background:\s*var\(--accent-soft\);/,
    `${label}: Next Wave uses the rounded-square icon tile from the Insights card family`,
  );

  const headerRule = html.match(/\n\s*header\s*\{([^}]*)\}/)?.[1] || '';
  assert.ok(headerRule, `${label}: Home header rule exists`);
  assert.doesNotMatch(headerRule, /position:\s*(?:sticky|fixed)/,
    `${label}: the Home header and divider remain in normal document flow`);
}

console.log('final Home styling regression tests passed for mobile and desktop');
