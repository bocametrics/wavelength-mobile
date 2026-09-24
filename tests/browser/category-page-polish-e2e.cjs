const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('puppeteer-core');

const THEME = process.env.WAVELENGTH_THEME || 'light';
const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8795';
const URL = process.env.WAVELENGTH_URL || `${ORIGIN}/?category-page-polish-e2e=local`;
const SHOT_DIR = process.env.WAVELENGTH_SHOT_DIR || 'C:\\Temp';

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive:true });
  const browser = await puppeteer.launch({
    executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless:true,
    args:['--no-sandbox', '--disable-gpu'],
  });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.stack || error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewport({ width:390, height:844, deviceScaleFactor:3, isMobile:true, hasTouch:true });
    await page.goto(URL, { waitUntil:'networkidle0' });
    await page.evaluate(theme => {
      localStorage.clear();
      localStorage.setItem('wavelength_theme', theme);
    }, THEME);
    await page.reload({ waitUntil:'networkidle0' });
    const homeCard = await page.evaluate(() => {
      const rect = document.querySelector('.habit').getBoundingClientRect();
      return { width:rect.width, left:rect.left, right:rect.right };
    });

    await page.click('#manageCategoriesBtn');
    await page.waitForFunction(() => !document.getElementById('categoriesView').hidden);
    const openingHeaderTop = await page.$eval(
      '#categoriesView .management-header',
      header => header.getBoundingClientRect().top,
    );
    await new Promise(resolve => setTimeout(resolve, 260));
    const categories = await page.evaluate(() => {
      const header = document.querySelector('#categoriesView .management-header');
      const heading = document.getElementById('categoriesHeading');
      const back = document.getElementById('categoriesBack');
      const trailingSlot = header.lastElementChild;
      const row = document.querySelector('#categoriesList .category-row');
      const rowName = row.querySelector('.category-row-name');
      const add = document.getElementById('newCategoryBtn');
      const headerRect = header.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const addRect = add.getBoundingClientRect();
      const headingStyle = getComputedStyle(heading);
      const nameStyle = getComputedStyle(rowName);
      const addStyle = getComputedStyle(add);
      const headingRect = heading.getBoundingClientRect();
      return {
        headerTop:headerRect.top,
        backWidth:back.getBoundingClientRect().width,
        trailingWidth:trailingSlot.getBoundingClientRect().width,
        titleCenter:headingRect.left + headingRect.width / 2,
        viewportCenter:innerWidth / 2,
        titleSize:headingStyle.fontSize,
        titleWeight:headingStyle.fontWeight,
        titleLineHeight:headingStyle.lineHeight,
        rowWidth:rowRect.width,
        rowLeft:rowRect.left,
        rowRight:rowRect.right,
        nameSize:nameStyle.fontSize,
        nameWeight:nameStyle.fontWeight,
        addWidth:addRect.width,
        addHeight:addRect.height,
        addSize:addStyle.fontSize,
        gripDots:row.querySelectorAll('.category-grip-marker i, .category-grip-marker span').length,
        overflow:document.documentElement.scrollWidth - innerWidth,
      };
    });
    assert.ok(Math.abs(openingHeaderTop - categories.headerTop) <= 1,
      JSON.stringify({ openingHeaderTop, settledHeaderTop:categories.headerTop }));
    assert.ok(Math.abs(categories.headerTop) <= 1, JSON.stringify(categories));
    assert.equal(categories.backWidth, 44);
    assert.equal(categories.trailingWidth, 44);
    assert.ok(Math.abs(categories.titleCenter - categories.viewportCenter) <= 0.5, JSON.stringify(categories));
    assert.equal(categories.titleSize, '17px');
    assert.equal(categories.titleWeight, '600');
    assert.equal(categories.titleLineHeight, '20.4px');
    assert.ok(Math.abs(categories.rowWidth - homeCard.width) <= 1, JSON.stringify({ categories, homeCard }));
    assert.ok(Math.abs(categories.rowLeft - homeCard.left) <= 1, JSON.stringify({ categories, homeCard }));
    assert.ok(Math.abs(categories.rowRight - homeCard.right) <= 1, JSON.stringify({ categories, homeCard }));
    assert.equal(categories.nameSize, '16px');
    assert.equal(categories.nameWeight, '500');
    assert.ok(Math.abs(categories.addWidth - categories.rowWidth) <= 1, JSON.stringify(categories));
    assert.ok(categories.addHeight >= 50, JSON.stringify(categories));
    assert.equal(categories.addSize, '16px');
    assert.equal(categories.gripDots, 6);
    assert.ok(categories.overflow <= 0, JSON.stringify(categories));
    await page.screenshot({ path:path.join(SHOT_DIR, `wavelength-categories-polished-${THEME}.png`), fullPage:false });

    await page.click('#newCategoryBtn');
    await page.waitForFunction(() => !document.getElementById('categoryEditorView').hidden);
    await new Promise(resolve => setTimeout(resolve, 260));
    const editor = await page.evaluate(() => {
      const header = document.querySelector('#categoryEditorView .management-header');
      const back = document.getElementById('categoryEditorBack');
      const input = document.getElementById('categoryNameInput');
      const emojiInput = document.getElementById('categoryEmojiInput');
      const submit = document.getElementById('categoryEditorSave');
      const emojiLabel = emojiInput.closest('label')?.querySelector('span')?.textContent.trim();
      return {
        headerTop:header.getBoundingClientRect().top,
        backLabel:back.getAttribute('aria-label'),
        backText:back.textContent.trim(),
        backIcon:!!back.querySelector('svg'),
        headerSave:header.contains(submit),
        submitInCard:document.querySelector('.category-editor-card').contains(submit),
        submitText:submit.textContent.trim(),
        submitDisabled:submit.disabled,
        inputFont:getComputedStyle(input).fontSize,
        emojiInputFont:getComputedStyle(emojiInput).fontSize,
        emojiLabel,
        emojiHelp:document.getElementById('categoryEmojiHelp').textContent.trim(),
        activeElementId:document.activeElement?.id || '',
        scale:visualViewport?.scale || 1,
        overflow:document.documentElement.scrollWidth - innerWidth,
      };
    });
    assert.ok(Math.abs(editor.headerTop) <= 1, JSON.stringify(editor));
    assert.deepEqual({ label:editor.backLabel, text:editor.backText, icon:editor.backIcon }, { label:'Back', text:'', icon:true });
    assert.equal(editor.headerSave, false);
    assert.equal(editor.submitInCard, true);
    assert.equal(editor.submitText, 'Add Category');
    assert.equal(editor.submitDisabled, true);
    assert.equal(editor.inputFont, '16px');
    assert.equal(editor.emojiInputFont, '16px');
    assert.equal(editor.emojiLabel, 'Choose another emoji');
    assert.notEqual(editor.activeElementId, 'categoryNameInput');
    assert.notEqual(editor.activeElementId, 'categoryEmojiInput');
    assert.match(editor.emojiHelp, /emoji keyboard/i);
    assert.equal(editor.scale, 1);
    assert.ok(editor.overflow <= 0, JSON.stringify(editor));

    await page.type('#categoryNameInput', 'Family');
    await page.evaluate(() => {
      const input = document.getElementById('categoryEmojiInput');
      input.value = '👨‍👩‍👧‍👦';
      input.dispatchEvent(new Event('input', { bubbles:true }));
    });
    const valid = await page.evaluate(() => ({
      disabled:document.getElementById('categoryEditorSave').disabled,
      invalid:document.getElementById('categoryEmojiInput').getAttribute('aria-invalid'),
      preview:document.getElementById('categoryEmojiPreview').textContent,
    }));
    assert.deepEqual(valid, { disabled:false, invalid:'false', preview:'👨‍👩‍👧‍👦' });
    await page.screenshot({ path:path.join(SHOT_DIR, `wavelength-new-category-polished-${THEME}.png`), fullPage:false });
    await page.click('#categoryEditorSave');
    await page.waitForFunction(() => document.getElementById('manageCategoryHeading').textContent === 'Manage Family');
    await page.click('#manageCategoryBack');
    await page.waitForFunction(() => !document.getElementById('categoriesView').hidden);
    const persisted = await page.evaluate(() => {
      const category = categoryState.definitions.find(value => value.name === 'Family');
      const row = [...document.querySelectorAll('#categoriesList .category-row')]
        .find(value => value.querySelector('.category-row-name')?.textContent === 'Family');
      return {
        schemaVersion:categoryState.schemaVersion,
        id:category?.id || '',
        iconKey:category?.iconKey || '',
        emoji:category?.emoji || '',
        rendered:row?.querySelector('.category-row-icon')?.textContent || '',
      };
    });
    assert.equal(persisted.schemaVersion, 2);
    assert.match(persisted.id, /^cat_[a-f0-9-]{8,64}$/);
    assert.equal(persisted.iconKey, 'star');
    assert.equal(persisted.emoji, '👨‍👩‍👧‍👦');
    assert.equal(persisted.rendered, '👨‍👩‍👧‍👦');

    await page.click('#newCategoryBtn');
    await page.type('#categoryNameInput', 'Draft');
    let browserBackMessage = '';
    page.once('dialog', async dialog => {
      browserBackMessage = dialog.message();
      await dialog.dismiss();
    });
    await page.goBack();
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(browserBackMessage, 'Discard unsaved changes?');
    assert.equal(await page.$eval('#categoryEditorView', view => !view.hidden), true,
      'declining browser/native Back keeps the Category editor open');
    assert.equal(await page.$eval('#categoryNameInput', input => input.value), 'Draft',
      'declining browser/native Back retains the Category draft');

    let escapeMessage = '';
    page.once('dialog', async dialog => {
      escapeMessage = dialog.message();
      await dialog.dismiss();
    });
    await page.keyboard.press('Escape');
    assert.equal(escapeMessage, 'Discard unsaved changes?');
    assert.equal(await page.$eval('#categoryEditorView', view => !view.hidden), true,
      'declining Escape keeps the Category editor open');
    assert.equal(await page.$eval('#categoryNameInput', input => input.value), 'Draft',
      'declining Escape retains the Category draft');

    let toolbarBackMessage = '';
    page.once('dialog', async dialog => {
      toolbarBackMessage = dialog.message();
      await dialog.accept();
    });
    await page.click('#categoryEditorBack');
    await page.waitForFunction(() => !document.getElementById('categoriesView').hidden);
    assert.equal(toolbarBackMessage, 'Discard unsaved changes?');

    await page.click('#newCategoryBtn');
    await page.type('#categoryNameInput', 'Draft 2');
    let acceptedBrowserBackMessage = '';
    page.once('dialog', async dialog => {
      acceptedBrowserBackMessage = dialog.message();
      await dialog.accept();
    });
    await page.goBack();
    await page.waitForFunction(() => !document.getElementById('categoriesView').hidden);
    assert.equal(acceptedBrowserBackMessage, 'Discard unsaved changes?');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log(`category page polish 390px ${THEME} Edge flow passed`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
