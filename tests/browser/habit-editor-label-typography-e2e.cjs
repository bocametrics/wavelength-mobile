'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),puppeteer=require('puppeteer-core');
const theme=process.env.WAVELENGTH_THEME||'light',origin=process.env.WAVELENGTH_ORIGIN||'http://127.0.0.1:8791',out=process.env.WAVELENGTH_SHOT_DIR;
assert.ok(out,'Explicit evidence directory required');fs.mkdirSync(out,{recursive:true});
const evidence={theme,cases:[],samples:[],errors:[],screenshots:[]};let browser,page,profile;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function run(name,fn){try{await fn();evidence.cases.push({name,passed:true});}catch(e){evidence.cases.push({name,passed:false,error:e.message});}}
async function inspect(name){
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForFunction(()=>[...document.querySelectorAll('.management-view:not([hidden])')].every(n=>getComputedStyle(n).opacity==='1'&&n.getAnimations().every(a=>a.playState==='finished')));
 const sample=await page.evaluate(()=>{
  const row=document.querySelector('#habitEditorBody .edit-habit');
  const selectors=['.eh-emoji-field > span:first-child','.eh-label-row > span:first-child','.eh-name-field > span:first-child:not(.eh-label-row)','.eh-category-field > span:first-child','.eh-measurement-label > span:first-child','.eh-measure-field > span:first-child','.eh-schedule-label > span:first-child','.eh-param-field > span:first-child','.eh-form-field > span:first-child','.eh-preference-field > span:first-child','.eh-next-wave-toggle > span:first-child','.eh-rhythm-label > span:first-child','.eh-rhythm-field > span:first-child'];
  const visible=n=>n.getClientRects().length&&!n.closest('[hidden]');
  const style=n=>{const c=getComputedStyle(n);return {size:c.fontSize,weight:c.fontWeight,color:c.color,lineHeight:c.lineHeight,transform:c.textTransform,spacing:c.letterSpacing};};
  const labels=[...new Set(selectors.flatMap(s=>[...row.querySelectorAll(s)]))].filter(visible).map(n=>({text:n.textContent.trim(),...style(n)}));
  const values=[...row.querySelectorAll('input,select,textarea')].filter(n=>visible(n)&&!['checkbox','hidden'].includes(n.type)&&!n.classList.contains('eh-icon')).map(n=>({field:n.className,...style(n)}));
  const helpers=[...row.querySelectorAll('.eh-helper,.eh-note-count,#habitNameCount')].filter(visible).map(n=>({text:n.textContent.trim(),...style(n)}));
  const heading=style(document.getElementById('habitEditorHeading'));
  return {labels,values,helpers,heading,noOverflow:document.documentElement.scrollWidth<=innerWidth};
 });evidence.samples.push({name,...sample});
 assert.ok(sample.labels.length>=10,'Nonempty peer-label inventory');
 const mismatch=sample.labels.filter(s=>s.size!=='14px'||s.weight!=='500'||s.color!==sample.labels[0].color||s.lineHeight!=='18.9px'||s.transform!=='none'||s.spacing!=='normal'&&s.spacing!=='0px');
 assert.deepEqual(mismatch,[],'All visible peer labels use one 14px medium style');
 assert.ok(sample.values.length>0);assert.deepEqual(sample.values.filter(s=>s.weight!=='400'),[],'Field values retain regular weight');
 assert.ok(Number.parseFloat(sample.heading.size)>14,'Page title remains visually distinct');
 assert.ok(sample.helpers.every(s=>Number.parseFloat(s.size)<14),'Helpers and counters remain secondary');
 assert.equal(sample.noOverflow,true);
}
async function shot(name){await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>[...document.querySelectorAll('.management-view:not([hidden])')].every(n=>getComputedStyle(n).opacity==='1'&&n.getAnimations().every(a=>a.playState==='finished')));const file=path.join(out,`${theme}-${name}.png`);await page.screenshot({path:file,fullPage:true});evidence.screenshots.push({file,sha256:sha(fs.readFileSync(file))});}
(async()=>{try{
 profile=fs.mkdtempSync(path.join(process.env.TEMP||'/home/ai_agent/.hermes/cache/scratch','wl-type-'));
 browser=await puppeteer.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true,userDataDir:profile,defaultViewport:{width:390,height:844},args:['--no-sandbox','--disable-gpu','--no-first-run']});
 page=await browser.newPage();page.on('pageerror',e=>evidence.errors.push(String(e)));const response=await page.goto(origin+'/?label-typography='+theme,{waitUntil:'networkidle0'});evidence.sourceHash=sha(await response.buffer());
 await page.evaluate(theme=>{localStorage.clear();localStorage.setItem('wavelength_theme',theme);},theme);await page.reload({waitUntil:'networkidle0'});
 await run('Actual requested theme',async()=>assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme));
 const ids=await page.evaluate(()=>HABITS.filter(h=>SYSTEM_HABIT_IDS.has(h.id)).map(h=>h.id));
 for(const id of ids)await run(id+' system peer labels',async()=>{await page.evaluate(id=>{habitEditorDirty=false;openHabitEditorPage(id);},id);await inspect(id);});
 await page.evaluate(()=>{habitEditorDirty=false;openNewHabitEditorPage('movement','home');});
 await page.evaluate(()=>{for(const [selector,value]of [['.eh-text','HIIT Rowing'],['.eh-note','Short intervals'],['.eh-measurement','amount'],['.eh-target','10'],['.eh-unit','intervals'],['.eh-step','1'],['.eh-custom-preferred-time','specific'],['.eh-custom-specific-time','12:34'],['.eh-rhythm','temp-above'],['.eh-rhythm-threshold','90'],['.eh-rhythm-note','Hello']]){const n=document.querySelector(selector);n.value=value;n.dispatchEvent(new Event(n.tagName==='SELECT'?'change':'input',{bubbles:true}));}});
 await run('New custom Amount, cue and Specific time labels',async()=>inspect('new-custom-amount-cue'));
 await shot('new-custom');
 await page.evaluate(()=>{habitEditorDirty=false;openHabitEditorPage('hydrate');});await run('Notice heading stays distinct',async()=>assert.ok(await page.evaluate(()=>Number(getComputedStyle(document.querySelector('.eh-system-notice strong')).fontWeight)>500)));await shot('system-hydrate');
 for(const width of [320,390])await run(width+'px labels retain hierarchy',async()=>{await page.setViewport({width,height:844});await inspect(width+'px-hydrate');});
 await run('No runtime errors',async()=>assert.deepEqual(evidence.errors,[]));
}catch(e){evidence.fatal=e.stack;}finally{if(browser)await browser.close();if(profile)fs.rmSync(profile,{recursive:true,force:true});evidence.profileRemoved=!!profile&&!fs.existsSync(profile);evidence.passed=!evidence.fatal&&evidence.cases.length>0&&evidence.cases.every(c=>c.passed)&&evidence.profileRemoved;fs.writeFileSync(path.join(out,`${theme}-typography-evidence.json`),JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:evidence.passed,cases:evidence.cases.length,failures:evidence.cases.filter(c=>!c.passed),fatal:evidence.fatal}));if(!evidence.passed)process.exitCode=1;}})();
