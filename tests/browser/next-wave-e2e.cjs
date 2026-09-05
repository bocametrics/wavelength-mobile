const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8773';
const URL = process.env.WAVELENGTH_URL || `${ORIGIN}/?next-wave-e2e=local`;
const SHOT_DIR = process.env.WAVELENGTH_SHOT_DIR || 'C:\\Temp';
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
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const context = browser.defaultBrowserContext();
  await context.overridePermissions(ORIGIN, []);
  const page = await browser.newPage();
  await page.setViewport({ width:390, height:844, deviceScaleFactor:3, isMobile:true, hasTouch:true });
  const runtimeErrors = collectErrors(page);

  await page.goto(URL, { waitUntil:'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil:'networkidle0' });
  await page.waitForSelector('#nextWaveCard');

  const neutral = await page.evaluate(() => ({
    heading:document.getElementById('nextWaveHeading').textContent,
    title:document.getElementById('nextWaveTitle').textContent,
    detail:document.getElementById('nextWaveDetail').textContent,
    actionHidden:document.getElementById('nextWaveAction').hidden,
    viewportWidth:innerWidth,
    documentWidth:document.documentElement.scrollWidth,
    cardHeights:[...document.querySelectorAll('.habit')].map(card => Math.round(card.getBoundingClientRect().height)),
  }));
  assert.equal(neutral.heading, '🌊 Your next wave');
  assert.ok(neutral.title.length > 0);
  assert.ok(neutral.detail.length > 0);
  assert.equal(neutral.actionHidden, false);
  assert.equal(neutral.documentWidth, neutral.viewportWidth);
  assert.ok(neutral.cardHeights.every(height => height === 104), JSON.stringify(neutral.cardHeights));
  assert.equal(await page.evaluate(() => !!document.querySelector('#insightSunrise, #insightHeat, .insight-grid')), false);

  const mergeOrders = await page.evaluate(() => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const key = dateKey(now);
    state.done[key] = { daylight:true, sunscreen:true };
    state.progress = state.progress || {};
    saveState();
    renderHabits(now);
    const capture = () => ({
      title:document.getElementById('nextWaveTitle').textContent,
      detail:document.getElementById('nextWaveDetail').textContent,
      snapshot:{ ...rhythmWeatherData },
    });
    rhythmWeatherData = null;
    updateRhythmAnchors({ uv:1, feel:96, sunrise:'6:58 AM', sunset:'7:42 PM' }, now);
    updateRhythmAnchors({ aqi:43 }, now);
    const forecastFirst = capture();
    rhythmWeatherData = null;
    updateRhythmAnchors({ aqi:43 }, now);
    updateRhythmAnchors({ uv:1, feel:96, sunrise:'6:58 AM', sunset:'7:42 PM' }, now);
    const aqiFirst = capture();
    return { forecastFirst, aqiFirst };
  });
  assert.deepEqual(mergeOrders.forecastFirst, mergeOrders.aqiFirst);
  assert.equal(mergeOrders.forecastFirst.title, 'Outdoor walk or movement');
  assert.equal(mergeOrders.forecastFirst.detail, 'Good air quality · AQI 43');

  const safety = await page.evaluate(() => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const key = dateKey(now);
    const beach = HABITS.find(habit => habit.id === 'beach');
    const daylight = HABITS.find(habit => habit.id === 'daylight');
    const originalBeachRhythm = JSON.parse(JSON.stringify(beach.rhythm));
    const originalDaylightRhythm = JSON.parse(JSON.stringify(daylight.rhythm));
    const capture = () => {
      const suggestion = getNextWaveSuggestion(HABITS, state.done, state.progress, now, rhythmWeatherData);
      return {
        reason:suggestion.reason,
        title:document.getElementById('nextWaveTitle').textContent,
        detail:document.getElementById('nextWaveDetail').textContent,
      };
    };

    state.done[key] = { daylight:true, sunscreen:true };
    beach.rhythm = { type:'aqi-below', threshold:150 };
    rhythmWeatherData = null;
    renderHabits(now);
    updateRhythmAnchors({ aqi:121, uv:1 }, now);
    const loose150 = capture();

    beach.rhythm = { type:'aqi-below', threshold:200 };
    rhythmWeatherData = null;
    renderHabits(now);
    updateRhythmAnchors({ aqi:160, uv:1 }, now);
    const loose200 = capture();

    beach.rhythm = { type:'aqi-below', threshold:50 };
    rhythmWeatherData = null;
    renderHabits(now);
    updateRhythmAnchors({ aqi:78, uv:1 }, now);
    const strict50 = capture();

    state.done[key] = { sunscreen:true };
    beach.rhythm = null;
    daylight.rhythm = null;
    rhythmWeatherData = null;
    renderHabits(now);
    updateRhythmAnchors({ aqi:43, uv:1, sunrise:'7:00 AM' }, now);
    const daylightOptOut = capture();

    beach.rhythm = originalBeachRhythm;
    daylight.rhythm = originalDaylightRhythm;
    state.done[key] = { daylight:true, sunscreen:true };
    state.progress[key] = {};
    rhythmWeatherData = null;
    saveState();
    renderHabits(now);
    updateRhythmAnchors({ aqi:43, uv:4, feel:96, sunrise:'6:58 AM', sunset:'7:42 PM' }, now);
    return { loose150, loose200, strict50, daylightOptOut };
  });
  assert.equal(safety.loose150.title, 'Outdoor walk or movement');
  assert.equal(safety.loose150.detail, 'AQI 121 · Move indoors if you’re sensitive.');
  assert.equal(safety.loose200.title, 'Outdoor walk or movement');
  assert.equal(safety.loose200.detail, 'AQI 160 · Move indoors today.');
  assert.notEqual(safety.strict50.reason, 'aqi-opportunity');
  assert.doesNotMatch(safety.strict50.detail, /AQI/);
  assert.notEqual(safety.daylightOptOut.reason, 'sunrise-light');
  assert.doesNotMatch(safety.daylightOptOut.detail, /Sunrise/);

  await page.waitForFunction(() => document.getElementById('nextWaveTitle').textContent === 'Outdoor walk or movement');
  const favorable = await page.evaluate(() => {
    const card = document.getElementById('nextWaveCard');
    const action = document.getElementById('nextWaveAction');
    return {
      eyebrow:document.getElementById('nextWaveEyebrow').textContent,
      title:document.getElementById('nextWaveTitle').textContent,
      detail:document.getElementById('nextWaveDetail').textContent,
      icon:document.getElementById('nextWaveIcon').textContent,
      habitId:action.dataset.habitId,
      actionHeight:Math.round(action.getBoundingClientRect().height),
      cardWidth:Math.round(card.getBoundingClientRect().width),
      bodyWidth:document.body.getBoundingClientRect().width,
    };
  });
  assert.deepEqual({
    eyebrow:favorable.eyebrow,
    title:favorable.title,
    detail:favorable.detail,
    icon:favorable.icon,
    habitId:favorable.habitId,
    actionHeight:favorable.actionHeight,
  }, {
    eyebrow:'Suggested now',
    title:'Outdoor walk or movement',
    detail:'Good air quality · AQI 43',
    icon:'🌊',
    habitId:'beach',
    actionHeight:40,
  });
  assert.ok(favorable.cardWidth <= favorable.bodyWidth, JSON.stringify(favorable));
  await page.$eval('#nextWaveCard', element => element.scrollIntoView({ block:'center' }));
  await page.screenshot({ path:path.join(SHOT_DIR, 'wavelength-next-wave.png') });

  await page.emulateMediaFeatures([{ name:'prefers-reduced-motion', value:'reduce' }]);
  await page.evaluate(() => {
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function(options) {
      window.__nextWaveScrollBehavior = options && options.behavior;
      return original.call(this, options);
    };
  });
  await page.click('#nextWaveAction');
  await page.waitForFunction(() => document.querySelector('.cat-tab.active')?.dataset.cat === 'movement');
  await page.waitForFunction(() => document.querySelector('.habit[data-id="beach"]')?.classList.contains('next-wave-focus'));
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll('.habit[data-id]')];
    return cards.length > 0 && cards.every(card => getComputedStyle(card).opacity === '1');
  });
  const jump = await page.evaluate(() => {
    const target = document.querySelector('.habit[data-id="beach"]');
    const rect = target.getBoundingClientRect();
    return {
      activeCategory:document.querySelector('.cat-tab.active').dataset.cat,
      visibleHabits:[...document.querySelectorAll('.habit[data-id]')].map(card => ({ id:card.dataset.id, category:card.dataset.cat })),
      highlighted:target.classList.contains('next-wave-focus'),
      verticallyVisible:rect.bottom > 0 && rect.top < innerHeight,
      scrollBehavior:window.__nextWaveScrollBehavior,
    };
  });
  assert.equal(jump.activeCategory, 'movement');
  assert.ok(jump.visibleHabits.some(habit => habit.id === 'beach'), JSON.stringify(jump.visibleHabits));
  assert.ok(jump.visibleHabits.every(habit => habit.category === 'movement'), JSON.stringify(jump.visibleHabits));
  assert.equal(jump.highlighted, true);
  assert.equal(jump.verticallyVisible, true);
  assert.equal(jump.scrollBehavior, 'auto');
  await page.screenshot({ path:path.join(SHOT_DIR, 'wavelength-next-wave-focus.png') });

  await page.click('.habit[data-id="beach"]');
  await page.evaluate(() => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    renderHabits(now);
  });
  await page.waitForFunction(() => document.getElementById('nextWaveTitle').textContent === 'Drink 16 oz water');
  const advanced = await page.evaluate(() => ({
    title:document.getElementById('nextWaveTitle').textContent,
    detail:document.getElementById('nextWaveDetail').textContent,
    habitId:document.getElementById('nextWaveAction').dataset.habitId,
    walkDone:document.querySelector('.habit[data-id="beach"]')?.classList.contains('done') || false,
  }));
  assert.deepEqual(advanced, {
    title:'Drink 16 oz water',
    detail:'Feels like 96°F · Extra water may help',
    habitId:'hydrate',
    walkDone:true,
  });

  await page.evaluate(() => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const key = dateKey(now);
    const custom = HABITS.find(habit => habit.id === 'meditate');
    custom.text = '<img id="next-wave-injection" src=x onerror=alert(1)>';
    state.done[key] = Object.fromEntries(getScheduledHabits(HABITS, now)
      .filter(habit => habit.id !== 'meditate')
      .map(habit => [habit.id, true]));
    saveState();
    renderHabits(now);
  });
  await page.waitForFunction(() => document.getElementById('nextWaveAction').dataset.habitId === 'meditate');
  const safeCustomText = await page.evaluate(() => ({
    title:document.getElementById('nextWaveTitle').textContent,
    injectedNode:!!document.getElementById('next-wave-injection'),
  }));
  assert.equal(safeCustomText.title, '<img id="next-wave-injection" src=x onerror=alert(1)>');
  assert.equal(safeCustomText.injectedNode, false);

  await page.evaluate(() => {
    HABITS.find(habit => habit.id === 'meditate').text = 'Meditate 10 min';
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const key = dateKey(now);
    state.done[key] = { daylight:true, sunscreen:true };
    state.progress[key] = {};
    saveState();
    renderHabits(now);
    updateRhythmAnchors({ aqi:121, uv:1, feel:72 }, now);
  });
  await page.waitForFunction(() => document.getElementById('nextWaveDetail').textContent.includes('Move indoors'));
  const unfavorable = await page.evaluate(() => ({
    eyebrow:document.getElementById('nextWaveEyebrow').textContent,
    title:document.getElementById('nextWaveTitle').textContent,
    detail:document.getElementById('nextWaveDetail').textContent,
    habitId:document.getElementById('nextWaveAction').dataset.habitId,
  }));
  assert.deepEqual(unfavorable, {
    eyebrow:'Adapt today',
    title:'Outdoor walk or movement',
    detail:'AQI 121 · Move indoors if you’re sensitive.',
    habitId:'beach',
  });

  await page.evaluate(() => {
    const now = new Date();
    const key = dateKey(now);
    state.done[key] = Object.fromEntries(getScheduledHabits(HABITS, now).map(habit => [habit.id, true]));
    saveState();
    renderHabits();
  });
  await page.waitForFunction(() => document.getElementById('nextWaveTitle').textContent === 'Today’s habits are complete.');
  const complete = await page.evaluate(() => ({
    eyebrow:document.getElementById('nextWaveEyebrow').textContent,
    title:document.getElementById('nextWaveTitle').textContent,
    detail:document.getElementById('nextWaveDetail').textContent,
    actionHidden:document.getElementById('nextWaveAction').hidden,
    runtimeWidth:document.documentElement.scrollWidth,
    viewportWidth:innerWidth,
  }));
  assert.deepEqual(complete, {
    eyebrow:'You’re caught up',
    title:'Today’s habits are complete.',
    detail:'You followed through on every scheduled habit.',
    actionHidden:true,
    runtimeWidth:390,
    viewportWidth:390,
  });

  const noScheduled = await page.evaluate(() => {
    const now = new Date();
    const originalDays = HABITS.map(habit => ({ id:habit.id, days:habit.days ? [...habit.days] : null }));
    const excludedDay = (now.getDay() + 1) % 7;
    HABITS.forEach(habit => { habit.days = [excludedDay]; });
    renderHabits(now);
    const result = {
      eyebrow:document.getElementById('nextWaveEyebrow').textContent,
      title:document.getElementById('nextWaveTitle').textContent,
      actionHidden:document.getElementById('nextWaveAction').hidden,
    };
    originalDays.forEach(original => {
      const habit = HABITS.find(item => item.id === original.id);
      if (original.days) habit.days = original.days;
      else delete habit.days;
    });
    renderHabits(now);
    return result;
  });
  assert.deepEqual(noScheduled, {
    eyebrow:'A quiet day',
    title:'No habits are scheduled today.',
    actionHidden:true,
  });

  await page.click('#resetBtn');
  await page.waitForFunction(() => !document.getElementById('nextWaveAction').hidden && document.getElementById('nextWaveTitle').textContent !== 'Today\u2019s habits are complete.');

  const generation = await page.evaluate(async () => {
    const first = rhythmWeatherGeneration;
    const origFetch = window.fetch;
    const origGetLocation = getLocation;
    getLocation = () => Promise.resolve({ lat:26.7153, lon:-80.0534 });
    let aqiCall = 0;
    window.fetch = (url) => {
      if (String(url).includes('air-quality')) {
        const value = aqiCall++ === 0 ? 999 : 43;
        const delay = value === 999 ? 80 : 0;
        return new Promise(resolve => setTimeout(() => {
          resolve({ ok:true, json:() => Promise.resolve({ current:{ us_aqi:value } }) });
        }, delay));
      }
      if (String(url).includes('api.open-meteo.com/v1/forecast')) {
        return Promise.resolve({
          ok:true,
          json:() => Promise.resolve({
            current:{ apparent_temperature:72, uv_index:1, is_day:1 },
            daily:{ sunrise:['2026-08-31T06:58'], sunset:['2026-08-31T19:42'] },
          }),
        });
      }
      return origFetch(url);
    };
    try {
      renderInsights(new Date());
      await Promise.resolve();
      renderInsights(new Date());
      const afterDouble = rhythmWeatherGeneration;
      await new Promise(resolve => setTimeout(resolve, 250));
      return { first, afterDouble, finalAqi:rhythmWeatherData?.aqi ?? null, aqiCall };
    } finally {
      window.fetch = origFetch;
      getLocation = origGetLocation;
    }
  });
  assert.equal(generation.afterDouble, generation.first + 2, 'each renderInsights call increments the generation');
  assert.equal(generation.aqiCall, 2, 'both AQI requests started so the stale-response guard is exercised');
  assert.equal(generation.finalAqi, 43, 'newest environmental response wins after the superseded response resolves');

  const rollover = await page.evaluate(() => {
    rhythmWeatherData = { sunrise:'6:00 AM', sunset:'8:00 PM', feel:72, uv:4, aqi:43 };
    const currentKey = dateKey(new Date());
    lastRenderedDateKey = '1900-01-01';
    rhythmWeatherGeneration = 0;
    window.dispatchEvent(new Event('pageshow'));
    return {
      snapshotCleared: rhythmWeatherData === null,
      generationBumped: rhythmWeatherGeneration > 0,
      keyUpdated: lastRenderedDateKey === currentKey,
    };
  });
  assert.equal(rollover.snapshotCleared, true, 'rollover clears every stale environmental channel');
  assert.equal(rollover.generationBumped, true, 'rollover bumps the generation');
  assert.equal(rollover.keyUpdated, true, 'rollover updates the rendered date key');

  const resetState = await page.evaluate(() => {
    const key = dateKey(new Date());
    return {
      doneCount:Object.keys(state.done[key] || {}).length,
      actionHidden:document.getElementById('nextWaveAction').hidden,
    };
  });
  assert.deepEqual(resetState, { doneCount:0, actionHidden:false });

  const lifecycleRollover = await page.evaluate(() => {
    const currentKey = dateKey(new Date());
    document.getElementById('dateDay').textContent = 'stale date';
    lastRenderedDateKey = '1900-01-01';
    window.dispatchEvent(new Event('pageshow'));
    const pageshowRecovered = lastRenderedDateKey === currentKey && document.getElementById('dateDay').textContent !== 'stale date';
    lastRenderedDateKey = '1900-01-01';
    document.dispatchEvent(new Event('visibilitychange'));
    const visibilityRecovered = lastRenderedDateKey === currentKey;
    return {
      pageshowRecovered,
      visibilityRecovered,
      duplicateRefresh:refreshForDateRollover(new Date()),
      timerScheduled:dateRolloverTimer !== null,
    };
  });
  assert.deepEqual(lifecycleRollover, {
    pageshowRecovered:true,
    visibilityRecovered:true,
    duplicateRefresh:false,
    timerScheduled:true,
  });

  assert.deepEqual(runtimeErrors, [], `runtime errors: ${JSON.stringify(runtimeErrors)}`);
  console.log('next wave 390px Edge flow passed');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
});
