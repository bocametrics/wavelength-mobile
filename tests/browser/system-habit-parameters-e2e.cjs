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
  const assertTimeEditor = async (name, time, label = 'Wake time') => {
    assert.deepEqual(await page.$eval('#habitEditorBody .edit-habit', row => {
      const name = row.querySelector('.eh-system-name .eh-text');
      const time = row.querySelector('.eh-param-targetTime');
      return {
        name:name.value, readOnly:name.readOnly,
        time:time.value, type:time.type,
        label:time.closest('label.eh-param-field')?.querySelector('span')?.textContent,
        previewCount:row.querySelectorAll('.eh-system-target').length,
      };
    }), { name, readOnly:true, time, type:'time', label, previewCount:0 });
  };

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

  const editorContracts = await page.evaluate(() => {
    // Include the initially archived shipped habit in this render-only contract probe.
    // The editor intentionally reads active HABITS; do not inspect a stale preceding row.
    const activeHabits = HABITS;
    HABITS = ALL_HABITS.slice();
    try {
      return DEFAULT_HABITS.map(habit => {
    editingHabitId = habit.id;
    const rendered = renderHabitEditorForm(habit.id);
    const row = document.querySelector('#habitEditorBody .edit-habit');
    return {
      id:habit.id,
      rendered:rendered !== false && row?.dataset.id === habit.id,
      titleCount:row.querySelectorAll('.eh-system-title').length,
      editableTitleCount:row.querySelectorAll('input.eh-text[type="text"], textarea.eh-text:not([readonly])').length,
      visibleRhythmEditors:[...row.querySelectorAll('.eh-rhythm-block')].filter(element => !element.hidden).length,
      readOnlyIdentity:(() => { const n = row.querySelector('.eh-system-name .eh-text'); return n?.tagName === 'TEXTAREA' && n.readOnly && !n.hidden && n.value === HABITS.find(h => h.id === habit.id).text; })(),
      managedCue:(() => {
        const h = HABITS.find(h => h.id === habit.id), cue = normalizeRhythmConfig(h.rhythm), block = row.querySelector('.eh-system-anchor');
        const selector = block?.querySelector('.eh-rhythm'), threshold = block?.querySelector('.eh-rhythm-threshold'), note = block?.querySelector('.eh-rhythm-note');
        return selector?.disabled && selector.value === (cue?.type || 'none') && threshold?.readOnly && threshold.value === String(cue?.threshold ?? '') && note?.readOnly && note.value === (cue?.note || '').replace(/\r\n?/g, '\n') && !!row.querySelector('.eh-system-notice')?.textContent.includes('managed by Wavelength');
      })(),
      anchorCount:row.querySelectorAll('.eh-system-anchor').length,
      hasWeight:!!row.querySelector('.eh-weight'),
      previewCount:row.querySelectorAll('.eh-system-target').length,
      labeledParameters:Object.entries(SYSTEM_HABIT_PARAMETER_DEFS[habit.id] || {}).every(([key, field]) => {
        const h = HABITS.find(h => h.id === habit.id);
        const control = row.querySelector(`.eh-param-${key}`);
        const expected = String(h.params?.[key] ?? field.default);
        if (key === 'durationMinutes') {
          const duration = row.querySelector('.eh-duration-minutes');
          const resolved = resolveSharedHabitDuration(h, habitCatalogState.fieldSettings?.find(e => e.habitId === h.id));
          return !control && duration?.type === 'number' && duration.value === String(resolved.minutes ?? '') && duration.closest('label').querySelector('span').textContent === 'Duration';
        }
        if (['hydrate','gratitude'].includes(habit.id)) {
          const config = normalizeMeasurementConfig(h);
          return !control && row.querySelector('.eh-measurement').value === config.type && row.querySelector('.eh-target').value === String(h.target ?? '') && !!row.querySelector('[data-field-resolution="keep-tracking"]') && row.querySelector('.eh-field-review').textContent.includes(expected);
        }
        if (habit.id === 'dinner' && key === 'targetTime') return !control && !!row.querySelector('[data-field-resolution="keep-deadline"]') && row.querySelector('.eh-field-review').textContent.includes(expected);
        return !!control && !control.hidden && control.closest('label.eh-param-field')?.querySelector('span')?.textContent === field.label && control.value === expected;
      }),
    };
      });
    } finally { HABITS = activeHabits; }
  });
  assert.equal(editorContracts.length, await page.evaluate(() => DEFAULT_HABITS.length));
  assert.ok(editorContracts.every(result => result.rendered), 'every shipped habit is actually rendered rather than reusing an earlier row');
  assert.ok(editorContracts.every(result => result.titleCount === 1), 'every shipped habit has a locked title');
  assert.ok(editorContracts.every(result => result.editableTitleCount === 0), 'system habits expose no editable title field');
  assert.ok(editorContracts.every(result => result.readOnlyIdentity), 'every system name is present in the shared read-only textarea with its actual value');
  assert.ok(editorContracts.every(result => result.visibleRhythmEditors === 1 && result.managedCue), 'system cues show actual values in a disabled selector and read-only threshold/message with a managed explanation');
  assert.ok(editorContracts.every(result => result.anchorCount === 1), 'system anchors remain visible as summaries');
  assert.ok(editorContracts.every(result => !result.hasWeight), 'obsolete weight selector is absent');
  assert.ok(editorContracts.every(result => result.previewCount === 0), 'no system editor repeats the target in a summary');
  assert.ok(editorContracts.every(result => result.labeledParameters), 'clock parameters retain exact values; retired parameters expose shared controls and explicit legacy review');

  await openEditor('wake');
  await page.evaluate(() => {
    const wake = document.querySelector('#habitEditorBody .eh-param-targetTime');
    wake.value = '07:45';
    wake.dispatchEvent(new Event('input', { bubbles:true }));
    wake.dispatchEvent(new Event('change', { bubbles:true }));
  });
  await assertTimeEditor('Wake', '07:45');
  await page.evaluate(() => {
    const wake = document.querySelector('#habitEditorBody .eh-param-targetTime');
    wake.value = '08:00';
    wake.dispatchEvent(new Event('change', { bubbles:true }));
  });
  await assertTimeEditor('Wake', '08:00');
  const discardDialog = new Promise((resolve, reject) => {
    page.once('dialog', async dialog => {
      try {
        assert.equal(dialog.message(), 'Discard unsaved changes?');
        await dialog.accept();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
  await activate('#habitEditorBack');
  await discardDialog;
  await page.waitForFunction(() => !document.getElementById('manageCategoryView').hidden);

  await openEditor('sleep');
  await page.evaluate(() => { document.querySelector('#habitEditorBody .eh-param-targetTime').value = '23:30'; });
  await activate('#habitEditorSave');
  await page.waitForFunction(() => !document.getElementById('manageCategoryView').hidden);
  await openEditor('sleep');
  const saved = await page.evaluate(() => {
    const overrides = JSON.parse(localStorage.getItem('wavelength_wpb_habits'));
    const row = document.querySelector('#habitEditorBody .edit-habit');
    return {
      title:row.querySelector('.eh-system-name .eh-text').value,
      time:row.querySelector('.eh-param-targetTime').value,
      stored:overrides.sleep,
      rhythmVisible:!row.querySelector('.eh-rhythm-block').hidden,
      width:document.documentElement.scrollWidth,
      viewport:innerWidth,
    };
  });
  assert.equal(saved.title, 'In bed');
  await assertTimeEditor('In bed', '23:30', 'Bedtime');
  assert.equal(saved.time, '23:30');
  assert.deepEqual(saved.stored, { params:{ targetTime:'23:30' } });
  assert.equal(saved.rhythmVisible, true, 'saved system cues remain visible in the shared field order');
  assert.ok(saved.width <= saved.viewport, 'focused editor has no horizontal overflow');
  await page.screenshot({ path:SHOT, fullPage:false });

  await page.evaluate(() => {
    localStorage.setItem('wavelength_wpb_habits', JSON.stringify({ sleep:{ text:'Sleep when the moon feels right' } }));
  });
  await page.reload({ waitUntil:'networkidle0' });
  await openEditor('sleep');
  assert.equal(await page.$eval('#habitEditorBody .eh-system-title', element => element.querySelector('.eh-system-name .eh-text').value), 'Sleep when the moon feels right');
  await activate('#habitEditorSave');
  await openEditor('sleep');
  assert.deepEqual(await page.evaluate(() => ({
    title:document.querySelector('#habitEditorBody .eh-system-name .eh-text').value,
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
  assert.equal(await page.$eval('#habitEditorBody .eh-system-title', element => element.querySelector('.eh-system-name .eh-text').value), 'A legacy affirming phrase');
  await activate('#habitEditorSave');
  await openEditor('affirm');
  assert.deepEqual(await page.evaluate(() => ({
    title:document.querySelector('#habitEditorBody .eh-system-name .eh-text').value,
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
      title:row.querySelector('.eh-system-name .eh-text').value,
      time:row.querySelector('.eh-param-targetTime').value,
      grandfathered:row.dataset.grandfatheredTitle,
      stored:JSON.parse(localStorage.getItem('wavelength_wpb_habits')).wake,
    };
  });
  assert.match(legacyWake.toast, /Backup imported/);
  assert.equal(legacyWake.title, 'Wake');
  await assertTimeEditor('Wake', '07:30');
  assert.equal(legacyWake.time, '07:30');
  assert.equal(legacyWake.grandfathered, 'false');
  assert.deepEqual(legacyWake.stored, { params:{ targetTime:'07:30' } });
  await page.evaluate(() => {
    const wake = document.querySelector('#habitEditorBody .eh-param-targetTime');
    wake.value = '07:45';
    wake.dispatchEvent(new Event('change', { bubbles:true }));
  });
  await assertTimeEditor('Wake', '07:45');

  assert.deepEqual(errors, []);
  console.log(`system habit parameters 390px ${THEME} Edge flow passed`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
