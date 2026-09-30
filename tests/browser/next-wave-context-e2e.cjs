const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8778';
const URL = process.env.WAVELENGTH_URL || `${ORIGIN}/?next-wave-context-e2e=local`;
const THEME = process.env.WAVELENGTH_THEME || 'dark';
const TOAST_SHOT = process.env.WAVELENGTH_TOAST_SHOT || 'C:\\Temp\\wavelength-toast-dock.png';
const CONTEXT_SHOT = process.env.WAVELENGTH_CONTEXT_SHOT || 'C:\\Temp\\wavelength-next-wave-context.png';
const FORECAST_SHOT = process.env.WAVELENGTH_FORECAST_SHOT || 'C:\\Temp\\wavelength-next-wave-forecast.png';
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
    window.__forecastFetchCount = 0;
    Object.defineProperty(navigator, 'geolocation', {
      configurable:true,
      value:{ getCurrentPosition(success) { success({ coords:{ latitude:26.7153, longitude:-80.0534 } }); } },
    });
    window.fetch = async input => {
      const url = String(input);
      if (url.includes('api.open-meteo.com/v1/forecast')) {
        window.__forecastFetchCount += 1;
        return new Response(JSON.stringify({
          current:{ apparent_temperature:84, uv_index:1, is_day:1 },
          hourly:{
            time:['2026-09-30T08:00','2026-09-30T09:00','2026-09-30T10:00'],
            apparent_temperature:[80,81,82], uv_index:[1,2,3], is_day:[1,1,1],
            precipitation_probability:[20,65,80],
          },
          daily:{ sunrise:['2026-08-31T06:58'], sunset:['2026-08-31T19:42'] },
          timezone:'America/New_York',
        }), { status:200, headers:{ 'Content-Type':'application/json' } });
      }
      if (url.includes('air-quality-api.open-meteo.com')) {
        return new Response(JSON.stringify({
          current:{ us_aqi:43 },
          hourly:{ time:['2026-09-30T09:00','2026-09-30T08:00'], us_aqi:[55,45] },
          timezone:'America/New_York',
        }), {
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
  await page.waitForFunction(() => rhythmWeatherReadyGeneration === rhythmWeatherGeneration &&
    rhythmWeatherData?.hourlyForecast?.entries?.length === 3);
  const hourlySnapshot = await page.evaluate(() => ({
    timezone:rhythmWeatherData.hourlyForecast.timezone,
    entries:rhythmWeatherData.hourlyForecast.entries,
    fetchedAt:rhythmWeatherData.hourlyForecastFetchedAt,
    visibleCopy:document.getElementById('nextWaveDetail').textContent,
  }));
  assert.deepEqual(hourlySnapshot.entries, [
    { time:'2026-09-30T08:00', apparentTemperature:80, uv:1, isDay:true, precipitationProbability:20, aqi:45 },
    { time:'2026-09-30T09:00', apparentTemperature:81, uv:2, isDay:true, precipitationProbability:65, aqi:55 },
    { time:'2026-09-30T10:00', apparentTemperature:82, uv:3, isDay:true, precipitationProbability:80 },
  ], 'the browser runtime joins hourly weather and AQI by timestamp');
  assert.equal(hourlySnapshot.timezone, 'America/New_York');
  assert.ok(Number.isFinite(hourlySnapshot.fetchedAt), 'the runtime-only hourly snapshot records acquisition time');
  assert.equal(await page.evaluate(() => window.__forecastFetchCount), 1,
    'initial pageshow recovery does not abort and duplicate the in-flight forecast request');
  assert.doesNotMatch(hourlySnapshot.visibleCopy, /best time|it(?:'|’)s raining/i,
    'forecast copy never overstates probability as observed rain or a universal best time');

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
    targetLabel:document.getElementById('nextWaveTarget')?.textContent || '',
    detail:document.getElementById('nextWaveDetail').textContent,
    persisted:localStorage.getItem('wavelength_completion_cue'),
  }));
  assert.deepEqual(flossCue, {
    habitId:'floss',
    eyebrow:'An easy next step',
    title:'Floss', targetLabel:'',
    detail:'Breakfast is done. Take two minutes to floss.',
    persisted:null,
  }, 'checking breakfast surfaces the approved session-only Floss cue');
  await page.evaluate(() => {
    const floss = HABITS.find(habit => habit.id === 'floss');
    floss.measurement = 'count';
    floss.target = 2;
    delete floss.step;
    delete floss.unit;
    renderHabits(new Date());
    focusNextWaveHabit('floss', new Date());
    adjustMeasuredHabit('floss', 1);
  });
  const partialFloss = await page.evaluate(() => ({
    progress:state.progress?.[dateKey(new Date())]?.floss,
    suggestedId:document.getElementById('nextWaveAction')?.dataset.habitId || null,
    title:document.getElementById('nextWaveTitle')?.textContent,
    cue:recentNextWaveProgressCue,
  }));
  assert.equal(partialFloss.progress, 1, 'the count increment remains incomplete at 1/2');
  assert.equal(partialFloss.suggestedId, null, 'the only just-acted-on count habit pauses rather than persisting');
  assert.equal(partialFloss.title, 'Nice work taking a step.');
  assert.equal(partialFloss.cue.habitId, 'floss');
  assert.ok(Date.now() - partialFloss.cue.actedAt < 5_000, 'partial progress starts a fresh cooldown');

  await page.evaluate(() => adjustMeasuredHabit('floss', 1));
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
    const poorAirDinnerClosing = getNextWaveSuggestion(DEFAULT_HABITS, doneFor(at1810, idsExcept(['dinner','beach'])), {}, at1810, { aqi:121, isDay:1, sunrise:'6:58 AM', sunset:'7:42 PM' });
    const poorAirOnly = getNextWaveSuggestion(DEFAULT_HABITS, doneFor(at1810, idsExcept(['beach'])), {}, at1810, { aqi:121, isDay:1, sunrise:'6:58 AM', sunset:'7:42 PM' });
    const sunsetEdge = fixed(19, 21);
    const daylightClosing = getNextWaveSuggestion(DEFAULT_HABITS, doneFor(sunsetEdge, idsExcept(['beach'])), {}, sunsetEdge, { aqi:43, isDay:1, sunrise:'6:58 AM', sunset:'7:42 PM' });
    const at1930 = fixed(19, 30);
    const lowLight = getNextWaveSuggestion(DEFAULT_HABITS, doneFor(at1930, idsExcept(['beach'])), {}, at1930, { aqi:43, isDay:1, sunrise:'6:58 AM', sunset:'7:42 PM' });
    const at2000 = fixed(20);
    const afterDark = getNextWaveSuggestion(DEFAULT_HABITS, doneFor(at2000, idsExcept(['beach'])), {}, at2000, { aqi:43, isDay:0, sunrise:'6:58 AM', sunset:'7:42 PM' });
    const beach = DEFAULT_HABITS.find(habit => habit.id === 'beach');
    const phaseCompetitor = (id, context) => ({ id, cat:'mind', icon:'○', text:`${id} habit`, note:'Fits indoors', context });
    const flexibleOverFallback = getNextWaveSuggestion([beach, phaseCompetitor('flexible-fit', { start:360, idealStart:420, idealEnd:720, end:1260, setting:'indoor', duration:5 })], {}, {}, at2000, { aqi:43, isDay:0 });
    const lateOverFallback = getNextWaveSuggestion([beach, phaseCompetitor('late-fit', { start:360, idealStart:420, idealEnd:720, lateStart:1140, end:1260, setting:'indoor', duration:5 })], {}, {}, at2000, { aqi:43, isDay:0 });
    const availableOverFallback = getNextWaveSuggestion([beach, phaseCompetitor('available-fit', { start:360, idealStart:1260, end:1320, setting:'indoor', duration:5 })], {}, {}, at2000, { aqi:43, isDay:0 });
    const at2300 = fixed(23);
    const veryLate = getNextWaveSuggestion(DEFAULT_HABITS, doneFor(at2300, idsExcept(['beach'])), {}, at2300, { aqi:43, isDay:0, sunrise:'6:58 AM', sunset:'7:42 PM' });
    const at2205 = fixed(22, 5);
    const missedBedtime = getNextWaveSuggestion(DEFAULT_HABITS, doneFor(at2205, idsExcept(['sleep'])), {}, at2205, { isDay:0 });
    const at1300 = fixed(13);
    const mobilityFlexible = getNextWaveSuggestion(HABITS, doneFor(at1300, idsExcept(['stretch'])), {}, at1300, { isDay:1 });
    const at2109 = fixed(21, 9);
    const mobilityLate = getNextWaveSuggestion(HABITS, doneFor(at2109, idsExcept(['stretch'])), {}, at2109, { isDay:0 });
    state.done[dateKey(at2000)] = Object.fromEntries(idsExcept(['beach']).map(id => [id, true]));
    rhythmWeatherData = {
      ...rhythmWeatherData,
      aqi:43,
      isDay:0,
      sunrise:'6:58 AM',
      sunset:'7:42 PM',
      weatherObservedAt:at2000.getTime(),
      aqiObservedAt:at2000.getTime(),
    };
    renderNextWave(at2000);
    return {
      earlyEvening,
      dinnerClosing,
      poorAirDinnerClosing,
      poorAirOnly,
      daylightClosing,
      lowLight,
      afterDark,
      flexibleOverFallback,
      lateOverFallback,
      availableOverFallback,
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
  assert.deepEqual(contextResults.poorAirDinnerClosing, {
    habitId:'dinner', category:'fuel', icon:'🍳', reason:'window-closing', eyebrow:'Window closing',
    title:'Finish dinner', detail:'Your dinner window is closing.', action:'View habit', targetLabel:'',
  }, 'a genuine closing window outranks a poor-air indoor version');
  assert.deepEqual(contextResults.poorAirOnly, {
    habitId:'beach', category:'movement', icon:'🌊', reason:'aqi-adapt', eyebrow:'Adapt today',
    title:'Outdoor walk or movement', detail:'AQI 121 · Move indoors if you’re sensitive.', action:'View habit', targetLabel:'',
  }, 'poor air resolves to the data-driven indoor version when no higher-priority action fits');
  assert.equal(contextResults.daylightClosing.reason, 'daylight-closing');
  assert.equal(contextResults.daylightClosing.detail, 'About 21 minutes of daylight remain.');
  assert.equal(contextResults.lowLight.reason, 'low-light-adapt');
  assert.equal(contextResults.afterDark.reason, 'after-dark-adapt');
  assert.equal(contextResults.afterDark.title, 'Outdoor walk or movement');
  assert.equal(contextResults.flexibleOverFallback.habitId, 'flexible-fit');
  assert.equal(contextResults.flexibleOverFallback.reason, 'still-fits');
  assert.equal(contextResults.lateOverFallback.habitId, 'late-fit');
  assert.equal(contextResults.lateOverFallback.reason, 'late-form');
  assert.equal(contextResults.availableOverFallback.habitId, 'available-fit');
  assert.equal(contextResults.availableOverFallback.reason, 'available-now');
  assert.equal(contextResults.veryLate.reason, 'not-timely');
  assert.equal(contextResults.veryLate.habitId, null);
  assert.equal(contextResults.missedBedtime.reason, 'not-timely');
  assert.deepEqual(contextResults.mobilityFlexible, {
    habitId:'stretch', category:'morning', icon:'🧘', reason:'still-fits', eyebrow:'Still fits today',
    title:'Mobility', detail:'A mobility session can still work later in the day.', action:'View habit', targetLabel:'10 min',
  });
  assert.deepEqual(contextResults.mobilityLate, {
    habitId:'stretch', category:'morning', icon:'🧘', reason:'late-form', eyebrow:'Keep it gentle',
    title:'Mobility', detail:'A lighter session can still work tonight.', action:'View habit', targetLabel:'10 min',
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

  const forecastResults = await page.evaluate(() => {
    const fixed = (hour, minute = 0) => new Date(2026, 8, 30, hour, minute, 0, 0);
    const time = hour => `2026-09-30T${String(hour).padStart(2, '0')}:00`;
    const doneExcept = (date, openIds) => ({
      [dateKey(date)]:Object.fromEntries(DEFAULT_HABITS
        .filter(habit => !openIds.includes(habit.id))
        .map(habit => [habit.id, true])),
    });
    const data = (now, rows, extra = {}) => ({
      sunrise:'6:58 AM', sunset:'8:00 PM', isDay:true,
      hourlyForecastFetchedAt:now.getTime(),
      hourlyForecast:{
        timezone:'America/New_York',
        entries:rows.map(([hour, apparentTemperature, uv, precipitationProbability, isDay, aqi]) => ({
          time:time(hour), apparentTemperature, uv, precipitationProbability, isDay, aqi,
        })),
      },
      ...extra,
    });

    const movementNow = fixed(16, 7);
    const movementData = data(movementNow, [
      [16, 90, 2, 80, true, 43], [17, 90, 2, 80, true, 43],
      [18, 84, 2, 30, true, 43], [19, 84, 2, 30, true, 43],
    ], { aqi:43 });
    const movement = getNextWaveSuggestion(
      DEFAULT_HABITS, doneExcept(movementNow, ['beach']), {}, movementNow, movementData,
    );

    const daylightNow = fixed(7, 7);
    const daylightData = data(daylightNow, [
      [7, 92, 2, 20, true, 40], [8, 84, 2, 20, true, 40],
      [9, 84, 2, 20, true, 40], [10, 84, 2, 20, true, 40],
    ]);
    const daylight = getNextWaveSuggestion(
      DEFAULT_HABITS, doneExcept(daylightNow, ['daylight']), {}, daylightNow, daylightData,
    );

    const sunscreenNow = fixed(8, 7);
    const sunscreenData = data(sunscreenNow, [
      [8, 80, 4, 20, true, undefined],
      [9, 81, 4, 20, true, undefined],
      [10, 82, 4, 20, true, undefined],
    ]);
    const sunscreen = getNextWaveSuggestion(
      DEFAULT_HABITS, doneExcept(sunscreenNow, ['sunscreen']), {}, sunscreenNow, sunscreenData,
    );

    state.done[dateKey(movementNow)] = doneExcept(movementNow, ['beach'])[dateKey(movementNow)];
    state.progress[dateKey(movementNow)] = {};
    rhythmWeatherData = movementData;
    rhythmWeatherReadyGeneration = rhythmWeatherGeneration;
    renderNextWave(movementNow);
    return {
      movement,
      daylight,
      sunscreen,
      rendered:{
        eyebrow:document.getElementById('nextWaveEyebrow').textContent,
        title:document.getElementById('nextWaveTitle').textContent,
        detail:document.getElementById('nextWaveDetail').textContent,
        habitId:document.getElementById('nextWaveAction').dataset.habitId,
        documentWidth:document.documentElement.scrollWidth,
        viewportWidth:window.innerWidth,
      },
    };
  });
  assert.deepEqual(forecastResults.movement, {
    habitId:'beach', category:'movement', icon:'🌊', reason:'forecast-window', eyebrow:'Better window ahead',
    title:'Outdoor walk or movement', targetLabel:'',
    detail:'Feels like 84°F · Rain chance 30% around 6:00 PM.', action:'View habit',
  }, 'movement exposes the exact bounded cooler-and-drier forecast copy');
  assert.deepEqual(forecastResults.daylight, {
    habitId:'daylight', category:'morning', icon:'🌤️', reason:'forecast-window', eyebrow:'Better window ahead',
    title:'Get outdoor light after waking', targetLabel:'',
    detail:'Feels like 84°F around 8:00 AM.', action:'View habit',
  }, 'morning light participates without losing its stable habit identity');
  assert.deepEqual(forecastResults.sunscreen, {
    habitId:'sunscreen', category:'hygiene', icon:'🧴', reason:'forecast-uv', eyebrow:'Suggested now',
    title:'Sun protection before outdoor time', targetLabel:'',
    detail:'Forecast UV 4 · Protect before going out.', action:'View habit',
  }, 'sun protection uses hourly UV without misrepresenting its two-minute task as outdoor exposure');
  assert.deepEqual(forecastResults.rendered, {
    eyebrow:'Better window ahead',
    title:'Outdoor walk or movement',
    detail:'Feels like 84°F · Rain chance 30% around 6:00 PM.',
    habitId:'beach',
    documentWidth:390,
    viewportWidth:390,
  });
  await page.evaluate(() => {
    document.querySelector('.next-wave-card').scrollIntoView({ block:'center' });
  });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.next-wave-card')).opacity === '1');
  await page.screenshot({ path:FORECAST_SHOT, fullPage:false });

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
      targetLabel:document.getElementById('nextWaveTarget')?.textContent || '',
      detail:document.getElementById('nextWaveDetail').textContent,
      habitId:document.getElementById('nextWaveAction').dataset.habitId,
      habitTitle:HABITS.find(habit => habit.id === 'stretch').text,
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:window.innerWidth,
    };
  });
  assert.deepEqual(renderedMobility, {
    eyebrow:'Keep it gentle',
    title:'Mobility', targetLabel:'10 min',
    detail:'A lighter session can still work tonight.',
    habitId:'stretch',
    habitTitle:'Mobility',
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
