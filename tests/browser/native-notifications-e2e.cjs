const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8784';
const URL = process.env.WAVELENGTH_URL || `${ORIGIN}/?native-notifications-e2e=local`;
const SHOT_DIR = process.env.WAVELENGTH_SHOT_DIR || 'C:\\Temp';
const THEME = process.env.WAVELENGTH_THEME || 'light';
let browser;

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

(async () => {
  browser = await puppeteer.launch({
    executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless:true,
    args:['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width:390, height:844, deviceScaleFactor:1 });
  const errors = collectErrors(page);
  await page.evaluateOnNewDocument(() => {
    const calls = { checked:0, requested:0, scheduled:[], cancelled:[], action:null };
    window.__nativeNotificationCalls = calls;
    window.WavelengthNative = {
      isNative:true,
      platform:'ios',
      notifications:{
        checkPermissions: async () => { calls.checked += 1; return { display:'granted' }; },
        requestPermissions: async () => { calls.requested += 1; return { display:'granted' }; },
        schedule: async payload => { calls.scheduled.push(payload); return {}; },
        cancel: async payload => { calls.cancelled.push(payload); return {}; },
        addActionListener: async callback => { calls.action = callback; return { remove:async () => {} }; },
      },
    };
  });
  await page.goto(URL, { waitUntil:'networkidle0' });
  await page.evaluate(theme => {
    localStorage.clear();
    localStorage.setItem('wavelength_theme', theme);
  }, THEME);
  await page.reload({ waitUntil:'networkidle0' });

  await page.click('#navSettings');
  await page.waitForFunction(() => !document.getElementById('nativeNotificationCard').hidden);
  const initial = await page.evaluate(() => ({
    enabled:document.getElementById('nextWaveNotificationsEnabled').checked,
    time:document.getElementById('nextWaveNotificationTime').value,
    status:document.getElementById('nativeNotificationStatus').textContent,
    calls:window.__nativeNotificationCalls,
    width:{ document:document.documentElement.scrollWidth, viewport:innerWidth },
  }));
  assert.equal(initial.enabled, false);
  assert.equal(initial.time, '09:00');
  assert.equal(initial.calls.requested, 0, 'launch does not prompt for notification permission');
  assert.equal(initial.calls.scheduled.length, 0, 'disabled reminders schedule nothing');
  assert.equal(initial.width.document, initial.width.viewport, JSON.stringify(initial.width));

  const reminderTime = await page.evaluate(() => {
    const now = new Date();
    const nextHour = (now.getHours() + 1) % 24;
    return `${String(nextHour).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  await page.$eval('#nextWaveNotificationTime', (element, value) => {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles:true }));
  }, reminderTime);
  await page.click('label[for="nextWaveNotificationsEnabled"]');
  await page.waitForFunction(() => window.__nativeNotificationCalls.requested === 1 && window.__nativeNotificationCalls.scheduled.length === 1);

  const enabled = await page.evaluate(() => ({
    enabled:document.getElementById('nextWaveNotificationsEnabled').checked,
    time:document.getElementById('nextWaveNotificationTime').value,
    status:document.getElementById('nativeNotificationStatus').textContent,
    calls:window.__nativeNotificationCalls,
  }));
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.time, reminderTime);
  assert.match(enabled.status, /^Daily at \d{1,2}:\d{2} [AP]M$/);
  assert.ok(enabled.calls.scheduled[0].notifications.length >= 13 && enabled.calls.scheduled[0].notifications.length <= 14);
  assert.ok(enabled.calls.scheduled[0].notifications.every(request =>
    request.title === 'Your next wave is ready' &&
    request.body === 'Open Wavelength for one useful next step.' &&
    request.extra.route === 'home'
  ));

  await page.click('#navInsights');
  await page.waitForFunction(() => !document.getElementById('insightsView').hidden);
  await page.evaluate(() => window.__nativeNotificationCalls.action({ notification:{ extra:{ route:'home' } } }));
  await page.waitForFunction(() => !document.getElementById('homeView').hidden);
  const route = await page.evaluate(() => document.getElementById('navHome').getAttribute('aria-current'));
  assert.equal(route, 'page', 'tapping a native reminder returns to Home');

  await page.click('#navSettings');
  await page.$eval('#nativeNotificationCard', element => element.scrollIntoView({ block:'center' }));
  await page.waitForFunction(() => getComputedStyle(document.getElementById('nativeNotificationCard')).opacity === '1');
  await page.screenshot({ path:path.join(SHOT_DIR, `wavelength-native-notifications-${THEME}.png`) });
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log(`native notification 390px ${THEME} Edge flow passed`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
});
