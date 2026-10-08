'use strict';
// Phase 12: real Edge acceptance. No source hooks or production writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const crypto = require('node:crypto');
const puppeteer = require('puppeteer-core');
const THEME = process.env.WAVELENGTH_THEME || 'light';
assert.ok(['light', 'dark'].includes(THEME), 'WAVELENGTH_THEME must be light|dark');
const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8791';
const SHOT_DIR = process.env.WAVELENGTH_SHOT_DIR || 'C:\\Temp\\habit-lifecycle-phase12';
const SOURCE_HASH = process.env.WAVELENGTH_SOURCE_SHA256 || '715f688d9e38062bbc8f11c3da6d2124d285833392f038da0b332f1cddb44b88';
assert.match(SOURCE_HASH, /^[0-9a-f]{64}$/, 'Expected source hash must be an exact SHA-256');
const FIXED_NOW = '2026-10-05T14:00:00.000Z';
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
fs.mkdirSync(SHOT_DIR, { recursive:true });
const evidencePath = path.join(SHOT_DIR, `lifecycle-${THEME}-evidence.json`);
const evidence = { schemaVersion:1, theme:THEME, model:'gpt-6.1-sol', origin:ORIGIN,
  harnessSha256:sha256(fs.readFileSync(__filename)),
  viewport:{ width:390, height:844, deviceScaleFactor:1 }, deterministic:{ now:FIXED_NOW, timezone:'America/New_York', weather:'geolocation denied; weather HTTP mocked neutral' },
  sourceHash:null, scenarios:[], screenshots:[], layout:[], contrast:[], focus:[], errors:[], fixtures:[], passed:false };
const persist = () => fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
let browser, page, current;
function check(label, actual, expected = true) {
  const record={ label, actual, expected, passed:false }; current.assertions.push(record);
  assert.deepEqual(actual, expected, label); record.passed=true;
}
function audit(label, actual, expected=true) { try { check(label,actual,expected); } catch(error) { (current.auditFailures ||= []).push(error.message); } }
async function isVisible(selector) {
  return page.$eval(selector, n => !!n.getClientRects().length && !n.closest('[hidden], [inert]') && getComputedStyle(n).visibility !== 'hidden');
}
async function settled() {
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#app')).opacity === '1' && !document.querySelector('#toast.show') &&
    [...document.querySelectorAll('.management-view:not([hidden]), dialog[open]')].every(n =>
      getComputedStyle(n).opacity === '1' && n.getAnimations().every(a => a.playState === 'finished')));
  await sleep(350);
}
async function target(selector) {
  await page.waitForSelector(selector, { visible:true });
  await page.$eval(selector, n => n.scrollIntoView({ block:'center', inline:'center', behavior:'instant' }));
  await sleep(100);
  const point = await page.$eval(selector, n => {
    const r = n.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    const hit = document.elementFromPoint(x, y), dock = document.querySelector('.app-dock');
    const dr = dock?.getBoundingClientRect();
    const dockVisible = dock && getComputedStyle(dock).display !== 'none';
    return { x, y, hit:n === hit || n.contains(hit), aboveDock:!dockVisible || n.closest('.app-dock, dialog[open]') !== null || r.bottom <= dr.top,
      inViewport:r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
  });
  assert.ok(point.hit && point.aboveDock && point.inViewport, `Unobscured centered user target ${selector}: ${JSON.stringify(point)}`);
  return point;
}
async function click(selector) { const p = await target(selector); await page.mouse.click(p.x, p.y); await sleep(80); }
async function type(selector, value) {
  await click(selector); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
  await page.keyboard.press('Backspace'); await page.keyboard.type(value);
}
async function select(selector, value) { await target(selector); await page.select(selector, value); }
async function view(id) { await page.waitForFunction(id => !document.getElementById(id).hidden, {}, id); }
async function home() { await page.waitForFunction(() => document.documentElement.dataset.managementOpen !== 'true'); }
const homeAction = action => `#habitList [data-habit-lifecycle-action="${action}"]`;
const manageAction = action => `#manageHabitLifecycleActions [data-habit-lifecycle-action="${action}"]`;
async function category(cat) { await click(`.cat-tab[data-cat="${cat}"]`); }
async function reset() {
  await page.goto(`${ORIGIN}/?habit-lifecycle-e2e=${THEME}`, { waitUntil:'networkidle0' });
  await page.evaluate(theme => { localStorage.clear(); localStorage.setItem('wavelength_theme', theme); }, THEME);
  await page.reload({ waitUntil:'networkidle0' });
  await page.waitForSelector('.habit[data-id]'); await settled();
  assert.equal(await page.$eval('html', n => n.dataset.theme), THEME);
}
async function scenario(id, name, run) {
  current = { id, name, assertions:[], status:'running' }; evidence.scenarios.push(current); persist();
  try { await reset(); await run(); check('No pageerror or console error', evidence.errors, []); current.status='passed'; }
  catch (error) { current.status='failed'; current.failure={ message:error.message, stack:error.stack }; console.error(`Scenario ${id} FAILED: ${error.message}`); }
  persist(); console.log(`${THEME} scenario ${id}: ${current.status} (${current.assertions.length} explicit assertions)`);
}
// Computed colors are alpha-composited through the ancestor tree; gradients are
// rejected rather than guessed. Scope is lifecycle copy, not legacy card ellipsis.
async function inspectLayout(label) {
  // Measurements must exclude the management enter-animation fade.
  await settled();
  const result = await page.evaluate(() => {
    const modal=document.querySelector('dialog[open]');
    const visible = n => (!modal||modal.contains(n)) && n.getClientRects().length && !n.closest('[hidden], [inert]') && getComputedStyle(n).visibility !== 'hidden';
    const controls = [...document.querySelectorAll('[data-habit-lifecycle-action], [data-restore-habit-id], #habitEditorBack, #habitEditorSave, #habitEditorArchive, #archivedHabitsBack, #viewAllArchivedHabits, #habitArchiveDialog button, #restoreHabitCategoryDialog button')].filter(visible);
    const targets = controls.map(n => { const r=n.getBoundingClientRect(); return { selector:n.id || n.dataset.habitLifecycleAction || n.dataset.restoreHabitId, width:r.width, height:r.height }; });
    const copies = [...document.querySelectorAll('[data-habit-lifecycle-action], .archived-habits-intro, .archived-habit-name, .archived-habit-meta, .archived-habit-restore, .management-empty, .view-all-archived, .habit-lifecycle-dialog-message, dialog[open] h2, dialog[open] button, #habitEditorBody label > span, #habitEditorBody .eh-note-count, #habitEditorHeading')].filter(visible);
    const parse = color => {
      const m=color.match(/[\d.]+/g); if (!m) throw new Error(`Unsupported color ${color}`);
      const scale=color.startsWith('color(srgb ')?255:1;
      if(!color.startsWith('rgb')&&!color.startsWith('color(srgb '))throw new Error(`Unsupported color space ${color}`);
      return [...m.slice(0,3).map(v=>Number(v)*scale),m.length>3?Number(m[3]):1];
    };
    const blend = (a,b) => { const alpha=a[3]+b[3]*(1-a[3]); return [0,1,2].map(i => alpha ? (a[i]*a[3]+b[i]*b[3]*(1-a[3]))/alpha : 0).concat(alpha); };
    const lum = rgb => rgb.slice(0,3).map(c => { c/=255; return c<=0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4; }).reduce((s,v,i) => s+v*[0.2126,0.7152,0.0722][i],0);
    const contrast = copies.map(n => {
      const ancestry=[]; for(let p=n;p;p=p.parentElement) ancestry.unshift(p);
      let bg=[255,255,255,1], opacity=1; const gradients=[];
      for(const p of ancestry) { const s=getComputedStyle(p); opacity*=Number(s.opacity); if(s.backgroundImage !== 'none') gradients.push(s.backgroundImage); bg=blend(parse(s.backgroundColor),bg); }
      const style=getComputedStyle(n), fg=parse(style.color); fg[3]*=opacity; const effective=blend(fg,bg), a=lum(effective), b=lum(bg);
      return { text:n.textContent.trim(), className:n.className, size:Number.parseFloat(style.fontSize), computedColor:style.color, computedBackground:style.backgroundColor, hover:n.matches(':hover'), foreground:fg, background:bg, blendedForeground:effective, ratio:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05), gradients };
    });
    const clipping=copies.filter(n => n.tagName !== 'SELECT' && (n.scrollWidth > n.clientWidth+1 || n.scrollHeight > n.clientHeight+2)).map(n => ({ text:n.textContent.trim(), className:n.className, client:[n.clientWidth,n.clientHeight], scroll:[n.scrollWidth,n.scrollHeight] }));
    return { width:document.documentElement.scrollWidth, viewport:innerWidth, targets, clipping, contrast };
  });
  evidence.layout.push({ label, ...result, contrast:undefined }); evidence.contrast.push({ label, samples:result.contrast });
  return result;
}
async function shot(name, scrollSelector) {
  await settled();
  if(scrollSelector) await target(scrollSelector); else await page.evaluate(() => scrollTo(0,0));
  await sleep(200); const layout=await inspectLayout(name);
  const file=path.join(SHOT_DIR, `${THEME}-${name}.png`); await page.screenshot({ path:file, fullPage:false });
  evidence.screenshots.push({ name, file, sha256:sha256(fs.readFileSync(file)), width:390, height:844, scroll:await page.evaluate(() => ({ x:scrollX, y:scrollY })), settled:true }); persist();
  check(`${name}: no horizontal overflow`, layout.width <= layout.viewport);
}
async function confirmLeave(selector, accept) {
  const dialog = new Promise(resolve => page.once('dialog', async d => { const message=d.message(); await (accept ? d.accept() : d.dismiss()); resolve(message); }));
  await click(selector); check('Dirty draft confirm exact copy', await dialog, 'Discard unsaved changes?');
}
async function create(name, cat='hygiene', measured=false) {
  await category(cat); await click(homeAction('create')); await view('habitEditorView');
  await type('#habitNameInput', name); await type('#habitNoteInput', 'Retained lifecycle evidence');
  if(measured) { await select('#habitMeasurementInput','count'); await type('#habitTargetInput','2'); }
  await click('#habitEditorSave'); await home();
  const id=await page.evaluate(name => ALL_HABITS.find(h => h.text===name)?.id, name);
  assert.ok(id); return id;
}
async function snapshot(id) {
  return page.evaluate(id => ({
    id, config:ALL_HABITS.find(h=>h.id===id), state:localStorage.getItem(STORAGE_KEY), custom:localStorage.getItem(CUSTOM_HABITS_KEY),
    order:userOrder.slice(), orderBytes:localStorage.getItem(ORDER_KEY), categories:localStorage.getItem(CATEGORY_STATE_KEY),
    evidence:Object.fromEntries(Object.entries(insightHistory.days).map(([key,day]) => [key,{ completion:day.completions?.[id] || null, recommendations:(day.recommendations || []).filter(r=>r.habitId===id) }]))
  }), id);
}
async function editor(id) { await click(`#manageCategoryList [data-habit-id="${id}"] .manage-habit-row-button`); await view('habitEditorView'); }
async function archive(id, screenshot=false) {
  await editor(id); const before=await snapshot(id);
  await click('#habitEditorArchive'); check('Archive dialog open', await page.$eval('#habitArchiveDialog',n=>n.open));
  if(screenshot) await shot('archive-confirmation');
  await click('#habitArchiveCancel'); check('Cancel retains active identity', await page.evaluate(id=>HABITS.some(h=>h.id===id),id));
  check('Cancel preserves all retained data', await snapshot(id), before);
  await click('#habitEditorArchive'); await page.keyboard.press('Escape');
  check('Archive Escape closes dialog',await page.$eval('#habitArchiveDialog',n=>!n.open));
  check('Escape retains data',await snapshot(id),before);
  await click('#habitEditorArchive'); await click('#habitArchiveConfirm'); await view('manageCategoryView');
  check('Archive excludes active identity',await page.evaluate(id=>HABITS.some(h=>h.id===id),id),false);
  check('Archive retains ID/config/progress/order/history/evidence',await snapshot(id),before);
  return before;
}
(async () => {
  const profile=fs.mkdtempSync('C:\\Temp\\wavelength-phase12-owned-');
  try {
    browser=await puppeteer.launch({ executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', userDataDir:profile, headless:true, args:['--no-sandbox','--disable-gpu','--no-first-run'], defaultViewport:evidence.viewport });
    evidence.browser=await browser.version(); page=await browser.newPage(); await page.setViewport({ ...evidence.viewport,isMobile:true,hasTouch:true });
    await page.emulateTimezone('America/New_York');
    page.setDefaultTimeout(10000);
    page.on('pageerror',e=>{ evidence.errors.push({ type:'pageerror',message:e.message }); persist(); });
    page.on('console',m=>{if(m.type()==='error'){evidence.errors.push({type:'console',message:m.text()});persist();}});
    await page.evaluateOnNewDocument(fixed => {
      const NativeDate=Date, ms=NativeDate.parse(fixed);
      globalThis.Date=class extends NativeDate { constructor(...args){ super(...(args.length?args:[ms])); } static now(){return ms;} };
      navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code:1,message:'Deterministic neutral location denied' });
    },FIXED_NOW);
    await page.setRequestInterception(true);
    page.on('request',request => {
      if(/open-meteo|geocoding|nominatim|weather|air-quality/.test(request.url()) && !request.url().startsWith(ORIGIN)) {
        request.respond({status:200,contentType:'application/json',body:'{}'}).catch(()=>{});
      } else request.continue().catch(()=>{});
    });
    const response=await page.goto(ORIGIN,{waitUntil:'networkidle0'}); evidence.sourceHash=sha256(await response.buffer()); assert.equal(evidence.sourceHash,SOURCE_HASH,'Served production hash unchanged');
    await scenario(1,'Home All incomplete → lifecycle actions → Completed partition',async()=>{
      await click('.habit[data-id="floss"]');
      const partition=await page.evaluate(()=>[...document.querySelector('#habitList').children].map(n=>n.classList.contains('habit')?(n.classList.contains('done')?'completed':'incomplete'):n.classList.contains('habit-lifecycle-actions')?'lifecycle':n.classList.contains('completed-divider')?'divider':'other'));
      const p=partition.indexOf('lifecycle'); check('Incomplete precedes lifecycle',partition.slice(0,p).every(x=>x==='incomplete')&&p>0);
      check('Completed divider follows lifecycle',partition[p+1],'divider'); check('Completed follows divider',partition.slice(p+2).every(x=>x==='completed'));
      check('Both lifecycle buttons present',await page.$$eval('#habitList [data-habit-lifecycle-action]',ns=>ns.map(n=>n.textContent.trim())),['Add a new habit','Add an archived habit']);
      await shot('home-all-completed',homeAction('create'));
    });
    await scenario(2,'Home category launch and preselected create category',async()=>{
      await category('morning'); check('Category lifecycle scope',await page.$eval(homeAction('create'),n=>n.dataset.categoryId),'morning');
      check('Category lifecycle spacing',await page.evaluate(()=>{
        const actions=document.querySelector('#habitList .habit-lifecycle-actions');
        const primary=actions.querySelector('.habit-lifecycle-primary').getBoundingClientRect();
        const secondary=actions.querySelector('.habit-lifecycle-secondary').getBoundingClientRect();
        return {listGap:getComputedStyle(actions.parentElement).gap,actionGap:secondary.top-primary.bottom};
      }),{listGap:'8px',actionGap:4});
      await shot('home-category',homeAction('create')); await click(homeAction('create')); await view('habitEditorView');
      check('Create category preselected',await page.$eval('#habitCategoryInput',n=>n.value),'morning');
      check('Create launch origin',await page.evaluate(()=>habitEditorOrigin),'home'); await shot('new-habit-category');
      await click('#habitEditorBack'); await home(); check('Clean Back returns category',await page.evaluate(()=>currentCat),'morning');
    });
    await scenario(3,'All create explicit category, exact defaults and validation',async()=>{
      await click(homeAction('create')); await view('habitEditorView');
      const defaults=await page.evaluate(()=>({category:document.querySelector('#habitCategoryInput').value, icon:document.querySelector('.eh-icon').textContent,name:document.querySelector('#habitNameInput').value,note:document.querySelector('#habitNoteInput').value,measurement:document.querySelector('#habitMeasurementInput').value,days:[...document.querySelectorAll('.eh-day[aria-checked="true"]')].map(n=>Number(n.dataset.day)).sort(),rhythm:document.querySelector('#habitRhythmInput').value,saveDisabled:document.querySelector('#habitEditorSave').disabled,archiveHidden:document.querySelector('#habitEditorArchive').hidden,resetHidden:document.querySelector('#habitEditorReset').hidden}));
      check('Exact new habit defaults',defaults,{category:'',icon:'⭐',name:'',note:'',measurement:'check',days:[0,1,2,3,4,5,6],rhythm:'none',saveDisabled:true,archiveHidden:true,resetHidden:true});
      await type('#habitNameInput','Phase twelve unique'); check('Name alone cannot save without category',await page.$eval('#habitEditorSave',n=>n.disabled));
      await select('#habitCategoryInput','hygiene'); check('Explicit category enables valid name',await page.$eval('#habitEditorSave',n=>n.disabled),false);
      await type('#habitNameInput','Floss'); check('Duplicate shipped name rejected',await page.$eval('#habitEditorSave',n=>n.disabled));
      await type('#habitNameInput','   '); check('Whitespace-only rejected',await page.$eval('#habitEditorSave',n=>n.disabled));
      await type('#habitNameInput','Phase twelve unique');
      for(const d of [0,1,2,3,4,5,6]) await click(`.eh-day[data-day="${d}"]`);
      check('Zero repeat days rejected',await page.$eval('#habitEditorSave',n=>n.disabled)); await click('.eh-day[data-day="1"]');
      await select('#habitMeasurementInput','count'); await type('#habitTargetInput','0'); check('Nonpositive count goal rejected',await page.$eval('#habitEditorSave',n=>n.disabled));
      await type('#habitTargetInput','2'); check('Valid measurement accepted',await page.$eval('#habitEditorSave',n=>n.disabled),false);
      await click('#habitEditorSave'); await home();
      check('Home All successful save returns All',await page.evaluate(()=>currentCat),'all');
      const saved=await page.evaluate(()=>habitCatalogState.customDefinitions.find(h=>h.text==='Phase twelve unique'));
      check('Home All save retains explicit category and stable identity',!!saved?.id&&saved.cat==='hygiene');
      await page.reload({waitUntil:'networkidle0'});await settled();
      check('Home All created definition survives reload',await page.evaluate(id=>habitCatalogState.customDefinitions.find(h=>h.id===id),saved.id),saved);
    });
    await scenario(4,'Manage scoped and All create origin/return',async()=>{
      for(const cat of ['morning','all']) {
        await category(cat); await click('#manageBtn'); await view('manageCategoryView');
        check(`${cat}: lifecycle scope`,await page.$eval(manageAction('create'),n=>n.dataset.categoryId),cat);
        if(cat==='morning') await shot('manage-scoped',manageAction('create'));
        await click(manageAction('create')); await view('habitEditorView');
        check(`${cat}: manage create origin`,await page.evaluate(()=>habitEditorOrigin),'manage'); check(`${cat}: preselected`,await page.$eval('#habitCategoryInput',n=>n.value),cat==='all'?'':cat);
        await click('#habitEditorBack'); await view('manageCategoryView'); check(`${cat}: return scope`,await page.evaluate(()=>managedCategoryId),cat);
        await click(manageAction('create'));await view('habitEditorView');
        const name=`Manage ${cat} creation`;await type('#habitNameInput',name);
        if(cat==='all')await select('#habitCategoryInput','hygiene');
        await click('#habitEditorSave');await view('manageCategoryView');
        check(`${cat}: successful save returns exact Manage scope`,await page.evaluate(()=>managedCategoryId),cat);
        const saved=await page.evaluate(name=>habitCatalogState.customDefinitions.find(h=>h.text===name),name);
        check(`${cat}: successful Manage save persists category and identity`,!!saved?.id&&saved.cat===(cat==='all'?'hygiene':cat));
        check(`${cat}: successful save rerenders created row`,await page.$$eval('#manageCategoryList [data-habit-id]',(ns,id)=>ns.some(n=>n.dataset.habitId===id),saved.id));
        await click('#manageCategoryBack'); await home();
      }
    });
    await scenario(5,'Create/reload/complete/keyboard reorder stable custom identity/order/history',async()=>{
      const id=await create('Lifecycle completed custom'); check('Opaque custom ID',/^habit_[a-f0-9-]{8,64}$/i.test(id));
      const before=await snapshot(id); await page.reload({waitUntil:'networkidle0'}); await settled(); check('Reload retains new ID/config/order',await snapshot(id),before);
      await category('hygiene'); await click(`.habit[data-id="${id}"]`); check('Actual completion persisted',await page.evaluate(id=>state.done[dateKey(new Date())][id],id));
      const completed=await snapshot(id); check('Completion evidence nonempty',Object.values(completed.evidence).some(x=>x.completion));
      await click('#manageBtn'); await view('manageCategoryView');
      const scopedBefore=await page.$$eval('#manageCategoryList [data-habit-id]',ns=>ns.map(n=>n.dataset.habitId));
      const selector=`#manageCategoryList [data-habit-id="${id}"] .manage-habit-grip`; await target(selector); await page.focus(selector); await page.keyboard.press('ArrowUp');
      const reordered=await snapshot(id); check('Keyboard ArrowUp changes persisted canonical order',reordered.orderBytes!==completed.orderBytes);
      check('Custom moves exactly one scoped slot',await page.$$eval('#manageCategoryList [data-habit-id]',(ns,id)=>ns.findIndex(n=>n.dataset.habitId===id),id),scopedBefore.indexOf(id)-1);
      check('Scoped reorder swaps canonical slot with previous scoped ID',reordered.order.indexOf(id),completed.order.indexOf(scopedBefore[scopedBefore.indexOf(id)-1]));
      check('Completion history retained during reorder',reordered.evidence,completed.evidence);
      await page.reload({waitUntil:'networkidle0'}); await settled(); check('Reload retains reordered ID/config/progress/order/evidence',await snapshot(id),reordered);
    });
    await scenario(6,'Archive completed/incomplete shipped and custom via cancellation and confirmation',async()=>{
      const completed=await create('Archive completed custom'), incomplete=await create('Archive incomplete custom','hygiene',true);
      await click(`.habit[data-id="${completed}"]`); await click('.habit[data-id="floss"]');
      // A real measured tap produces retained partial progress for the incomplete case.
      await click(`.habit[data-id="${incomplete}"] .progress-plus`);
      await category('all'); await click('#manageBtn'); await view('manageCategoryView'); const before=[];
      for(const id of ['floss','sunscreen',completed,incomplete]) before.push(await archive(id,id==='floss'));
      await page.reload({waitUntil:'networkidle0'}); await settled();
      for(const retained of before) { check(`${retained.id}: retained data after reload`,await snapshot(retained.id),retained); check(`${retained.id}: still inactive after reload`,await page.evaluate(id=>HABITS.some(h=>h.id===id),retained.id),false); }
    });
    await scenario(7,'Counts/Next Wave and real native publication/scheduling exclude archives',async()=>{
      const candidate=await page.$eval('#nextWaveAction',n=>n.dataset.habitId);
      check('Discriminating fixture has a live incomplete recommendable candidate',!!candidate&&await page.evaluate(id=>HABITS.some(h=>h.id===id)&&!state.done[dateKey(new Date())]?.[id],candidate));
      await page.evaluate(()=>{window.__phase12SavedBridge=window.WavelengthNative;window.__phase12WidgetBeforeAfter=[];
        window.WavelengthNative={isNative:true,widgets:{publish:async s=>__phase12WidgetBeforeAfter.push(s)}};renderHabits(new Date());});
      try{
        check('Before archive real widget recommends the same candidate',await page.evaluate(()=>__phase12WidgetBeforeAfter.at(-1)?.nextWave.habitId),candidate);
        await click('.habit[data-id="floss"]');await click('#manageBtn');await view('manageCategoryView');await archive('floss');await archive(candidate);
        await click('#manageCategoryBack');await home();
        check('After actual UI archive Home recommendation changes',await page.$eval('#nextWaveAction',(n,id)=>n.dataset.habitId!==id,candidate));
        check('After actual UI archive published widget recommendation changes',await page.evaluate(id=>__phase12WidgetBeforeAfter.at(-1)?.nextWave.habitId!==id,candidate));
        check('Archived recommended identity absent from real published habit catalog',await page.evaluate(id=>__phase12WidgetBeforeAfter.at(-1)?.habits.every(h=>h.id!==id),candidate));
        current.recommendationTransition={candidate,beforeAfter:await page.evaluate(()=>__phase12WidgetBeforeAfter.map(s=>s.nextWave))};
      }finally{await page.evaluate(()=>{window.WavelengthNative=__phase12SavedBridge;delete window.__phase12SavedBridge;delete window.__phase12WidgetBeforeAfter;});}
      const calls=await page.evaluate(async()=>{
        const bridge=window.WavelengthNative, settings=nativeNotificationSettings, catalog=habitCatalogState;
        const catalogBytes=localStorage.getItem(HABIT_CATALOG_KEY);
        const idsBefore=localStorage.getItem(NATIVE_NOTIFICATION_IDS_KEY); const published=[],scheduled=[],cancelled=[];let permissions=0;
        window.WavelengthNative={isNative:true,widgets:{publish:async s=>{published.push(s);}},notifications:{checkPermissions:async()=>{permissions++;return {display:'granted'};},schedule:async r=>{scheduled.push(r);},cancel:async r=>{cancelled.push(r);}}};
        nativeNotificationSettings={enabled:true,time:'11:00'};
        try {
          renderHabits(new Date()); await syncNativeNotifications(new Date());
          const active={count:document.getElementById('doneCount').textContent,expected:getDailyHabitStats(state.done,HABITS,new Date(),5,state.progress),archived:ALL_HABITS.filter(h=>!HABITS.some(a=>a.id===h.id)).map(h=>h.id),next:document.getElementById('nextWaveAction').dataset.habitId,snapshot:published.at(-1),scheduled:scheduled.slice(),permissions};
          // Runtime hard-edge fixture: all retained identities inactive on this day.
          for(const h of ALL_HABITS) habitCatalogState=setHabitActiveOnDate(habitCatalogState,h.id,false,dateKey(new Date()),ALL_HABITS);
          localStorage.setItem(HABIT_CATALOG_KEY,JSON.stringify(habitCatalogState));
          reloadHabits(); renderHabits(new Date()); await syncNativeNotifications(new Date());
          return {active,empty:{count:document.getElementById('doneCount').textContent,next:document.getElementById('nextWaveAction').dataset.habitId,snapshot:published.at(-1),scheduledCalls:scheduled.length,permissions,cancelled},publishCalls:published.length};
        } finally {
          window.WavelengthNative=bridge;nativeNotificationSettings=settings;habitCatalogState=catalog;
          if(catalogBytes===null)localStorage.removeItem(HABIT_CATALOG_KEY);else localStorage.setItem(HABIT_CATALOG_KEY,catalogBytes);
          reloadHabits();renderHabits(new Date());
          if(idsBefore===null)localStorage.removeItem(NATIVE_NOTIFICATION_IDS_KEY);else localStorage.setItem(NATIVE_NOTIFICATION_IDS_KEY,idsBefore);
        }
      });
      evidence.fixtures.push({scenario:7,kind:'runtime hard edge',detail:'All retained identities inactive using real model helpers and localStorage; original catalog restored in finally. Only native bridge boundary mocked.'});
      check('Active count exactly matches scheduled active identities',calls.active.count,`${calls.active.expected.doneCount}/${calls.active.expected.scheduledCount}`);
      check('Archived floss excluded from Next Wave',calls.active.next!=='floss'); check('Actual widgets.publish fired',calls.publishCalls>=2);
      check('Published widget excludes archived ID',calls.active.snapshot.habits.every(h=>h.id!=='floss')); check('Widget counts equal active scheduler',calls.active.snapshot.progress.total,calls.active.expected.scheduledCount);
      check('Actual widget publication excludes every archived identity',calls.active.snapshot.habits.every(h=>!calls.active.archived.includes(h.id)));
      check('Actual Next Wave excludes every archived identity',!calls.active.archived.includes(calls.active.next));
      check('Published widget identities exactly match scheduled active identities',calls.active.snapshot.habits.map(h=>h.id).sort(),calls.active.expected.scheduledHabits.map(h=>h.id).sort());
      check('Real sync function scheduled eligible generic reminders',calls.active.scheduled.length,1); check('Permission boundary called twice',calls.empty.permissions,2);
      check('Generic reminder payload has no habit IDs',calls.active.scheduled[0].notifications.every(n=>n.extra.route==='home'&&!Object.hasOwn(n.extra,'habitId')));
      check('All-archived counts empty',calls.empty.count,'0/0'); check('All-archived Next Wave has no habit ID',calls.empty.next,'');
      check('All-archived actual widget publishes no habits',calls.empty.snapshot.habits,[]); check('All-archived no new scheduling',calls.empty.scheduledCalls,1); check('Prior scheduled notifications actually cancelled',calls.empty.cancelled.length,1);
      current.nativeCalls=calls;
    });
    await scenario(8,'Restore active category and archived-category reassignment with atomic rollback',async()=>{
      const customId=await create('Restored completed custom');await click(`.habit[data-id="${customId}"]`);
      await click('.habit[data-id="floss"]'); await click('#manageBtn'); await view('manageCategoryView'); const before=await archive('floss');
      const customBefore=await archive(customId);
      await click(manageAction('archived')); await view('archivedHabitsView'); await click('[data-restore-habit-id="floss"]');
      check('Direct restore keeps Archived page open',await isVisible('#archivedHabitsView')); check('Direct restore active',await page.evaluate(()=>HABITS.some(h=>h.id==='floss')));
      check('Direct restore preserves retained config/history/order',await snapshot('floss'),before);
      await click(`[data-restore-habit-id="${customId}"]`);check('Custom restore retains stable ID/config/progress/order/evidence',await snapshot(customId),customBefore);
      check('Restored custom is active',await page.evaluate(id=>HABITS.some(h=>h.id===id),customId));
      // Browse All so an archived shipped habit assigned to a legacy category remains visible.
      await click('#viewAllArchivedHabits');
      await page.evaluate(()=>{
        let historic=setHabitActiveOnDate(habitCatalogState,'medication',true,'2026-10-04',ALL_HABITS);
        historic=setHabitActiveOnDate(historic,'medication',false,dateKey(new Date()),ALL_HABITS);
        habitCatalogState=saveHabitCatalogState(historic,DEFAULT_HABITS,categoryState.definitions.map(c=>c.id),dateKey(new Date()));
        state.done['2026-10-04']={...(state.done['2026-10-04']||{}),medication:true};state.created=new Date('2026-10-04T14:00:00Z').getTime();saveState();
        recordInsightCompletion(insightHistory,'medication',new Date('2026-10-04T14:00:00Z'),true);saveInsightHistory();
        let next=addCategoryDefinition(categoryState,'cat_deadbeef','Legacy care','star',ALL_HABITS,'',HABITS);
        next=setHabitCategoryAssignment(next,'medication','cat_deadbeef',ALL_HABITS,HABITS);
        next=setCategoryArchived(next,'cat_deadbeef',true,ALL_HABITS,HABITS);
        categoryState=saveCategoryState(next,ALL_HABITS,localStorage,HABITS);reloadHabits();renderArchivedHabitsPage();
      });
      evidence.fixtures.push({scenario:8,kind:'runtime hard edge',detail:'Retained archived medication with nonempty previous-day completion history assigned to archived Legacy care via real lifecycle/category/insight model helpers.'});
      const retained=await snapshot('medication');check('Archived-category fixture has nonempty retained completion evidence',Object.values(retained.evidence).some(x=>x.completion));
      await click('[data-restore-habit-id="medication"]'); check('Archived-category chooser opens',await page.$eval('#restoreHabitCategoryDialog',n=>n.open));
      check('Chooser guidance uses Add language',await page.$eval('#restoreHabitCategoryDialog .habit-lifecycle-dialog-message',n=>n.textContent),'The habit’s previous category is archived. Choose an active category to add it.');
      check('Chooser confirmation uses Add language',await page.$eval('#restoreHabitCategoryConfirm',n=>n.textContent),'Add habit');
      check('Chooser excludes archived categories',await page.$$eval('#restoreHabitCategoryInput option',ns=>ns.every(n=>n.value!=='cat_deadbeef'))); await shot('restore-category-chooser');
      await page.keyboard.press('Escape'); check('Chooser Escape cancels',await page.$eval('#restoreHabitCategoryDialog',n=>!n.open)); check('Escape clears restoring identity',await page.evaluate(()=>restoringArchivedHabitId),null); check('Escape leaves retained data',await snapshot('medication'),retained);
      await click('[data-restore-habit-id="medication"]'); await select('#restoreHabitCategoryInput','movement');
      const atomic=()=>page.evaluate(()=>({catalog:localStorage.getItem(HABIT_CATALOG_KEY),categories:localStorage.getItem(CATEGORY_STATE_KEY),memoryCatalog:JSON.stringify(habitCatalogState),memoryCategories:JSON.stringify(categoryState),journal:localStorage.getItem(IMPORT_JOURNAL_KEY)}));
      for(const boundary of ['catalog','category']) {
        const beforeFailure=await atomic();
        await page.evaluate(boundary=>{
          const original=Storage.prototype.setItem; let fired=0;
          const key=boundary==='catalog'?HABIT_CATALOG_KEY:CATEGORY_STATE_KEY;
          Storage.prototype.setItem=function(k,v){if(k===key&&fired===0){fired++;throw new DOMException('Phase12 injected authoritative write failure','QuotaExceededError');}return original.call(this,k,v);};
          window.__phase12RestoreStorage=()=>{Storage.prototype.setItem=original;return fired;};
        },boundary);
        let fired;try{await click('#restoreHabitCategoryConfirm');}finally{fired=await page.evaluate(()=>{const n=__phase12RestoreStorage();delete window.__phase12RestoreStorage;return n;});}
        check(`${boundary}: injection actually fired`,fired,1); check(`${boundary}: atomic storage and memory rollback`,await atomic(),beforeFailure);
        check(`${boundary}: failed restore leaves chooser open`,await page.$eval('#restoreHabitCategoryDialog',n=>n.open));
      }
      await click('#restoreHabitCategoryConfirm'); check('Retry closes chooser',await page.$eval('#restoreHabitCategoryDialog',n=>!n.open));
      check('Reassignment active/category exact',await page.evaluate(()=>({active:HABITS.some(h=>h.id==='medication'),category:getEffectiveCategoryId(ALL_HABITS.find(h=>h.id==='medication'),categoryState)})),{active:true,category:'movement'});
      const after=await snapshot('medication');check('Reassignment preserves ID/config except category',{...after.config,cat:retained.config.cat},retained.config);check('Reassignment preserves progress',after.state,retained.state);check('Reassignment preserves history',after.evidence,retained.evidence);check('Reassignment preserves order',after.order,retained.order);
      await page.reload({waitUntil:'networkidle0'});await settled();check('Reassignment reload retains config/history/order',await snapshot('medication'),after);
    });
    await scenario(9,'Global/scoped empty states, conditional View all, canonical archive order',async()=>{
      await category('morning');await click(homeAction('archived'));await view('archivedHabitsView');
      check('Archived intro uses Add language',await page.$eval('.archived-habits-intro',n=>n.textContent),'Add a habit to start tracking.');
      check('Scoped empty copy exact',await page.$eval('#archivedHabitsList',n=>n.textContent.trim()),'No archived habits in Morning');
      check('View all when archive exists elsewhere',await isVisible('#viewAllArchivedHabits'));await click('#viewAllArchivedHabits');
      check('Global archive contains shipped medication',await page.$$eval('[data-archived-habit-id]',ns=>ns.map(n=>n.dataset.archivedHabitId)),['medication']);
      check('Archived row action uses Add language',await page.$eval('[data-restore-habit-id="medication"]',n=>n.textContent),'Add');await shot('archived-populated');
      check('Global hides View all',await isVisible('#viewAllArchivedHabits'),false);await click('[data-restore-habit-id="medication"]');
      check('Global empty headline exact',await page.$eval('.management-empty p:first-child',n=>n.textContent),'No archived habits yet');check('Global empty guidance exact',await page.$eval('.management-empty p:last-child',n=>n.textContent),'Habits you archive will appear here.');await shot('archived-empty');
      await click('#archivedHabitsBack');await home();await category('all');await click('#manageBtn');await view('manageCategoryView');
      await archive('sunscreen');await archive('floss');await click(manageAction('archived'));await view('archivedHabitsView');
      check('Archived rows in canonical order',await page.$$eval('[data-archived-habit-id]',ns=>ns.map(n=>n.dataset.archivedHabitId)),await page.evaluate(()=>userOrder.filter(id=>['sunscreen','floss'].includes(id))));
      await click('#archivedHabitsBack');await view('manageCategoryView');await click('#manageCategoryBack');await home();await category('hygiene');await click(homeAction('archived'));await view('archivedHabitsView');check('No View all when all archives within scope',await isVisible('#viewAllArchivedHabits'),false);
    });
    await scenario(10,'Back/Escape/history/dirty guards and cross-scope focus restoration',async()=>{
      await category('morning');await click(homeAction('archived'));await view('archivedHabitsView');await click('#viewAllArchivedHabits');await click('#archivedHabitsBack');await home();
      await page.waitForFunction(()=>document.activeElement?.dataset.habitLifecycleAction==='archived');check('Scoped→View all→Back focuses original Home scope',await page.evaluate(()=>document.activeElement.dataset.categoryId),'morning');
      await click(homeAction('archived'));await view('archivedHabitsView');await page.goBack();await home();await page.goForward();await view('archivedHabitsView');check('Browser Forward restores archive route',await page.evaluate(()=>history.state[MANAGEMENT_HISTORY_KEY].viewId),'archivedHabitsView');
      await page.keyboard.press('Escape');await home();check('Escape closes clean archive view',await page.evaluate(()=>document.documentElement.dataset.managementOpen!=='true'));
      await click(homeAction('create'));await view('habitEditorView');await type('#habitNameInput','Unsaved draft');await confirmLeave('#habitEditorBack',false);check('Dismiss dirty create retains typed draft',await page.$eval('#habitNameInput',n=>n.value),'Unsaved draft');
      const backCancel=new Promise(resolve=>page.once('dialog',async d=>{const text=d.message();await d.dismiss();resolve(text);}));
      await page.goBack();check('Browser Back dirty create prompts',await backCancel,'Discard unsaved changes?');
      await page.waitForFunction(()=>history.state?.[MANAGEMENT_HISTORY_KEY]?.viewId==='habitEditorView'&&!suppressNextManagementPop);
      check('Browser Back cancellation restores editor route/draft',await page.$eval('#habitNameInput',n=>n.value),'Unsaved draft');
      await confirmLeave('#habitEditorBack',true);await home();check('Discard create has no stored definition',await page.evaluate(()=>ALL_HABITS.some(h=>h.text==='Unsaved draft')),false);
      await click(homeAction('create'));await view('habitEditorView');await type('#habitNameInput','Escape unsaved create');
      const createEscapeCancel=new Promise(resolve=>page.once('dialog',async d=>{await d.dismiss();resolve(d.message());}));
      await page.keyboard.press('Escape');check('Create Escape cancellation prompts',await createEscapeCancel,'Discard unsaved changes?');
      check('Create Escape cancellation retains typed draft',await page.$eval('#habitNameInput',n=>n.value),'Escape unsaved create');
      const createEscapeAccept=new Promise(resolve=>page.once('dialog',async d=>{await d.accept();resolve(d.message());}));
      await page.keyboard.press('Escape');check('Create Escape acceptance prompts',await createEscapeAccept,'Discard unsaved changes?');await home();
      check('Create Escape discard never persists identity',await page.evaluate(()=>ALL_HABITS.some(h=>h.text==='Escape unsaved create')),false);
      await click('#manageBtn');await view('manageCategoryView');await editor('daylight');await type('.eh-note','Unsaved edit');await confirmLeave('#habitEditorBack',false);check('Dismiss dirty edit retains draft',await page.$eval('.eh-note',n=>n.value),'Unsaved edit');
      const editBackCancel=new Promise(resolve=>page.once('dialog',async d=>{await d.dismiss();resolve(d.message());}));
      await page.goBack();check('Dirty edit browser Back cancellation prompts',await editBackCancel,'Discard unsaved changes?');
      await page.waitForFunction(()=>history.state?.[MANAGEMENT_HISTORY_KEY]?.viewId==='habitEditorView'&&!suppressNextManagementPop);
      check('Dirty edit browser Back cancellation retains typed draft',await page.$eval('.eh-note',n=>n.value),'Unsaved edit');
      await click('#habitEditorArchive');await click('#habitArchiveCancel');
      check('Dirty edit archive cancellation retains draft',await page.$eval('.eh-note',n=>n.value),'Unsaved edit');
      check('Dirty edit archive cancellation retains active identity',await page.evaluate(()=>HABITS.some(h=>h.id==='daylight')));
      const dialog=new Promise(resolve=>page.once('dialog',async d=>{const text=d.message();await d.accept();resolve(text);}));await page.keyboard.press('Escape');check('Escape dirty edit prompts',await dialog,'Discard unsaved changes?');await view('manageCategoryView');check('Discard edit does not persist',await page.evaluate(()=>ALL_HABITS.find(h=>h.id==='daylight').note==='Unsaved edit'),false);
      await click(manageAction('archived'));await view('archivedHabitsView');await click('#viewAllArchivedHabits');await click('#archivedHabitsBack');await view('manageCategoryView');await page.waitForFunction(()=>document.activeElement?.dataset.habitLifecycleAction==='archived');check('Manage cross-scope Back focus fallback',await page.evaluate(()=>document.activeElement.dataset.categoryId),'morning');
    });
    await scenario(11,'390px layout, lifecycle target size, keyboard outline, blended AA copy contrast',async()=>{
      audit('Eight distinct screenshot views',new Set(evidence.screenshots.map(s=>s.name)).size,8);
      audit('All captured lifecycle surfaces overflow-free',evidence.layout.every(x=>x.width<=390));
      audit('No unapproved lifecycle text clipping',evidence.layout.flatMap(x=>x.clipping),[]);
      const undersized=evidence.layout.flatMap(x=>x.targets.map(t=>({...t,view:x.label}))).filter(t=>t.width<44||t.height<44);
      audit('Lifecycle touch controls at least 44×44',undersized,[]);
      const samples=evidence.contrast.flatMap(x=>x.samples.map(s=>({...s,view:x.label})));audit('Contrast has real small-copy samples',samples.filter(s=>s.size<18).length>10);
      audit('No unresolved gradient backgrounds in lifecycle copy',samples.filter(s=>s.gradients.length>0),[]);
      audit('Computed alpha-blended lifecycle copy contrast >=4.5',samples.filter(s=>s.ratio<4.5),[]);
      await page.mouse.move(1,1);await inspectLayout('home-actions-normal');
      const hoverPoint=await target(homeAction('create'));await page.mouse.move(hoverPoint.x,hoverPoint.y);await sleep(200);await inspectLayout('home-primary-hover');
      await target(homeAction('create'));await page.focus(homeAction('create'));await page.keyboard.press('Tab');
      const focus=await page.evaluate(()=>{const n=document.activeElement,s=getComputedStyle(n);return {action:n.dataset.habitLifecycleAction,visible:n.matches(':focus-visible'),style:s.outlineStyle,width:parseFloat(s.outlineWidth),color:s.outlineColor};});evidence.focus.push(focus);
      audit('Keyboard focus-visible lifecycle outline',focus.visible&&focus.style!=='none'&&focus.width>=2);
      await page.keyboard.down('Shift');await page.keyboard.press('Tab');await page.keyboard.up('Shift');
      const createFocus=await page.evaluate(()=>{const n=document.activeElement,s=getComputedStyle(n);return {action:n.dataset.habitLifecycleAction,visible:n.matches(':focus-visible'),style:s.outlineStyle,width:parseFloat(s.outlineWidth),color:s.outlineColor};});evidence.focus.push(createFocus);
      audit('Primary create has actual keyboard focus-visible outline',createFocus.action==='create'&&createFocus.visible&&createFocus.style!=='none'&&createFocus.width>=2);
      await page.mouse.move(1,1);await inspectLayout('home-primary-keyboard-focus');
      await click(homeAction('archived'));await view('archivedHabitsView');await page.focus('#archivedHabitsBack');await page.keyboard.press('Tab');
      const restoreFocus=await page.evaluate(()=>{const n=document.activeElement,s=getComputedStyle(n);return {restoreId:n.dataset.restoreHabitId,visible:n.matches(':focus-visible'),style:s.outlineStyle,width:parseFloat(s.outlineWidth),color:s.outlineColor};});evidence.focus.push(restoreFocus);
      audit('Restore control has actual keyboard focus-visible outline',restoreFocus.restoreId==='medication'&&restoreFocus.visible&&restoreFocus.style!=='none'&&restoreFocus.width>=2);
      await page.mouse.move(1,1);await inspectLayout('restore-keyboard-focus');
      const restorePoint=await target('[data-restore-habit-id="medication"]');await page.mouse.move(restorePoint.x,restorePoint.y);await sleep(200);await inspectLayout('restore-hover');
      await page.mouse.move(1,1);await inspectLayout('restore-normal');
      audit('Explicit normal hover and keyboard-focus lifecycle copy meets AA',evidence.contrast.filter(x=>/normal|hover|keyboard-focus/.test(x.label)).flatMap(x=>x.samples).filter(s=>s.ratio<4.5),[]);
      if(current.auditFailures?.length)throw new Error(current.auditFailures.join('\n'));
    });
    await scenario(12,'Lifecycle controls are not habit cards/drag rows and disappear during reorder',async()=>{
      const excluded=await page.$$eval('[data-habit-lifecycle-action]',ns=>ns.every(n=>!n.closest('.habit, .manage-habit-row')&&!n.hasAttribute('data-id')&&!n.hasAttribute('data-habit-id')&&!n.draggable));check('Home lifecycle controls excluded from habit and drag selectors',excluded);
      // Legacy Home reorder CSS state has no current user launch: explicitly a runtime CSS fixture.
      await page.evaluate(()=>document.querySelector('.habits').classList.add('reorder-mode'));
      try{check('Home reorder CSS hides lifecycle actions',await isVisible(homeAction('create')),false);}finally{await page.evaluate(()=>document.querySelector('.habits').classList.remove('reorder-mode'));}
      evidence.fixtures.push({scenario:12,kind:'runtime CSS fixture',detail:'Legacy .habits.reorder-mode has no exposed launch; visibility tested explicitly, separately from actual Manage grip interaction.'});
      await category('hygiene');await click('#manageBtn');await view('manageCategoryView');check('Manage lifecycle controls outside drag list',await page.$$eval('#manageHabitLifecycleActions [data-habit-lifecycle-action]',ns=>ns.every(n=>!n.closest('#manageCategoryList, .manage-habit-row'))));
      const point=await target('#manageCategoryList .manage-habit-grip');
      const cdp=await page.target().createCDPSession();
      try{
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,radiusX:4,radiusY:4,force:1}]});await sleep(350);
        check('Actual touch reorder arms real drag proxy',await page.evaluate(()=>document.body.classList.contains('dragging-active')&&!!document.querySelector('.category-drag-proxy')));
        check('Actual drag proxy contains no lifecycle controls',await page.$$eval('.category-drag-proxy [data-habit-lifecycle-action]',ns=>ns.length),0);
        audit('Create control disappears during actual Manage reorder',await isVisible(manageAction('create')),false);
        audit('Archived control disappears during actual Manage reorder',await isVisible(manageAction('archived')),false);
      }finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await cdp.detach();}
      check('Actual reorder cancellation cleans drag proxy and drag state',await page.evaluate(()=>!document.body.classList.contains('dragging-active')&&!document.querySelector('.category-drag-proxy')));
      if(current.auditFailures?.length)throw new Error(current.auditFailures.join('\n'));
    });
    evidence.passed=evidence.scenarios.length===12&&evidence.scenarios.every(s=>s.status==='passed')&&evidence.screenshots.length===8&&evidence.errors.length===0;persist();
    console.log(JSON.stringify({theme:THEME,passed:evidence.passed,scenarios:evidence.scenarios.map(s=>({id:s.id,status:s.status,assertions:s.assertions.length,failure:s.failure?.message})),screenshots:evidence.screenshots.length,evidence:evidencePath}));
    if(!evidence.passed)process.exitCode=1;
  }finally{
    if(browser)await browser.close();fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300});
  }
})().catch(error=>{evidence.fatal={message:error.message,stack:error.stack};persist();console.error(error);process.exitCode=1;});
