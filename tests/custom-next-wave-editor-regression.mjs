import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Parent UI/writer tracer. Runtime reader acceptance is a separate earlier gate.
const here=path.dirname(fileURLToPath(import.meta.url));
const builds=[['mobile','../index.html'],['desktop','fixtures/friday_app_2026-07-12.html']];
function extractFunction(source,name){
 const start=source.indexOf(`function ${name}(`);assert.notEqual(start,-1,`${name} is missing`);
 // Compile, never execute: comments, regexes and templates must not fool extraction.
 for(let end=start;(end=source.indexOf('}',end+1))!==-1;){
  const candidate=source.slice(start,end+1);
  for(const prefix of ['', 'async '])try{new Function(`return (${prefix}${candidate});`);return candidate;}catch(error){if(!(error instanceof SyntaxError))throw error;}
 }
 throw new Error(`${name} does not terminate`);
}
for(const [label,relative] of builds){
 const source=fs.readFileSync(path.resolve(here,relative),'utf8');
 const render=extractFunction(source,'renderHabitEditorForm');
 assert.match(render,/eh-custom-preferred-time/,`${label}: explicit consent editor includes independent custom Preferred time authoring`);
 assert.match(render,/eh-next-wave-enabled/,`${label}: actual custom renderer needs explicit Include in Next Wave switch`);
 assert.match(render,/Include in Next Wave/,`${label}: consent uses approved explicit benefit label`);
 assert.match(render,/eh-setting/,`${label}: actual custom renderer needs separate Setting select`);
 const getter=extractFunction(source,'getCustomNextWaveDraftFromEditor');
 assert.match(getter,/eh-next-wave-enabled[\s\S]*checked|checked[\s\S]*eh-next-wave-enabled/,`${label}: consent reads actual boolean checked state, not string value`);
 assert.match(getter,/eh-setting/,`${label}: authoring reads setting separately`);
 for(const [name,keys] of [
  ['saveNewCustomHabit',['HABIT_CATALOG_KEY','CATEGORY_STATE_KEY','ORDER_KEY','CUSTOM_NEXT_WAVE_KEY','STORAGE_KEY','INSIGHT_STORAGE_KEY']],
  ['saveExistingCustomHabit',['HABIT_CATALOG_KEY','CATEGORY_STATE_KEY','CUSTOM_NEXT_WAVE_KEY','STORAGE_KEY','INSIGHT_STORAGE_KEY']],
 ]){
  const body=extractFunction(source,name),commit=body.indexOf('commitStorageSnapshot(');assert.ok(commit>=0);
  const snapshot=body.slice(commit,body.indexOf('\n  });',commit)+6);
  for(const key of keys)assert.match(snapshot,new RegExp(`\\[${key}\\]\\s*:`),`${label}: ${name} atomically includes ${key}`);
  assert.equal((snapshot.match(/^\s*\[[A-Z_]+\]\s*:/gm)||[]).length,keys.length,`${label}: ${name} exact authoritative document scope`);
  assert.match(body.slice(0,commit),/buildCompleteHabitCatalog\([\s\S]*nextHabitCatalog,\s*nextCustomNextWaveState/,`${label}: ${name} derives projected flags before commit`);
  assert.match(body.slice(0,commit),/calculateCurrentStreak[\s\S]*recordInsightSuggestion[\s\S]*normalizeInsightHistoryAgainstState/,`${label}: ${name} stages derivations/evidence before commit`);
  assert.match(body.slice(commit),/renderingCommittedHabitEditorSnapshot = true[\s\S]*try[\s\S]*renderHabits[\s\S]*finally/,`${label}: ${name} committed render cannot split the transaction`);
 }
 console.log(`${label}: custom consent/setting authoring source contracts passed`);
}
