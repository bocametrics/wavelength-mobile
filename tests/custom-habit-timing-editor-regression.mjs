import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
function fn(source,name){const start=source.indexOf(`function ${name}(`);assert.notEqual(start,-1,`${name} missing`);const sig=source.slice(start).match(/^function\s+\w+\([\s\S]*?\)\s*\{/);assert.ok(sig);let depth=0,q=null,escape=false;for(let i=start+sig[0].length-1;i<source.length;i++){const c=source[i];if(q){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===q)q=null;continue;}if(c==='"'||c==="'"||c==='`'){q=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);}throw Error(name+' unterminated');}
for(const [label,file] of [['mobile','../index.html'],['desktop','fixtures/friday_app_2026-07-12.html']]){
 const source=fs.readFileSync(path.resolve(here,file),'utf8'),render=fn(source,'renderHabitEditorForm');
 assert.match(render,/eh-custom-preferred-time/,`${label}: actual custom editor needs Preferred time select`);
 assert.match(render,/eh-custom-specific-time/,`${label}: actual custom editor needs separate Specific time input`);
 assert.match(render,/Preferred time/);assert.match(render,/Any time/);assert.match(render,/Specific time/);
 assert.match(render,/getCustomPreferredTimeSelection/,`${label}: saved timing uses the accepted honest descriptor`);
 const getter=fn(source,'getCustomPreferredTimeDraftFromEditor');assert.match(getter,/eh-custom-preferred-time/);assert.match(getter,/eh-custom-specific-time/);assert.match(getter,/customPreferredTimeToPreferenceWindow/,`${label}: custom authoring uses exact new codec`);assert.doesNotMatch(getter,/displayTimeToPreferenceWindow\(/,`${label}: must not reuse old system center mapping`);
 assert.match(fn(source,'getNewCustomHabitDraftFromEditor'),/getCustomPreferredTimeDraftFromEditor/,`${label}: actual draft path includes custom timing intent`);
 assert.match(fn(source,'updateHabitEditorValidity'),/eh-custom-preferred-time|eh-custom-specific-time/,`${label}: actual timing controls participate in accessible validation`);
 assert.match(source,/#habitEditorView[^{}]*\.eh-custom-specific-time[^{}]*\{[^}]*appearance:\s*none/,`${label}: scoped native time field avoids known appearance overflow`);
 console.log(`${label}: custom timing editor source contracts passed`);
}
