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

function loadThemeFunctions(html) {
  const source = [
    extractFunction(html, 'resolveTheme'),
    extractFunction(html, 'getInitialThemePreference'),
    extractFunction(html, 'getThemeStatusCopy'),
    'globalThis.exports = { resolveTheme, getInitialThemePreference, getThemeStatusCopy };',
  ].join('\n');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.exports;
}

function relativeLuminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16) / 255);
  const linear = channels.map(value => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const { resolveTheme, getInitialThemePreference, getThemeStatusCopy } = loadThemeFunctions(html);

  assert.equal(resolveTheme('system', false), 'light', `${label}: System must follow a light device`);
  assert.equal(resolveTheme('system', true), 'dark', `${label}: System must follow a dark device`);
  assert.equal(resolveTheme('light', true), 'light', `${label}: Day must override a dark device`);
  assert.equal(resolveTheme('dark', false), 'dark', `${label}: Night must override a light device`);

  assert.equal(getInitialThemePreference(null, true), 'dark', `${label}: existing users must retain Night`);
  assert.equal(getInitialThemePreference(null, false), 'system', `${label}: new users must default to System`);
  assert.equal(getInitialThemePreference('light', true), 'light', `${label}: stored Day must persist`);
  assert.equal(getInitialThemePreference('system', true), 'system', `${label}: stored System must persist`);
  assert.equal(getInitialThemePreference('invalid', false), 'system', `${label}: invalid preferences must fail safe`);

  assert.equal(
    getThemeStatusCopy('system', 'light'),
    'Following your device — currently Day',
    `${label}: System status must expose the effective theme`,
  );
  assert.equal(getThemeStatusCopy('light', 'light'), 'Day mode', `${label}: Day status copy`);
  assert.equal(getThemeStatusCopy('dark', 'dark'), 'Night mode', `${label}: Night status copy`);

  for (const option of ['system', 'light', 'dark']) {
    assert.match(html, new RegExp(`data-theme-option=["']${option}["']`), `${label}: missing ${option} control`);
  }
  assert.match(html, /role=["']radiogroup["']/, `${label}: appearance control must be an accessible radiogroup`);
  assert.match(html, /\.theme-option\s*\{[^}]*min-height:\s*44px/s, `${label}: theme controls need 44px touch targets`);
  assert.match(html, /html\[data-theme=["']light["']\]/, `${label}: missing light theme token override`);
  assert.match(html, /prefers-color-scheme:\s*dark/, `${label}: missing system-theme media query`);
  assert.match(html, /addEventListener\(["']change["']|addListener\(/, `${label}: System mode must react to device changes`);
  assert.match(html, /meta name=["']color-scheme["'] content=["']light dark["']/, `${label}: browser controls must support both schemes`);

  // Day mode separates completion blue and success graphics from general
  // accent colors so each UI role can meet its own contrast floor.
  assert.match(html, /--completion-blue:\s*#4b98d8/i, `${label}: Day completion blue must stay close to Night while meeting 3:1`);
  assert.match(html, /--success-ring:\s*#16a34a/i, `${label}: Day progress ring must use vivid checkmark-family green`);
  assert.match(html, /--success-text:\s*#15803d/i, `${label}: Day progress text must use accessible green`);
  assert.match(html, /\.streak-info \.count\s*\{[^}]*color:\s*var\(--completion-blue\)/s, `${label}: streak count must use completion blue`);
  assert.match(html, /\.habit\.done \.checkbox\s*\{[^}]*background:\s*var\(--completion-blue\)[^}]*border-color:\s*var\(--completion-blue\)/s, `${label}: completed checkbox must use completion blue`);
  assert.match(html, /\.streak-ring\s*\{[^}]*var\(--success-ring\)/s, `${label}: progress ring must use its semantic token`);
  assert.match(html, /\.streak-ring-inner\s*\{[^}]*color:\s*var\(--success-text\)/s, `${label}: progress text must use its semantic token`);
  assert.match(html, /\.habit\.done\s*\{[^}]*background:\s*var\(--accent-faint\)/s, `${label}: completed card background must remain unchanged`);
  assert.match(html, /\.week-day \.dot\.filled\s*\{[^}]*var\(--success-ring\)/s, `${label}: weekly filled chart must use success green`);
  assert.doesNotMatch(html, /conic-gradient\(var\(--accent2\)/, `${label}: progress charts must not use the general accent green`);

  assert.ok(contrastRatio('#4b98d8', '#ffffff') >= 3, `${label}: Day completion blue needs 3:1 against cards`);
  assert.ok(contrastRatio('#16a34a', '#ffffff') >= 3, `${label}: Day success ring needs 3:1 against cards`);
  assert.ok(contrastRatio('#15803d', '#ffffff') >= 4.5, `${label}: Day success text needs 4.5:1 against cards`);
}

const mobileHtml = fs.readFileSync(builds[0][1], 'utf8');
assert.match(mobileHtml, /meta name=["']theme-color["'][^>]*id=["']themeColorMeta["']/, 'mobile: dynamic Android theme-color meta is required');
assert.match(mobileHtml, /id=["']appleStatusBarMeta["']/, 'mobile: iPhone status-bar metadata needs a stable update target');

const manifestPath = path.resolve(here, '../manifest.webmanifest');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.equal(manifest.display, 'standalone', 'Android PWA must remain standalone');
assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i, 'Android manifest theme_color must be valid');
assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i, 'Android manifest background_color must be valid');

console.log('theme regression tests passed for mobile, desktop, and Android PWA metadata');
