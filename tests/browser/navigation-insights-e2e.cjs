const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8774';
const URL = process.env.WAVELENGTH_URL || `${ORIGIN}/?navigation-insights-e2e=local`;
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
    executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless:true,
    args:['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width:390, height:844, deviceScaleFactor:3, isMobile:true, hasTouch:true });
  const runtimeErrors = collectErrors(page);

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable:true,
      value:{
        getCurrentPosition(success) {
          success({ coords:{ latitude:26.7153, longitude:-80.0534 } });
        },
      },
    });
    const originalFetch = window.fetch.bind(window);
    window.fetch = async input => {
      const url = String(input);
      const quiet = localStorage.getItem('__wavelength_e2e_quiet') === '1';
      if (url.includes('api.open-meteo.com/v1/forecast')) {
        const uv = quiet ? 1 : 7;
        const feel = quiet ? 72 : 96;
        return new Response(JSON.stringify({
          current:{ apparent_temperature:feel, uv_index:uv },
          daily:{ sunrise:['2026-08-30T06:58'], sunset:['2026-08-30T19:42'] },
          timezone:'America/New_York',
        }), { status:200, headers:{ 'Content-Type':'application/json' } });
      }
      if (url.includes('air-quality-api.open-meteo.com')) {
        return new Response(JSON.stringify({ current:{ us_aqi:43 } }), {
          status:200,
          headers:{ 'Content-Type':'application/json' },
        });
      }
      return originalFetch(input);
    };
  });

  await page.goto(URL, { waitUntil:'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil:'networkidle0' });
  await page.waitForFunction(() => rhythmWeatherData?.uv === 7 && rhythmWeatherData?.aqi === 43);
  await page.evaluate(() => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    renderHabits(now);
  });
  await page.waitForFunction(() => document.getElementById('nextWaveTitle')?.textContent === 'Sun protection before outdoor time');
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('wavelength_insights_v1');
    if (!raw) return false;
    const history = JSON.parse(raw);
    return history.days?.[dateKey(new Date())]?.recommendations
      ?.some(item => item.reason === 'uv-protect');
  });

  const home = await page.evaluate(() => {
    const homeView = document.getElementById('homeView');
    const insightsView = document.getElementById('insightsView');
    const wave = document.getElementById('nextWaveCard').getBoundingClientRect();
    const habits = document.getElementById('habitList').getBoundingClientRect();
    const dock = document.querySelector('.app-dock').getBoundingClientRect();
    const dockButtons = [...document.querySelectorAll('.dock-button')].map(button => {
      const rect = button.getBoundingClientRect();
      return { width:Math.round(rect.width), height:Math.round(rect.height) };
    });
    const stored = JSON.parse(localStorage.getItem('wavelength_insights_v1'));
    const today = dateKey(new Date());
    const record = stored.days[today].recommendations.find(item => item.reason === 'uv-protect');
    return {
      homeHidden:homeView.hidden,
      insightsHidden:insightsView.hidden,
      nextWaveBeforeHabits:wave.top < habits.top,
      streakInHome:!!homeView.querySelector('.streak-bar'),
      currentHome:document.getElementById('navHome').getAttribute('aria-current'),
      dock:{ bottom:Math.round(dock.bottom), viewport:innerHeight, buttons:dockButtons },
      width:{ document:document.documentElement.scrollWidth, viewport:innerWidth },
      record,
      storedText:JSON.stringify(stored),
    };
  });
  assert.equal(home.homeHidden, false);
  assert.equal(home.insightsHidden, true);
  assert.equal(home.nextWaveBeforeHabits, true);
  assert.equal(home.streakInHome, false);
  assert.equal(home.currentHome, 'page');
  assert.equal(home.width.document, home.width.viewport);
  assert.ok(home.dock.bottom <= home.dock.viewport, JSON.stringify(home.dock));
  assert.ok(home.dock.buttons.every(button => button.height >= 44), JSON.stringify(home.dock.buttons));
  assert.equal(home.record.habitId, 'sunscreen');
  assert.equal(home.record.reason, 'uv-protect');
  assert.deepEqual(home.record.conditions, { feel:96, uv:7, aqi:43, sunrise:'6:58 AM', sunset:'7:42 PM' });
  assert.deepEqual(home.record.sources, { weather:'open-meteo', aqi:'open-meteo' });
  assert.doesNotMatch(home.storedText, /latitude|longitude|\blat\b|\blon\b/i);

  await page.$eval('#nextWaveCard', element => element.scrollIntoView({ block:'center' }));
  await page.screenshot({ path:path.join(SHOT_DIR, 'wavelength-navigation-home.png') });

  await page.click('#nextWaveAction');
  await page.waitForFunction(() => document.querySelector('.habit[data-id="sunscreen"]'));
  const viewedAt = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('wavelength_insights_v1'));
    const record = stored.days[dateKey(new Date())].recommendations.find(item => item.reason === 'uv-protect');
    return record.viewedAt;
  });
  assert.equal(Number.isInteger(viewedAt), true);

  await page.click('.habit[data-id="sunscreen"]');
  const completed = await page.evaluate(() => {
    const key = dateKey(new Date());
    const stored = JSON.parse(localStorage.getItem('wavelength_insights_v1'));
    const record = stored.days[key].recommendations.find(item => item.reason === 'uv-protect');
    return { state:state.done[key].sunscreen, completedAt:record.completedAt, ledger:stored.days[key].completions.sunscreen };
  });
  assert.equal(completed.state, true);
  assert.equal(Number.isInteger(completed.completedAt), true);
  assert.equal(completed.completedAt, completed.ledger);

  await page.click('.habit[data-id="sunscreen"]');
  const unmarked = await page.evaluate(() => {
    const key = dateKey(new Date());
    const stored = JSON.parse(localStorage.getItem('wavelength_insights_v1'));
    const record = stored.days[key].recommendations.find(item => item.reason === 'uv-protect');
    return {
      state:state.done[key].sunscreen,
      hasCompletedAt:Object.hasOwn(record, 'completedAt'),
      hasLedger:Object.hasOwn(stored.days[key].completions, 'sunscreen'),
    };
  });
  assert.equal(unmarked.state, undefined);
  assert.equal(unmarked.hasCompletedAt, false);
  assert.equal(unmarked.hasLedger, false);

  await page.click('#navInsights');
  await page.waitForFunction(() => !document.getElementById('insightsView').hidden);
  const learning = await page.evaluate(() => {
    const streak = document.querySelector('#insightsView .streak-bar').getBoundingClientRect();
    const week = document.querySelector('#insightsView .weekly').getBoundingClientRect();
    return {
      homeHidden:document.getElementById('homeView').hidden,
      insightsHidden:document.getElementById('insightsView').hidden,
      currentInsights:document.getElementById('navInsights').getAttribute('aria-current'),
      homeCurrent:document.getElementById('navHome').hasAttribute('aria-current'),
      streakBeforeWeek:streak.top < week.top,
      conditionHidden:document.getElementById('conditionInsightSection').hidden,
      adaptiveHidden:document.getElementById('adaptiveDaySection').hidden,
      learningHidden:document.getElementById('insightLearning').hidden,
      learningText:document.getElementById('insightLearning').textContent.replace(/\s+/g, ' ').trim(),
    };
  });
  assert.deepEqual(learning, {
    homeHidden:true,
    insightsHidden:false,
    currentInsights:'page',
    homeCurrent:false,
    streakBeforeWeek:true,
    conditionHidden:true,
    adaptiveHidden:true,
    learningHidden:false,
    learningText:'≈ Learning your rhythm Condition-aware insights appear after 10 relevant days. Each insight will show the sample it is based on.',
  });
  await page.screenshot({ path:path.join(SHOT_DIR, 'wavelength-navigation-insights-learning.png'), fullPage:true });

  const bottomClearance = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const dock = document.querySelector('.app-dock').getBoundingClientRect();
    const learningCard = document.getElementById('insightLearning').getBoundingClientRect();
    return Math.round(dock.top - learningCard.bottom);
  });
  assert.ok(bottomClearance >= 12, `dock clearance was ${bottomClearance}px`);

  await page.evaluate(() => {
    const insight = { version:1, days:{} };
    const storedState = { done:{}, progress:{}, longest:0 };
    for (let index = 0; index < 10; index += 1) {
      const date = new Date();
      date.setHours(9, 0, 0, 0);
      date.setDate(date.getDate() - (11 - index));
      const key = dateKey(date);
      const timestamp = date.getTime();
      const completed = index < 8;
      const recommendations = [{
        habitId:'sunscreen', reason:'uv-protect', shownAt:timestamp, lastShownAt:timestamp,
        observedAt:timestamp, habitLabel:'Sun protection before outdoor time', measurementType:'check',
        ruleVersion:1, rule:{ channel:'weather', reading:'uv', operator:'>=', threshold:3 },
        conditions:{ uv:5 + index / 10 }, sources:{ weather:'open-meteo', aqi:'open-meteo' },
        ...(completed ? { completedAt:timestamp } : {}),
      }];
      const completions = completed ? { sunscreen:timestamp } : {};
      storedState.done[key] = completed ? { sunscreen:true } : {};
      if (index === 7) {
        recommendations.push({
          habitId:'hydrate', reason:'heat-hydrate', shownAt:timestamp + 1, lastShownAt:timestamp + 1,
          observedAt:timestamp + 1, habitLabel:'Drink 16 oz water', measurementType:'amount',
          ruleVersion:1, rule:{ channel:'weather', reading:'feel', operator:'>', threshold:85 },
          completedAt:timestamp + 1, conditions:{ feel:96 }, sources:{ weather:'open-meteo', aqi:'open-meteo' },
        });
        completions.hydrate = timestamp + 1;
        storedState.done[key].hydrate = true;
      }
      insight.days[key] = { recommendations, completions };
    }
    localStorage.setItem('wavelength_wpb', JSON.stringify(storedState));
    localStorage.setItem('wavelength_insights_v1', JSON.stringify(insight));
    localStorage.setItem('__wavelength_e2e_quiet', '1');
  });
  await page.reload({ waitUntil:'networkidle0' });
  await page.click('#navInsights');
  await page.waitForFunction(() => !document.getElementById('conditionInsightSection').hidden && !document.getElementById('adaptiveDaySection').hidden);
  const reports = await page.evaluate(() => ({
    condition:{
      eyebrow:document.getElementById('conditionInsightEyebrow').textContent,
      title:document.getElementById('conditionInsightTitle').textContent,
      detail:document.getElementById('conditionInsightDetail').textContent,
    },
    adaptive:{
      eyebrow:document.getElementById('adaptiveDayEyebrow').textContent,
      title:document.getElementById('adaptiveDayTitle').textContent,
      detail:document.getElementById('adaptiveDayDetail').textContent,
    },
    learningHidden:document.getElementById('insightLearning').hidden,
    backup:createBackupPayload(),
    width:{ document:document.documentElement.scrollWidth, viewport:innerWidth },
  }));
  assert.deepEqual(reports.condition, {
    eyebrow:'Sun-wise',
    title:'You marked “Sun protection before outdoor time” complete on 8 of 10 days when Wavelength showed a UV cue.',
    detail:'Observed in your history · Based on 10 closed UV-cue dates',
  });
  assert.match(reports.adaptive.title, /^You completed two habits after Wavelength showed contextual cues on [A-Z][a-z]{2} \d{1,2}\.$/);
  assert.equal(reports.adaptive.eyebrow, 'Context-aware follow-through');
  assert.equal(reports.adaptive.detail, '“Sun protection before outdoor time” and “Drink 16 oz water” were marked complete.');
  assert.equal(reports.learningHidden, true);
  assert.equal(reports.backup.version, 3);
  assert.equal(reports.backup.insightHistory.version, 1);
  assert.equal(reports.width.document, reports.width.viewport);
  assert.doesNotMatch(JSON.stringify(reports.backup.insightHistory), /latitude|longitude|\blat\b|\blon\b/i);

  await page.$eval('#conditionInsightSection', element => element.scrollIntoView({ block:'start' }));
  await page.screenshot({ path:path.join(SHOT_DIR, 'wavelength-navigation-insights-reports.png'), fullPage:true });

  const invalidAtomic = await page.evaluate(async () => {
    const before = {
      state:localStorage.getItem(STORAGE_KEY),
      order:localStorage.getItem(ORDER_KEY),
      custom:localStorage.getItem(CUSTOM_HABITS_KEY),
      insight:localStorage.getItem(INSIGHT_STORAGE_KEY),
    };
    const payload = createBackupPayload();
    payload.insightHistory.days['2026-08-30'] = {
      recommendations:[{ habitId:'unknown', reason:'uv-protect', shownAt:1, lastShownAt:1, conditions:{uv:5}, sources:{weather:'open-meteo',aqi:'open-meteo'} }],
      completions:{},
    };
    await importBackupFile(new File([JSON.stringify(payload)], 'invalid.json', { type:'application/json' }));
    return {
      before,
      after:{
        state:localStorage.getItem(STORAGE_KEY),
        order:localStorage.getItem(ORDER_KEY),
        custom:localStorage.getItem(CUSTOM_HABITS_KEY),
        insight:localStorage.getItem(INSIGHT_STORAGE_KEY),
      },
      toast:document.getElementById('toast').textContent,
    };
  });
  assert.deepEqual(invalidAtomic.after, invalidAtomic.before);
  assert.match(invalidAtomic.toast, /^Import failed:/);

  const legacy = await page.evaluate(async () => {
    const payload = createBackupPayload();
    payload.version = 1;
    delete payload.insightHistory;
    const importedAt = Date.now();
    await importBackupFile(new File([JSON.stringify(payload)], 'legacy.json', { type:'application/json' }));
    return {
      toast:document.getElementById('toast').textContent,
      insight:JSON.parse(localStorage.getItem(INSIGHT_STORAGE_KEY)),
      importedAt,
      today:dateKey(new Date()),
    };
  });
  assert.equal(legacy.toast, '✓ Backup imported');
  assert.equal(legacy.insight.version, 1);
  assert.ok(Object.keys(legacy.insight.days).every(key => key === legacy.today), JSON.stringify(legacy.insight.days));
  assert.ok(Object.values(legacy.insight.days).flatMap(day => day.recommendations)
    .every(record => record.shownAt >= legacy.importedAt), JSON.stringify(legacy.insight.days));

  assert.deepEqual(runtimeErrors, [], runtimeErrors.join('\n'));
  console.log('navigation and insights 390px Edge flow passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
});
