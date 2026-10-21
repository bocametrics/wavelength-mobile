import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

// Parent next-slice tracer: real runtime consent plumbing and generic source/role isolation.
const here=path.dirname(fileURLToPath(import.meta.url));
const builds=[['mobile','../index.html'],['desktop','fixtures/friday_app_2026-07-12.html']];
// Reuse the reviewed extraction harness, not simplified replacement behavior.
const parent=fs.readFileSync(path.join(here,'custom-next-wave-selection-regression.mjs'),'utf8');
const from=parent.indexOf('function extractFunction('),to=parent.indexOf('const id=');
assert.ok(from>=0&&to>from,'reviewed selector extraction harness must be present');
const sandbox={assert,vm};vm.createContext(sandbox);vm.runInContext(parent.slice(from,to)+'\nglobalThis.loadApi=load; globalThis.extract=extractFunction;',sandbox);
const id='habit_cafecafe-1234-4234-8234-cafecafecafe';
const definition={id,cat:'movement',icon:'⭐',text:'Independent authored habit',note:'',activeFrom:'2026-10-11',days:[0,1,2,3,4,5,6],measurement:'check'};
const rows=[];
for(const [label,relative] of builds){
 const source=fs.readFileSync(path.resolve(here,relative),'utf8'),api=sandbox.loadApi(source);
 const run=(name,fn)=>{try{fn();rows.push({build:label,name,passed:true});}catch(e){if(e.name!=='AssertionError')throw e;rows.push({build:label,name,passed:false,error:e.message});}};
 run('startup explicitly loads isolated runtime model before catalog construction',()=>{
  assert.match(source,/let\s+customNextWaveState\s*=\s*loadCustomNextWaveState\(habitCatalogState\)/);
  assert.match(source,/const initialCompleteHabitCatalog = buildCompleteHabitCatalog\(\s*DEFAULT_HABITS,\s*loadCustomHabits\(\) \|\| \{\},\s*habitCatalogState,\s*customNextWaveState,\s*dateKey\(new Date\(\)\)\s*\)/);
 });
 run('reload reads isolated runtime model after catalog and passes it explicitly',()=>{
  const body=sandbox.extract(source,'reloadHabits');
  assert.match(body,/habitCatalogState = loadHabitCatalogState[\s\S]*customNextWaveState = loadCustomNextWaveState\(habitCatalogState\)[\s\S]*buildCompleteHabitCatalog\(\s*DEFAULT_HABITS,\s*overrides \|\| \{\},\s*habitCatalogState,\s*customNextWaveState,\s*dateKey\(now\)\s*\)/);
 });
 run('import stages incoming normalized consent and never publishes its model before commit',()=>{
  const body=sandbox.extract(source,'importBackupFile');
  assert.match(body,/buildCompleteHabitCatalog\(\s*DEFAULT_HABITS,\s*customHabits,\s*importedHabitCatalog,\s*importedCustomNextWave,\s*dateKey\(importDate\)\s*\)/);
  assert.doesNotMatch(body.slice(0,body.indexOf('commitStorageSnapshot(')),/\bcustomNextWaveState\s*=/);
 });
 for(const name of ['saveNewCustomHabit','saveExistingCustomHabit'])run(`${name} rejects stale/corrupt isolated configuration before authoring writes`,()=>{
  const body=sandbox.extract(source,name);
  assert.match(body,/assertCustomNextWaveStorageIntegrity\(\s*customNextWaveState,\s*habitCatalogState,?\s*\)/);
  assert.ok(body.indexOf('assertCustomNextWaveStorageIntegrity(')<body.indexOf('commitStorageSnapshot('));
 });
 const make=rhythm=>api.buildCompleteHabitCatalog([],{},
  {schemaVersion:1,customDefinitions:[{...definition,rhythm}],status:[]},
  {schemaVersion:1,settings:[{habitId:id,enabled:true,setting:'outdoor'}]})[0];
 run('generic consent cannot enable the old system time picker and rewrite clipped legacy windows',()=>{
  const habit=make({type:'sunset',note:'Authored'});
  assert.equal(api.isEligibleForPreferenceWindow(habit),false,'custom timing must wait for explicit preservation-safe controls, not the legacy system picker');
 });
 const now=new Date(2026,9,12,12,0,0,0);
 run('generic advisory AQI cannot attach shipped observed-source expiry',()=>{
  const habit=make({type:'aqi-below',threshold:40,note:'Authored'});
  const result=api.getNextWaveSuggestion([habit],{}, {},now,{aqi:31,aqiObservedAt:now.getTime()});
  assert.equal(result.habitId,id);assert.equal(result.reason,'available-now');
  assert.equal(Object.hasOwn(result,'recommendationSourceFreshUntil'),false,'generic inactive/unproven advisory cue must not expire neutral guidance on shipped source metadata');
 });
 run('unsupported custom cannot enter protection forecast through extra runtime shape',()=>{
  const habit=make({type:'uv-above',threshold:3,note:'Authored'});
  const shaped={...habit,context:{...habit.context,duration:2}},key=apiDateKey(now);
  const data={uv:7,weatherObservedAt:now.getTime(),hourlyForecastFetchedAt:now.getTime(),hourlyForecast:{timezone:'America/New_York',entries:[{time:key+'T12:00',uv:7}]}};
  const result=api.getNextWaveSuggestion([shaped],{}, {},now,data);
  assert.equal(result.habitId,id);assert.equal(result.reason,'available-now','custom identity must not acquire shipped protection purpose from UV/duration');
  assert.equal(Object.hasOwn(result,'forecastEvidence'),false);
 });
}
function apiDateKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
console.log(JSON.stringify({cases:rows,passing:rows.filter(r=>r.passed).length,total:rows.length},null,2));
assert.ok(rows.every(r=>r.passed),'explicit runtime consent and generic weather-role isolation are required');
