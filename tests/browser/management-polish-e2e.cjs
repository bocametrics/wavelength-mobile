const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const THEME = process.env.WAVELENGTH_THEME || 'light';
const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8791';
const URL = process.env.WAVELENGTH_URL || `${ORIGIN}/?management-polish-e2e=local`;
const SHOT_DIR = process.env.WAVELENGTH_SHOT_DIR || 'C:\\Temp';
fs.mkdirSync(SHOT_DIR, { recursive:true });
let browser;

async function waitForHome(page) {
  await page.waitForFunction(() => document.documentElement.dataset.managementOpen !== 'true');
  await new Promise(resolve => setTimeout(resolve, 150));
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

  await page.goto(URL, { waitUntil:'networkidle0' });
  await page.evaluate(theme => {
    localStorage.clear();
    localStorage.setItem('wavelength_theme', theme);
  }, THEME);
  await page.reload({ waitUntil:'networkidle0' });
  await page.waitForSelector('.habit[data-id]');

  const homeVisual = await page.evaluate(() => {
    const card = document.querySelector('.habit:not(.done)');
    const style = getComputedStyle(card);
    return {
      pageBackground:getComputedStyle(document.body).backgroundColor,
      cardBackground:style.backgroundColor,
      cardBorder:style.borderColor,
      themeColor:document.getElementById('themeColorMeta').content,
      width:{ document:document.documentElement.scrollWidth, viewport:innerWidth },
    };
  });
  const expectedHomeVisual = THEME === 'light'
    ? {
        pageBackground:'rgb(238, 243, 245)',
        cardBackground:'rgb(255, 255, 255)',
        cardBorder:'rgba(28, 53, 68, 0.16)',
        themeColor:'#eef3f5',
      }
    : {
        pageBackground:'rgb(11, 15, 26)',
        cardBackground:'rgb(18, 24, 39)',
        cardBorder:'rgba(255, 255, 255, 0.06)',
        themeColor:'#0b0f1a',
      };
  assert.deepEqual({
    pageBackground:homeVisual.pageBackground,
    cardBackground:homeVisual.cardBackground,
    cardBorder:homeVisual.cardBorder,
    themeColor:homeVisual.themeColor,
  }, expectedHomeVisual, `${THEME} surface hierarchy uses the approved tokens`);
  assert.ok(homeVisual.width.document <= homeVisual.width.viewport, JSON.stringify(homeVisual.width));
  await page.screenshot({ path:path.join(SHOT_DIR, `wavelength-home-contrast-${THEME}.png`), fullPage:false });

  // Reproduce the natural pre-fix collision: a stale flow 1 survives reload,
  // then the reloaded page starts its first Home-origin flow.
  await page.evaluate(() => {
    history.replaceState({
      ...(history.state || {}),
      [MANAGEMENT_HISTORY_KEY]:{
        viewId:'categoriesView',
        flowId:1,
        categoryId:'all',
        habitId:null,
        categoryEditorId:null,
        categoryEditorOrigin:'categories',
        managementOrigin:'home',
      },
    }, '', location.href);
  });
  await page.reload({ waitUntil:'networkidle0' });
  await page.waitForSelector('.habit[data-id]');
  await page.click('#manageBtn');
  await page.waitForFunction(() => document.getElementById('manageCategoryHeading').textContent === 'Manage All Habits');
  const freshFlowId = await page.evaluate(() => history.state?.[MANAGEMENT_HISTORY_KEY]?.flowId);
  assert.notEqual(freshFlowId, 1,
    'a reload gives the new management flow a collision-proof session identity');
  const manageAllHeader = await page.evaluate(() => {
    const header = document.querySelector('#manageCategoryView .management-header').getBoundingClientRect();
    const heading = document.getElementById('manageCategoryHeading').getBoundingClientRect();
    const options = document.getElementById('categoryOptionsBtn');
    return {
      optionsHidden:options.hidden,
      optionsDisplay:getComputedStyle(options).display,
      centerDelta:Math.abs((heading.left + heading.width / 2) - (header.left + header.width / 2)),
    };
  });
  assert.equal(manageAllHeader.optionsHidden, true, 'Manage All suppresses the nonfunctional ellipsis');
  assert.equal(manageAllHeader.optionsDisplay, 'none', 'suppressed Manage All ellipsis consumes no visible space');
  assert.ok(manageAllHeader.centerDelta <= 1, `Manage All title remains centered: ${manageAllHeader.centerDelta}`);
  const manageLifecycleSpacing = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#manageCategoryList .manage-habit-row')];
    const finalRow = rows.at(-1).getBoundingClientRect();
    const actions = document.getElementById('manageHabitLifecycleActions');
    const actionRect = actions.getBoundingClientRect();
    const primary = actions.querySelector('.habit-lifecycle-primary').getBoundingClientRect();
    const secondary = actions.querySelector('.habit-lifecycle-secondary').getBoundingClientRect();
    return {
      listGap:actionRect.top - finalRow.bottom,
      actionGap:secondary.top - primary.bottom,
      primaryHeight:primary.height,
      secondaryHeight:secondary.height,
    };
  });
  assert.deepEqual(manageLifecycleSpacing, {
    listGap:8,
    actionGap:4,
    primaryHeight:64,
    secondaryHeight:44,
  }, 'Manage All uses normal list spacing and keeps the archived action optically close');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('manageCategoryView')).opacity === '1');
  await page.screenshot({ path:path.join(SHOT_DIR, `wavelength-manage-all-${THEME}.png`), fullPage:false });

  await page.click('#manageCategoryBack');
  await waitForHome(page);
  const afterAllBack = await page.evaluate(() => ({
    managementOpen:document.documentElement.dataset.managementOpen === 'true',
    categoriesVisible:!document.getElementById('categoriesView').hidden,
    homeVisible:!document.getElementById('homeView').hidden,
  }));
  assert.deepEqual(afterAllBack, { managementOpen:false, categoriesVisible:false, homeVisible:true },
    'Manage All Back returns deterministically to Home even with stale Categories history');

  // A scoped category opened directly from Home follows that actual origin.
  await page.click('.cat-tab[data-cat="morning"]');
  await page.click('#manageBtn');
  await page.waitForFunction(() => document.getElementById('manageCategoryHeading').textContent === 'Manage Morning');
  await page.click('#manageCategoryBack');
  await waitForHome(page);
  assert.equal(await page.$eval('#homeView', view => !view.hidden), true,
    'Home-origin scoped management returns to Home');

  // A scoped category opened from Categories returns to Categories, including after Habit Editor.
  await page.click('#manageCategoriesBtn');
  await page.waitForFunction(() => !document.getElementById('categoriesView').hidden);
  const addCategoryStyle = await page.$eval('#newCategoryBtn', button => {
    const style = getComputedStyle(button);
    return {
      height:button.getBoundingClientRect().height,
      borderRadius:style.borderRadius,
      fontSize:style.fontSize,
      fontWeight:style.fontWeight,
      backgroundColor:style.backgroundColor,
      borderColor:style.borderColor,
      color:style.color,
    };
  });
  await page.click('#categoriesList [data-category-id="morning"] .category-row-button');
  await page.waitForFunction(() => document.getElementById('manageCategoryHeading').textContent === 'Manage Morning');

  const headerControls = await page.evaluate(() => {
    const backIcon = document.querySelector('#manageCategoryBack svg');
    const optionsIcon = document.querySelector('#categoryOptionsBtn svg');
    const backButton = document.getElementById('manageCategoryBack').getBoundingClientRect();
    const optionsButton = document.getElementById('categoryOptionsBtn').getBoundingClientRect();
    const backPath = backIcon.querySelector('path');
    const optionDots = [...optionsIcon.querySelectorAll('circle')];
    return {
      backTarget:[backButton.width, backButton.height],
      backSize:[backIcon.getBoundingClientRect().width, backIcon.getBoundingClientRect().height],
      backStroke:Number.parseFloat(getComputedStyle(backPath).strokeWidth),
      optionsTarget:[optionsButton.width, optionsButton.height],
      optionsSize:[optionsIcon.getBoundingClientRect().width, optionsIcon.getBoundingClientRect().height],
      dotRadii:optionDots.map(dot => dot.r.baseVal.value),
    };
  });
  assert.ok(headerControls.backTarget.every(size => size >= 44), JSON.stringify(headerControls));
  assert.ok(headerControls.backSize.every(size => size >= 24), JSON.stringify(headerControls));
  assert.ok(headerControls.backStroke >= 2.2, JSON.stringify(headerControls));
  assert.ok(headerControls.optionsTarget.every(size => size >= 44), JSON.stringify(headerControls));
  assert.ok(headerControls.optionsSize.every(size => size >= 26), JSON.stringify(headerControls));
  assert.ok(headerControls.dotRadii.every(radius => radius >= 1.5), JSON.stringify(headerControls));

  await page.click('#categoryOptionsBtn');
  await page.waitForFunction(() => document.getElementById('categoryOptionsSheet').open);
  const optionStyles = await page.evaluate(() => {
    const edit = document.getElementById('editCategoryOption');
    const archive = document.getElementById('categoryRemovalOption');
    const cancel = document.getElementById('categoryOptionsClose');
    const guidance = document.getElementById('categoryOptionsGuidance');
    const style = element => getComputedStyle(element);
    return {
      buttons:[edit, archive, cancel].map(button => ({
        id:button.id,
        textAlign:style(button).textAlign,
        height:button.getBoundingClientRect().height,
        fontSize:style(button).fontSize,
        fontWeight:style(button).fontWeight,
        borderRadius:style(button).borderRadius,
        borderStyle:style(button).borderStyle,
        borderColor:style(button).borderColor,
        backgroundColor:style(button).backgroundColor,
        color:style(button).color,
      })),
      archiveDanger:archive.classList.contains('danger'),
      archiveDisabled:archive.disabled,
      archiveDescribedBy:archive.getAttribute('aria-describedby'),
      guidance:guidance.textContent,
      guidanceTextAlign:style(guidance).textAlign,
      guidanceHasLink:!!guidance.querySelector('a'),
      guidanceGrouped:archive.parentElement === guidance.parentElement && archive.parentElement.classList.contains('category-option-guidance-group'),
      guidanceGap:guidance.getBoundingClientRect().top - archive.getBoundingClientRect().bottom,
      guidanceGroupBorder:style(archive.parentElement).borderStyle,
      guidanceGroupBackground:style(archive.parentElement).backgroundColor,
    };
  });
  assert.ok(optionStyles.buttons.every(button => button.textAlign === 'center'), JSON.stringify(optionStyles));
  assert.equal(addCategoryStyle.height, 50, JSON.stringify(addCategoryStyle));
  assert.ok(optionStyles.buttons.every(button => button.height === 50), JSON.stringify(optionStyles));
  assert.ok(optionStyles.buttons.every(button => button.height === addCategoryStyle.height), JSON.stringify({ optionStyles, addCategoryStyle }));
  assert.ok(optionStyles.buttons.every(button => button.fontSize === addCategoryStyle.fontSize), JSON.stringify({ optionStyles, addCategoryStyle }));
  assert.ok(optionStyles.buttons.every(button => button.fontWeight === addCategoryStyle.fontWeight), JSON.stringify({ optionStyles, addCategoryStyle }));
  assert.ok(optionStyles.buttons.every(button => button.borderRadius === addCategoryStyle.borderRadius), JSON.stringify({ optionStyles, addCategoryStyle }));
  assert.ok(optionStyles.buttons.every(button => button.borderStyle === 'solid'), JSON.stringify(optionStyles));
  assert.ok(optionStyles.buttons.every(button => button.backgroundColor !== 'rgba(0, 0, 0, 0)'), JSON.stringify(optionStyles));
  const editOptionStyle = optionStyles.buttons.find(button => button.id === 'editCategoryOption');
  assert.notEqual(editOptionStyle.backgroundColor, addCategoryStyle.backgroundColor,
    'modal options deliberately use neutral surfaces while Add a Category retains accent emphasis');
  assert.notEqual(editOptionStyle.borderColor, addCategoryStyle.borderColor,
    'modal options deliberately use neutral borders while Add a Category retains accent emphasis');
  assert.notEqual(editOptionStyle.color, addCategoryStyle.color,
    'modal options deliberately use neutral text while Add a Category retains accent emphasis');
  assert.equal(optionStyles.archiveDanger, false, 'reversible Archive is not styled as permanent deletion');
  assert.equal(optionStyles.archiveDisabled, true);
  assert.equal(optionStyles.archiveDescribedBy, 'categoryOptionsGuidance');
  assert.match(optionStyles.guidance, /^Move \d+ active habits first$/);
  assert.equal(optionStyles.guidanceTextAlign, 'center');
  assert.equal(optionStyles.guidanceHasLink, false, 'blocked-archive guidance remains explanatory plain text');
  assert.equal(optionStyles.guidanceGrouped, true, 'Archive and its helper share one semantic group');
  assert.equal(optionStyles.guidanceGap, 4,
    `Archive helper stays outside with a close four-pixel layout gap: ${JSON.stringify(optionStyles)}`);
  assert.equal(optionStyles.guidanceGroupBorder, 'none');
  assert.equal(optionStyles.guidanceGroupBackground, 'rgba(0, 0, 0, 0)');
  await page.screenshot({ path:path.join(SHOT_DIR, `wavelength-category-options-${THEME}.png`), fullPage:false });
  await page.click('#categoryOptionsClose');

  const firstHabitId = await page.$eval('#manageCategoryList .manage-habit-row', row => row.dataset.habitId);
  await page.click(`#manageCategoryList [data-habit-id="${firstHabitId}"] .manage-habit-row-button`);
  await page.waitForFunction(() => !document.getElementById('habitEditorView').hidden);
  await page.click('#habitEditorBack');
  await page.waitForFunction(() => !document.getElementById('manageCategoryView').hidden);
  await page.click('#manageCategoryBack');
  await page.waitForFunction(() => !document.getElementById('categoriesView').hidden);
  assert.equal(await page.$eval('#categoriesView', view => !view.hidden), true,
    'Categories-origin management retains Categories as its parent after Habit Editor');

  assert.deepEqual(runtimeErrors, [], runtimeErrors.join('\n'));
  console.log(`management navigation polish 390px ${THEME} Edge flow passed`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
});
