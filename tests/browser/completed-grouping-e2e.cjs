const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8777';
const URL = process.env.WAVELENGTH_URL || `${ORIGIN}/?completed-grouping-e2e=local`;
const ALL_SHOT = process.env.WAVELENGTH_ALL_SHOT || 'C:\\Temp\\wavelength-completed-all.png';
const FUEL_SHOT = process.env.WAVELENGTH_FUEL_SHOT || 'C:\\Temp\\wavelength-completed-fuel.png';
const REORDER_SHOT = process.env.WAVELENGTH_REORDER_SHOT || 'C:\\Temp\\wavelength-completed-reorder.png';
const THEME = process.env.WAVELENGTH_THEME || 'light';
let browser;

function contrastRatio(foreground, background) {
  const channels = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const luminance = value => {
    const [red, green, blue] = channels(value).map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

(async () => {
  browser = await puppeteer.launch({
    executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless:true,
    args:['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width:390, height:844, deviceScaleFactor:3, isMobile:true, hasTouch:true });
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable:true,
      value:{ getCurrentPosition(success) { success({ coords:{ latitude:26.7153, longitude:-80.0534 } }); } },
    });
    window.fetch = async input => {
      const url = String(input);
      if (url.includes('api.open-meteo.com/v1/forecast')) {
        return new Response(JSON.stringify({
          current:{ apparent_temperature:84, uv_index:4 },
          daily:{ sunrise:['2026-08-31T06:58'], sunset:['2026-08-31T19:42'] },
          timezone:'America/New_York',
        }), { status:200, headers:{ 'Content-Type':'application/json' } });
      }
      if (url.includes('air-quality-api.open-meteo.com')) {
        return new Response(JSON.stringify({ current:{ us_aqi:43 } }), {
          status:200, headers:{ 'Content-Type':'application/json' },
        });
      }
      return new Response('', { status:404 });
    };
  });

  await page.goto(URL, { waitUntil:'networkidle0' });
  await page.evaluate(theme => {
    localStorage.clear();
    localStorage.setItem('wavelength_theme', theme);
    localStorage.setItem(ORDER_KEY, JSON.stringify(DEFAULT_HABITS.map(habit => habit.id)));
    localStorage.setItem(CUSTOM_HABITS_KEY, JSON.stringify({
      hydrate:{ measurement:'count', target:2 },
    }));
    const now = new Date();
    const key = dateKey(now);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      done:{ [key]:{ wake:true, hydrate:true, beach:true, breakfast:true } },
      progress:{ [key]:{ hydrate:2 } },
      streak:0,
      longestStreak:0,
      week:{},
      created:new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10, 8).getTime(),
    }));
  }, THEME);
  await page.reload({ waitUntil:'networkidle0' });
  await page.waitForSelector('.completed-divider');

  const snapshot = () => page.evaluate(() => {
    const list = document.getElementById('habitList');
    const children = [...list.children];
    const divider = list.querySelector('.completed-divider');
    const dividerIndex = divider ? children.indexOf(divider) : -1;
    const cards = [...list.querySelectorAll('.habit')];
    const canonical = [...getScheduledHabits(HABITS, new Date())]
      .filter(habit => currentCat === 'all' || habit.cat === currentCat)
      .sort((a, b) => userOrder.indexOf(a.id) - userOrder.indexOf(b.id));
    const todayDone = state.done[dateKey(new Date())] || {};
    const todayProgress = state.progress?.[dateKey(new Date())] || {};
    const expected = partitionHabitsForTracking(canonical, todayDone, todayProgress);
    return {
      category:currentCat,
      reorderMode,
      ids:cards.map(card => card.dataset.id),
      activeIds:dividerIndex < 0 ? cards.map(card => card.dataset.id) : children.slice(0, dividerIndex).filter(node => node.classList.contains('habit')).map(card => card.dataset.id),
      completedIds:dividerIndex < 0 ? [] : children.slice(dividerIndex + 1).filter(node => node.classList.contains('habit')).map(card => card.dataset.id),
      expectedCanonical:canonical.map(habit => habit.id),
      expectedActive:expected.active.map(habit => habit.id),
      expectedCompleted:expected.completed.map(habit => habit.id),
      dividerText:divider?.textContent.trim() || '',
      dividerAria:divider?.getAttribute('aria-label') || '',
      dividerColor:divider ? getComputedStyle(divider).color : '',
      backgroundColor:getComputedStyle(document.body).backgroundColor,
      dividerCount:list.querySelectorAll('.completed-divider').length,
      completedClassIds:cards.filter(card => card.classList.contains('done')).map(card => card.dataset.id),
      storedOrder:localStorage.getItem(ORDER_KEY),
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:window.innerWidth,
      cardHeights:cards.map(card => Math.round(card.getBoundingClientRect().height)),
    };
  });

  const all = await snapshot();
  assert.deepEqual(all.activeIds, all.expectedActive);
  assert.deepEqual(all.completedIds, all.expectedCompleted);
  assert.equal(all.dividerText, `Completed · ${all.expectedCompleted.length}`);
  assert.equal(all.dividerAria, `${all.expectedCompleted.length} completed habits`);
  assert.ok(contrastRatio(all.dividerColor, all.backgroundColor) >= 4.5,
    'completed divider meets WCAG AA text contrast');
  assert.equal(all.dividerCount, 1);
  assert.deepEqual(all.ids, [...all.expectedActive, ...all.expectedCompleted]);
  assert.ok(all.documentWidth <= all.viewportWidth, 'All view has no horizontal overflow');
  assert.ok(all.cardHeights.every(height => height === 104), 'grouping preserves equal card heights');
  const originalStoredOrder = all.storedOrder;

  await page.evaluate(() => document.querySelector('.completed-divider').scrollIntoView({ block:'center' }));
  await new Promise(resolve => setTimeout(resolve, 300));
  await page.screenshot({ path:ALL_SHOT, fullPage:false });

  await page.click('.cat-tab[data-cat="fuel"]');
  await page.waitForFunction(() => document.querySelector('.cat-tab[data-cat="fuel"]').classList.contains('active'));
  const fuel = await snapshot();
  assert.equal(fuel.category, 'fuel');
  assert.deepEqual(fuel.activeIds, fuel.expectedActive);
  assert.deepEqual(fuel.completedIds, ['breakfast']);
  assert.equal(fuel.dividerText, 'Completed · 1');
  assert.equal(fuel.dividerAria, '1 completed habit');
  assert.ok(contrastRatio(fuel.dividerColor, fuel.backgroundColor) >= 4.5,
    'singular completed divider meets WCAG AA text contrast');
  assert.deepEqual(fuel.ids, [...fuel.expectedActive, 'breakfast']);
  assert.equal(fuel.storedOrder, originalStoredOrder, 'category grouping does not alter saved order');

  await page.evaluate(() => document.getElementById('habitList').scrollIntoView({ block:'start' }));
  await new Promise(resolve => setTimeout(resolve, 250));
  await page.screenshot({ path:FUEL_SHOT, fullPage:false });

  await page.click('#reorderBtn');
  await page.waitForFunction(() => document.getElementById('reorderBtn').getAttribute('aria-pressed') === 'true');
  const reorder = await snapshot();
  assert.equal(reorder.reorderMode, true);
  assert.equal(reorder.dividerCount, 0, 'Reorder removes completion grouping');
  assert.deepEqual(reorder.ids, reorder.expectedCanonical, 'Reorder restores canonical sequence');
  assert.deepEqual(reorder.completedClassIds, ['breakfast'], 'completed styling remains in Reorder');
  assert.equal(reorder.storedOrder, originalStoredOrder, 'entering Reorder does not mutate saved order');

  await page.evaluate(() => document.getElementById('habitList').scrollIntoView({ block:'start' }));
  await new Promise(resolve => setTimeout(resolve, 250));
  await page.screenshot({ path:REORDER_SHOT, fullPage:false });

  await page.click('#reorderBtn');
  await page.click('.cat-tab[data-cat="morning"]');
  await page.waitForSelector('.habit[data-id="hydrate"] .progress-minus:not([disabled])');
  let morning = await snapshot();
  assert.ok(morning.completedIds.includes('hydrate'), 'completed measured habit starts below divider');
  await page.click('.habit[data-id="hydrate"] .progress-minus');
  await page.waitForFunction(() => !document.querySelector('.habit[data-id="hydrate"]').classList.contains('done'));
  morning = await snapshot();
  assert.ok(morning.activeIds.includes('hydrate'), 'measured habit returns above divider after decrement');
  assert.ok(!morning.completedIds.includes('hydrate'));

  await page.click('.habit[data-id="wake"]');
  await page.waitForFunction(() => !document.querySelector('.habit[data-id="wake"]').classList.contains('done'));
  morning = await snapshot();
  assert.ok(morning.activeIds.includes('wake'), 'unmarked check-once habit returns above divider');

  const firstOpenId = morning.activeIds.find(id => id !== 'wake' && id !== 'hydrate');
  await page.click(`.habit[data-id="${firstOpenId}"]`);
  await page.waitForFunction(id => document.querySelector(`.habit[data-id="${id}"]`).classList.contains('done'), {}, firstOpenId);
  morning = await snapshot();
  assert.ok(morning.completedIds.includes(firstOpenId), 'new completion moves below divider');
  assert.equal(morning.storedOrder, originalStoredOrder, 'completion changes never rewrite canonical order');
  assert.ok(morning.documentWidth <= morning.viewportWidth, 'Morning view has no horizontal overflow');
  assert.deepEqual(runtimeErrors, []);

  console.log('completed grouping 390px Edge flow passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
});
