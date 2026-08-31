const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8776';
const URL = process.env.WAVELENGTH_URL || `${ORIGIN}/?last-30-days-e2e=local`;
const SHOT = process.env.WAVELENGTH_SHOT || 'C:\\Temp\\wavelength-last-30-days.png';
const HEADER_SHOT = process.env.WAVELENGTH_HEADER_SHOT || 'C:\\Temp\\wavelength-last-30-days-header.png';
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
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('wavelength_theme', 'light');
    const now = new Date();
    const completionCounts = [5, 8, 3, 10, 6, 9, 4, 5];
    const done = {};
    for (let offset = 7; offset >= 0; offset--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, 12);
      const eligible = getScheduledHabits(DEFAULT_HABITS, date);
      const count = Math.min(completionCounts[7 - offset], eligible.length);
      done[dateKey(date)] = Object.fromEntries(eligible.slice(0, count).map(habit => [habit.id, true]));
    }
    const created = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 8).getTime();
    localStorage.setItem('wavelength_wpb', JSON.stringify({
      done, progress:{}, streak:0, longestStreak:0, week:{}, created,
    }));
  });
  await page.reload({ waitUntil:'networkidle0' });
  await page.click('#navInsights');
  await page.waitForFunction(() => document.querySelectorAll('#last30Chart .trend-point').length === 8);

  const result = await page.evaluate(() => {
    const now = new Date();
    const week = getElapsedWeekSummary(state.done || {}, HABITS, now, state.progress || {});
    const trend = getLast30DayTrend(state.done || {}, HABITS, now, state.progress || {}, state.created);
    const card = document.querySelector('.last-30-card');
    const svg = document.getElementById('last30Chart');
    const labels = [...svg.querySelectorAll('.trend-date-label')].map(node => node.textContent);
    const axisLabels = [...svg.querySelectorAll('.trend-axis-label')].map(node => node.textContent);
    const rect = card.getBoundingClientRect();
    return {
      dateLabel:document.getElementById('dateLabel').textContent,
      year:String(now.getFullYear()),
      weekText:document.getElementById('weekStats').textContent,
      expectedWeek:`${week.pct}% completion`,
      trendText:document.getElementById('last30Stats').textContent,
      expectedTrend:`${trend.averagePct}% average · ${trend.trackedDays} days`,
      trackedDays:trend.trackedDays,
      pointCount:svg.querySelectorAll('.trend-point').length,
      pathCount:svg.querySelectorAll('.trend-line').length,
      labels,
      axisLabels,
      title:svg.querySelector('title')?.textContent,
      cardWidth:rect.width,
      viewportWidth:window.innerWidth,
      documentWidth:document.documentElement.scrollWidth,
      cardRight:rect.right,
      cardLeft:rect.left,
    };
  });

  assert.match(result.dateLabel, new RegExp(`^Week \\d+ · ${result.year}$`));
  assert.equal(result.weekText, result.expectedWeek, 'This Week uses elapsed eligible days only');
  assert.equal(result.trendText, result.expectedTrend, 'Last 30 Days shows weighted average and tracked-day count');
  assert.equal(result.trackedDays, 8);
  assert.equal(result.pointCount, 8);
  assert.equal(result.pathCount, 1);
  assert.equal(result.labels.length, 5, 'x-axis uses sparse mobile labels');
  assert.deepEqual(result.axisLabels, ['100%', '50%', '0%']);
  assert.match(result.title, /average completion across 8 tracked days/);
  assert.ok(result.cardLeft >= 0 && result.cardRight <= result.viewportWidth, 'trend card fits the viewport');
  assert.ok(result.documentWidth <= result.viewportWidth, 'page has no horizontal overflow');
  assert.deepEqual(runtimeErrors, []);

  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(resolve => setTimeout(resolve, 300));
  await page.screenshot({ path:HEADER_SHOT, fullPage:false });
  await page.evaluate(() => document.querySelector('.last-30-card').scrollIntoView({ block:'center' }));
  await new Promise(resolve => setTimeout(resolve, 400));
  await page.screenshot({ path:SHOT, fullPage:false });
  console.log('last 30 days 390px Edge flow passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
});
