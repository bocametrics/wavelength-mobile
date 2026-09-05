const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8778';
const URL = process.env.WAVELENGTH_URL || `${ORIGIN}/?drag-reorder-e2e=local`;
const SHOT_DIR = process.env.WAVELENGTH_SHOT_DIR || 'C:\\Temp';
const THEME = process.env.WAVELENGTH_THEME || 'dark';
const IS_MOBILE = process.env.WAVELENGTH_IS_MOBILE !== '0';
let browser;

(async () => {
  browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({
    width: IS_MOBILE ? 390 : 1280,
    height: IS_MOBILE ? 844 : 800,
    deviceScaleFactor: IS_MOBILE ? 3 : 1,
    isMobile: IS_MOBILE,
    hasTouch: IS_MOBILE,
  });
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });

  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.evaluate(theme => {
    localStorage.clear();
    localStorage.setItem('wavelength_theme', theme);
  }, THEME);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.habit[data-id]');
  await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, {}, THEME);

  // Enter reorder mode
  await page.click('#reorderBtn');
  await page.waitForFunction(() => document.getElementById('reorderBtn').getAttribute('aria-pressed') === 'true');

  // Verify move buttons are visible/hidden based on viewport
  const moveBtnsVisible = await page.evaluate(() => {
    const btn = document.querySelector('.move-btns');
    if (!btn) return null;
    return getComputedStyle(btn).display !== 'none';
  });

  // On mobile, move buttons should be hidden; on desktop, visible
  if (IS_MOBILE) {
    assert.equal(moveBtnsVisible, false, 'mobile: move buttons are hidden in reorder mode');
  } else {
    assert.equal(moveBtnsVisible, true, 'desktop: move buttons are visible in reorder mode');
  }

  // Verify drag handle is visible in reorder mode
  const dragHandleVisible = await page.evaluate(() => {
    const handle = document.querySelector('.drag-handle');
    if (!handle) return null;
    return getComputedStyle(handle).display !== 'none';
  });
  assert.equal(dragHandleVisible, true, 'drag handle is visible in reorder mode');

  // Simulate a drag and leave the ghost lifted for geometry and screenshot evidence.
  const dragResult = await page.evaluate(async () => {
    const handle = document.querySelector('.drag-handle');
    const habitEl = document.querySelector('.habit');
    if (!handle || !habitEl) return { error: 'no handle or habit element' };

    const rect = habitEl.getBoundingClientRect();
    const handleRect = handle.getBoundingClientRect();
    const startX = handleRect.left + handleRect.width / 2;
    const startY = handleRect.top + handleRect.height / 2;

    // Dispatch pointerdown on the handle
    handle.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, clientX: startX, clientY: startY,
    }));

    // Wait DRAG_ARM_MS (300ms) for drag to arm
    await new Promise(r => setTimeout(r, 400));

    const ghost = document.querySelector('.touch-ghost');
    if (!ghost) return { error: 'no ghost found after drag arm' };
    const initialGhostTop = ghost.getBoundingClientRect().top;

    // Move the pointer far to the right; the card itself must remain list-aligned.
    const moveX = startX + 200;
    const moveY = startY + 12;
    document.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, cancelable: true, clientX: moveX, clientY: moveY,
    }));

    // Wait a frame for ghost to update
    await new Promise(r => setTimeout(r, 50));

    const ghostRect = ghost.getBoundingClientRect();
    window.__dragReorderE2E = { moveX, moveY };

    return {
      ghostLeft: Math.round(ghostRect.left),
      ghostRight: Math.round(ghostRect.right),
      ghostTop: Math.round(ghostRect.top),
      ghostMovedY: Math.round(ghostRect.top - initialGhostTop),
      sourceLeft: Math.round(rect.left),
      sourceRight: Math.round(rect.right),
      sourceTop: Math.round(rect.top),
      pointerDeltaY: Math.round(moveY - startY),
      viewportWidth: window.innerWidth,
      ghostStayedInViewport: ghostRect.left >= 0 && ghostRect.right <= window.innerWidth,
    };
  });

  assert.ok(!dragResult.error, `drag simulation error: ${dragResult.error}`);
  assert.ok(dragResult.ghostStayedInViewport,
    `ghost must stay within viewport: left=${dragResult.ghostLeft} right=${dragResult.ghostRight} vw=${dragResult.viewportWidth}`);
  assert.equal(dragResult.ghostLeft, dragResult.sourceLeft, 'ghost keeps the source card left edge');
  assert.equal(dragResult.ghostRight, dragResult.sourceRight, 'ghost keeps the source card right edge');
  assert.equal(dragResult.ghostMovedY, dragResult.pointerDeltaY,
    'ghost preserves the original finger offset instead of jumping vertically');

  // Capture the active lifted card, then release it.
  const shotName = IS_MOBILE ? `wavelength-drag-${THEME}.png` : `wavelength-drag-desktop-${THEME}.png`;
  await page.screenshot({ path: `${SHOT_DIR}\\${shotName}`, fullPage: false });
  await page.evaluate(async () => {
    const { moveX, moveY } = window.__dragReorderE2E;
    document.dispatchEvent(new PointerEvent('pointerup', {
      bubbles:true, cancelable:true, clientX:moveX, clientY:moveY,
    }));
    delete window.__dragReorderE2E;
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  // Exit reorder mode
  await page.click('#reorderBtn');
  await page.waitForFunction(() => document.getElementById('reorderBtn').getAttribute('aria-pressed') === 'false');

  // Verify no horizontal overflow
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  assert.ok(overflow.scrollWidth <= overflow.viewportWidth, 'no horizontal overflow after exiting reorder');

  assert.deepEqual(runtimeErrors, []);
  console.log(`drag reorder ${IS_MOBILE ? 'mobile' : 'desktop'} ${THEME} Edge flow passed`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
});
