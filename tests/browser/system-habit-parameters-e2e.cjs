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
  await page.click('#manageBtn');
  await page.waitForSelector('#modalOverlay.open');

  const initial = await page.evaluate(() => ({
    systemCount:DEFAULT_HABITS.length,
    titleCount:document.querySelectorAll('.eh-system-title').length,
    editableTitleCount:document.querySelectorAll('.edit-habit input.eh-text[type="text"]').length,
    visibleRhythmEditors:[...document.querySelectorAll('.eh-rhythm-block')].filter(el => !el.hidden).length,
    systemAnchorCount:document.querySelectorAll('.eh-system-anchor').length,
    hasWeight:!!document.querySelector('.eh-weight'),
    width:document.documentElement.scrollWidth,
    viewport:window.innerWidth,
  }));
  assert.equal(initial.titleCount, initial.systemCount, 'every shipped habit has a locked title');
  assert.equal(initial.editableTitleCount, 0, 'system habits expose no editable title field');
  assert.equal(initial.visibleRhythmEditors, 0, 'system anchors expose no editable controls');
  assert.equal(initial.systemAnchorCount, initial.systemCount, 'system anchors remain visible as summaries');
  assert.equal(initial.hasWeight, false, 'obsolete weight selector is absent');
  assert.ok(initial.width <= initial.viewport, 'Manage has no horizontal overflow');

  await page.evaluate(() => {
    const wake = document.querySelector('.edit-habit[data-id="wake"] .eh-param-targetTime');
    wake.value = '07:45';
    wake.dispatchEvent(new Event('input', { bubbles:true }));
    wake.dispatchEvent(new Event('change', { bubbles:true }));
  });
  assert.equal(
    await page.$eval('.edit-habit[data-id="wake"] .eh-system-title', el => el.textContent),
    'Wake at 7:45 AM',
    'changing a system parameter updates its locked title preview before saving',
  );
  await page.evaluate(() => {
    const wake = document.querySelector('.edit-habit[data-id="wake"] .eh-param-targetTime');
    wake.value = '08:00';
    wake.dispatchEvent(new Event('change', { bubbles:true }));
  });
  assert.equal(
    await page.$eval('.edit-habit[data-id="wake"] .eh-system-title', el => el.textContent),
    'Wake at 8:00 AM',
    'a native-picker change event also updates the title preview',
  );

  await page.evaluate(() => {
    const row = document.querySelector('.edit-habit[data-id="sleep"]');
    row.querySelector('.eh-param-targetTime').value = '23:30';
  });
  await page.click('#modalSave');
  await page.waitForSelector('#modalOverlay.open', { hidden:true });
  await page.click('#manageBtn');
  await page.waitForSelector('#modalOverlay.open');
  const saved = await page.evaluate(() => {
    const overrides = JSON.parse(localStorage.getItem('wavelength_wpb_habits'));
    const sleep = document.querySelector('.edit-habit[data-id="sleep"]');
    return {
      title:sleep.querySelector('.eh-system-title').textContent,
      time:sleep.querySelector('.eh-param-targetTime').value,
      stored:overrides.sleep,
      rhythmVisible:!sleep.querySelector('.eh-rhythm-block').hidden,
    };
  });
  assert.equal(saved.title, 'In bed by 11:30 PM', 'bedtime parameter regenerates the locked title');
  assert.equal(saved.time, '23:30', 'Manage reloads the saved canonical bedtime');
  assert.deepEqual(saved.stored, { params:{ targetTime:'23:30' } }, 'save stores only non-default structured params');
  assert.equal(saved.rhythmVisible, false, 'sleep anchor remains non-editable after reload');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.modal')).opacity === '1');
  await page.screenshot({ path:SHOT, fullPage:false });

  await page.click('#modalClose');
  await page.waitForSelector('#modalOverlay.open', { hidden:true });
  await page.evaluate(() => {
    localStorage.setItem('wavelength_wpb_habits', JSON.stringify({
      sleep:{ text:'Sleep when the moon feels right' },
    }));
  });
  await page.reload({ waitUntil:'networkidle0' });
  await page.click('#manageBtn');
  await page.waitForSelector('#modalOverlay.open');
  assert.equal(
    await page.$eval('.edit-habit[data-id="sleep"] .eh-system-title', el => el.textContent),
    'Sleep when the moon feels right',
    'unknown legacy title loads as a locked grandfathered label',
  );
  await page.click('#modalSave');
  await page.waitForSelector('#modalOverlay.open', { hidden:true });
  await page.click('#manageBtn');
  await page.waitForSelector('#modalOverlay.open');
  const grandfathered = await page.evaluate(() => ({
    title:document.querySelector('.edit-habit[data-id="sleep"] .eh-system-title').textContent,
    stored:JSON.parse(localStorage.getItem('wavelength_wpb_habits')).sleep,
  }));
  assert.equal(grandfathered.title, 'Sleep when the moon feels right',
    'unknown legacy title survives an unrelated Manage save and reopen');
  assert.deepEqual(grandfathered.stored, { text:'Sleep when the moon feels right' },
    'save preserves only the grandfathered unknown title override');

  const importVersions = await page.evaluate(async () => {
    const results = [];
    for (const version of [1, 2, 3]) {
      const payload = createBackupPayload();
      payload.version = version;
      if (version === 1) delete payload.insightHistory;
      await importBackupFile({ text:async () => JSON.stringify(payload) });
      results.push({ version, toast:document.getElementById('toast').textContent });
    }
    return results;
  });
  for (const result of importVersions) {
    assert.match(result.toast, /Backup imported/, `version-${result.version} backup imports successfully`);
  }
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('wavelength_wpb_habits')).sleep.text),
    'Sleep when the moon feels right',
    'backup imports retain the grandfathered unknown title',
  );

  const legacyWake = await page.evaluate(async () => {
    const payload = createBackupPayload();
    payload.version = 2;
    payload.customHabits.wake = { text:'Wake at 7:30 AM' };
    await importBackupFile({ text:async () => JSON.stringify(payload) });
    const row = document.querySelector('.edit-habit[data-id="wake"]');
    return {
      toast:document.getElementById('toast').textContent,
      title:row.querySelector('.eh-system-title').textContent,
      time:row.querySelector('.eh-param-targetTime').value,
      grandfathered:row.dataset.grandfatheredTitle,
      stored:JSON.parse(localStorage.getItem('wavelength_wpb_habits')).wake,
    };
  });
  assert.match(legacyWake.toast, /Backup imported/, 'version-2 wake-title backup imports');
  assert.equal(legacyWake.title, 'Wake at 7:30 AM', 'legacy wake title renders from migrated parameters');
  assert.equal(legacyWake.time, '07:30', 'legacy wake title populates the structured time control');
  assert.equal(legacyWake.grandfathered, 'false', 'recognized wake title is no longer treated as frozen custom prose');
  assert.deepEqual(legacyWake.stored, { params:{ targetTime:'07:30' } }, 'import stores canonical wake parameters, not text');
  await page.evaluate(() => {
    const wake = document.querySelector('.edit-habit[data-id="wake"] .eh-param-targetTime');
    wake.value = '07:45';
    wake.dispatchEvent(new Event('change', { bubbles:true }));
  });
  assert.equal(
    await page.$eval('.edit-habit[data-id="wake"] .eh-system-title', el => el.textContent),
    'Wake at 7:45 AM',
    'migrated wake title remains live when the parameter changes',
  );
  assert.deepEqual(errors, []);
  console.log(`system habit parameters 390px ${THEME} Edge flow passed`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
