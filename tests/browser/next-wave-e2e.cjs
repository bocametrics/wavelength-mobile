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
    heading:document.getElementById('insightsHeading').textContent,
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
    const key = dateKey(new Date());
    state.done[key] = { daylight:true, sunscreen:true };
    state.progress = state.progress || {};
    saveState();
    renderHabits();
    const capture = () => ({
      title:document.getElementById('nextWaveTitle').textContent,
      detail:document.getElementById('nextWaveDetail').textContent,
      snapshot:{ ...rhythmWeatherData },
    });
    rhythmWeatherData = null;
    updateRhythmAnchors({ uv:1, feel:96, sunrise:'6:58 AM', sunset:'7:42 PM' });
    updateRhythmAnchors({ aqi:43 });
    const forecastFirst = capture();
    rhythmWeatherData = null;
    updateRhythmAnchors({ aqi:43 });
    updateRhythmAnchors({ uv:1, feel:96, sunrise:'6:58 AM', sunset:'7:42 PM' });
    const aqiFirst = capture();
    return { forecastFirst, aqiFirst };
  });
  assert.deepEqual(mergeOrders.forecastFirst, mergeOrders.aqiFirst);
  assert.equal(mergeOrders.forecastFirst.title, 'Now is a good time for your outdoor walk.');
  assert.equal(mergeOrders.forecastFirst.detail, 'Good air quality · AQI 43');

  const safety = await page.evaluate(() => {
    const now = new Date();
    const key = dateKey(now);
    const beach = HABITS.find(habit => habit.id === 'beach');
    const daylight = HABITS.find(habit => habit.id === 'daylight');
    const originalBeachRhythm = JSON.parse(JSON.stringify(beach.rhythm));
    const originalDaylightRhythm = JSON.parse(JSON.stringify(daylight.rhythm));
    const capture = () => ({
      title:document.getElementById('nextWaveTitle').textContent,
      detail:document.getElementById('nextWaveDetail').textContent,
    });

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
  assert.equal(safety.loose150.title, "If you're sensitive to air quality, move indoors today.");
  assert.equal(safety.loose200.title, 'Move today’s activity indoors.');
  assert.notEqual(safety.strict50.title, 'Outdoor movement could fit now.');
  assert.doesNotMatch(safety.strict50.detail, /AQI/);
  assert.notEqual(safety.daylightOptOut.title, 'Step outside for your morning light.');
  assert.doesNotMatch(safety.daylightOptOut.detail, /Sunrise/);

  await page.waitForFunction(() => document.getElementById('nextWaveTitle').textContent === 'Now is a good time for your outdoor walk.');
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
    title:'Now is a good time for your outdoor walk.',
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
  await page.waitForFunction(() => document.getElementById('nextWaveTitle').textContent === 'Have your next glass of water.');
  const advanced = await page.evaluate(() => ({
    title:document.getElementById('nextWaveTitle').textContent,
    detail:document.getElementById('nextWaveDetail').textContent,
    habitId:document.getElementById('nextWaveAction').dataset.habitId,
    walkDone:document.querySelector('.habit[data-id="beach"]')?.classList.contains('done') || false,
  }));
  assert.deepEqual(advanced, {
    title:'Have your next glass of water.',
    detail:'Feels like 96°F',
    habitId:'hydrate',
    walkDone:true,
  });

  await page.evaluate(() => {
    const now = new Date();
    const key = dateKey(now);
    const custom = HABITS.find(habit => habit.id === 'meditate');
    custom.text = '<img id="next-wave-injection" src=x onerror=alert(1)>';
    state.done[key] = Object.fromEntries(getScheduledHabits(HABITS, now)
      .filter(habit => habit.id !== 'meditate')
      .map(habit => [habit.id, true]));
    saveState();
    renderHabits();
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
    const key = dateKey(new Date());
    state.done[key] = { daylight:true, sunscreen:true };
    state.progress[key] = {};
    saveState();
    renderHabits();
    updateRhythmAnchors({ aqi:121, uv:1, feel:72 });
  });
  await page.waitForFunction(() => document.getElementById('nextWaveTitle').textContent.includes('move indoors today'));
  const unfavorable = await page.evaluate(() => ({
    eyebrow:document.getElementById('nextWaveEyebrow').textContent,
    title:document.getElementById('nextWaveTitle').textContent,
    detail:document.getElementById('nextWaveDetail').textContent,
    habitId:document.getElementById('nextWaveAction').dataset.habitId,
  }));
  assert.deepEqual(unfavorable, {
    eyebrow:'Adapt today',
    title:"If you're sensitive to air quality, move indoors today.",
    detail:'Unhealthy for sensitive groups · AQI 121',
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

  const generation = await page.evaluate(() => {
    const first = rhythmWeatherGeneration;
    renderInsights(new Date());
    renderInsights(new Date());
    const afterDouble = rhythmWeatherGeneration;
    return new Promise(resolve => {
      const origFetch = window.fetch;
      let firstResolved = false;
      window.fetch = (url) => {
        if (String(url).includes('air-quality')) {
          return new Promise(res => {
            const delay = firstResolved ? 0 : 80;
            firstResolved = true;
            setTimeout(() => {
              res({ ok:true, json:() => Promise.resolve({ current:{ us_aqi:firstResolved ? 999 : 43 } }) });
            }, delay);
          });
        }
        return origFetch(url);
      };
      renderInsights(new Date());
      renderInsights(new Date());
      setTimeout(() => {
        const result = { first, afterDouble, finalAqi:rhythmWeatherData.aqi };
        window.fetch = origFetch;
        resolve(result);
      }, 250);
    });
  });
  assert.equal(generation.afterDouble, generation.first + 2, 'each renderInsights call increments the generation');
  assert.notEqual(generation.finalAqi, 999, 'superseded environmental response does not overwrite newer context');

  const rollover = await page.evaluate(() => {
    rhythmWeatherData = { sunrise:'6:00 AM', sunset:'8:00 PM', feel:72, uv:4, aqi:43 };
    const currentKey = dateKey(new Date());
    lastRenderedDateKey = '1900-01-01';
    rhythmWeatherGeneration = 0;
    window.dispatchEvent(new Event('pageshow'));
    return {
      afterHasSunrise: !!rhythmWeatherData.sunrise,
      afterHasSunset: !!rhythmWeatherData.sunset,
      afterKeepsFeel: rhythmWeatherData.feel === 72,
      afterKeepsUv: rhythmWeatherData.uv === 4,
      afterKeepsAqi: rhythmWeatherData.aqi === 43,
      generationBumped: rhythmWeatherGeneration > 0,
      keyUpdated: lastRenderedDateKey === currentKey,
    };
  });
  assert.equal(rollover.afterHasSunrise, false, 'rollover clears stale sunrise');
  assert.equal(rollover.afterHasSunset, false, 'rollover clears stale sunset');
  assert.equal(rollover.afterKeepsFeel, true, 'rollover preserves non-day-specific feel');
  assert.equal(rollover.afterKeepsUv, true, 'rollover preserves non-day-specific UV');
  assert.equal(rollover.afterKeepsAqi, true, 'rollover preserves AQI');
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
