import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const builds=[['mobile',path.resolve(here,'../index.html')],['shared fixture',path.resolve(here,'fixtures/friday_app_2026-07-12.html')]];
function fn(s,n){const start=s.indexOf(`function ${n}(`);assert.notEqual(start,-1,`${n} is missing`);const b=s.indexOf('{',start);let depth=0,q=null,esc=false;for(let i=b;i<s.length;i++){const c=s[i];if(q){if(esc)esc=false;else if(c==='\\')esc=true;else if(c===q)q=null;continue;}if(c==='\''||c==='"'||c==='`'){q=c;continue;}if(c==='{')depth++;else if(c==='}'&&!--depth)return s.slice(start,i+1);}throw Error(`Unterminated ${n}`);}
function constant(s,n){const m=s.match(new RegExp(`const ${n}\\s*=\\s*[^;]+;`));assert.ok(m,`${n} is missing`);return m[0];}
function lastRule(s,selector){const matches=[...s.matchAll(new RegExp(selector+'\\s*\\{([^}]+)\\}','g'))];assert.ok(matches.length,`${selector} CSS is missing`);return matches.at(-1)[1];}
for(const [label,file] of builds){
 const html=fs.readFileSync(file,'utf8');
 // This is an actual field-error contract, not a whole-page string assertion.
 const validator=fn(html,'getHabitEditorValidationErrors');
 const deps=['normalizeCategoryEmoji','normalizeHabitIcon','normalizeMeasurementConfig','isConciseRhythmNote','normalizeRhythmConfig'];
 const context={};vm.createContext(context);vm.runInContext([constant(html,'HABIT_NAME_MAX'),constant(html,'HABIT_CARD_NOTE_MAX'),constant(html,'RHYTHM_TYPES'),...deps.map(n=>fn(html,n)),validator,'globalThis.validate=getHabitEditorValidationErrors;'].join('\n'),context);
 const check=(draft,existing=null)=>JSON.parse(JSON.stringify(context.validate(draft,existing)));
 const base={cat:'movement',icon:'⭐',text:'HIIT Rowing',note:'Short intervals',days:[4,5],measurement:'amount',target:10,step:1,unit:'Internals'};
 assert.deepEqual(check(base),{},`${label}: valid Amount draft passes without autocorrecting the unit`);
 assert.ok(check({...base,text:'\u200d'}).text,`${label}: standalone joiner cannot author an invisible required name`);
 assert.ok(check({...base,text:'\ufe0f'}).text,`${label}: standalone variation selector cannot author an invisible required name`);
 assert.deepEqual(check({...base,text:'Family 👩‍👩‍👧‍👦'}),{},`${label}: visible joined emoji remain valid in a name`);
 assert.ok(check({...base,unit:'\u200b'}).unit,`${label}: invisible Amount units are rejected on the actual unit field`);
 assert.ok(check({...base,unit:'\u202eoz'}).unit,`${label}: bidi override cannot hide or reorder an Amount unit`);
 assert.ok(check({...base,rhythm:{type:'sunrise',note:'\u200b'}}).rhythmNote,`${label}: invisible cue message is rejected on its own field`);
 assert.ok(check({...base,rhythm:{type:'sunrise',note:false}}).rhythmNote,`${label}: explicit non-string cue message gets the same helper/model error`);
 assert.ok(check({...base,text:'ab  ab  ab  ab  ab  ab  ab  ab  ab'}).text,`${label}: title counter and changed-field budget use the same raw authoring value`);
 assert.ok(check({...base,note:'ab  ab  ab  ab  ab  ab  ab  ab  ab'}).note,`${label}: counter and system-save budget cannot disagree for repeated whitespace`);
 const stepErrors=check({...base,target:1,step:10});assert.ok(stepErrors.step,`${label}: increment-over-goal is attached to increment`);assert.equal(stepErrors.text,undefined,`${label}: another field's failure cannot mark a valid name invalid`);
 assert.ok(check({...base,target:''}).target,`${label}: a blank goal has a field error`);
 assert.ok(check({...base,unit:''}).unit,`${label}: a blank Amount unit has a field error`);
 assert.ok(check({...base,rhythm:{type:'temp-above',threshold:0,note:'Fewer intervals'}}).threshold,`${label}: selected cue needs a threshold`);
 assert.deepEqual(check({...base,rhythm:{type:'temp-above',threshold:90,note:'Fewer intervals'}}),{},`${label}: supplying threshold permits the valid draft`);
 assert.ok(check({...base,text:'x'.repeat(31)}).text,`${label}: new title budget is 30`);
 assert.ok(check({...base,note:'x'.repeat(33)}).note,`${label}: new description budget is 32`);
 assert.deepEqual(check({...base,text:'x'.repeat(30),note:'y'.repeat(32)}),{},`${label}: exact new budgets accepted`);
 const legacy={...base,id:'habit_11111111-1111-4111-8111-111111111111',activeFrom:'2026-10-05',text:'x'.repeat(48),note:'y'.repeat(42)};
 assert.deepEqual(check({...legacy,days:[4]},legacy),{},`${label}: unrelated edits preserve both legacy fields`);
 assert.deepEqual(check({...legacy,text:'A shorter name'},legacy),{},`${label}: editing title does not force shortening an unchanged description`);
 assert.deepEqual(check({...legacy,note:'A shorter description'},legacy),{},`${label}: editing description preserves an unchanged legacy title`);
 assert.ok(check({...legacy,text:'z'.repeat(31)},legacy).text,`${label}: changed legacy title must meet new budget`);
 assert.ok(check({...legacy,note:'z'.repeat(33)},legacy).note,`${label}: changed legacy description must meet new budget`);
 const editor=html.match(/<section[^>]*id="habitEditorView"[\s\S]*?<\/section>/)?.[0];assert.ok(editor);
 const header=editor.match(/<div class="management-header">[\s\S]*?<\/div>/)?.[0];
 assert.match(header,/id="habitEditorBack"[^>]*aria-label="Back"[^>]*><svg/ ,`${label}: established accessible chevron`);
 assert.doesNotMatch(header,/id="habitEditorSave"|‹ Habits/,`${label}: no header save or labeled back`);
 assert.ok(editor.indexOf('id="habitEditorSave"')>editor.indexOf('id="habitEditorBody"'),`${label}: primary action follows form body`);
 assert.ok(editor.indexOf('id="habitEditorSave"')<editor.indexOf('id="habitEditorArchive"'),`${label}: primary save is separated from Archive`);
 const render=fn(html,'renderHabitEditorForm');
 assert.match(render,/Habit cue/);assert.doesNotMatch(render,/System anchor ·|<span>Rhythm anchor<\/span>|Optional: one concise action/);
 assert.match(render,/Cue message \(optional\)/);assert.match(render,/Shown on the habit card when cue conditions are met\./);
 assert.match(render,/habitEmojiInput|habitEmojiButton/,`${label}: emoji is selectable`);
 assert.match(render,/habitNameCount|eh-name-count/,`${label}: title has a live counter`);
 assert.match(render,/habitNoteCount|eh-note-count/,`${label}: description has a live counter`);
 assert.match(render,/e\.g\. 16/);assert.match(render,/e\.g\. ounces/);assert.match(render,/e\.g\. 2/);assert.match(render,/Add per tap/);
 assert.match(fn(html,'updateHabitEditorValidity'),/getHabitEditorValidationErrors/);
 assert.match(fn(html,'normalizeNewCustomHabitDraft'),/getHabitEditorValidationErrors/);
 assert.match(fn(html,'normalizeExistingCustomHabitDraft'),/getHabitEditorValidationErrors/);
 const titleRule=lastRule(html,'\\.manage-habit-row-name');assert.match(titleRule,/white-space:\s*normal/);assert.match(titleRule,/overflow-wrap:\s*(?:anywhere|break-word)/);
 const metaRule=lastRule(html,'\\.manage-habit-row-meta');assert.match(metaRule,/-webkit-line-clamp:\s*2/);
 const cueRule=lastRule(html,'\\.eh-rhythm-label');assert.match(cueRule,/flex-direction:\s*column/);
 const saved=fn(html,'normalizeCustomHabitDefinition');assert.match(saved,/text\.length > 48/);assert.match(saved,/note\.length > 42/,`${label}: stored legacy validation is not destructively reduced`);
 console.log(`${label}: editor polish field/model/source contracts passed`);
}
