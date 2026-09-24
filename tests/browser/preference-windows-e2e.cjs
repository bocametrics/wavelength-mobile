const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8778';
const URL = process.env.WAVELENGTH_URL || `${ORIGIN}/?preference-windows-e2e=local`;
const THEME = process.env.WAVELENGTH_THEME || 'light';
const SHOT = process.env.WAVELENGTH_SHOT || 'C:\\Temp\\wavelength-preference-windows.png';
let browser;

(async () => {
  browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width:390, height:844, deviceScaleFactor:3, isMobile:true, hasTouch:true });
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`); });
  await page.goto(URL, { waitUntil:'networkidle0' });
  await page.evaluate(theme => { localStorage.clear(); localStorage.setItem('wavelength_theme', theme); }, THEME);
  await page.reload({ waitUntil:'networkidle0' });
  await page.waitForSelector('.habit[data-id]');

  const openStretch = async () => {
    if (await page.$('#habitEditorView:not([hidden])')) return;
    if (!await page.$('#manageCategoryView:not([hidden])')) {
      await page.click('#manageBtn');
      await page.waitForFunction(() => !document.getElementById('manageCategoryView').hidden);
    }
    await page.click('#manageCategoryList [data-habit-id="stretch"] .manage-habit-row-button');
    await page.waitForFunction(() => !document.getElementById('habitEditorView').hidden);
  };

  await page.click('.cat-tab[data-cat="morning"]');
  await page.waitForFunction(() => document.querySelector('.cat-tab[data-cat="morning"]').classList.contains('active'));
  await openStretch();
  const fieldPresence = await page.evaluate(() => {
    const row = document.querySelector('#habitEditorBody .edit-habit');
    return {
      hasField:!!row?.querySelector('.eh-preference'),
      eligible:isEligibleForPreferenceWindow(HABITS.find(habit => habit.id === 'stretch')),
      heading:document.getElementById('habitEditorHeading').textContent.trim(),
    };
  });
  assert.deepEqual(fieldPresence, { hasField:true, eligible:true, heading:'Mobility' });

  await page.evaluate(() => {
    const input = document.querySelector('#habitEditorBody .eh-preference');
    input.value = '07:30';
    input.dispatchEvent(new Event('change', { bubbles:true }));
  });
  await page.click('#habitEditorSave');
  await page.waitForFunction(() => !document.getElementById('manageCategoryView').hidden);
  const stored = await page.evaluate(() => {
    const overrides = JSON.parse(localStorage.getItem('wavelength_wpb_habits') || '{}');
    const payload = createBackupPayload();
    return {
      override:overrides.stretch?.preferenceWindow || null,
      backupVersion:payload.version,
      payloadOverride:payload.customHabits.stretch?.preferenceWindow || null,
      runtimeStretch:HABITS.find(habit => habit.id === 'stretch')?.preferenceWindow || null,
    };
  });
  assert.deepEqual(stored, {
    override:{ idealStart:435, idealEnd:465 }, backupVersion:7,
    payloadOverride:{ idealStart:435, idealEnd:465 }, runtimeStretch:{ idealStart:435, idealEnd:465 },
  });

  const stretchFit = await page.evaluate(() => {
    const now = new Date(); now.setHours(7, 20, 0, 0);
    const map = getPreferenceWindowsMap(HABITS);
    return getHabitRecommendationFit(HABITS.find(habit => habit.id === 'stretch'), now, null, map.stretch);
  });
  assert.equal(stretchFit.eligible, true);
  assert.equal(stretchFit.phase, 'ideal');

  await openStretch();
  assert.equal(await page.$eval('#habitEditorBody .eh-preference', input => input.value), '07:30');
  await page.screenshot({ path:SHOT, fullPage:false });
  await page.evaluate(() => {
    const input = document.querySelector('#habitEditorBody .eh-preference');
    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles:true }));
  });
  await page.click('#habitEditorSave');
  await page.waitForFunction(() => !document.getElementById('manageCategoryView').hidden);
  assert.equal(await page.evaluate(() => !!JSON.parse(localStorage.getItem('wavelength_wpb_habits') || '{}').stretch?.preferenceWindow), false);

  const importRoundTrip = await page.evaluate(async () => {
    const payload = createBackupPayload();
    payload.version = 5;
    delete payload.categoryState;
    payload.customHabits = { stretch:{ preferenceWindow:{ idealStart:600, idealEnd:630 } } };
    payload.preferenceWindows = { stretch:{ idealStart:600, idealEnd:630 } };
    await importBackupFile({ text:async () => JSON.stringify(payload) });
    const overrides = JSON.parse(localStorage.getItem('wavelength_wpb_habits') || '{}');
    return { restored:overrides.stretch?.preferenceWindow || null, runtime:HABITS.find(habit => habit.id === 'stretch')?.preferenceWindow || null };
  });
  assert.deepEqual(importRoundTrip, {
    restored:{ idealStart:600, idealEnd:630 }, runtime:{ idealStart:600, idealEnd:630 },
  }, 'v5 import restores matching preference windows');

  await page.evaluate(() => openHabitEditorPage('stretch'));
  await page.waitForFunction(() => !document.getElementById('habitEditorView').hidden);
  const layout = await page.evaluate(() => ({ documentWidth:document.documentElement.scrollWidth, viewportWidth:innerWidth, fieldVisible:!!document.querySelector('.eh-preference') }));
  assert.equal(layout.fieldVisible, true);
  assert.ok(layout.documentWidth <= layout.viewportWidth, 'full-page editor has no horizontal overflow');
  assert.deepEqual(runtimeErrors, []);
  console.log(`preference windows 390px ${THEME} Edge flow passed`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
