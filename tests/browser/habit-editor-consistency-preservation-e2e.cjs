'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),puppeteer=require('puppeteer-core');
const theme=process.env.WAVELENGTH_THEME||'light',origin=process.env.WAVELENGTH_ORIGIN||'http://127.0.0.1:8791',out=process.env.WAVELENGTH_SHOT_DIR;
assert.ok(out);fs.mkdirSync(out,{recursive:true});
const evidence={theme,cases:[],errors:[],screenshots:[]};let browser,page,profile;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function run(name,fn){try{await fn();evidence.cases.push({name,passed:true});}catch(e){evidence.cases.push({name,passed:false,error:e.stack});}}
async function fresh(){await page.goto(origin+'/?consistency-preservation',{waitUntil:'networkidle0'});await page.evaluate(theme=>{localStorage.clear();localStorage.setItem('wavelength_theme',theme);},theme);await page.reload({waitUntil:'networkidle0'});}
async function settings(){await page.evaluate(()=>setActiveView('settings'));await page.waitForFunction(()=>!document.getElementById('settingsView').hidden);}
async function snapshot(id){return page.evaluate(id=>JSON.stringify(HABITS.find(h=>h.id===id)),id);}
(async()=>{try{
profile=fs.mkdtempSync(path.join(process.env.TEMP||'/home/ai_agent/.hermes/cache/scratch','wl-preserve-'));browser=await puppeteer.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true,userDataDir:profile,defaultViewport:{width:390,height:844},args:['--no-sandbox','--disable-gpu','--no-first-run']});page=await browser.newPage();page.on('pageerror',e=>evidence.errors.push(String(e)));
const response=await page.goto(origin,{waitUntil:'networkidle0'});evidence.sourceHash=hash(await response.buffer());await fresh();
await run('Requested theme actually renders',async()=>assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme));
const ids=await page.evaluate(()=>HABITS.filter(h=>SYSTEM_HABIT_IDS.has(h.id)).map(h=>h.id));
for(const id of ids)await run(id+' managed values and unrelated Save preserve runtime definition',async()=>{
 await page.reload({waitUntil:'networkidle0'});const before=await snapshot(id);await page.evaluate(id=>openHabitEditorPage(id),id);
 const data=await page.evaluate(id=>{const h=HABITS.find(h=>h.id===id),setting=document.querySelector('.eh-setting'),include=document.querySelector('.eh-next-wave-enabled');return {setting:setting.value,expected:h.context?.setting||'',locked:setting.disabled&&include.disabled,include:include.checked,expectedInclude:!!h.context&&h.context.recommend!==false};},id);assert.equal(data.setting,data.expected);assert.equal(data.include,data.expectedInclude);assert.equal(data.locked,true);
 assert.equal(await page.evaluate(()=>{habitEditorDirty=false;for(const n of document.querySelectorAll('#habitEditorBody [readonly],#habitEditorBody :disabled')){n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));}return habitEditorDirty;}),false);
 await page.click('#habitEditorSave');const expected=JSON.parse(before);if(!['wake','sleep'].includes(id))expected.context.authoredDuration=true;const after=JSON.parse(await snapshot(id));assert.deepEqual(after,expected,'Only explicit shared planning provenance may be added; all existing runtime values stay exact');await page.reload({waitUntil:'networkidle0'});assert.deepEqual(JSON.parse(await snapshot(id)),expected);
});
for(const id of ['wake','sleep'])await run(id+' Settings link handles archived habit honestly',async()=>{
 await fresh();await page.evaluate(id=>{habitCatalogState=setHabitActiveOnDate(habitCatalogState,id,false,dateKey(new Date()),ALL_HABITS);localStorage.setItem(HABIT_CATALOG_KEY,JSON.stringify(habitCatalogState));reloadHabits();},id);await settings();
 const state=await page.evaluate(id=>{const n=document.querySelector(`[data-habit-anchor="${id}"]`);return {exists:!!n,disabled:n?.disabled,explanation:!!n&&/archived|restore/i.test(n.parentElement.textContent)};},id);
 assert.equal(state.exists,true);assert.equal(state.disabled,true,'Archived anchor cannot be a silent no-op link');assert.equal(state.explanation,true,'Archived anchor explains restore path');
});
for(const id of ['wake','sleep'])await run(id+' Settings edit shares param and returns to Settings',async()=>{
 await fresh();await settings();await page.click(`[data-habit-anchor="${id}"]`);await page.waitForFunction(()=>!document.getElementById('habitEditorView').hidden);
 await page.evaluate(id=>{const n=document.querySelector('.eh-param-targetTime');n.value=id==='wake'?'07:15':'22:45';n.dispatchEvent(new Event('input',{bubbles:true}));},id);await page.click('#habitEditorSave');await page.waitForFunction(()=>!document.getElementById('settingsView').hidden&&!document.documentElement.dataset.managementOpen);
 assert.equal(await page.evaluate(id=>loadCustomHabits()[id].params.targetTime,id),id==='wake'?'07:15':'22:45');await page.reload({waitUntil:'networkidle0'});assert.equal(await page.evaluate(id=>HABITS.find(h=>h.id===id).params.targetTime,id),id==='wake'?'07:15':'22:45');
});
for(const window of [{idealEnd:720},{idealStart:600,idealEnd:720},{idealStart:1430,idealEnd:1440},null])await run('System saved timing '+JSON.stringify(window)+' survives untouched and changed saves',async()=>{
 await fresh();await page.evaluate(window=>{localStorage.setItem(CUSTOM_HABITS_KEY,JSON.stringify({beach:{preferenceWindow:window}}));reloadHabits();openHabitEditorPage('beach');},window);
 if(window){assert.equal(await page.evaluate(()=>document.querySelector('.eh-custom-specific-time').value),'','Noncanonical windows must not imply an exact clock');assert.equal(await page.evaluate(()=>document.querySelector('.eh-custom-time-help').textContent.includes('Saved window')),true);}
 await page.click('#habitEditorSave');assert.deepEqual(await page.evaluate(()=>loadCustomHabits()?.beach?.preferenceWindow),window);
 await page.reload({waitUntil:'networkidle0'});await page.evaluate(()=>openHabitEditorPage('beach'));assert.deepEqual(await page.evaluate(()=>HABITS.find(h=>h.id==='beach').preferenceWindow),window);
 await page.select('.eh-custom-preferred-time','specific');await page.evaluate(()=>{const n=document.querySelector('.eh-custom-specific-time');n.value='11:22';n.dispatchEvent(new Event('input',{bubbles:true}));});await page.click('#habitEditorSave');assert.deepEqual(await page.evaluate(()=>loadCustomHabits()?.beach?.preferenceWindow),{idealStart:682,idealEnd:683});
});
await run('System Saved window has explicit clear intent distinct from untouched blank',async()=>{
 for(const action of ['anytime','choose-then-clear']){
  await fresh();await page.evaluate(()=>{localStorage.setItem(CUSTOM_HABITS_KEY,JSON.stringify({beach:{preferenceWindow:{idealStart:600,idealEnd:720}}}));reloadHabits();openHabitEditorPage('beach');});
  assert.equal(await page.$eval('.eh-custom-preferred-time',n=>n.value),'saved');
  if(action==='choose-then-clear'){await page.select('.eh-custom-preferred-time','specific');await page.evaluate(()=>{const n=document.querySelector('.eh-custom-specific-time');n.value='11:22';n.dispatchEvent(new Event('input',{bubbles:true}));});}
  await page.select('.eh-custom-preferred-time','any');
  await page.click('#habitEditorSave');assert.equal(await page.evaluate(()=>loadCustomHabits()?.beach?.preferenceWindow),null,action+' clears instead of restoring opaque window');
 }
});
await run('Readonly cue retains raw multiline managed override and explicit null',async()=>{
 for(const rhythm of [{type:'aqi-below',threshold:55,note:'Line one\r\nLine two'},null]){
  await fresh();await page.evaluate(rhythm=>{localStorage.setItem(CUSTOM_HABITS_KEY,JSON.stringify({beach:{rhythm}}));reloadHabits();openHabitEditorPage('beach');},rhythm);
  if(rhythm)assert.equal(await page.evaluate(()=>document.querySelector('.eh-rhythm-note').value),'Line one\nLine two');await page.click('#habitEditorSave');assert.deepEqual(await page.evaluate(()=>loadCustomHabits().beach.rhythm),rhythm);
 }
});
for(const width of [320,390])await run(width+'px shared layout without clipped controls',async()=>{
 await fresh();await page.setViewport({width,height:844});await page.evaluate(()=>openHabitEditorPage('beach'));await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>[...document.querySelectorAll('.management-view:not([hidden])')].every(n=>getComputedStyle(n).opacity==='1'&&n.getAnimations().every(a=>a.playState==='finished')));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const contrast=await page.evaluate(()=>{
  const parse=color=>{const m=color.match(/[\d.]+/g).map(Number),scale=color.startsWith('color(srgb ')?255:1;return [m[0]*scale,m[1]*scale,m[2]*scale,m.length>3?m[3]:1];};
  const blend=(a,b)=>{const alpha=a[3]+b[3]*(1-a[3]);return [0,1,2].map(i=>(a[i]*a[3]+b[i]*b[3]*(1-a[3]))/alpha).concat(alpha);};
  const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
  return [...document.querySelectorAll('#habitEditorBody input,#habitEditorBody textarea,#habitEditorBody select')].filter(n=>n.value&&n.type!=='checkbox'&&!n.classList.contains('eh-icon')&&n.getClientRects().length&&!n.closest('[hidden]')).map(n=>{const ancestors=[];for(let p=n;p;p=p.parentElement)ancestors.unshift(p);let bg=[255,255,255,1],opacity=1;for(const p of ancestors){const s=getComputedStyle(p);bg=blend(parse(s.backgroundColor),bg);opacity*=Number(s.opacity);}const s=getComputedStyle(n),fg=parse(s.webkitTextFillColor||s.color);fg[3]*=opacity;const a=lum(blend(fg,bg)),b=lum(bg);return {field:n.className,ratio:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)};});
 });(evidence.contrast||=[]).push({width,samples:contrast});assert.ok(contrast.length>0);assert.ok(contrast.every(n=>n.ratio>=4.5),JSON.stringify(contrast));
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#habitEditorBody input,#habitEditorBody select,#habitEditorBody textarea')].filter(n=>n.getClientRects().length&&!n.closest('[hidden]')).every(n=>{const r=n.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth+1;})),true);
 const file=path.join(out,`${theme}-${width}-system.png`);await page.screenshot({path:file,fullPage:true});evidence.screenshots.push({file,sha256:hash(fs.readFileSync(file))});
});
await run('No runtime errors',async()=>assert.deepEqual(evidence.errors,[]));
}catch(e){evidence.fatal=e.stack;}finally{if(browser)await browser.close();if(profile)fs.rmSync(profile,{recursive:true,force:true});evidence.profileRemoved=!!profile&&!fs.existsSync(profile);evidence.passed=!evidence.fatal&&evidence.cases.length>0&&evidence.cases.every(c=>c.passed)&&evidence.profileRemoved;fs.writeFileSync(path.join(out,`${theme}-preservation-evidence.json`),JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:evidence.passed,cases:evidence.cases.length,failures:evidence.cases.filter(c=>!c.passed),fatal:evidence.fatal}));if(!evidence.passed)process.exitCode=1;}})();
