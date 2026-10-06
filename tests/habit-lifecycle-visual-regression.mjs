import assert from 'node:assert/strict';
import fs from 'node:fs';

// Parent-owned guards for Phase 12 defects reproduced in real Edge.
// Behavioral contrast, clipping and touch-drag acceptance remain in the browser suite.
for (const build of ['index.html', 'tests/fixtures/friday_app_2026-07-12.html']) {
  const html = fs.readFileSync(new URL(`../${build}`, import.meta.url), 'utf8');
  const nameRule = html.match(/\.archived-habit-name\s*\{([^}]+)\}/)?.[1];
  assert.ok(nameRule, `${build}: archived names have a style rule`);
  assert.doesNotMatch(nameRule, /text-overflow:\s*ellipsis|white-space:\s*nowrap|overflow:\s*hidden/,
    `${build}: retained archived names cannot be ellipsized or clipped`);
  assert.match(nameRule, /overflow-wrap:\s*anywhere/,
    `${build}: long unbroken custom names can wrap within the retained row`);
  assert.match(html, /body\.dragging-active\s+#manageHabitLifecycleActions\s*\{[^}]*visibility:\s*hidden/s,
    `${build}: real Manage grip reorder hides lifecycle actions without collapsing drag geometry`);
  assert.match(html, /--lifecycle-accent:\s*var\(--accent\)/,
    `${build}: Night preserves the established lifecycle accent`);
  assert.match(html, /html\[data-theme="light"\][^{]*\{[^}]*--lifecycle-accent:\s*#[0-9a-f]{6}/is,
    `${build}: Day has a scoped AA lifecycle accent rather than changing every app accent`);
  for (const selector of ['habit-lifecycle-primary', 'archived-habit-restore']) {
    assert.match(html, new RegExp(`\\.${selector}(?:,|\\s*\\{)[^}]*color:\\s*var\\(--lifecycle-accent\\)`, 's'),
      `${build}: ${selector} uses the readable lifecycle token`);
  }
}
console.log('Habit lifecycle visual guards passed for both builds.');
