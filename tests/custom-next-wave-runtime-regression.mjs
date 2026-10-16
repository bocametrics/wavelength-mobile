import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Parent tracer: pure custom catalog context from explicit isolated consent.
// This does not accept editor transactions, selection/cue behavior or native release.
const here = path.dirname(fileURLToPath(import.meta.url));
const builds = [['mobile', '../index.html'], ['desktop', 'fixtures/friday_app_2026-07-12.html']];
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const signature = source.slice(start).match(/^function\s+\w+\([\s\S]*?\)\s*\{/);
  assert.ok(signature, `${name} body is missing`);
  const brace = start + signature[0].length - 1;
  let depth = 0, quote = null, escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} does not terminate`);
}
const plain = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const id = 'habit_cafecafe-1234-4234-8234-cafecafecafe';
const definition = {
  id, cat:'movement', icon:'⭐', text:'Sun protection or medication', note:'Legacy note',
  activeFrom:'2026-10-11', days:[0,1,2,3,4,5,6], measurement:'check',
  rhythm:{type:'sunset',note:'Go\r\nnow'},
};
const documentFor = (enabled, setting = 'either') => ({schemaVersion:1,settings:[{habitId:id,enabled,setting}]});
for (const [label, relative] of builds) {
  const source = fs.readFileSync(path.resolve(here, relative), 'utf8');
  const required = ['createDefaultCustomNextWaveState','normalizeCustomNextWaveState',
    'normalizePreferenceWindow','buildRuntimeHabits','buildCompleteHabitCatalog',
    'isValidDateKey','isHabitActiveOnDate','getHabitsActiveOnDate'];
  const optional = ['deriveCustomRecommendationContext'].filter(name => source.includes(`function ${name}(`));
  const sandbox = {};
  vm.createContext(sandbox);
  // Empty shipped roster isolates custom derivation; execute the real runtime builder.
  // No claims about parameterized shipped behavior are made by this fixture.
  vm.runInContext('const MAX_CUSTOM_HABITS=100; const SYSTEM_HABIT_PARAMETER_DEFS={}; const SYSTEM_HABIT_IDS=new Set();\n' +
    [...required,...optional].map(name => extractFunction(source,name)).join('\n') +
    '\nglobalThis.api={buildCompleteHabitCatalog,getHabitsActiveOnDate};', sandbox);
  const catalogFor = habit => freeze({schemaVersion:1,customDefinitions:[habit],status:[]});
  const build = (habit, config) => {
    const catalog = catalogFor(habit), before = JSON.stringify(catalog), configBefore = JSON.stringify(config);
    const runtime = sandbox.api.buildCompleteHabitCatalog([], {}, catalog, freeze(config));
    assert.equal(JSON.stringify(catalog), before, `${label}: catalog authoring must stay unchanged`);
    assert.equal(JSON.stringify(config), configBefore, `${label}: configuration must stay unchanged`);
    assert.equal(runtime[0].id, habit.id);
    assert.equal(runtime[0].text, habit.text);
    assert.equal(runtime[0].rhythm?.note, habit.rhythm?.note);
    assert.equal(runtime[0].targetLabel, '');
    assert.equal(runtime[0].weight, 1);
    return {runtime,catalog};
  };
  for (const config of [undefined, null, {schemaVersion:1,settings:[]}, documentFor(false,'outdoor'),
    documentFor('true'), {schemaVersion:1,settings:[...documentFor(true).settings,...documentFor(false).settings]}]) {
    assert.deepEqual(plain(build({...definition},config).runtime[0].context), {recommend:false},
      `${label}: absent, disabled or invalid whole configuration remains exactly manual`);
  }
  for (const setting of ['indoor','outdoor','either']) {
    const expected = {recommend:true,setting,start:0,end:1440};
    assert.deepEqual(plain(build({...definition},documentFor(true,setting)).runtime[0].context), expected,
      `${label}: explicit ${setting} consent derives only neutral generic context, not title/category/cue purpose`);
    for (const rhythm of [undefined,{type:'uv-above',threshold:3,note:'Authored'}, {type:'aqi-below',threshold:40}]) {
      assert.deepEqual(plain(build({...definition,rhythm},documentFor(true,setting)).runtime[0].context), expected,
        `${label}: cue type must not create daylight, duration, adaptive variants or medical purpose`);
    }
  }
  for (const [window,expected] of [
    [{idealStart:360,idealEnd:720},{start:300,end:780,idealStart:360,idealEnd:720,lateStart:720}],
    [{idealStart:1080,idealEnd:1440},{start:1020,end:1440,idealStart:1080,idealEnd:1440}],
    [{idealStart:0,idealEnd:15},{start:0,end:75,idealStart:0,idealEnd:15,lateStart:15}],
    [{idealStart:620},{start:0,end:1440}],
    [{idealEnd:780},{start:0,end:1440}],
  ]) {
    const habit = {...definition,preferenceWindow:window};
    const {runtime} = build(habit,documentFor(true,'either'));
    assert.deepEqual(plain(runtime[0].context), {recommend:true,setting:'either',...expected},
      `${label}: derive once from complete ideal intervals; partial stored windows stay neutral`);
    assert.deepEqual(plain(runtime[0].preferenceWindow), window, `${label}: unchanged stored windows are not rewritten`);
  }
  const future = build({...definition,activeFrom:'2026-10-13'},documentFor(true));
  assert.deepEqual(plain(sandbox.api.getHabitsActiveOnDate(future.runtime,future.catalog,'2026-10-12')), []);
  const archivedCatalog = freeze({...future.catalog,status:[{habitId:id,initialActive:false,changes:[]}]});
  assert.deepEqual(plain(sandbox.api.getHabitsActiveOnDate(future.runtime,archivedCatalog,'2026-10-14')), [],
    `${label}: consent never bypasses date-effective lifecycle exclusion`);
  console.log(`${label}: pure explicit custom context contracts passed`);
}
