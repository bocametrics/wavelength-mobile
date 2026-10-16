import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Parent-owned Stage 2 tracer: isolated configuration validation/read integrity.
// No editor, catalog extension or authoritative write is authorized by this slice.
const here = path.dirname(fileURLToPath(import.meta.url));
const builds = [
  ['mobile', path.resolve(here, '../index.html')],
  ['desktop', path.resolve(here, 'fixtures/friday_app_2026-07-12.html')],
];
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const brace = source.indexOf('{', start);
  let depth = 0, quote = null, escaped = false;
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
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} does not terminate`);
}
const plain = value => JSON.parse(JSON.stringify(value));
const id = 'habit_cafecafe-1234-4234-8234-cafecafecafe';
const secondId = 'habit_deadbeef-1234-4234-8234-deadbeefdead';
const catalog = {
  schemaVersion: 1,
  customDefinitions: [
    { id, cat:'movement', icon:'⭐', text:'Independent habit', note:'', activeFrom:'2026-10-11', days:[0,1,2,3,4,5,6], measurement:'check' },
    { id:secondId, cat:'mind', icon:'⭐', text:'Archived habit', note:'', activeFrom:'2026-10-11', days:[1], measurement:'check' },
  ],
  status:[{ habitId:secondId, initialActive:false, changes:[] }],
};
const empty = { schemaVersion:1, settings:[] };
const state = enabled => ({ schemaVersion:1, settings:[{ habitId:id, enabled, setting:'either' }] });
function makeReadOnlyStorage(raw, readError = false) {
  const calls = [];
  return {
    calls,
    getItem(key) { calls.push(['get',key]); if (readError) throw new Error('storage read denied'); return raw; },
    setItem() { calls.push(['write']); throw new Error('read path must not write'); },
    removeItem() { calls.push(['remove']); throw new Error('read path must not remove'); },
  };
}
for (const [label, file] of builds) {
  const html = fs.readFileSync(file, 'utf8');
  const key = html.match(/const CUSTOM_NEXT_WAVE_KEY\s*=\s*'([^']+)'\s*;/);
  assert.ok(key, `${label}: isolated custom Next Wave key is missing`);
  assert.equal(key[1], 'wavelength_custom_next_wave_v1', `${label}: consent is not embedded in schema-1 catalog data`);
  const functions = ['createDefaultCustomNextWaveState','normalizeCustomNextWaveState','loadCustomNextWaveState','assertCustomNextWaveStorageIntegrity'];
  const sandbox = { JSON };
  vm.createContext(sandbox);
  vm.runInContext(`const CUSTOM_NEXT_WAVE_KEY = ${JSON.stringify(key[1])};\nconst MAX_CUSTOM_HABITS = 100;\n` +
    functions.map(name => extractFunction(html,name)).join('\n') + '\nglobalThis.api = {' + functions.join(',') + '};', sandbox);
  const api = sandbox.api;
  const normalized = (raw, strict=true) => plain(api.normalizeCustomNextWaveState(raw, catalog, strict));
  assert.deepEqual(plain(api.createDefaultCustomNextWaveState()), empty, `${label}: absent consent defaults to no settings`);
  assert.deepEqual(normalized(empty), empty);
  for (const enabled of [true,false]) {
    for (const setting of ['indoor','outdoor','either']) {
      const raw = {schemaVersion:1,settings:[{habitId:id,enabled,setting}]};
      const before = JSON.stringify(raw), catalogBefore = JSON.stringify(catalog);
      assert.deepEqual(normalized(raw), raw, `${label}: explicit ${enabled}/${setting} survives exact normalization`);
      assert.equal(JSON.stringify(raw), before);
      assert.equal(JSON.stringify(catalog), catalogBefore, `${label}: isolated normalization cannot modify legacy catalog`);
    }
  }
  assert.deepEqual(normalized({schemaVersion:1,settings:[{habitId:secondId,enabled:true,setting:'outdoor'}]}).settings,
    [{habitId:secondId,enabled:true,setting:'outdoor'}], `${label}: archived retained custom IDs are valid configuration references`);
  const invalid = [
    null, [], {}, {schemaVersion:2,settings:[]}, {schemaVersion:'1',settings:[]},
    {schemaVersion:1,settings:[],extra:true}, {schemaVersion:1,settings:{}},
    {schemaVersion:1,settings:[null]}, {schemaVersion:1,settings:[[]]},
    {schemaVersion:1,settings:[{habitId:id,setting:'either'}]},
    {schemaVersion:1,settings:[{habitId:id,enabled:true}]},
    {schemaVersion:1,settings:[{habitId:id,enabled:'true',setting:'either'}]},
    {schemaVersion:1,settings:[{habitId:id,enabled:1,setting:'either'}]},
    {schemaVersion:1,settings:[{habitId:id,enabled:true,setting:'OUTDOOR'}]},
    {schemaVersion:1,settings:[{habitId:id,enabled:true,setting:'either',context:{recommend:true}}]},
    {schemaVersion:1,settings:[{habitId:'hydrate',enabled:true,setting:'either'}]},
    {schemaVersion:1,settings:[{habitId:'habit_ffffffff',enabled:true,setting:'either'}]},
    {schemaVersion:1,settings:[...state(true).settings,...state(false).settings]},
    {schemaVersion:1,settings:[...state(true).settings,{habitId:secondId,enabled:'false',setting:'outdoor'}]},
    {schemaVersion:1,settings:Array.from({length:101},()=>state(true).settings[0])},
  ];
  for (const [index, raw] of invalid.entries()) {
    assert.throws(()=>api.normalizeCustomNextWaveState(raw,catalog,true), `${label}: invalid document ${index} fails strict validation`);
    assert.deepEqual(normalized(raw,false), empty, `${label}: invalid document ${index} fails closed completely, not partial consent`);
  }
  for (const [raw,expected,readError] of [
    [null,empty,false], [JSON.stringify(state(true)),state(true),false],
    ['{bad json',empty,false], [JSON.stringify(invalid[18]),empty,false], [null,empty,true],
  ]) {
    const storage = makeReadOnlyStorage(raw,readError);
    assert.deepEqual(plain(api.loadCustomNextWaveState(catalog,storage)),expected, `${label}: load is read-only and fails closed`);
    assert.deepEqual(storage.calls,[['get',key[1]]], `${label}: absent/corrupt/denied reads never persist defaults`);
  }
  assert.equal(api.assertCustomNextWaveStorageIntegrity(empty,catalog,makeReadOnlyStorage(null)),true);
  assert.equal(api.assertCustomNextWaveStorageIntegrity(state(true),catalog,makeReadOnlyStorage(JSON.stringify(state(true)))),true);
  for (const storage of [makeReadOnlyStorage('{bad json'),makeReadOnlyStorage(JSON.stringify(invalid[18])),makeReadOnlyStorage(null,true)]) {
    assert.throws(()=>api.assertCustomNextWaveStorageIntegrity(empty,catalog,storage), `${label}: corrupt or unreadable consent cannot be silently overwritten`);
    assert.ok(storage.calls.every(([operation])=>operation==='get'));
  }
  assert.throws(()=>api.assertCustomNextWaveStorageIntegrity(state(true),catalog,makeReadOnlyStorage(null)), `${label}: missing persisted settings cannot erase a nonempty runtime configuration`);
  assert.throws(()=>api.assertCustomNextWaveStorageIntegrity(state(true),catalog,makeReadOnlyStorage(JSON.stringify(state(false)))), `${label}: stale runtime consent cannot replace changed storage`);
  console.log(`${label}: isolated custom Next Wave storage contracts passed`);
}
