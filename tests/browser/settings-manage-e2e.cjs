const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8778';
const URL = process.env.WAVELENGTH_URL || `${ORIGIN}/?settings-manage-e2e=local`;
const THEME = process.env.WAVELENGTH_THEME || 'light';
const SETTINGS_SHOT = process.env.WAVELENGTH_SETTINGS_SHOT || 'C:\\Temp\\wavelength-settings.png';
const MANAGE_SHOT = process.env.WAVELENGTH_MANAGE_SHOT || 'C:\\Temp\\wavelength-manage-hygiene.png';
const HOME_SHOT = process.env.WAVELENGTH_HOME_SHOT || 'C:\\Temp\\wavelength-home-greeting.png';
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
  page.on('console', message => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });

  await page.goto(URL, { waitUntil:'networkidle0' });
  await page.evaluate(theme => {
    localStorage.clear();
    localStorage.setItem('wavelength_theme', theme);
  }, THEME);
  await page.reload({ waitUntil:'networkidle0' });
  await page.waitForSelector('.habit[data-id]');

  // Category-scoped Manage opens as a full-screen page and preserves Home scope.
  await page.click('.cat-tab[data-cat="hygiene"]');
  await page.waitForFunction(() => document.querySelector('.cat-tab[data-cat="hygiene"]').classList.contains('active'));
  const expectedHygiene = await page.evaluate(() => HABITS.filter(habit => habit.cat === 'hygiene').map(habit => habit.id));
  assert.ok(expectedHygiene.length > 0, 'test fixture has Hygiene habits');
  await page.click('#manageBtn');
  await page.waitForFunction(() => !document.getElementById('manageCategoryView').hidden);
  let managed = await page.evaluate(() => ({
    title:document.getElementById('manageCategoryHeading')?.textContent.trim(),
    ids:[...document.querySelectorAll('#manageCategoryList .manage-habit-row')].map(row => row.dataset.habitId),
    dock:getComputedStyle(document.querySelector('.app-dock')).display,
    hasAppearance:!!document.querySelector('#manageCategoryView .appearance-tools'),
    hasDataTools:!!document.querySelector('#manageCategoryView .data-tools'),
  }));
  assert.equal(managed.title, 'Manage Hygiene');
  assert.deepEqual(managed.ids, expectedHygiene);
  assert.equal(managed.dock, 'none', 'management pages hide the primary dock');
  assert.equal(managed.hasAppearance, false, 'Appearance is not inside Manage');
  assert.equal(managed.hasDataTools, false, 'backup controls are not inside Manage');
  await page.screenshot({ path:MANAGE_SHOT, fullPage:false });

  await page.click('#manageCategoryBack');
  await page.waitForFunction(() => document.documentElement.dataset.managementOpen !== 'true');
  const preservedHomeCategory = await page.evaluate(() => ({
    currentCat,
    hygieneActive:document.querySelector('.cat-tab[data-cat="hygiene"]').classList.contains('active'),
  }));
  assert.deepEqual(preservedHomeCategory, { currentCat:'hygiene', hygieneActive:true },
    'returning from Manage preserves the Home category');

  // A focused reset must never clear other habits or move the edited habit.
  await page.evaluate(() => {
    localStorage.setItem(CUSTOM_HABITS_KEY, JSON.stringify({
      wake:{ note:'Keep morning' },
      floss:{ note:'Reset hygiene' },
    }));
    reloadHabits();
    renderHabits();
  });
  await page.click('#manageBtn');
  await page.waitForFunction(() => !document.getElementById('manageCategoryView').hidden);
  await page.click('#manageCategoryList [data-habit-id="floss"] .manage-habit-row-button');
  await page.waitForFunction(() => !document.getElementById('habitEditorView').hidden);
  assert.equal(await page.$eval('#habitEditorReset', button => button.textContent.trim()), 'Reset habit defaults');
  await page.click('#habitEditorReset');
  await page.waitForFunction(() => !document.getElementById('habitEditorView').hidden);
  const overridesAfterScopedReset = await page.evaluate(() => JSON.parse(localStorage.getItem(CUSTOM_HABITS_KEY) || '{}'));
  assert.deepEqual(overridesAfterScopedReset, { wake:{ note:'Keep morning' } },
    'focused reset preserves every other habit override');
  await page.waitForFunction(() => !document.getElementById('toast').classList.contains('show'), { timeout:4000 });
  await page.click('#habitEditorBack');
  await page.waitForFunction(() => !document.getElementById('manageCategoryView').hidden);
  await page.click('#manageCategoryBack');
  await page.waitForFunction(() => document.documentElement.dataset.managementOpen !== 'true');

  // With no stored name, Home uses the calm non-personal default.
  const defaultGreeting = await page.$eval('#greeting', element => element.textContent);
  assert.match(defaultGreeting, /^Good (morning|afternoon|evening|night), Friend [☀️🌤️🌙]+$/);

  // Settings is a third accessible dock destination and owns profile, appearance, and transfer controls.
  await page.click('#navSettings');
  await page.waitForFunction(() => !document.getElementById('settingsView').hidden);
  const settings = await page.evaluate(() => ({
    homeHidden:document.getElementById('homeView').hidden,
    insightsHidden:document.getElementById('insightsView').hidden,
    settingsHidden:document.getElementById('settingsView').hidden,
    selected:document.getElementById('navSettings').getAttribute('aria-selected'),
    nameInput:!!document.getElementById('firstNameInput'),
    appearance:!!document.querySelector('#settingsView .appearance-tools'),
    dataTools:!!document.querySelector('#settingsView .data-tools'),
    dockButtons:[...document.querySelectorAll('.app-dock .dock-button')].map(button => ({
      id:button.id,
      height:Math.round(button.getBoundingClientRect().height),
    })),
  }));
  assert.equal(settings.homeHidden, true);
  assert.equal(settings.insightsHidden, true);
  assert.equal(settings.settingsHidden, false);
  assert.equal(settings.selected, 'true');
  assert.equal(settings.nameInput, true);
  assert.equal(settings.appearance, true);
  assert.equal(settings.dataTools, true);
  assert.deepEqual(settings.dockButtons.map(button => button.id), ['navHome', 'navInsights', 'navSettings']);
  assert.ok(settings.dockButtons.every(button => button.height >= 48), 'all dock targets are at least 48px high');
  await page.screenshot({ path:SETTINGS_SHOT, fullPage:false });

  const firstName = 'Daria <b>safe</b>';
  await page.click('#firstNameInput', { clickCount:3 });
  await page.type('#firstNameInput', firstName);
  await page.$eval('#firstNameInput', input => input.dispatchEvent(new Event('change', { bubbles:true })));
  await page.waitForFunction(name => localStorage.getItem('wavelength_first_name') === name, {}, firstName);
  const safeGreeting = await page.$eval('#greeting', element => ({ text:element.textContent, hasBold:!!element.querySelector('b') }));
  assert.match(safeGreeting.text, /^Good (morning|afternoon|evening|night), Daria <b>safe<\/b> [☀️🌤️🌙]+$/);
  assert.equal(safeGreeting.hasBold, false, 'first name is rendered as text, never markup');
  const backupTransfer = await page.evaluate(async () => {
    const payload = createBackupPayload();
    const exportedFirstName = payload.firstName;
    payload.firstName = 'Ari';
    const file = new File([JSON.stringify(payload)], 'wavelength-backup.json', { type:'application/json' });
    await importBackupFile(file);
    return {
      version:payload.version,
      exportedFirstName,
      stored:localStorage.getItem('wavelength_first_name'),
      input:document.getElementById('firstNameInput').value,
    };
  });
  assert.deepEqual(backupTransfer, { version:6, exportedFirstName:firstName, stored:'Ari', input:'Ari' },
    'backup export/import round-trips First Name through the production import path');
  await page.click('#navHome');
  await page.waitForFunction(() => !document.getElementById('homeView').hidden);
  const greeting = await page.evaluate(() => {
    const element = document.getElementById('greeting');
    return {
      text:element.textContent,
      html:element.innerHTML,
      nameElement:element.querySelector('b'),
      stored:localStorage.getItem('wavelength_first_name'),
      scrollWidth:document.documentElement.scrollWidth,
      viewportWidth:window.innerWidth,
    };
  });
  assert.match(greeting.text, /^Good (morning|afternoon|evening|night), Ari [☀️🌤️🌙]+$/);
  assert.equal(greeting.nameElement, null, 'first name is rendered as text, never markup');
  assert.equal(greeting.stored, 'Ari');
  assert.ok(greeting.scrollWidth <= greeting.viewportWidth, 'Settings and Home introduce no horizontal overflow');

  await page.screenshot({ path:HOME_SHOT, fullPage:false });
  assert.deepEqual(runtimeErrors, []);
  console.log(`settings and scoped Manage 390px ${THEME} Edge flow passed`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
});
