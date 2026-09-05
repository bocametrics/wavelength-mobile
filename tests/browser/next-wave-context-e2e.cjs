const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8778';
const URL = process.env.WAVELENGTH_URL || `${ORIGIN}/?next-wave-context-e2e=local`;
const THEME = process.env.WAVELENGTH_THEME || 'dark';
const TOAST_SHOT = process.env.WAVELENGTH_TOAST_SHOT || 'C:\\Temp\\wavelength-toast-dock.png';
const CONTEXT_SHOT = process.env.WAVELENGTH_CONTEXT_SHOT || 'C:\\Temp\\wavelength-next-wave-context.png';
const MOBILITY_SHOT = process.env.WAVELENGTH_MOBILITY_SHOT || 'C:\\Temp\\wavelength-mobility-late.png';
let browser;

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
          current:{ apparent_temperature:84, uv_index:1, is_day:1 },
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
  }, THEME);
  await page.reload({ waitUntil:'networkidle0' });
  await page.waitForSelector('.habit[data-id="affirm"]');

  await page.evaluate(() => toggleHabit('affirm'));
  await page.waitForSelector('#toast.show');
  await page.waitForFunction(() => {
    const toast = document.getElementById('toast');
    const rect = toast.getBoundingClientRect();
    return getComputedStyle(toast).opacity === '1' && rect.top < window.innerHeight;
  });
  const toastGeometry = await page.evaluate(() => {
    const toast = document.getElementById('toast').getBoundingClientRect();
    const dock = document.querySelector('.app-dock').getBoundingClientRect();
    const toastStyle = getComputedStyle(document.getElementById('toast'));
    const dockStyle = getComputedStyle(document.querySelector('.app-dock'));
    return {
      toast:{ top:toast.top, bottom:toast.bottom, left:toast.left, right:toast.right, zIndex:toastStyle.zIndex },
      dock:{ top:dock.top, bottom:dock.bottom, left:dock.left, right:dock.right, zIndex:dockStyle.zIndex },
      gap:dock.top - toast.bottom,
      overlap:Math.max(0, Math.min(toast.bottom, dock.bottom) - Math.max(toast.top, dock.top)),
      toastText:document.getElementById('toast').textContent,
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:window.innerWidth,
    };
  });
  await page.screenshot({ path:TOAST_SHOT, fullPage:false });
  assert.ok(toastGeometry.toastText.length > 0, 'completion produces a visible response toast');
  assert.equal(toastGeometry.overlap, 0, `completion toast must not overlap dock: ${JSON.stringify(toastGeometry)}`);
  assert.ok(toastGeometry.gap >= 8, `completion toast keeps at least 8px above dock: ${JSON.stringify(toastGeometry)}`);
  await page.waitForSelector('#toast.show', { hidden:true });

  await page.evaluate(() => {
    const now = new Date();
    const key = dateKey(now);
    state.done[key] = Object.fromEntries(HABITS
      .filter(habit => !['breakfast','floss'].includes(habit.id))
      .map(habit => [habit.id, true]));
    state.progress[key] = {};
    saveState();
    renderHabits(now);
  });
  await page.evaluate(() => toggleHabit('breakfast'));
  await page.waitForFunction(() => document.getElementById('nextWaveTitle').textContent === 'Floss');
  const flossCue = await page.evaluate(() => ({
    habitId:document.getElementById('nextWaveAction').dataset.habitId,
    eyebrow:document.getElementById('nextWaveEyebrow').textContent,
    title:document.getElementById('nextWaveTitle').textContent,
    detail:document.getElementById('nextWaveDetail').textContent,
    persisted:localStorage.getItem('wavelength_completion_cue'),
  }));
  assert.deepEqual(flossCue, {
    habitId:'floss',
    eyebrow:'An easy next step',
    title:'Floss',
    detail:'Breakfast is done. Take two minutes to floss.',
    persisted:null,
  }, 'checking breakfast surfaces the approved session-only Floss cue');
  await page.evaluate(() => toggleHabit('floss'));
  assert.equal(await page.evaluate(() => recentCompletionCue), null, 'completing Floss clears the meal cue');
  assert.notEqual(await page.$eval('#nextWaveAction', el => el.dataset.habitId), 'floss', 'completed Floss is no longer suggested');

  const contextResults = await page.evaluate(() => {
    const fixed = (hour, minute = 0) => new Date(2026, 7, 31, hour, minute, 0, 0);
    const doneFor = (date, ids) => ({ [dateKey(date)]:Object.fromEntries(ids.map(id => [id, true])) });
    const idsExcept = ids => DEFAULT_HABITS.filter(habit => !ids.includes(habit.id)).map(habit => habit.id);
    const at1921 = fixed(19, 21);
    const keepAt1921 = ['meditate','winddown'];
    const earlyEvening = getNextWaveSuggestion(DEFAULT_HABITS, doneFor(at1921, idsExcept(keepAt1921)), {}, at1921, { aqi:43, isDay:1, sunrise:'6:58 AM', sunset:'7:42 PM' });
    const at1810 = fixed(18, 10);
    const dinnerClosing = getNextWaveSuggestion(DEFAULT_HABITS, doneFor(at1810, idsExcept(['dinner','beach'])), {}, at1810, { aqi:43, isDay:1, sunrise:'6:58 AM', sunset:'7:42 PM' });
    const sunsetEdge = fixed(19, 21);
    const daylightClosing = getNextWaveSuggestion(DEFAULT_HABITS, doneFor(sunsetEdge, idsExcept(['beach'])), {}, sunsetEdge, { aqi:43, isDay:1, sunrise:'6:58 AM', sunset:'7:42 PM' });
    const at1930 = fixed(19, 30);
    const lowLight = getNextWaveSuggestion(DEFAULT_HABITS, doneFor(at1930, idsExcept(['beach'])), {}, at1930, { aqi:43, isDay:1, sunrise:'6:58 AM', sunset:'7:42 PM' });
    const at2000 = fixed(20);
    const afterDark = getNextWaveSuggestion(DEFAULT_HABITS, doneFor(at2000, idsExcept(['beach'])), {}, at2000, { aqi:43, isDay:0, sunrise:'6:58 AM', sunset:'7:42 PM' });
    const at2300 = fixed(23);
    const veryLate = getNextWaveSuggestion(DEFAULT_HABITS, doneFor(at2300, idsExcept(['beach'])), {}, at2300, { aqi:43, isDay:0, sunrise:'6:58 AM', sunset:'7:42 PM' });
    const at2205 = fixed(22, 5);
    const missedBedtime = getNextWaveSuggestion(DEFAULT_HABITS, doneFor(at2205, idsExcept(['sleep'])), {}, at2205, { isDay:0 });
    const at1300 = fixed(13);
    const mobilityFlexible = getNextWaveSuggestion(DEFAULT_HABITS, doneFor(at1300, idsExcept(['stretch'])), {}, at1300, { isDay:1 });
    const at2109 = fixed(21, 9);
    const mobilityLate = getNextWaveSuggestion(DEFAULT_HABITS, doneFor(at2109, idsExcept(['stretch'])), {}, at2109, { isDay:0 });
    state.done[dateKey(at2000)] = Object.fromEntries(idsExcept(['beach']).map(id => [id, true]));
    renderNextWave(at2000);
    return {
      earlyEvening,
      dinnerClosing,
      daylightClosing,
      lowLight,
      afterDark,
      veryLate,
      missedBedtime,
      mobilityFlexible,
      mobilityLate,
      rendered:{
        eyebrow:document.getElementById('nextWaveEyebrow').textContent,
        title:document.getElementById('nextWaveTitle').textContent,
        detail:document.getElementById('nextWaveDetail').textContent,
      },
    };
  });

  assert.equal(contextResults.earlyEvening.habitId, 'meditate', '7:21 PM excludes premature wind-down');
  assert.equal(contextResults.dinnerClosing.habitId, 'dinner');
  assert.equal(contextResults.dinnerClosing.reason, 'window-closing');
  assert.equal(contextResults.daylightClosing.reason, 'daylight-closing');
  assert.equal(contextResults.daylightClosing.detail, 'About 21 minutes of daylight remain.');
  assert.equal(contextResults.lowLight.reason, 'low-light-adapt');
  assert.equal(contextResults.afterDark.reason, 'after-dark-adapt');
  assert.equal(contextResults.afterDark.title, 'Outdoor walk or movement');
  assert.equal(contextResults.veryLate.reason, 'not-timely');
  assert.equal(contextResults.veryLate.habitId, null);
  assert.equal(contextResults.missedBedtime.reason, 'not-timely');
  assert.deepEqual(contextResults.mobilityFlexible, {
    habitId:'stretch', category:'morning', icon:'🧘', reason:'still-fits', eyebrow:'Still fits today',
    title:'10-min mobility', detail:'A mobility session can still work later in the day.', action:'View habit',
  });
  assert.deepEqual(contextResults.mobilityLate, {
    habitId:'stretch', category:'morning', icon:'🧘', reason:'late-form', eyebrow:'Keep it gentle',
    title:'10-min mobility', detail:'A lighter session can still work tonight.', action:'View habit',
  });
  assert.equal(contextResults.rendered.eyebrow, 'Adapt tonight');
  assert.equal(contextResults.rendered.title, 'Outdoor walk or movement');
  assert.match(contextResults.rendered.detail, /gentle indoor movement/i);

  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelector('.next-wave-card').scrollIntoView({ block:'center' });
  });
  await new Promise(resolve => setTimeout(resolve, 300));
  await page.screenshot({ path:CONTEXT_SHOT, fullPage:false });
  const layout = await page.evaluate(() => ({
    documentWidth:document.documentElement.scrollWidth,
    viewportWidth:window.innerWidth,
    actionHeight:document.getElementById('nextWaveAction').getBoundingClientRect().height,
  }));
  assert.ok(layout.documentWidth <= layout.viewportWidth, 'contextual Next Wave has no horizontal overflow');
  assert.ok(layout.actionHeight >= 40, 'View habit action retains its touch target');

  const renderedMobility = await page.evaluate(() => {
    const at2109 = new Date(2026, 7, 31, 21, 9, 0, 0);
    const key = dateKey(at2109);
    state.done[key] = Object.fromEntries(DEFAULT_HABITS
      .filter(habit => habit.id !== 'stretch')
      .map(habit => [habit.id, true]));
    state.progress[key] = {};
    renderNextWave(at2109);
    return {
      eyebrow:document.getElementById('nextWaveEyebrow').textContent,
      title:document.getElementById('nextWaveTitle').textContent,
      detail:document.getElementById('nextWaveDetail').textContent,
      habitId:document.getElementById('nextWaveAction').dataset.habitId,
      habitTitle:HABITS.find(habit => habit.id === 'stretch').text,
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:window.innerWidth,
    };
  });
  assert.deepEqual(renderedMobility, {
    eyebrow:'Keep it gentle',
    title:'10-minute mobility',
    detail:'A lighter session can still work tonight.',
    habitId:'stretch',
    habitTitle:'10-minute mobility',
    documentWidth:390,
    viewportWidth:390,
  });
  await page.screenshot({ path:MOBILITY_SHOT, fullPage:false });
  assert.deepEqual(runtimeErrors, []);

  console.log(`next wave context and toast/dock 390px ${THEME} Edge flow passed`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
});
