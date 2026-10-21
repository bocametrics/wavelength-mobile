import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
function extract(source,name){
 const start=source.indexOf(`function ${name}(`);assert.notEqual(start,-1,`${name} missing`);let depth=0,quote=null,escaped=false;
 for(let i=source.indexOf('{',start);i<source.length;i++){const c=source[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=null;continue;}if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);}throw new Error(`${name} unterminated`);
}
for(const [label,file] of [['mobile','../index.html'],['desktop','fixtures/friday_app_2026-07-12.html']]){
 const html=fs.readFileSync(path.resolve(here,file),'utf8');
 assert.match(html,/const BACKUP_VERSION\s*=\s*11\s*;/,`${label}: backup v11 retains the isolated custom recommendation settings introduced in v10`);
 const exporter=extract(html,'createBackupPayload'),importer=extract(html,'importBackupFile');
 assert.match(exporter,/assertCustomNextWaveStorageIntegrity\(/,`${label}: export cannot silently replace corrupt retained settings with read fallback`);
 assert.match(exporter,/customNextWave\s*:/,`${label}: v10 has the explicit separate transfer document`);
 assert.match(importer,/payload\.version >= 9 && !payload\.habitCatalog/,`${label}: v9 and v10 require catalogs`);
 assert.match(importer,/const importedHabitCatalog = payload\.version >= 9/,`${label}: v9 customs are not remigrated after the version bump`);
 assert.match(importer,/if \(payload\.version >= 9\)/,`${label}: v9 and v10 retain exact complete order validation`);
 assert.match(importer,/payload\.version >= 9 \? importedCompleteHabits : DEFAULT_HABITS/,`${label}: legacy order migration is confined to versions1–8`);
 const validation=importer.indexOf('normalizeCustomNextWaveState(payload.customNextWave');
 const commit=importer.indexOf('commitStorageSnapshot(localStorage, importedSnapshot)');
 assert.ok(validation>=0&&commit>validation,`${label}: strict incoming configuration validation precedes every import write`);
 assert.match(importer,/createDefaultCustomNextWaveState\(/,`${label}: older imports explicitly reset consent to empty/manual`);
 const snapshot=importer.slice(importer.indexOf('const importedSnapshot = {'),commit);
 const constants=['STORAGE_KEY','ORDER_KEY','FIRST_NAME_STORAGE_KEY','INSIGHT_STORAGE_KEY','CATEGORY_STATE_KEY','CUSTOM_HABITS_KEY','HABIT_CATALOG_KEY','CUSTOM_NEXT_WAVE_KEY'];
 for(const name of constants)assert.match(snapshot,new RegExp(`\\[${name}\\]\\s*:`),`${label}: atomic import includes ${name}`);
 assert.equal((snapshot.match(/^\s*\[[A-Z_]+\]\s*:/gm)||[]).length,8,`${label}: import has exactly eight authoritative documents`);
 const key=name=>{const found=html.match(new RegExp(`const ${name}\\s*=\\s*'([^']+)'`));assert.ok(found);return found[1];};
 const sandbox={JSON};vm.createContext(sandbox);vm.runInContext(`const IMPORT_JOURNAL_KEY=${JSON.stringify(key('IMPORT_JOURNAL_KEY'))};\n${extract(html,'commitStorageSnapshot')}\nglobalThis.commit=commitStorageSnapshot`,sandbox);
 for(const missing of [false,true]){
  const initial=Object.fromEntries(constants.filter((_,i)=>!missing||i%2===0).map(name=>[key(name),`raw previous\r\n${name}`]));
  const replacement=Object.fromEntries(constants.map((name,i)=>[key(name),i%3===0?null:`replacement ${name}`]));
  for(let failAt=1;failAt<=10;failAt++){
   const values=new Map(Object.entries(initial));let mutations=0,triggered=false;
   const mutate=fn=>{if(++mutations===failAt){triggered=true;throw new Error('one-shot quota');}fn();};
   const storage={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>mutate(()=>values.set(k,String(v))),removeItem:k=>mutate(()=>values.delete(k))};
   assert.throws(()=>sandbox.commit(storage,replacement),/one-shot quota/);assert.ok(triggered);
   assert.deepEqual(Object.fromEntries(values),initial,`${label}: boundary${failAt} restores all eight raw values/absence, missing=${missing}`);
  }
 }
 console.log(`${label}: v10 separate settings, v9 compatibility and eight-document rollback contracts passed`);
}
