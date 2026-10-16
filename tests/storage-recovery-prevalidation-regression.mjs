import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
function extractFunction(source, name) {
  const start=source.indexOf(`function ${name}(`); assert.notEqual(start,-1,`${name} is missing`);
  let depth=0,quote=null,escaped=false;
  for(let i=source.indexOf('{',start);i<source.length;i++){
    const c=source[i];
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=null;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`${name} does not terminate`);
}
for(const [label,file] of [['mobile','../index.html'],['desktop','fixtures/friday_app_2026-07-12.html']]){
  const html=fs.readFileSync(path.resolve(here,file),'utf8');
  const journalKey=html.match(/const IMPORT_JOURNAL_KEY\s*=\s*'([^']+)'/)?.[1];assert.ok(journalKey);
  const sandbox={JSON};vm.createContext(sandbox);
  vm.runInContext(`const IMPORT_JOURNAL_KEY=${JSON.stringify(journalKey)};\n${extractFunction(html,'recoverStorageSnapshot')}\nglobalThis.recover=recoverStorageSnapshot`,sandbox);
  function storageFor(journal){
    const values=new Map([['first','new-first'],['last','new-last'],[journalKey,JSON.stringify(journal)]]),calls=[];
    return {values,calls,getItem:k=>values.has(k)?values.get(k):null,setItem(k,v){calls.push(['set',k,v]);values.set(k,v);},removeItem(k){calls.push(['remove',k]);values.delete(k);}};
  }
  for(const malformed of [['last',123],['last'],null,['last',{}]]){
    const storage=storageFor({previous:[['first','old-first'],malformed]});const before=[...storage.values];
    assert.throws(()=>sandbox.recover(storage));
    assert.deepEqual([...storage.values],before,`${label}: malformed later journal entry must fail before any restoration`);
    assert.deepEqual(storage.calls,[],`${label}: complete journal prevalidation performs zero writes on malformed entries`);
  }
  for(const count of [2,4,7,8]){
    const entries=Array.from({length:count},(_,i)=>[`key-${i}`,i%2?'legacy  raw\r\nbytes':null]);
    const storage=storageFor({previous:entries});assert.equal(sandbox.recover(storage),true);
    for(const [key,value] of entries)assert.equal(storage.getItem(key),value,`${label}: ${count}-key recovery preserves raw bytes/absence`);
    assert.equal(storage.getItem(journalKey),null);
  }
  console.log(`${label}: journal prevalidation and subset/legacy/eight-document recovery passed`);
}
