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
