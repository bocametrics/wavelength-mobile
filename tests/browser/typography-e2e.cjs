const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8766';
const URL = process.env.WAVELENGTH_URL || `${ORIGIN}/?typography-e2e=local`;
const THEME = process.env.WAVELENGTH_THEME || 'light';
const SHOT_DIR = process.env.WAVELENGTH_SHOT_DIR || 'C:\\Temp';
let browser;

function px(value) { return Number.parseFloat(value); }
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
  page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`); });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable:true,
      value:{ getCurrentPosition(success) { success({ coords:{ latitude:26.7153, longitude:-80.0534 } }); } },
    });
    window.fetch = async input => {
      const url = String(input);
      if (url.includes('api.open-meteo.com/v1/forecast')) {
        return new Response(JSON.stringify({
          current:{ apparent_temperature:84, uv_index:7, is_day:1 },
          daily:{ sunrise:['2026-09-13T06:58'], sunset:['2026-09-13T19:42'] },
          timezone:'America/New_York',
        }), { status:200, headers:{ 'Content-Type':'application/json' } });
      }
      if (url.includes('air-quality-api.open-meteo.com')) {
        return new Response(JSON.stringify({ current:{ us_aqi:43 } }), { status:200, headers:{ 'Content-Type':'application/json' } });
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
  await page.waitForSelector('.habit[data-id]');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.habit')).opacity === '1');
  await page.waitForFunction(() => rhythmWeatherReadyGeneration === rhythmWeatherGeneration);

  const home = await page.evaluate(() => {
    const style = selector => {
      const computed = getComputedStyle(document.querySelector(selector));
      return { fontSize:computed.fontSize, lineHeight:computed.lineHeight, fontWeight:computed.fontWeight, color:computed.color, opacity:computed.opacity };
    };
    const cards = [...document.querySelectorAll('.habit')];
    return {
      typography:Object.fromEntries([
        '.date-display .day', '.date-display .label', '.greeting h1', '.greeting p', '.insights h3',
        '.next-wave-eyebrow', '.next-wave-title', '.next-wave-detail', '.next-wave-action', '.cat-tab',
        '.section-title h2', '.section-title .count', '.habit-text', '.habit-note', '.rhythm-anchor-label',
        '.reorder-hint', '.manage-btn', '.reset-btn', '.dock-button',
      ].map(selector => [selector, style(selector)])),
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth,
      titleOverflow:cards.filter(card => card.querySelector('.habit-text').scrollWidth > card.querySelector('.habit-text').clientWidth).map(card => card.dataset.id),
      noteOverflow:cards.filter(card => card.querySelector('.habit-note').scrollWidth > card.querySelector('.habit-note').clientWidth).map(card => card.dataset.id),
      anchorOverflow:cards.filter(card => {
        const anchor = card.querySelector('.rhythm-anchor-label');
        return anchor && anchor.scrollWidth > anchor.clientWidth;
      }).map(card => card.dataset.id),
      verticalOverflow:cards.filter(card => {
        const rect = card.getBoundingClientRect();
        return [...card.querySelectorAll('.habit-body > *')].some(child => child.getBoundingClientRect().bottom > rect.bottom + 0.5);
      }).map(card => card.dataset.id),
      habitNoteColor:getComputedStyle(document.querySelector('.habit-note')).color,
      habitSurface:getComputedStyle(document.querySelector('.habit')).backgroundColor,
    };
  });

  const expectedHomeSizes = {
    '.date-display .day':16, '.date-display .label':12, '.greeting h1':22, '.greeting p':14,
    '.insights h3':14, '.next-wave-eyebrow':12, '.next-wave-title':17, '.next-wave-detail':14,
    '.next-wave-action':13, '.cat-tab':14, '.section-title h2':14, '.section-title .count':13,
    '.habit-text':16, '.habit-note':14, '.rhythm-anchor-label':13, '.reorder-hint':12,
    '.manage-btn':12.5, '.reset-btn':12.5, '.dock-button':13,
  };
  for (const [selector, expected] of Object.entries(expectedHomeSizes)) {
    assert.equal(px(home.typography[selector].fontSize), expected, `${selector} uses the approved mobile size`);
  }
  assert.equal(home.typography['.rhythm-anchor-label'].opacity, '1');
  assert.equal(home.documentWidth, home.viewportWidth, 'Home has no horizontal overflow');
  assert.deepEqual(home.titleOverflow, [], 'shipped titles fit without ellipsis');
  assert.deepEqual(home.noteOverflow, [], 'shipped descriptions fit without ellipsis');
  assert.deepEqual(home.anchorOverflow, [], 'live anchor labels fit without ellipsis');
  assert.deepEqual(home.verticalOverflow, [], 'habit content stays inside fixed cards');
  assert.ok(contrastRatio(home.habitNoteColor, home.habitSurface) >= 4.5, 'habit descriptions meet AA contrast');
  const completedDividerSize = await page.evaluate(() => {
    toggleHabit('wake');
    const divider = document.querySelector('.completed-divider');
    const size = divider ? getComputedStyle(divider).fontSize : null;
    toggleHabit('wake');
    return size;
  });
  assert.ok(completedDividerSize, 'completing a habit renders the completed section label');
  assert.equal(px(completedDividerSize), 12, 'the completed section label stays legible');
  await page.screenshot({ path:path.join(SHOT_DIR, `wavelength-typography-home-${THEME}.png`), fullPage:false });

  await page.click('#manageBtn');
  await page.waitForSelector('#modalOverlay.open');
  const manage = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('.eh-note')];
    const style = selector => getComputedStyle(document.querySelector(selector));
    return {
      sizes:{
        title:style('.modal-header h3').fontSize,
        systemTitle:style('.eh-system-title').fontSize,
        note:style('.eh-note').fontSize,
        counter:style('.eh-note-count').fontSize,
        measurementLabel:style('.eh-measurement-label').fontSize,
        measureField:style('.eh-measure-field').fontSize,
        day:style('.eh-day').fontSize,
        button:style('.modal-btn').fontSize,
      },
      maxLengths:[...new Set(inputs.map(input => input.maxLength))],
      counters:[...document.querySelectorAll('.eh-note-count')].map(item => item.textContent.trim()),
      notes:inputs.map(input => input.value),
      firstRow:(() => {
        const row = document.querySelector('.edit-habit .eh-row');
        const note = row.querySelector('.eh-note').getBoundingClientRect();
        const counter = row.querySelector('.eh-note-count').getBoundingClientRect();
        const parameter = row.querySelector('.eh-param-field')?.getBoundingClientRect();
        return {
          noteWidth:note.width,
          noteRight:note.right,
          counterLeft:counter.left,
          parameterTop:parameter?.top ?? null,
          noteBottom:note.bottom,
        };
      })(),
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth,
    };
  });
  assert.deepEqual(manage.maxLengths, [42]);
  assert.ok(manage.counters.every((counter, index) => counter === `${manage.notes[index].length} / 42`));
  assert.ok(manage.notes.every(note => note.length <= 42));
  assert.equal(px(manage.sizes.title), 16);
  assert.equal(px(manage.sizes.systemTitle), 15);
  assert.equal(px(manage.sizes.note), 16);
  assert.equal(px(manage.sizes.counter), 12);
  assert.equal(px(manage.sizes.measurementLabel), 12);
  assert.equal(px(manage.sizes.measureField), 11.5);
  assert.equal(px(manage.sizes.day), 11.5);
  assert.equal(px(manage.sizes.button), 14);
  assert.equal(manage.documentWidth, manage.viewportWidth, 'Manage has no document overflow');
  assert.ok(manage.firstRow.noteWidth >= 200, 'the card-summary input keeps useful editing width');
  assert.ok(manage.firstRow.counterLeft >= manage.firstRow.noteRight, 'the summary counter does not overlap the input');
  assert.ok(manage.firstRow.parameterTop >= manage.firstRow.noteBottom, 'system parameters wrap below the summary row');
  await page.screenshot({ path:path.join(SHOT_DIR, `wavelength-typography-manage-${THEME}.png`), fullPage:false });

  await page.evaluate(() => {
    const input = document.querySelector('.eh-note');
    input.value = 'X'.repeat(43);
    input.dispatchEvent(new Event('input', { bubbles:true }));
  });
  await page.click('#modalSave');
  await page.waitForFunction(() => document.getElementById('toast').classList.contains('show'));
  assert.equal(await page.$eval('#modalOverlay', modal => modal.classList.contains('open')), true, 'edited over-limit description keeps Manage open');
  assert.equal(await page.$eval('.eh-note-count', counter => counter.textContent.trim()), '43 / 42');
  assert.equal(await page.$eval('.eh-note', input => document.activeElement === input), true);
  assert.equal(await page.evaluate(() => localStorage.getItem(CUSTOM_HABITS_KEY)), null, 'rejected description changes nothing');

  const longToast = await page.evaluate(() => {
    showToast('Use 60 characters or fewer; avoid semicolons, em dashes, “Anchor:”, and comparison phrases');
    const toast = document.getElementById('toast');
    const rect = toast.getBoundingClientRect();
    const computed = getComputedStyle(toast);
    return { left:rect.left, right:rect.right, width:rect.width, whiteSpace:computed.whiteSpace, fontSize:computed.fontSize, textAlign:computed.textAlign };
  });
  assert.ok(longToast.left >= 14, JSON.stringify(longToast));
  assert.ok(longToast.right <= 376, JSON.stringify(longToast));
  assert.equal(longToast.whiteSpace, 'normal');
  assert.equal(longToast.textAlign, 'center');
  assert.equal(px(longToast.fontSize), 14);
  await page.screenshot({ path:path.join(SHOT_DIR, `wavelength-typography-manage-error-${THEME}.png`), fullPage:false });
  await page.click('#modalClose');

  await page.evaluate(() => {
    localStorage.setItem(CUSTOM_HABITS_KEY, JSON.stringify({ wake:{ note:'L'.repeat(60) } }));
    reloadHabits();
    renderHabits();
  });
  await page.click('#manageBtn');
  await page.waitForSelector('#modalOverlay.open');
  assert.equal(await page.$eval('.edit-habit[data-id="wake"] .eh-note', input => input.value.length), 60);
  await page.click('#modalSave');
  await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open'));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(CUSTOM_HABITS_KEY)).wake.note.length), 60,
    'unchanged legacy descriptions survive unrelated saves');

  await page.click('#navInsights');
  await page.waitForFunction(() => !document.getElementById('insightsView').hidden);
  const insights = await page.evaluate(() => {
    const size = selector => getComputedStyle(document.querySelector(selector)).fontSize;
    return {
      sizes:{
        introTitle:size('.insights-intro h1'), introBody:size('.insights-intro p'), streakLabel:size('.streak-info .label'),
        streakMeta:size('.streak-best'), weeklyTitle:size('.weekly-header h3'), weeklyStat:size('.weekly-header span'),
        dayLabel:size('.week-day .label'), dayCount:size('.week-day .count'), chartLabel:size('.trend-axis-label'),
        sectionLabel:size('.insight-section-label'), reportTitle:size('.report-card-title'), reportDetail:size('.report-card-detail'),
        learningTitle:size('.insight-learning strong'), learningBody:size('.insight-learning p'), progress:size('.insight-progress'),
      },
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth,
    };
  });
  const expectedInsightSizes = {
    introTitle:22, introBody:14, streakLabel:13, streakMeta:12, weeklyTitle:13, weeklyStat:13,
    dayLabel:12, dayCount:11, chartLabel:11, sectionLabel:12, reportTitle:16, reportDetail:14,
    learningTitle:14, learningBody:13.5, progress:12,
  };
  for (const [key, expected] of Object.entries(expectedInsightSizes)) assert.equal(px(insights.sizes[key]), expected, `${key} uses the approved size`);
  assert.equal(insights.documentWidth, insights.viewportWidth, 'Insights has no horizontal overflow');
  await page.screenshot({ path:path.join(SHOT_DIR, `wavelength-typography-insights-${THEME}.png`), fullPage:false });

  await page.click('#navSettings');
  await page.waitForFunction(() => !document.getElementById('settingsView').hidden);
  const settings = await page.evaluate(() => {
    const size = selector => getComputedStyle(document.querySelector(selector)).fontSize;
    return {
      sizes:{
        introTitle:size('.settings-intro h1'), introBody:size('.settings-intro p'), cardTitle:size('.settings-card h2'),
        field:size('.settings-field'), input:size('.settings-field input'), themeStatus:size('.theme-status'),
        themeOption:size('.theme-option'), notificationBody:size('.native-notification-heading p'),
        notificationStatus:size('.native-notification-status'),
      },
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth,
    };
  });
  const expectedSettingsSizes = {
    introTitle:22, introBody:14, cardTitle:15, field:14, input:16, themeStatus:12.5,
    themeOption:14, notificationBody:13, notificationStatus:12.5,
  };
  for (const [key, expected] of Object.entries(expectedSettingsSizes)) assert.equal(px(settings.sizes[key]), expected, `${key} uses the approved size`);
  assert.equal(settings.documentWidth, settings.viewportWidth, 'Settings has no horizontal overflow');
  await page.screenshot({ path:path.join(SHOT_DIR, `wavelength-typography-settings-${THEME}.png`), fullPage:false });

  assert.deepEqual(runtimeErrors, []);
  console.log(`typography and concise-description 390px Edge flow passed (${THEME})`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
