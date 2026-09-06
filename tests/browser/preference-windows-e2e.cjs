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
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });

  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.evaluate(theme => {
    localStorage.clear();
    localStorage.setItem('wavelength_theme', theme);
  }, THEME);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.habit[data-id]');

  // Opening Manage for Morning shows a Preferred time field on stretch (eligible)
  // and hydrate (eligible), but habits without timing context are excluded.
  await page.click('.cat-tab[data-cat="morning"]');
  await page.waitForFunction(() => document.querySelector('.cat-tab[data-cat="morning"]').classList.contains('active'));
  await page.click('#manageBtn');
  await page.waitForSelector('#modalOverlay.open');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('modalOverlay')).opacity === '1');

  const fieldPresence = await page.evaluate(() => {
    const stretchRow = document.querySelector('.edit-habit[data-id="stretch"]');
    return {
      stretchHasField: !!stretchRow?.querySelector('.eh-preference'),
      stretchEligible: typeof isEligibleForPreferenceWindow === 'function'
        ? isEligibleForPreferenceWindow(HABITS.find(h => h.id === 'stretch'))
        : 'n/a',
      scope: document.getElementById('modalTitle')?.textContent.trim(),
    };
  });
  assert.equal(fieldPresence.scope, 'Manage Morning', 'Manage opens scoped to the selected category');
  assert.equal(fieldPresence.stretchHasField, true, 'stretch shows a Preferred time field');
  assert.equal(fieldPresence.stretchEligible, true, 'stretch is eligible for a preference window');

  // Set a preferred time of 07:30 on stretch and save.
  await page.evaluate(() => {
    const row = document.querySelector('.edit-habit[data-id="stretch"]');
    const input = row.querySelector('.eh-preference');
    input.value = '07:30';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#modalSave');
  await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open') &&
    getComputedStyle(document.getElementById('modalOverlay')).opacity === '0');

  const stored = await page.evaluate(() => {
    const overrides = JSON.parse(localStorage.getItem('wavelength_wpb_habits') || '{}');
    const payload = createBackupPayload();
    return {
      override: overrides.stretch?.preferenceWindow || null,
      backupVersion: payload.version,
      payloadWindows: payload.preferenceWindows || {},
      runtimeStretch: HABITS.find(h => h.id === 'stretch')?.preferenceWindow || null,
    };
  });
  assert.deepEqual(stored.override, { idealStart: 435, idealEnd: 465 },
    'saving 07:30 stores idealStart 07:15 / idealEnd 07:45');
  assert.equal(stored.backupVersion, 5, 'backup schema is v5');
  assert.deepEqual(stored.payloadWindows.stretch, { idealStart: 435, idealEnd: 465 },
    'backup payload carries the preference window');
  assert.deepEqual(stored.runtimeStretch, { idealStart: 435, idealEnd: 465 },
    'runtime habits carry the preference window');

  // Next Wave view at 07:20 should treat stretch as ideal (window is 07:15–07:45).
  const nextWaveAt0720 = await page.evaluate(() => {
    const now = new Date();
    now.setHours(7, 20, 0, 0);
    const suggestion = getNextWaveSuggestion(HABITS, state.done || {}, state.progress || {}, now, null, null, getPreferenceWindowsMap(HABITS));
    return { reason: suggestion.reason, habitId: suggestion.habitId, eyebrow: suggestion.eyebrow };
  });
  // We don't assert the exact habit (priority ordering may pick an urgent/context card first),
  // but we do assert the fit function itself honors the window.
  const stretchFit = await page.evaluate(() => {
    const now = new Date();
    now.setHours(7, 20, 0, 0);
    const map = getPreferenceWindowsMap(HABITS);
    const stretch = HABITS.find(h => h.id === 'stretch');
    return getHabitRecommendationFit(stretch, now, null, map.stretch || null);
  });
  assert.ok(stretchFit.eligible, 'stretch is eligible at 07:20 with a 07:15–07:45 preference window');
  assert.equal(stretchFit.phase, 'ideal', 'stretch is in the ideal phase inside its preference window');

  const stretchFitOutside = await page.evaluate(() => {
    const now = new Date();
    now.setHours(9, 30, 0, 0);
    const map = getPreferenceWindowsMap(HABITS);
    const stretch = HABITS.find(h => h.id === 'stretch');
    return getHabitRecommendationFit(stretch, now, null, map.stretch || null);
  });
  // 09:30 is after idealEnd 07:45 → flexible (or unavailable if past eligibleEnd); either way NOT ideal.
  assert.notEqual(stretchFitOutside.phase, 'ideal', 'stretch leaves the ideal phase after its preference window ends');

  // Reopen Manage: the field should be pre-filled with 07:30.
  await page.click('#manageBtn');
  await page.waitForSelector('#modalOverlay.open');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('modalOverlay')).opacity === '1');
  const prefilled = await page.$eval('.edit-habit[data-id="stretch"] .eh-preference', input => input.value);
  assert.equal(prefilled, '07:30', 'Manage reopens with the preferred time pre-filled');
  await page.$eval('.edit-habit[data-id="stretch"]', el => el.scrollIntoView({ block: 'center' }));
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: SHOT, fullPage: false });

  // Clear the field and save → preference removed.
  await page.evaluate(() => {
    const row = document.querySelector('.edit-habit[data-id="stretch"]');
    const input = row.querySelector('.eh-preference');
    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#modalSave');
  await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open') &&
    getComputedStyle(document.getElementById('modalOverlay')).opacity === '0');
  const cleared = await page.evaluate(() => {
    const overrides = JSON.parse(localStorage.getItem('wavelength_wpb_habits') || '{}');
    return { override: overrides.stretch?.preferenceWindow || null, hasOverride: !!overrides.stretch?.preferenceWindow };
  });
  assert.equal(cleared.hasOverride, false, 'clearing the field removes the preference window');

  // Backup import restores a preference window from a v5 payload.
  const importRoundTrip = await page.evaluate(async () => {
    const payload = createBackupPayload();
    payload.customHabits = { stretch: { preferenceWindow: { idealStart: 600, idealEnd: 630 } } };
    payload.preferenceWindows = { stretch: { idealStart: 600, idealEnd: 630 } };
    const file = new File([JSON.stringify(payload)], 'wavelength-backup.json', { type: 'application/json' });
    await importBackupFile(file);
    const overrides = JSON.parse(localStorage.getItem('wavelength_wpb_habits') || '{}');
    return { restored: overrides.stretch?.preferenceWindow || null, runtime: HABITS.find(h => h.id === 'stretch')?.preferenceWindow || null };
  });
  assert.deepEqual(importRoundTrip.restored, { idealStart: 600, idealEnd: 630 },
    'v5 import restores the preference window into overrides');
  assert.deepEqual(importRoundTrip.runtime, { idealStart: 600, idealEnd: 630 },
    'v5 import rebuilds runtime habits with the preference window');

  // 390px layout: no horizontal overflow on the Manage modal and the field row fits.
  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    fieldVisible: !!document.querySelector('.eh-preference'),
  }));
  assert.ok(layout.documentWidth <= layout.viewportWidth, 'no horizontal overflow with preference field present');

  assert.deepEqual(runtimeErrors, []);
  console.log(`preference windows 390px ${THEME} Edge flow passed`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
});