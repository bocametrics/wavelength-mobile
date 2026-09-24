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
      const proxy = document.querySelector('.category-drag-proxy');
      const proxyRect = proxy?.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      return {
        bodyDragging:document.body.classList.contains('dragging-active'),
        proxy:!!proxy,
        placeholder:row.classList.contains('category-drag-placeholder'),
        proxyTop:proxyRect?.top ?? null,
        proxyLeft:proxyRect?.left ?? null,
        sourceLeft:rowRect.left,
      };
    });
    await client.send('Input.dispatchTouchEvent', {
      type:'touchMove',
      touchPoints:[{ x:point.x + deltaX, y:point.y + deltaY, radiusX:4, radiusY:4, force:1 }],
    });
    await new Promise(resolve => setTimeout(resolve, 80));
    const movingState = await page.evaluate(() => {
      const proxy = document.querySelector('.category-drag-proxy');
      const proxyRect = proxy?.getBoundingClientRect();
      const placeholder = document.querySelector('.category-drag-placeholder');
      const rows = [...document.querySelectorAll('#categoriesList .category-row, #manageCategoryList .manage-habit-row')]
        .filter(row => row.offsetParent !== null);
      const animatedSibling = rows.some(row => {
        if (row === placeholder) return false;
        const transform = getComputedStyle(row).transform;
        return transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)';
      });
      return {
        proxy:!!proxy,
        proxyTop:proxyRect?.top ?? null,
        proxyLeft:proxyRect?.left ?? null,
        placeholder:!!placeholder,
        animatedSibling,
      };
    });
    await client.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
    const releaseState = await page.evaluate(() => ({
      proxy:!!document.querySelector('.category-drag-proxy'),
      placeholder:!!document.querySelector('.category-drag-placeholder'),
      bodyDragging:document.body.classList.contains('dragging-active'),
    }));
    await new Promise(resolve => setTimeout(resolve, 260));
    const cleanupState = await page.evaluate(() => ({
      proxy:!!document.querySelector('.category-drag-proxy'),
      placeholder:!!document.querySelector('.category-drag-placeholder'),
      bodyDragging:document.body.classList.contains('dragging-active'),
      inlineMotion:[...document.querySelectorAll('#categoriesList .category-row, #manageCategoryList .manage-habit-row')]
        .some(row => row.style.transform || row.style.transition),
    }));
    return { heldState, movingState, releaseState, cleanupState };
  } finally {
    await client.detach();
  }
}

async function cancelTouchDrag(page, selector, holdMs, deltaY) {
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
    await client.send('Input.dispatchTouchEvent', {
      type:'touchMove',
      touchPoints:[{ x:point.x, y:point.y + deltaY, radiusX:4, radiusY:4, force:1 }],
    });
    await new Promise(resolve => setTimeout(resolve, 80));
    await client.send('Input.dispatchTouchEvent', { type:'touchCancel', touchPoints:[] });
    return await page.evaluate(() => ({
      proxy:!!document.querySelector('.category-drag-proxy'),
      placeholder:!!document.querySelector('.category-drag-placeholder'),
      bodyDragging:document.body.classList.contains('dragging-active'),
      inlineMotion:[...document.querySelectorAll('#categoriesList .category-row')]
        .some(row => row.style.transform || row.style.transition),
      order:categoryState.order.slice(),
    }));
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
    const earlyTrace = await touchDrag(page, '#categoriesList [data-category-id="morning"] .category-grip', 100, 80, 100);
    assert.deepEqual(earlyTrace.heldState, {
      bodyDragging:false,
      proxy:false,
      placeholder:false,
      proxyTop:null,
      proxyLeft:null,
      sourceLeft:earlyTrace.heldState.sourceLeft,
    },
      'a short touch does not visually lift or arm the category card');
    assert.deepEqual(
      await page.evaluate(() => categoryState.order.slice()),
      categoryOrderBefore,
      'moving before the 250ms hold threshold does not reorder categories',
    );
    const sameSlotTrace = await touchDrag(page, '#categoriesList [data-category-id="morning"] .category-grip', 320, 4, 100);
    assert.deepEqual(sameSlotTrace.releaseState, {
      proxy:true,
      placeholder:true,
      bodyDragging:true,
    }, 'an armed same-slot release visibly settles back before cleanup');
    assert.deepEqual(sameSlotTrace.cleanupState, {
      proxy:false,
      placeholder:false,
      bodyDragging:false,
      inlineMotion:false,
    }, 'same-slot settling removes all transient drag state');
    assert.deepEqual(
      await page.evaluate(() => categoryState.order.slice()),
      categoryOrderBefore,
      'same-slot settling does not persist a reorder',
    );

    const cancelledState = await cancelTouchDrag(
      page,
      '#categoriesList [data-category-id="morning"] .category-grip',
      320,
      80,
    );
    assert.deepEqual(cancelledState, {
      proxy:false,
      placeholder:false,
      bodyDragging:false,
      inlineMotion:false,
      order:categoryOrderBefore,
    }, 'touch cancellation restores the original order and clears all drag state');

    const dragTrace = await touchDrag(page, '#categoriesList [data-category-id="morning"] .category-grip', 320, 80, 100);
    assert.equal(dragTrace.heldState.bodyDragging, true, 'the long press enters drag interaction state');
    assert.equal(dragTrace.heldState.proxy, true, 'the long press lifts a full-card drag proxy');
    assert.equal(dragTrace.heldState.placeholder, true, 'the source slot remains represented while dragging');
    assert.equal(dragTrace.movingState.proxy, true, 'the full-card proxy remains visible during pointer movement');
    assert.ok(Math.abs((dragTrace.movingState.proxyTop - dragTrace.heldState.proxyTop) - 80) <= 3,
      JSON.stringify(dragTrace), 'the lifted card follows the finger vertically');
    assert.ok(Math.abs(dragTrace.movingState.proxyLeft - dragTrace.heldState.sourceLeft) <= 1,
      JSON.stringify(dragTrace), 'the lifted card stays horizontally locked despite finger drift');
    assert.equal(dragTrace.movingState.placeholder, true, 'the list keeps a same-height destination placeholder');
    assert.equal(dragTrace.movingState.animatedSibling, true, 'a neighboring card has a real transient displacement transform');
    assert.deepEqual(dragTrace.releaseState, {
      proxy:true,
      placeholder:true,
      bodyDragging:true,
    }, 'a reordered card remains visible while settling to its destination');
    assert.deepEqual(dragTrace.cleanupState, {
      proxy:false,
      placeholder:false,
      bodyDragging:false,
      inlineMotion:false,
    }, 'release cleanup removes the proxy, placeholder, body state, and inline motion styles');
    const animatedOrder = await page.evaluate(() => categoryState.order.slice());
    assert.notDeepEqual(animatedOrder, categoryOrderBefore, 'animated category reorder persists');
    assert.equal(animatedOrder[0], 'movement');

    await page.emulateMediaFeatures([{ name:'prefers-reduced-motion', value:'reduce' }]);
    const reducedOrderBefore = await page.evaluate(() => categoryState.order.slice());
    const reducedTrace = await touchDrag(page, '#categoriesList [data-category-id="morning"] .category-grip', 320, 80, 100);
    assert.deepEqual(reducedTrace.releaseState, {
      proxy:false,
      placeholder:false,
      bodyDragging:false,
    }, 'reduced motion commits immediately without a settle animation');
    assert.deepEqual(reducedTrace.cleanupState, {
      proxy:false,
      placeholder:false,
      bodyDragging:false,
      inlineMotion:false,
    }, 'reduced-motion reordering leaves no transient drag state');
    assert.notDeepEqual(
      await page.evaluate(() => categoryState.order.slice()),
      reducedOrderBefore,
      'reduced motion preserves reorder behavior',
    );
    await page.emulateMediaFeatures([{ name:'prefers-reduced-motion', value:'no-preference' }]);
  } else {
    await page.focus('#categoriesList [data-category-id="morning"] .category-grip');
    await page.keyboard.press('ArrowDown');
  }
  const categoryOrderAfter = await page.evaluate(() => JSON.parse(localStorage.getItem(CATEGORY_STATE_KEY)).order);
  assert.notDeepEqual(categoryOrderAfter, categoryOrderBefore, 'category grip reorder persists');
  assert.equal(categoryOrderAfter[0], 'movement');
  await page.focus('#categoriesList [data-category-id="morning"] .category-grip');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  assert.equal(
    (await page.evaluate(() => JSON.parse(localStorage.getItem(CATEGORY_STATE_KEY)).order))[0],
    'morning',
    'keyboard arrow reordering remains available after animated and reduced-motion drags',
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
  assert.equal(after.markerWidth, 9, 'visible six-dot grip stays compact');
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
