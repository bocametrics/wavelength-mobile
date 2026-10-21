'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const puppeteer = require('puppeteer-core');
const theme = process.env.WAVELENGTH_THEME || 'light';
const origin = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8791';
const out = process.env.WAVELENGTH_SHOT_DIR;
assert.ok(out, 'An explicit evidence directory is required');
fs.mkdirSync(out, {recursive:true});
const evidence = {theme, checks:[], errors:[], screenshots:[]};
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
let browser, page, profile;
function check(name, value, expected=true) { const passed = JSON.stringify(value) === JSON.stringify(expected); evidence.checks.push({name,value,expected,passed}); }
async function inspect(name, fn) {check(name, await page.evaluate(fn));}
async function shot(name) {const file=path.join(out,`${theme}-${name}.png`);await page.screenshot({path:file,fullPage:true});evidence.screenshots.push({file,sha256:hash(fs.readFileSync(file))});}
async function edit(id) {await page.evaluate(id=>{habitEditorDirty=false;openHabitEditorPage(id);},id);await page.evaluate(()=>document.fonts.ready);}
(async()=>{try {
 profile=fs.mkdtempSync(path.join(process.env.TEMP || '/home/ai_agent/.hermes/cache/scratch','wl-consistency-'));
 browser=await puppeteer.launch({executablePath:process.env.WAVELENGTH_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true,userDataDir:profile,defaultViewport:{width:390,height:844,deviceScaleFactor:1},args:['--no-sandbox','--disable-gpu','--no-first-run']});
 page=await browser.newPage();page.on('pageerror',e=>evidence.errors.push(String(e)));
 const response=await page.goto(origin+'/?editor-consistency='+theme,{waitUntil:'networkidle0'});evidence.sourceHash=hash(await response.buffer());
 await page.evaluate(theme=>{localStorage.clear();localStorage.setItem('wavelength_theme',theme);},theme);await page.reload({waitUntil:'networkidle0'});
 const ids=await page.evaluate(()=>HABITS.filter(h=>SYSTEM_HABIT_IDS.has(h.id)).map(h=>h.id));evidence.systemIds=ids;
 for (const id of ids) {
  await edit(id);
  check(id+': shared identity',await page.evaluate(()=>!!document.querySelector('.eh-identity-row .eh-text[readonly]')));
  check(id+': notice explains restriction',await page.evaluate(()=>{const n=document.querySelector('.eh-system-notice');return !!n&&n.textContent.includes('Wavelength habit')&&n.textContent.includes('can’t be edited');}));
  check(id+': duration visible',await page.evaluate(()=>{const n=document.querySelector('.eh-duration-field');return !!n&&n.getClientRects().length>0&&!n.closest('[hidden]');}));
  check(id+': actual setting read-only',await page.evaluate(()=>{const n=document.querySelector('.eh-setting');return !!n&&n.disabled&&n.getClientRects().length>0;}));
  check(id+': inclusion read-only',await page.evaluate(()=>{const n=document.querySelector('.eh-next-wave-enabled');return !!n&&n.disabled;}));
  check(id+': cue same layout read-only',await page.evaluate(()=>{const n=document.querySelector('.eh-rhythm');return !!n&&n.disabled&&!n.closest('[hidden]');}));
  check(id+': shared visible field order',await page.evaluate(()=>{const selectors=['.eh-identity-row','.eh-note-field','.eh-category-field','.eh-measurement-block','.eh-schedule','.eh-duration-field','.eh-timing-group','.eh-setting-field','.eh-next-wave-toggle','.eh-rhythm-block'];const nodes=selectors.map(s=>document.querySelector(s));return nodes.every(n=>n&&n.getClientRects().length)&&nodes.every((n,i)=>!i||!!(nodes[i-1].compareDocumentPosition(n)&Node.DOCUMENT_POSITION_FOLLOWING));}));
  check(id+': no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 await edit('beach');
 check('AQI threshold complete',await page.evaluate(()=>{const n=document.querySelector('.eh-rhythm-threshold');return !!n&&(n.readOnly||n.disabled)&&n.value==='100'&&!!n.getClientRects().length;}));
 check('Unset system preferred time is explained',await page.evaluate(()=>{const n=document.querySelector('.eh-custom-time-group');return !!n&&n.textContent.includes('No preferred time.')&&n.querySelector('.eh-custom-preferred-time').value==='any';}));
 await shot('system-aqi');
 await edit('hydrate');check('Temperature threshold complete',await page.evaluate(()=>document.querySelector('.eh-rhythm-threshold').value),'85');check('System message visible',await page.evaluate(()=>{const n=document.querySelector('.eh-rhythm-note');return n.value==='Drink extra water'&&n.readOnly&&!!n.getClientRects().length;}));
 await edit('strength');check('Strength Duration label',await page.evaluate(()=>document.querySelector('.eh-duration-field')?.textContent.includes('Minimum duration')),false);
 await edit('winddown');check('Winddown shared planned Duration explanation',await page.evaluate(()=>{const n=document.querySelector('.eh-duration-field');return n.querySelector('.eh-duration-minutes').type==='number'&&n.textContent.includes('Planned minutes for this habit, independent of tracking.');}));
 await edit('dinner');check('Dinner preferred time preserves deadline explanation',await page.evaluate(()=>{const n=document.querySelector('.eh-timing-group');return !!n&&n.textContent.includes('Preferred time')&&n.textContent.toLowerCase().includes('finish');}));
 await edit('gratitude');check('Good things uses shared Count Goal not a competing parameter',await page.evaluate(()=>{const mode=document.querySelector('.eh-measurement');mode.value='count';mode.dispatchEvent(new Event('change',{bubbles:true}));const n=document.querySelector('.eh-target');return n.type==='number'&&n.value==='3'&&n.closest('label').querySelector('span').textContent==='Goal'&&!document.querySelector('.eh-param-count')&&!!document.querySelector('[data-field-resolution="use-new-target"]');}));
 // Link-style button stays keyboard accessible; cancellation must not mutate storage.
 await edit('beach');check('Reset text action',await page.evaluate(()=>{const n=document.getElementById('habitEditorReset');return n.tagName==='BUTTON'&&n.classList.contains('reset-btn')&&!n.classList.contains('modal-btn')&&getComputedStyle(n).minHeight!=='0px';}));
 const before=await page.evaluate(()=>localStorage.getItem(CUSTOM_HABITS_KEY));let dialogText=null;page.once('dialog',async d=>{dialogText=d.message();await d.dismiss();});await page.click('#habitEditorReset');await new Promise(r=>setTimeout(r,100));check('Reset explains scope before mutation',typeof dialogText==='string'&&/reset|restore/i.test(dialogText));check('Reset cancel retains saved overrides',await page.evaluate(()=>localStorage.getItem(CUSTOM_HABITS_KEY)),before);check('Reset explains recorded evidence preservation and tracking cutover',typeof dialogText==='string'&&dialogText.includes('Recorded completion and amounts/counts are kept.')&&dialogText.includes('tracking changes start tomorrow')&&dialogText.includes('Category assignment stays.'));
 await page.evaluate(()=>{habitEditorDirty=false;openNewHabitEditorPage('movement','manage');});
 check('Custom shared Duration is authorable',await page.evaluate(()=>{const n=document.querySelector('.eh-duration-minutes');return n?.type==='number'&&!n.disabled&&!n.readOnly&&n.value==='';}));
 await page.select('.eh-rhythm','temp-above');await page.evaluate(()=>{const threshold=document.querySelector('.eh-rhythm-threshold'),note=document.querySelector('.eh-rhythm-note');threshold.value='90';threshold.dispatchEvent(new Event('input',{bubbles:true}));note.value='Hello';note.dispatchEvent(new Event('input',{bubbles:true}));});
 check('Cue label belongs to own input',await page.evaluate(()=>{const t=document.querySelector('.eh-rhythm-threshold').getBoundingClientRect(),label=document.querySelector('.eh-cue-message>span').getBoundingClientRect(),input=document.querySelector('.eh-rhythm-note').getBoundingClientRect();return label.top-t.bottom>=14&&input.top-label.bottom<=8;}));
 await shot('new-cue');
 // Start each navigation case with a fresh document: direct renderer inventory
 // above is not a user history flow and must not leave pending history.back().
 await page.reload({waitUntil:'networkidle0'});
 await page.evaluate(()=>setActiveView('settings'));
 check('Actual requested theme',await page.evaluate(()=>document.documentElement.dataset.theme),theme);
 check('Settings exposes anchor links',await page.evaluate(()=>['wake','sleep'].every(id=>!!document.querySelector(`[data-habit-anchor="${id}"]`))));
 for(const id of ['wake','sleep']) {const selector=`[data-habit-anchor="${id}"]`;if(await page.$(selector)){await page.reload({waitUntil:'networkidle0'});await page.evaluate(()=>setActiveView('settings'));await page.click(selector);check(id+': Settings opens existing editor',await page.evaluate(id=>editingHabitId===id&&!document.getElementById('habitEditorView').hidden,id));}}
 check('No runtime errors',evidence.errors,[]);
 } catch(e) {evidence.fatal={message:e.message,stack:e.stack};console.error(e.stack);}
 finally {if(browser)await browser.close();if(profile)fs.rmSync(profile,{recursive:true,force:true});evidence.profileRemoved=!!profile&&!fs.existsSync(profile);evidence.passed=!evidence.fatal&&evidence.checks.length>0&&evidence.checks.every(c=>c.passed)&&evidence.profileRemoved;fs.writeFileSync(path.join(out,theme+'-evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:evidence.passed,checks:evidence.checks.length,failures:evidence.checks.filter(c=>!c.passed).map(c=>c.name),fatal:evidence.fatal}));if(!evidence.passed)process.exitCode=1;}
})();
