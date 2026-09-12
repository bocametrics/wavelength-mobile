const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8784';
const URL = process.env.WAVELENGTH_URL || `${ORIGIN}/?native-geolocation-e2e=local`;
const THEME = process.env.WAVELENGTH_THEME || 'light';
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
    args:['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width:390, height:844, deviceScaleFactor:1 });
  const errors = collectErrors(page);
  await page.evaluateOnNewDocument(() => {
    const calls = { checked:0, requested:0, positioned:0, browser:0 };
    window.__nativeGeolocationCalls = calls;
    window.WavelengthNative = {
      isNative:true,
      platform:'ios',
      geolocation:{
        checkPermissions:async () => { calls.checked += 1; return { location:'granted', coarseLocation:'granted' }; },
        requestPermissions:async () => { calls.requested += 1; return { location:'granted', coarseLocation:'granted' }; },
        getCurrentPosition:async options => {
          calls.positioned += 1;
          calls.options = options;
          return { coords:{ latitude:26.7153, longitude:-80.0534 } };
        },
      },
      notifications:null,
    };
    Object.defineProperty(navigator, 'geolocation', {
      configurable:true,
      value:{
        getCurrentPosition() {
          calls.browser += 1;
          throw new Error('navigator.geolocation must not run in Capacitor');
        },
      },
    });
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = String(input);
      if (url.startsWith('https://api.bigdatacloud.net/data/reverse-geocode-client')) {
        return Promise.resolve(new Response(JSON.stringify({ locality:'West Palm Beach' }), {
          status:200,
          headers:{ 'Content-Type':'application/json' },
        }));
      }
      return originalFetch(input, init);
    };
  });
  await page.goto(URL, { waitUntil:'networkidle0' });
  await page.evaluate(theme => {
    localStorage.clear();
    localStorage.setItem('wavelength_theme', theme);
  }, THEME);
  await page.reload({ waitUntil:'networkidle0' });
  await page.waitForFunction(() => window.__nativeGeolocationCalls.positioned > 0);

  const result = await page.evaluate(async () => ({
    location:await getLocation(),
    calls:window.__nativeGeolocationCalls,
    width:{ document:document.documentElement.scrollWidth, viewport:innerWidth },
  }));
  assert.deepEqual(result.location, { lat:26.7153, lon:-80.0534, city:'West Palm Beach' });
  assert.ok(result.calls.checked >= 1, JSON.stringify(result.calls));
  assert.equal(result.calls.requested, 0, 'already-granted native permission does not prompt again');
  assert.ok(result.calls.positioned >= 1, JSON.stringify(result.calls));
  assert.equal(result.calls.browser, 0, 'Capacitor path never invokes navigator.geolocation');
  assert.deepEqual(result.calls.options, { enableHighAccuracy:false, timeout:6000, maximumAge:300000 });
  assert.equal(result.width.document, result.width.viewport, JSON.stringify(result.width));
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log(`native geolocation 390px ${THEME} Edge flow passed`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
});
