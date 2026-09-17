const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const THEME = process.env.WAVELENGTH_THEME || 'light';
const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8791';
const URL = `${ORIGIN}/?category-personalization-e2e=local`;
const SHOT_DIR = process.env.WAVELENGTH_SHOT_DIR || 'C:\\Temp';

(async () => {
  const browser = await puppeteer.launch({
    executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless:true,
    args:['--no-sandbox', '--disable-gpu'],
  });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.stack || error.message));
    await page.setViewport({ width:390, height:844, deviceScaleFactor:3, isMobile:true, hasTouch:true });
    await page.goto(URL, { waitUntil:'networkidle0' });
    await page.evaluate(theme => {
      localStorage.clear();
      localStorage.setItem('wavelength_theme', theme);
    }, THEME);
    await page.reload({ waitUntil:'networkidle0' });

    const home = await page.evaluate(() => ({
      tabs:[...document.querySelectorAll('.cat-tab')].map(tab => tab.textContent),
      plus:!!document.getElementById('manageCategoriesBtn'),
      reorder:!!document.getElementById('reorderBtn'),
      width:{ document:document.documentElement.scrollWidth, viewport:innerWidth },
    }));
    assert.deepEqual(home.tabs, ['All','🌅 Morning','🏃 Movement','🧠 Mind','🥗 Fuel','🧼 Hygiene','🌙 Evening']);
    assert.equal(home.plus, true);
    assert.equal(home.reorder, false);
    assert.equal(home.width.document, home.width.viewport, JSON.stringify(home.width));

    await page.click('#manageCategoriesBtn');
    await page.waitForFunction(() => !document.getElementById('categoriesView').hidden);
    const categories = await page.evaluate(() => ({
      rows:[...document.querySelectorAll('#categoriesList .category-row-name')].map(node => node.textContent),
      lock:document.querySelector('#categoriesList [data-category-id="all"] .category-lock')?.textContent,
      allGrip:!!document.querySelector('#categoriesList [data-category-id="all"] .category-grip'),
      dock:getComputedStyle(document.querySelector('.app-dock')).display,
      width:{ document:document.documentElement.scrollWidth, viewport:innerWidth },
    }));
    assert.equal(categories.rows[0], 'All habits');
    assert.equal(categories.lock, '🔒');
    assert.equal(categories.allGrip, false);
    assert.equal(categories.dock, 'none');
    assert.equal(categories.width.document, categories.width.viewport, JSON.stringify(categories.width));
    await page.goBack();
    await page.waitForFunction(() => document.documentElement.dataset.managementOpen !== 'true');
    await page.goForward();
    await page.waitForFunction(() => !document.getElementById('categoriesView').hidden);

    await page.click('#newCategoryBtn');
    await page.waitForFunction(() => !document.getElementById('categoryEditorView').hidden);
    await page.type('#categoryNameInput', 'Recovery');
    await page.click('.category-icon-choice[data-icon-key="recovery"]');
    await page.click('#categoryEditorSave');
    await page.waitForFunction(() => document.getElementById('manageCategoryHeading').textContent === 'Manage Recovery');
    assert.match(await page.$eval('#manageCategoryList', node => node.textContent), /No habits are assigned/);
    assert.equal(await page.$eval('.archive-category-btn', button => button.disabled), false);

    await page.click('#manageCategoryBack');
    await page.waitForFunction(() => !document.getElementById('categoriesView').hidden);
    await page.click('#categoriesList [data-category-id="morning"] .category-row-button');
    await page.waitForFunction(() => document.getElementById('manageCategoryHeading').textContent === 'Manage Morning');
    await page.click('#manageCategoryList [data-habit-id="affirm"] .manage-habit-row-button');
    await page.waitForFunction(() => !document.getElementById('habitEditorView').hidden);
    const recoveryId = await page.evaluate(() => categoryState.definitions.find(category => category.name === 'Recovery').id);
    await page.select('#habitEditorBody .eh-category', recoveryId);
    let browserBackPrompts = 0;
    const dismissBrowserBack = async dialog => {
      browserBackPrompts += 1;
      await dialog.dismiss();
    };
    page.on('dialog', dismissBrowserBack);
    await page.evaluate(() => history.back());
    await new Promise(resolve => setTimeout(resolve, 500));
    page.off('dialog', dismissBrowserBack);
    assert.equal(browserBackPrompts, 1, 'declining browser Back prompts exactly once');
    assert.equal(await page.$eval('#habitEditorView', view => !view.hidden), true,
      'declining browser Back keeps the dirty editor open');
    page.once('dialog', dialog => dialog.dismiss());
    await page.click('#habitEditorBack');
    await page.waitForFunction(() => !document.getElementById('habitEditorView').hidden);
    assert.equal(await page.$eval('#habitEditorBody .eh-category', select => select.value), recoveryId,
      'Keep editing preserves the unsaved category move');
    page.once('dialog', dialog => dialog.accept());
    await page.click('#habitEditorBack');
    await page.waitForFunction(() => !document.getElementById('manageCategoryView').hidden);
    assert.ok(await page.$('#manageCategoryList [data-habit-id="affirm"]'), 'Discard keeps the habit in its prior category');
    await page.click('#manageCategoryList [data-habit-id="affirm"] .manage-habit-row-button');
    await page.waitForFunction(() => !document.getElementById('habitEditorView').hidden);
    await page.select('#habitEditorBody .eh-category', recoveryId);
    await page.click('#habitEditorSave');
    await page.waitForFunction(() => !document.getElementById('manageCategoryView').hidden);
    assert.equal(await page.$('#manageCategoryList [data-habit-id="affirm"]'), null);

    await page.click('#manageCategoryBack');
    await page.click(`#categoriesList [data-category-id="${recoveryId}"] .category-row-button`);
    await page.waitForFunction(() => document.getElementById('manageCategoryHeading').textContent === 'Manage Recovery');
    assert.ok(await page.$('#manageCategoryList [data-habit-id="affirm"]'));

    await page.click('#editCategoryBtn');
    await page.click('#categoryNameInput', { clickCount:3 });
    await page.type('#categoryNameInput', 'Rest & Restore');
    await page.click('.category-icon-choice[data-icon-key="heart"]');
    await page.click('#categoryEditorSave');
    await page.waitForFunction(() => document.getElementById('manageCategoryHeading').textContent === 'Manage Rest & Restore');

    await page.click('#manageCategoryList [data-habit-id="affirm"] .manage-habit-row-button');
    await page.select('#habitEditorBody .eh-category', 'mind');
    await page.click('#habitEditorSave');
    await page.waitForFunction(() => !document.getElementById('manageCategoryView').hidden);
    assert.equal(await page.$eval('.archive-category-btn', button => button.disabled), false);
    page.once('dialog', dialog => dialog.accept());
    await page.click('.archive-category-btn');
    await page.waitForFunction(() => !document.getElementById('categoriesView').hidden);
    assert.equal(await page.$(`#categoriesList [data-category-id="${recoveryId}"]`), null);
    assert.equal(await page.$eval('#archivedCategoriesBtn', button => button.hidden), false);

    await page.click('#archivedCategoriesBtn');
    await page.waitForFunction(() => !document.getElementById('archivedCategoriesView').hidden);
    assert.match(await page.$eval('#archivedCategoriesList', node => node.textContent), /Rest & Restore/);
    await page.click('#archivedCategoriesList .management-action');
    await page.click('#archivedCategoriesBack');
    assert.ok(await page.$(`#categoriesList [data-category-id="${recoveryId}"]`));

    const beforeOrder = await page.evaluate(() => categoryState.order.slice());
    await page.focus('#categoriesList [data-category-id="morning"] .category-grip');
    await page.keyboard.press('ArrowDown');
    const afterOrder = await page.evaluate(() => JSON.parse(localStorage.getItem('wavelength_categories_v1')).order);
    assert.notDeepEqual(afterOrder, beforeOrder);
    assert.equal(afterOrder[0], 'movement');

    await page.screenshot({ path:path.join(SHOT_DIR, `wavelength-categories-${THEME}.png`), fullPage:false });
    assert.deepEqual(errors, [], errors.join('\n'));
    console.log(`category personalization 390px ${THEME} Edge flow passed`);
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
