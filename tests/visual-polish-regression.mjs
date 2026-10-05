import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const builds = [
  ['mobile', path.resolve(here, '../index.html')],
  ['desktop', path.resolve(here, 'fixtures/friday_app_2026-07-12.html')],
];

assert.deepEqual(fs.readFileSync(builds[0][1]), fs.readFileSync(builds[1][1]),
  'mobile and desktop shared app builds remain byte-identical');

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /:root\s*\{[\s\S]*?--bg:\s*#0b0f1a;[\s\S]*?--habit-border:\s*var\(--border\);/,
    `${label}: Night keeps its established page and unfinished-card border treatment`);
  assert.match(html, /html\[data-theme="light"\]\s*\{[\s\S]*?--bg:\s*#eef3f5;[\s\S]*?--habit-border:\s*rgba\(28,53,68,0\.16\);/,
    `${label}: Day uses the approved restrained darker page and unfinished-card border tokens`);
  assert.match(html, /\.habit\s*\{[\s\S]*?border:\s*1px solid var\(--habit-border\);/,
    `${label}: unfinished cards consume the dedicated theme-aware border token`);
  assert.doesNotMatch(html, /'#f3f7f8'/,
    `${label}: browser chrome stays synchronized with the darker Day page background`);
  assert.match(html, /@media \(hover: hover\) \{[\s\S]*?\.habit:hover\s*\{[\s\S]*?border-color:\s*var\(--border-strong\);[\s\S]*?background:\s*var\(--surface2\);/,
    `${label}: visual hover feedback is limited to hover-capable pointers`);
  assert.match(html, /@media \(hover: hover\) \{[\s\S]*?\.habit:hover \.move-btn\s*\{[\s\S]*?\.move-btn:hover\s*\{/,
    `${label}: reorder-control hover feedback is limited to hover-capable pointers`);
  assert.doesNotMatch(html, /\n  \.habit:hover\s*\{/,
    `${label}: touch devices never receive a sticky unfinished-card hover treatment`);
  assert.doesNotMatch(html, /\n  (?:\.habit:hover \.move-btn|\.move-btn:hover)\s*\{/,
    `${label}: wide touch devices never receive sticky reorder-control hover treatment`);
}

console.log('visual polish regression tests passed for mobile and desktop');
