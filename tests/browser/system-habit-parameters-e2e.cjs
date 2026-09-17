const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8778';
const URL = process.env.WAVELENGTH_URL || `${ORIGIN}/?system-habit-parameters-e2e=local`;
const THEME = process.env.WAVELENGTH_THEME || 'dark';
const SHOT = process.env.WAVELENGTH_SHOT || 'C:\\Temp\\wavelength-system-habits.png';
let browser;

(async () => {
  browser = await puppeteer.launch({
    executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless:true,
    protocolTimeout:120000,
    args:['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width:390, height:844, deviceScaleFactor:3, isMobile:true, hasTouch:true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(URL, { waitUntil:'networkidle0' });
  await page.evaluate(theme => { localStorage.clear(); localStorage.setItem('wavelength_theme', theme); }, THEME);
  await page.reload({ waitUntil:'networkidle0' });

  const openEditor = async id => {
    await page.evaluate(habitId => {
      if (document.documentElement.dataset.managementOpen !== 'true') openManageCategoryPage('all', 'home');
      openHabitEditorPage(habitId);
    }, id);
    await page.waitForFunction(habitId => !document.getElementById('habitEditorView').hidden &&
      document.querySelector('#habitEditorBody .edit-habit')?.dataset.id === habitId, {}, id);
  };
  const activate = selector => page.$eval(selector, element => element.click());

  await page.evaluate(() => {
    localStorage.setItem('wavelength_wpb_habits', JSON.stringify({
      hydrate:{ params:{ amount:162 }, measurement:'amount', target:48, step:12, unit:'oz' },
    }));
  });
  await page.reload({ waitUntil:'networkidle0' });
  const measuredHydration = await page.$eval('.habit[data-id="hydrate"]', card => ({
    title:card.querySelector('.habit-name')?.textContent || '',
    target:card.querySelector('.habit-target')?.textContent || '',
    progress:card.querySelector('.progress-chip')?.textContent || '',
    increment:card.querySelector('.progress-step-copy')?.textContent || '',
  }));
  assert.deepEqual(measuredHydration, {
    title:'Drink water', target:'', progress:'0 / 48 oz', increment:'+12 oz each tap',
  }, 'measured hydration uses its progress goal without a contradictory title qualifier');
  await page.evaluate(() => localStorage.removeItem('wavelength_wpb_habits'));
  await page.reload({ waitUntil:'networkidle0' });

  const editorContracts = await page.evaluate(() => DEFAULT_HABITS.map(habit => {
    editingHabitId = habit.id;
    renderHabitEditorForm(habit.id);
    const row = document.querySelector('#habitEditorBody .edit-habit');
    return {
      id:habit.id,
      titleCount:row.querySelectorAll('.eh-system-title').length,
      editableTitleCount:row.querySelectorAll('input.eh-text[type="text"]').length,
      visibleRhythmEditors:[...row.querySelectorAll('.eh-rhythm-block')].filter(element => !element.hidden).length,
      anchorCount:row.querySelectorAll('.eh-system-anchor').length,
      hasWeight:!!row.querySelector('.eh-weight'),
    };
  }));
  assert.equal(editorContracts.length, await page.evaluate(() => DEFAULT_HABITS.length));
  assert.ok(editorContracts.every(result => result.titleCount === 1), 'every shipped habit has a locked title');
  assert.ok(editorContracts.every(result => result.editableTitleCount === 0), 'system habits expose no editable title field');
  assert.ok(editorContracts.every(result => result.visibleRhythmEditors === 0), 'system anchors expose no editable controls');
  assert.ok(editorContracts.every(result => result.anchorCount === 1), 'system anchors remain visible as summaries');
  assert.ok(editorContracts.every(result => !result.hasWeight), 'obsolete weight selector is absent');

  await openEditor('wake');
  await page.evaluate(() => {
    const wake = document.querySelector('#habitEditorBody .eh-param-targetTime');
    wake.value = '07:45';
    wake.dispatchEvent(new Event('input', { bubbles:true }));
    wake.dispatchEvent(new Event('change', { bubbles:true }));
  });
  assert.equal(await page.$eval('#habitEditorBody .eh-system-title', element => element.textContent), 'Wake at 7:45 AM');
  await page.evaluate(() => {
    const wake = document.querySelector('#habitEditorBody .eh-param-targetTime');
    wake.value = '08:00';
    wake.dispatchEvent(new Event('change', { bubbles:true }));
  });
  assert.equal(await page.$eval('#habitEditorBody .eh-system-title', element => element.textContent), 'Wake at 8:00 AM');
  await activate('#habitEditorBack');

  await openEditor('sleep');
  await page.evaluate(() => { document.querySelector('#habitEditorBody .eh-param-targetTime').value = '23:30'; });
  await activate('#habitEditorSave');
  await page.waitForFunction(() => !document.getElementById('manageCategoryView').hidden);
  await openEditor('sleep');
  const saved = await page.evaluate(() => {
    const overrides = JSON.parse(localStorage.getItem('wavelength_wpb_habits'));
    const row = document.querySelector('#habitEditorBody .edit-habit');
    return {
      title:row.querySelector('.eh-system-title').textContent,
      time:row.querySelector('.eh-param-targetTime').value,
      stored:overrides.sleep,
      rhythmVisible:!row.querySelector('.eh-rhythm-block').hidden,
      width:document.documentElement.scrollWidth,
      viewport:innerWidth,
    };
  });
  assert.equal(saved.title, 'In bed by 11:30 PM');
  assert.equal(saved.time, '23:30');
  assert.deepEqual(saved.stored, { params:{ targetTime:'23:30' } });
  assert.equal(saved.rhythmVisible, false);
  assert.ok(saved.width <= saved.viewport, 'focused editor has no horizontal overflow');
  await page.screenshot({ path:SHOT, fullPage:false });

  await page.evaluate(() => {
    localStorage.setItem('wavelength_wpb_habits', JSON.stringify({ sleep:{ text:'Sleep when the moon feels right' } }));
  });
  await page.reload({ waitUntil:'networkidle0' });
  await openEditor('sleep');
  assert.equal(await page.$eval('#habitEditorBody .eh-system-title', element => element.textContent), 'Sleep when the moon feels right');
  await activate('#habitEditorSave');
  await openEditor('sleep');
  assert.deepEqual(await page.evaluate(() => ({
    title:document.querySelector('#habitEditorBody .eh-system-title').textContent,
    stored:JSON.parse(localStorage.getItem('wavelength_wpb_habits')).sleep,
  })), {
    title:'Sleep when the moon feels right', stored:{ text:'Sleep when the moon feels right' },
  });

  await page.evaluate(() => {
    localStorage.setItem('wavelength_wpb_habits', JSON.stringify({
      sleep:{ text:'Sleep when the moon feels right' },
      affirm:{ text:'A legacy affirming phrase' },
    }));
  });
  await page.reload({ waitUntil:'networkidle0' });
  await openEditor('affirm');
  assert.equal(await page.$eval('#habitEditorBody .eh-system-title', element => element.textContent), 'A legacy affirming phrase');
  await activate('#habitEditorSave');
  await openEditor('affirm');
  assert.deepEqual(await page.evaluate(() => ({
    title:document.querySelector('#habitEditorBody .eh-system-title').textContent,
    stored:JSON.parse(localStorage.getItem('wavelength_wpb_habits')).affirm,
  })), { title:'A legacy affirming phrase', stored:{ text:'A legacy affirming phrase' } });

  const importVersions = await page.evaluate(async () => {
    const results = [];
    for (const version of [1, 2, 3, 4, 5]) {
      const payload = createBackupPayload();
      payload.version = version;
      delete payload.categoryState;
      if (version === 1) delete payload.insightHistory;
      await importBackupFile({ text:async () => JSON.stringify(payload) });
      results.push({ version, toast:document.getElementById('toast').textContent });
    }
    return results;
  });
  for (const result of importVersions) assert.match(result.toast, /Backup imported/, `version-${result.version} backup imports`);

  const legacyWake = await page.evaluate(async () => {
    const payload = createBackupPayload();
    payload.version = 2;
    delete payload.categoryState;
    payload.customHabits.wake = { text:'Wake at 7:30 AM' };
    await importBackupFile({ text:async () => JSON.stringify(payload) });
    openHabitEditorPage('wake');
    const row = document.querySelector('#habitEditorBody .edit-habit');
    return {
      toast:document.getElementById('toast').textContent,
      title:row.querySelector('.eh-system-title').textContent,
      time:row.querySelector('.eh-param-targetTime').value,
      grandfathered:row.dataset.grandfatheredTitle,
      stored:JSON.parse(localStorage.getItem('wavelength_wpb_habits')).wake,
    };
  });
  assert.match(legacyWake.toast, /Backup imported/);
  assert.equal(legacyWake.title, 'Wake at 7:30 AM');
  assert.equal(legacyWake.time, '07:30');
  assert.equal(legacyWake.grandfathered, 'false');
  assert.deepEqual(legacyWake.stored, { params:{ targetTime:'07:30' } });
  await page.evaluate(() => {
    const wake = document.querySelector('#habitEditorBody .eh-param-targetTime');
    wake.value = '07:45';
    wake.dispatchEvent(new Event('change', { bubbles:true }));
  });
  assert.equal(await page.$eval('#habitEditorBody .eh-system-title', element => element.textContent), 'Wake at 7:45 AM');

  assert.deepEqual(errors, []);
  console.log(`system habit parameters 390px ${THEME} Edge flow passed`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
