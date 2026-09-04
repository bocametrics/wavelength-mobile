const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8778';
const THEME = process.env.WAVELENGTH_THEME || 'dark';
const SHOT = process.env.WAVELENGTH_SHOT || 'C:\\Temp\\wavelength-narrow-header.png';
let browser;

(async () => {
  browser = await puppeteer.launch({
    executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless:true,
    args:['--no-sandbox', '--disable-gpu'],
  });
  const errors = [];
  for (const width of [393, 390, 375, 360]) {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(`${width}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`${width}: ${message.text()}`); });
    await page.setViewport({ width, height:844, deviceScaleFactor:3, isMobile:true, hasTouch:true });
    await page.goto(`${ORIGIN}/?narrow-header-e2e=${THEME}-${width}`, { waitUntil:'networkidle0' });
    await page.evaluate(theme => localStorage.setItem('wavelength_theme', theme), THEME);
    await page.reload({ waitUntil:'networkidle0' });
    const geometry = await page.evaluate(() => {
      const date = document.getElementById('dateDay');
      date.textContent = 'Wednesday, September 30';
      const range = document.createRange();
      range.selectNodeContents(date);
      const logo = document.querySelector('.logo').getBoundingClientRect();
      const dateRect = document.querySelector('.date-display').getBoundingClientRect();
      return {
        text:date.textContent,
        dateLines:range.getClientRects().length,
        taglineDisplay:getComputedStyle(document.querySelector('.logo-sub')).display,
        gap:dateRect.left - logo.right,
        scrollWidth:document.documentElement.scrollWidth,
        viewport:window.innerWidth,
      };
    });
    assert.equal(geometry.text, 'Wednesday, September 30', `${width}px keeps the full date`);
    assert.equal(geometry.dateLines, 1, `${width}px keeps the longest date on one line`);
    assert.equal(geometry.taglineDisplay, 'none', `${width}px hides only the secondary tagline`);
    assert.ok(geometry.gap >= 0, `${width}px keeps the logo and date from overlapping`);
    assert.ok(geometry.scrollWidth <= geometry.viewport, `${width}px has no horizontal overflow`);
    if (width === 360) await page.screenshot({ path:SHOT, fullPage:false });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(`narrow header 393/390/375/360px ${THEME} Edge flow passed`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
