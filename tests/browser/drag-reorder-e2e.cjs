const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8778';
const URL = process.env.WAVELENGTH_URL || `${ORIGIN}/?drag-reorder-e2e=local`;
const SHOT_DIR = process.env.WAVELENGTH_SHOT_DIR || 'C:\\Temp';
const THEME = process.env.WAVELENGTH_THEME || 'dark';
const IS_MOBILE = process.env.WAVELENGTH_IS_MOBILE !== '0';
let browser;

(async () => {
  browser = await puppeteer.launch({
    executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless:true,
    args:['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width:IS_MOBILE ? 390 : 1280, height:IS_MOBILE ? 844 : 800, deviceScaleFactor:IS_MOBILE ? 3 : 1, isMobile:IS_MOBILE, hasTouch:IS_MOBILE });
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`); });
  await page.goto(URL, { waitUntil:'networkidle0' });
  await page.evaluate(theme => { localStorage.clear(); localStorage.setItem('wavelength_theme', theme); }, THEME);
  await page.reload({ waitUntil:'networkidle0' });
  await page.waitForSelector('.habit[data-id]');

  await page.click('#manageCategoriesBtn');
  await page.waitForFunction(() => !document.getElementById('categoriesView').hidden);
  const categoryOrderBefore = await page.evaluate(() => categoryState.order.slice());
  assert.equal(await page.$('#categoriesList [data-category-id="all"] .category-grip'), null, 'All has no category reorder grip');
  await page.focus('#categoriesList [data-category-id="morning"] .category-grip');
  await page.keyboard.press('ArrowDown');
  const categoryOrderAfter = await page.evaluate(() => JSON.parse(localStorage.getItem(CATEGORY_STATE_KEY)).order);
  assert.notDeepEqual(categoryOrderAfter, categoryOrderBefore, 'category grip keyboard reorder persists');

  await page.click('#categoriesList [data-category-id="movement"] .category-row-button');
  await page.waitForFunction(() => document.getElementById('manageCategoryHeading').textContent === 'Manage Movement');
  const rows = await page.$$('#manageCategoryList .manage-habit-row');
  assert.ok(rows.length >= 2, 'Movement has enough habits for scoped reorder');
  const before = await page.evaluate(() => ({
    order:userOrder.slice(),
    ids:[...document.querySelectorAll('#manageCategoryList .manage-habit-row')].map(row => row.dataset.habitId),
  }));
  const rowBody = await page.$eval('#manageCategoryList .manage-habit-row-button', button => ({ x:button.getBoundingClientRect().x, y:button.getBoundingClientRect().y }));
  await page.click('#manageCategoryList .manage-habit-row-button');
  await page.waitForFunction(() => !document.getElementById('habitEditorView').hidden);
  await page.click('#habitEditorBack');
  await page.waitForFunction(() => !document.getElementById('manageCategoryView').hidden);
  await page.focus('#manageCategoryList .manage-habit-row .manage-habit-grip');
  await page.keyboard.press('ArrowDown');
  const after = await page.evaluate(() => ({
    order:JSON.parse(localStorage.getItem(ORDER_KEY)),
    ids:[...document.querySelectorAll('#manageCategoryList .manage-habit-row')].map(row => row.dataset.habitId),
    width:document.documentElement.scrollWidth,
    viewport:innerWidth,
    bodyPoint:document.querySelector('#manageCategoryList .manage-habit-row-button').getBoundingClientRect().x,
  }));
  assert.notDeepEqual(after.ids, before.ids, 'habit grip reorders only the active category list');
  assert.notDeepEqual(after.order, before.order, 'scoped habit reorder persists canonical order');
  assert.equal(after.bodyPoint, rowBody.x, 'grip use does not shift the row navigation target');
  assert.ok(after.width <= after.viewport, 'management reorder introduces no horizontal overflow');
  await page.screenshot({ path:`${SHOT_DIR}\\wavelength-category-drag-${IS_MOBILE ? 'mobile' : 'desktop'}-${THEME}.png`, fullPage:false });
  assert.deepEqual(runtimeErrors, []);
  console.log(`category grip reorder ${IS_MOBILE ? 'mobile' : 'desktop'} ${THEME} Edge flow passed`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
