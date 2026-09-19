const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8778';
const URL = process.env.WAVELENGTH_URL || `${ORIGIN}/?drag-reorder-e2e=local`;
const SHOT_DIR = process.env.WAVELENGTH_SHOT_DIR || 'C:\\Temp';
const THEME = process.env.WAVELENGTH_THEME || 'dark';
const IS_MOBILE = process.env.WAVELENGTH_IS_MOBILE !== '0';
let browser;

async function touchDrag(page, selector, holdMs, deltaY, deltaX = 0) {
  const point = await page.$eval(selector, element => {
    const rect = element.getBoundingClientRect();
    return { x:rect.left + rect.width / 2, y:rect.top + rect.height / 2 };
  });
  const client = await page.target().createCDPSession();
  try {
    await client.send('Input.dispatchTouchEvent', {
      type:'touchStart',
      touchPoints:[{ x:point.x, y:point.y, radiusX:4, radiusY:4, force:1 }],
    });
    await new Promise(resolve => setTimeout(resolve, holdMs));
    const heldState = await page.$eval(selector, element => {
      const row = element.closest('.category-row, .manage-habit-row');
      const style = getComputedStyle(row);
      return {
        dragging:row.classList.contains('dragging'),
        bodyDragging:document.body.classList.contains('dragging-active'),
        transform:style.transform,
        boxShadow:style.boxShadow,
      };
    });
    await client.send('Input.dispatchTouchEvent', {
      type:'touchMove',
      touchPoints:[{ x:point.x + deltaX, y:point.y + deltaY, radiusX:4, radiusY:4, force:1 }],
    });
    await new Promise(resolve => setTimeout(resolve, 80));
    await client.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
    await new Promise(resolve => setTimeout(resolve, 120));
    return heldState;
  } finally {
    await client.detach();
  }
}

function maxSpread(values) {
  return Math.max(...values) - Math.min(...values);
}

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
  assert.equal(await page.$('#categoriesList [data-category-id="all"]'), null, 'Categories has no All management card');
  const categoryOrderBefore = await page.evaluate(() => categoryState.order.slice());
  if (IS_MOBILE) {
    const earlyState = await touchDrag(page, '#categoriesList [data-category-id="morning"] .category-grip', 100, 80, 100);
    assert.deepEqual(earlyState, { dragging:false, bodyDragging:false, transform:'none', boxShadow:'none' },
      'a short touch does not visually lift or arm the category card');
    assert.deepEqual(
      await page.evaluate(() => categoryState.order.slice()),
      categoryOrderBefore,
      'moving before the 250ms hold threshold does not reorder categories',
    );
    const heldState = await touchDrag(page, '#categoriesList [data-category-id="morning"] .category-grip', 320, 80, 100);
    assert.equal(heldState.dragging, true, 'the long press visibly lifts the category card');
    assert.equal(heldState.bodyDragging, true, 'the long press enters drag interaction state');
    assert.notEqual(heldState.transform, 'none', 'the lifted category card receives native-like elevation feedback');
    assert.notEqual(heldState.boxShadow, 'none', 'the lifted category card receives a visible shadow');
  } else {
    await page.focus('#categoriesList [data-category-id="morning"] .category-grip');
    await page.keyboard.press('ArrowDown');
  }
  const categoryOrderAfter = await page.evaluate(() => JSON.parse(localStorage.getItem(CATEGORY_STATE_KEY)).order);
  assert.notDeepEqual(categoryOrderAfter, categoryOrderBefore, 'category grip reorder persists');
  assert.equal(categoryOrderAfter[0], 'movement');
  await page.focus('#categoriesList [data-category-id="morning"] .category-grip');
  await page.keyboard.press('ArrowUp');
  assert.equal(
    (await page.evaluate(() => JSON.parse(localStorage.getItem(CATEGORY_STATE_KEY)).order))[0],
    'morning',
    'keyboard arrow reordering remains available',
  );
  await page.focus('#categoriesList [data-category-id="morning"] .category-grip');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const consecutiveCategoryKeyboard = await page.evaluate(() => ({
    order:JSON.parse(localStorage.getItem(CATEGORY_STATE_KEY)).order,
    focused:document.activeElement?.closest('.category-row')?.dataset.categoryId || '',
  }));
  assert.equal(consecutiveCategoryKeyboard.order.indexOf('morning'), 2,
    'two consecutive category arrow moves work without manually restoring focus');
  assert.equal(consecutiveCategoryKeyboard.focused, 'morning',
    'category keyboard reorder restores focus to the replacement grip');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  assert.equal(
    (await page.evaluate(() => JSON.parse(localStorage.getItem(CATEGORY_STATE_KEY)).order))[0],
    'morning',
    'consecutive keyboard arrows can restore the category order',
  );

  await page.click('#categoriesList [data-category-id="movement"] .category-row-button');
  await page.waitForFunction(() => document.getElementById('manageCategoryHeading').textContent === 'Manage Movement');
  await new Promise(resolve => setTimeout(resolve, 250));
  const rows = await page.$$('#manageCategoryList .manage-habit-row');
  assert.ok(rows.length >= 2, 'Movement has enough habits for scoped reorder');
  const before = await page.evaluate(() => ({
    order:userOrder.slice(),
    ids:[...document.querySelectorAll('#manageCategoryList .manage-habit-row')].map(row => row.dataset.habitId),
    rowLeft:document.querySelector('#manageCategoryList .manage-habit-row').getBoundingClientRect().left,
    bodyPoint:document.querySelector('#manageCategoryList .manage-habit-row-button').getBoundingClientRect().x,
  }));
  await page.click('#manageCategoryList .manage-habit-row-button');
  await page.waitForFunction(() => !document.getElementById('habitEditorView').hidden);
  await page.click('#habitEditorBack');
  await page.waitForFunction(() => !document.getElementById('manageCategoryView').hidden);

  if (IS_MOBILE) {
    await touchDrag(page, '#manageCategoryList .manage-habit-row .manage-habit-grip', 320, 80, 120);
  } else {
    await page.focus('#manageCategoryList .manage-habit-row .manage-habit-grip');
    await page.keyboard.press('ArrowDown');
  }
  const after = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#manageCategoryList .manage-habit-row')];
    const lefts = selector => rows.map(row => row.querySelector(selector).getBoundingClientRect().left);
    const firstGrip = rows[0].querySelector('.manage-habit-grip').getBoundingClientRect();
    const firstMarker = rows[0].querySelector('.category-grip-marker').getBoundingClientRect();
    return {
      order:JSON.parse(localStorage.getItem(ORDER_KEY)),
      ids:rows.map(row => row.dataset.habitId),
      width:document.documentElement.scrollWidth,
      viewport:innerWidth,
      bodyPoint:rows[0].querySelector('.manage-habit-row-button').getBoundingClientRect().x,
      rowLeft:rows[0].getBoundingClientRect().left,
      gripWidth:firstGrip.width,
      markerWidth:firstMarker.width,
      ghost:!!document.querySelector('[class*="drag-ghost"]'),
      columns:{
        grip:lefts('.manage-habit-grip'),
        icon:lefts('.manage-habit-row-icon'),
        copy:lefts('.manage-habit-row-copy'),
        chevron:lefts('.manage-habit-chevron'),
      },
    };
  });
  assert.notDeepEqual(after.ids, before.ids, 'habit long-press grip reorders only the active category list');
  assert.notDeepEqual(after.order, before.order, 'scoped habit reorder persists canonical order');
  assert.equal(after.bodyPoint, before.bodyPoint, 'grip use does not shift the row navigation target');
  assert.equal(after.rowLeft, before.rowLeft, 'large horizontal pointer movement cannot drift the row');
  assert.equal(after.gripWidth, 44, 'compact grip retains its full touch target');
  assert.equal(after.markerWidth, 3, 'visible grip stays compact');
  assert.equal(after.ghost, false, 'management drag introduces no horizontally drifting ghost');
  for (const [name, values] of Object.entries(after.columns)) {
    assert.ok(maxSpread(values) <= 1, `${name} columns stay aligned: ${JSON.stringify(values)}`);
  }
  const keyboardHabitId = after.ids[0];
  await page.focus(`#manageCategoryList [data-habit-id="${keyboardHabitId}"] .manage-habit-grip`);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const consecutiveHabitKeyboard = await page.evaluate(id => ({
    ids:[...document.querySelectorAll('#manageCategoryList .manage-habit-row')].map(row => row.dataset.habitId),
    focused:document.activeElement?.closest('.manage-habit-row')?.dataset.habitId || '',
  }), keyboardHabitId);
  assert.equal(consecutiveHabitKeyboard.ids.indexOf(keyboardHabitId), 2,
    'two consecutive habit arrow moves work without manually restoring focus');
  assert.equal(consecutiveHabitKeyboard.focused, keyboardHabitId,
    'habit keyboard reorder restores focus to the replacement grip');
  assert.ok(after.width <= after.viewport, 'management reorder introduces no horizontal overflow');
  await page.screenshot({ path:`${SHOT_DIR}\\wavelength-category-drag-${IS_MOBILE ? 'mobile' : 'desktop'}-${THEME}.png`, fullPage:false });
  assert.deepEqual(runtimeErrors, []);
  console.log(`category long-press grip reorder ${IS_MOBILE ? 'mobile' : 'desktop'} ${THEME} Edge flow passed`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
