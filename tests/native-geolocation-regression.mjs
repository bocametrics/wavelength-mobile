import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const builds = [
  ['mobile', path.join(root, 'index.html')],
  ['desktop', path.join(root, 'tests', 'fixtures', 'friday_app_2026-07-12.html')],
];
const plain = value => JSON.parse(JSON.stringify(value));

function functionSource(script, name) {
  const marker = `function ${name}`;
  const asyncMarker = `async ${marker}`;
  const asyncStart = script.indexOf(asyncMarker);
  const start = asyncStart >= 0 ? asyncStart : script.indexOf(marker);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = script.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = brace; index < script.length; index++) {
    const char = script[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return script.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function loadFunctions(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const source = scripts.join('\n');
  const context = { console, Promise, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(`${functionSource(source, 'normalizeLocation')}\n${functionSource(source, 'getCurrentCoordinates')}`, context);
  return context;
}

for (const [label, file] of builds) {
  const html = fs.readFileSync(file, 'utf8');
  const { getCurrentCoordinates } = loadFunctions(html);

  let browserCalls = 0;
  const browserGeo = {
    getCurrentPosition(success) {
      browserCalls++;
      success({ coords:{ latitude:26.7153, longitude:-80.0534 } });
    },
  };

  const grantedCalls = { check:0, request:0, position:0 };
  const granted = {
    isNative:true,
    geolocation:{
      async checkPermissions() { grantedCalls.check++; return { location:'granted', coarseLocation:'granted' }; },
      async requestPermissions() { grantedCalls.request++; return { location:'granted', coarseLocation:'granted' }; },
      async getCurrentPosition(options) {
        grantedCalls.position++;
        assert.equal(JSON.stringify(options), JSON.stringify({ enableHighAccuracy:false, timeout:6000, maximumAge:300000 }));
        return { coords:{ latitude:26.7153, longitude:-80.0534 } };
      },
    },
  };
  assert.deepEqual(plain(await getCurrentCoordinates(granted, browserGeo)), { lat:26.7153, lon:-80.0534, city:'' }, `${label}: native coordinates normalize`);
  assert.deepEqual(grantedCalls, { check:1, request:0, position:1 }, `${label}: granted permission does not prompt again`);
  assert.equal(browserCalls, 0, `${label}: native path never invokes browser geolocation`);

  const promptedCalls = { request:0, position:0 };
  const prompted = {
    isNative:true,
    geolocation:{
      async checkPermissions() { return { location:'prompt', coarseLocation:'prompt' }; },
      async requestPermissions(options) {
        promptedCalls.request++;
        assert.equal(JSON.stringify(options), JSON.stringify({ permissions:['coarseLocation'] }));
        return { location:'granted', coarseLocation:'granted' };
      },
      async getCurrentPosition() {
        promptedCalls.position++;
        return { coords:{ latitude:10, longitude:20 } };
      },
    },
  };
  assert.deepEqual(plain(await getCurrentCoordinates(prompted, browserGeo)), { lat:10, lon:20, city:'' }, `${label}: prompt grant continues to position`);
  assert.deepEqual(promptedCalls, { request:1, position:1 });
  assert.equal(browserCalls, 0);

  let deniedPositionCalls = 0;
  const denied = {
    isNative:true,
    geolocation:{
      async checkPermissions() { return { location:'denied', coarseLocation:'denied' }; },
      async requestPermissions() { return { location:'denied', coarseLocation:'denied' }; },
      async getCurrentPosition() { deniedPositionCalls++; throw new Error('must not run'); },
    },
  };
  assert.equal(await getCurrentCoordinates(denied, browserGeo), null, `${label}: denial stays location-neutral`);
  assert.equal(deniedPositionCalls, 0);
  assert.equal(browserCalls, 0, `${label}: denial does not fall back to localhost browser permission`);

  const brokenNative = {
    isNative:true,
    geolocation:{
      async checkPermissions() { throw new Error('services unavailable'); },
      async requestPermissions() { throw new Error('must not run'); },
      async getCurrentPosition() { throw new Error('must not run'); },
    },
  };
  assert.equal(await getCurrentCoordinates(brokenNative, browserGeo), null, `${label}: native errors fail closed`);
  assert.equal(browserCalls, 0, `${label}: native errors do not fall back to web geolocation`);

  assert.deepEqual(plain(await getCurrentCoordinates(null, browserGeo)), { lat:26.7153, lon:-80.0534, city:'' }, `${label}: browser/PWA retains navigator fallback`);
  assert.equal(browserCalls, 1);

  const invalidBrowserGeo = { getCurrentPosition(success) { success({ coords:{ latitude:999, longitude:20 } }); } };
  assert.equal(await getCurrentCoordinates(null, invalidBrowserGeo), null, `${label}: malformed coordinates fail closed`);

  assert.match(html, /function getLocation\(\)[\s\S]*getCurrentCoordinates\(\)[\s\S]*reverse-geocode-client/,
    `${label}: location cache/reverse-geocode pipeline consumes the shared coordinate resolver`);
  assert.doesNotMatch(html, /function getLocation\(\)[\s\S]*navigator\.geolocation\.getCurrentPosition/,
    `${label}: getLocation no longer directly triggers WebKit browser permission`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(packageJson.dependencies['@capacitor/geolocation'], '8.2.2');
const bridge = fs.readFileSync(path.join(root, 'native', 'native-bridge.js'), 'utf8');
assert.match(bridge, /import \{ Geolocation \} from '@capacitor\/geolocation'/);
assert.match(bridge, /geolocation:\s*isNative\s*\?\s*\{/);
assert.match(bridge, /checkPermissions:[\s\S]*requestPermissions:[\s\S]*getCurrentPosition:/);
const plist = fs.readFileSync(path.join(root, 'ios', 'App', 'App', 'Info.plist'), 'utf8');
assert.match(plist, /<key>NSLocationWhenInUseUsageDescription<\/key>/);
assert.match(plist, /<key>NSLocationAlwaysAndWhenInUseUsageDescription<\/key>/);
assert.ok(fs.existsSync(path.join(root, 'ios', 'App', 'App.xcodeproj', 'project.xcworkspace', 'xcshareddata', 'swiftpm', 'Package.resolved')),
  'Xcode Swift package resolution is tracked');

console.log('native geolocation regression tests passed for mobile and desktop');
