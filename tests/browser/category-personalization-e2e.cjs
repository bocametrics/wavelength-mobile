const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const THEME = process.env.WAVELENGTH_THEME || 'light';
const ORIGIN = process.env.WAVELENGTH_ORIGIN || 'http://127.0.0.1:8791';
const URL = `${ORIGIN}/?category-personalization-e2e=local`;
const SHOT_DIR = process.env.WAVELENGTH_SHOT_DIR || 'C:\\Temp';

(async () => {
  const browser = await puppeteer.launch({
    executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless:true,
    args:['--no-sandbox', '--disable-gpu'],
  });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.stack || error.message));
    await page.setViewport({ width:390, height:844, deviceScaleFactor:3, isMobile:true, hasTouch:true });
    await page.goto(URL, { waitUntil:'networkidle0' });
    await page.evaluate(theme => {
      localStorage.clear();
      localStorage.setItem('wavelength_theme', theme);
    }, THEME);
    await page.reload({ waitUntil:'networkidle0' });

    const home = await page.evaluate(() => {
      const control = id => {
        const button = document.getElementById(id);
        const rect = button.getBoundingClientRect();
        return {
          label:button.getAttribute('aria-label'),
          width:rect.width,
          height:rect.height,
          hasIcon:!!button.querySelector('svg'),
        };
      };
      return {
        tabs:[...document.querySelectorAll('.cat-tab')].map(tab => tab.textContent),
        railPlus:!!document.querySelector('.manage-categories-btn'),
        manage:control('manageBtn'),
        categories:control('manageCategoriesBtn'),
        count:document.getElementById('doneCount').textContent,
        width:{ document:document.documentElement.scrollWidth, viewport:innerWidth },
      };
    });
    assert.deepEqual(home.tabs, ['All','🌅 Morning','🏃 Movement','🧠 Mind','🥗 Fuel','🧼 Hygiene','🌙 Evening']);
    assert.equal(home.railPlus, false, 'category rail has no trailing plus');
    assert.deepEqual(home.manage, { label:'Manage habits', width:44, height:44, hasIcon:true });
    assert.deepEqual(home.categories, { label:'Manage categories', width:44, height:44, hasIcon:true });
    assert.match(home.count, /^\d+\/\d+$/, 'Home count uses compact completed/total formatting');
    assert.ok(home.width.document <= home.width.viewport, JSON.stringify(home.width));
    await page.screenshot({ path:path.join(SHOT_DIR, `wavelength-home-controls-${THEME}.png`), fullPage:false });
    const originScroll = await page.evaluate(() => {
      const target = Math.min(320, document.documentElement.scrollHeight - innerHeight);
      window.scrollTo(0, target);
      return new Promise(resolve => requestAnimationFrame(() => resolve(window.scrollY)));
    });
    assert.ok(originScroll > 0, 'Home has enough content to verify origin scroll restoration');

    await page.click('#manageCategoriesBtn');
    await page.waitForFunction(() => !document.getElementById('categoriesView').hidden);
    const categories = await page.evaluate(() => ({
      rows:[...document.querySelectorAll('#categoriesList .category-row-name')].map(node => node.textContent),
      allRow:!!document.querySelector('#categoriesList [data-category-id="all"]'),
      counts:document.querySelectorAll('#categoriesList .category-row-meta').length,
      archivedHidden:document.getElementById('archivedCategoriesGroup').hidden,
      back:{ label:document.getElementById('categoriesBack').getAttribute('aria-label'), text:document.getElementById('categoriesBack').textContent.trim(), icon:!!document.querySelector('#categoriesBack svg') },
      header:{ position:getComputedStyle(document.querySelector('#categoriesView .management-header')).position, paddingTop:getComputedStyle(document.querySelector('#categoriesView .management-header')).paddingTop },
      nameSize:getComputedStyle(document.querySelector('#categoriesList .category-row-name')).fontSize,
      dock:getComputedStyle(document.querySelector('.app-dock')).display,
      width:{ document:document.documentElement.scrollWidth, viewport:innerWidth },
    }));
    assert.deepEqual(categories.rows, ['Morning','Movement','Mind','Fuel','Hygiene','Evening']);
    assert.equal(categories.allRow, false);
    assert.equal(categories.counts, 0);
    assert.equal(categories.archivedHidden, true);
    assert.deepEqual(categories.back, { label:'Back', text:'', icon:true });
    assert.equal(categories.header.position, 'sticky');
    assert.notEqual(categories.header.paddingTop, '0px');
    assert.equal(categories.nameSize, '16px');
    assert.equal(categories.dock, 'none');
    assert.ok(categories.width.document <= categories.width.viewport, JSON.stringify(categories.width));
    const mobileScrollStyles = await page.evaluate(() => ({
      htmlScrollbar:getComputedStyle(document.documentElement).scrollbarWidth,
      bodyScrollbar:getComputedStyle(document.body).scrollbarWidth,
      htmlOverflowX:getComputedStyle(document.documentElement).overflowX,
      bodyOverflowX:getComputedStyle(document.body).overflowX,
    }));
    assert.deepEqual(mobileScrollStyles, {
      htmlScrollbar:'none',
      bodyScrollbar:'none',
      htmlOverflowX:'clip',
      bodyOverflowX:'clip',
    });
    const stickyHeader = await page.evaluate(async () => {
      for (let index = 0; index < 10; index += 1) {
        categoryState = addCategoryDefinition(
          categoryState,
          `cat_a000000${index}`,
          `Extra ${index + 1}`,
          'star',
          DEFAULT_HABITS,
        );
      }
      categoryState = saveCategoryState(categoryState, DEFAULT_HABITS);
      renderCategoriesPage();
      window.scrollTo(0, 220);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const firstTop = document.querySelector('#categoriesView .management-header').getBoundingClientRect().top;
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const secondTop = document.querySelector('#categoriesView .management-header').getBoundingClientRect().top;
      const scrolled = window.scrollY;
      categoryState = saveCategoryState(createDefaultCategoryState(), DEFAULT_HABITS);
      reloadHabits();
      renderCategoryTabs();
      renderCategoriesPage();
      window.scrollTo(0, 0);
      return { firstTop, secondTop, scrolled };
    });
    assert.ok(stickyHeader.scrolled > 220, JSON.stringify(stickyHeader));
    assert.ok(Math.abs(stickyHeader.firstTop) <= 1, JSON.stringify(stickyHeader));
    assert.ok(Math.abs(stickyHeader.secondTop) <= 1, JSON.stringify(stickyHeader));

    await page.goBack();
    await page.waitForFunction(() => document.documentElement.dataset.managementOpen !== 'true');
    const restoredOriginScroll = await page.evaluate(() => new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.scrollY)))));
    assert.ok(Math.abs(restoredOriginScroll - originScroll) <= 1,
      `Back restores the originating Home scroll position: ${restoredOriginScroll} vs ${originScroll}`);
    await page.goForward();
    await page.waitForFunction(() => !document.getElementById('categoriesView').hidden);

    await page.click('#categoriesList [data-category-id="morning"] .category-row-button');
    await page.waitForFunction(() => document.getElementById('manageCategoryHeading').textContent === 'Manage Morning');
    const manageLayout = await page.evaluate(() => {
      const row = document.querySelector('#manageCategoryList .manage-habit-row');
      const grip = row.querySelector('.manage-habit-grip').getBoundingClientRect();
      const marker = row.querySelector('.category-grip-marker').getBoundingClientRect();
      const title = row.querySelector('.manage-habit-row-name');
      const description = row.querySelector('.manage-habit-row-meta');
      const titleRect = title.getBoundingClientRect();
      const descriptionRect = description.getBoundingClientRect();
      return {
        gripWidth:grip.width,
        markerWidth:marker.width,
        titleSize:getComputedStyle(title).fontSize,
        descriptionSize:getComputedStyle(description).fontSize,
        rowGap:descriptionRect.top - titleRect.bottom,
        backLabel:document.getElementById('manageCategoryBack').getAttribute('aria-label'),
        optionsLabel:document.getElementById('categoryOptionsBtn').getAttribute('aria-label'),
        width:{ document:document.documentElement.scrollWidth, viewport:innerWidth },
      };
    });
    assert.equal(manageLayout.gripWidth, 44, 'compact grip keeps a 44px interaction target');
    assert.equal(manageLayout.markerWidth, 9, 'visible grip uses a compact six-dot drag affordance');
    assert.equal(manageLayout.titleSize, '16px');
    assert.equal(manageLayout.descriptionSize, '14px');
    assert.ok(manageLayout.rowGap >= 3, JSON.stringify(manageLayout));
    assert.equal(manageLayout.backLabel, 'Back');
    assert.equal(manageLayout.optionsLabel, 'Category options');
    assert.ok(manageLayout.width.document <= manageLayout.width.viewport, JSON.stringify(manageLayout.width));

    await page.click('#categoryOptionsBtn');
    await page.waitForFunction(() => document.getElementById('categoryOptionsSheet').open);
    const shippedOptions = await page.evaluate(() => ({
      edit:document.getElementById('editCategoryOption').textContent,
      removal:document.getElementById('categoryRemovalOption').textContent,
      disabled:document.getElementById('categoryRemovalOption').disabled,
      guidance:document.getElementById('categoryOptionsGuidance').textContent,
      text:document.getElementById('categoryOptionsSheet').textContent,
    }));
    assert.equal(shippedOptions.edit, 'Edit category');
    assert.equal(shippedOptions.removal, 'Archive category');
    assert.equal(shippedOptions.disabled, true);
    assert.match(shippedOptions.guidance, /^Move \d+ habits first$/);
    assert.doesNotMatch(shippedOptions.text, /Pause|color/i);
    await page.click('#categoryOptionsClose');
    await page.click('#manageCategoryBack');
    await page.waitForFunction(() => !document.getElementById('categoriesView').hidden);

    await page.click('#newCategoryBtn');
    await page.waitForFunction(() => !document.getElementById('categoryEditorView').hidden);
    await page.type('#categoryNameInput', 'Recovery');
    await page.click('.category-icon-choice[data-icon-key="recovery"]');
    await page.click('#categoryEditorSave');
    await page.waitForFunction(() => document.getElementById('manageCategoryHeading').textContent === 'Manage Recovery');
    assert.match(await page.$eval('#manageCategoryList', node => node.textContent), /No habits are assigned/);

    await page.click('#categoryOptionsBtn');
    await page.waitForFunction(() => document.getElementById('categoryOptionsSheet').open);
    assert.equal(await page.$eval('#categoryRemovalOption', button => button.textContent), 'Delete category');
    assert.equal(await page.$eval('#categoryRemovalOption', button => button.disabled), false);
    await page.click('#categoryOptionsClose');

    await page.click('#manageCategoryBack');
    await page.waitForFunction(() => !document.getElementById('categoriesView').hidden);
    await page.click('#categoriesList [data-category-id="morning"] .category-row-button');
    await page.waitForFunction(() => document.getElementById('manageCategoryHeading').textContent === 'Manage Morning');
    await page.click('#manageCategoryList [data-habit-id="affirm"] .manage-habit-row-button');
    await page.waitForFunction(() => !document.getElementById('habitEditorView').hidden);
    const recoveryId = await page.evaluate(() => categoryState.definitions.find(category => category.name === 'Recovery').id);
    await page.select('#habitEditorBody .eh-category', recoveryId);
    let browserBackPrompts = 0;
    const dismissBrowserBack = async dialog => {
      browserBackPrompts += 1;
      await dialog.dismiss();
    };
    page.on('dialog', dismissBrowserBack);
    await page.evaluate(() => history.back());
    await new Promise(resolve => setTimeout(resolve, 500));
    page.off('dialog', dismissBrowserBack);
    assert.equal(browserBackPrompts, 1, 'declining browser Back prompts exactly once');
    assert.equal(await page.$eval('#habitEditorView', view => !view.hidden), true,
      'declining browser Back keeps the dirty editor open');
    page.once('dialog', dialog => dialog.dismiss());
    await page.click('#habitEditorBack');
    await page.waitForFunction(() => !document.getElementById('habitEditorView').hidden);
    assert.equal(await page.$eval('#habitEditorBody .eh-category', select => select.value), recoveryId,
      'Keep editing preserves the unsaved category move');
    page.once('dialog', dialog => dialog.accept());
    await page.click('#habitEditorBack');
    await page.waitForFunction(() => !document.getElementById('manageCategoryView').hidden);
    assert.ok(await page.$('#manageCategoryList [data-habit-id="affirm"]'), 'Discard keeps the habit in its prior category');
    await page.click('#manageCategoryList [data-habit-id="affirm"] .manage-habit-row-button');
    await page.waitForFunction(() => !document.getElementById('habitEditorView').hidden);
    await page.select('#habitEditorBody .eh-category', recoveryId);
    await page.click('#habitEditorSave');
    await page.waitForFunction(() => !document.getElementById('manageCategoryView').hidden);
    assert.equal(await page.$('#manageCategoryList [data-habit-id="affirm"]'), null);

    await page.click('#manageCategoryBack');
    await page.click(`#categoriesList [data-category-id="${recoveryId}"] .category-row-button`);
    await page.waitForFunction(() => document.getElementById('manageCategoryHeading').textContent === 'Manage Recovery');
    assert.ok(await page.$('#manageCategoryList [data-habit-id="affirm"]'));

    await page.click('#categoryOptionsBtn');
    await page.click('#editCategoryOption');
    await page.click('#categoryNameInput', { clickCount:3 });
    await page.type('#categoryNameInput', 'Rest & Restore');
    await page.click('.category-icon-choice[data-icon-key="heart"]');
    await page.click('#categoryEditorSave');
    await page.waitForFunction(() => document.getElementById('manageCategoryHeading').textContent === 'Manage Rest & Restore');

    await page.click('#manageCategoryList [data-habit-id="affirm"] .manage-habit-row-button');
    await page.select('#habitEditorBody .eh-category', 'mind');
    await page.click('#habitEditorSave');
    await page.waitForFunction(() => !document.getElementById('manageCategoryView').hidden);

    const beforeDelete = await page.evaluate(() => ({
      habitCount:HABITS.length,
      affirm:HABITS.find(habit => habit.id === 'affirm'),
      order:userOrder.slice(),
      done:JSON.stringify(state.done),
      insight:JSON.stringify(insightHistory),
    }));
    let removalBrowserDialogs = 0;
    const unexpectedDialog = async dialog => {
      removalBrowserDialogs += 1;
      await dialog.dismiss();
    };
    page.on('dialog', unexpectedDialog);
    await page.click('#categoryOptionsBtn');
    await page.click('#categoryRemovalOption');
    await page.waitForFunction(() => document.getElementById('categoryRemovalDialog').open);
    const removalDialog = await page.evaluate(() => ({
      heading:document.getElementById('categoryRemovalHeading').textContent,
      message:document.getElementById('categoryRemovalMessage').textContent,
      confirm:document.getElementById('categoryRemovalConfirm').textContent,
      red:document.getElementById('categoryRemovalConfirm').classList.contains('danger'),
    }));
    assert.equal(removalDialog.heading, "Delete 'Rest & Restore'?");
    assert.equal(removalDialog.message, 'This permanently removes the category. Your habits and history will not be deleted.');
    assert.equal(removalDialog.confirm, 'Delete category');
    assert.equal(removalDialog.red, true);
    await page.click('#categoryRemovalConfirm');
    await page.waitForFunction(() => !document.getElementById('categoriesView').hidden);
    page.off('dialog', unexpectedDialog);
    assert.equal(removalBrowserDialogs, 0, 'custom deletion uses only the in-app confirmation');
    const afterDelete = await page.evaluate(id => ({
      category:categoryState.definitions.find(category => category.id === id) || null,
      habitCount:HABITS.length,
      affirm:HABITS.find(habit => habit.id === 'affirm'),
      order:userOrder.slice(),
      done:JSON.stringify(state.done),
      insight:JSON.stringify(insightHistory),
    }), recoveryId);
    assert.equal(afterDelete.category, null);
    assert.equal(afterDelete.habitCount, beforeDelete.habitCount);
    assert.equal(afterDelete.affirm.id, beforeDelete.affirm.id);
    assert.equal(afterDelete.affirm.cat, 'mind');
    assert.deepEqual(afterDelete.order, beforeDelete.order);
    assert.equal(afterDelete.done, beforeDelete.done);
    assert.equal(afterDelete.insight, beforeDelete.insight);

    const archivedId = 'cat_deadbeef';
    const archivedBefore = await page.evaluate(id => {
      const next = {
        ...categoryState,
        definitions:[...categoryState.definitions, { id, name:'Legacy Recovery', iconKey:'recovery', archived:true }],
        order:[...categoryState.order, id],
      };
      categoryState = saveCategoryState(next, DEFAULT_HABITS);
      renderCategoriesPage();
      return { definition:categoryState.definitions.find(category => category.id === id), index:categoryState.order.indexOf(id) };
    }, archivedId);
    const archivedCard = await page.evaluate(id => {
      const row = document.querySelector(`#archivedCategoriesList [data-category-id="${id}"]`);
      return {
        groupHidden:document.getElementById('archivedCategoriesGroup').hidden,
        count:document.getElementById('archivedCategoriesCount').textContent,
        name:row?.querySelector('.category-row-name').textContent,
        restore:row?.querySelector('.restore-category-btn').textContent,
        grip:!!row?.querySelector('.category-grip'),
        chevron:!!row?.querySelector('.category-chevron'),
      };
    }, archivedId);
    assert.deepEqual(archivedCard, { groupHidden:false, count:'1', name:'Legacy Recovery', restore:'Restore', grip:false, chevron:false });
    await page.waitForFunction(() => {
      const toast = document.getElementById('toast');
      return !toast.classList.contains('show') && getComputedStyle(toast).opacity === '0';
    });
    await page.screenshot({ path:path.join(SHOT_DIR, `wavelength-categories-archived-${THEME}.png`), fullPage:false });
    await page.click(`#archivedCategoriesList [data-category-id="${archivedId}"] .restore-category-btn`);
    const restored = await page.evaluate(id => ({
      definition:categoryState.definitions.find(category => category.id === id),
      index:categoryState.order.indexOf(id),
      groupHidden:document.getElementById('archivedCategoriesGroup').hidden,
      tab:[...document.querySelectorAll('.cat-tab')].some(tab => tab.dataset.cat === id),
    }), archivedId);
    assert.deepEqual(restored.definition, { ...archivedBefore.definition, archived:false });
    assert.equal(restored.index, archivedBefore.index);
    assert.equal(restored.groupHidden, true);
    assert.equal(restored.tab, true, 'restoring updates Home tabs immediately');

    await page.evaluate(() => {
      for (const habit of HABITS.filter(value => value.cat === 'hygiene')) {
        categoryState = setHabitCategoryAssignment(categoryState, habit.id, 'mind', DEFAULT_HABITS);
      }
      categoryState = saveCategoryState(categoryState, DEFAULT_HABITS);
      reloadHabits();
      renderCategoryTabs();
      renderCategoriesPage();
    });
    await page.click('#categoriesList [data-category-id="hygiene"] .category-row-button');
    await page.waitForFunction(() => document.getElementById('manageCategoryHeading').textContent === 'Manage Hygiene');
    assert.match(await page.$eval('#manageCategoryList', node => node.textContent), /No habits are assigned/);
    await page.click('#categoryOptionsBtn');
    await page.waitForFunction(() => document.getElementById('categoryOptionsSheet').open);
    assert.equal(await page.$eval('#categoryRemovalOption', button => button.disabled), false);
    assert.equal(await page.$eval('#categoryRemovalOption', button => button.textContent), 'Archive category');
    await page.click('#categoryRemovalOption');
    await page.waitForFunction(() => document.getElementById('categoryRemovalDialog').open);
    const archiveDialog = await page.evaluate(() => ({
      heading:document.getElementById('categoryRemovalHeading').textContent,
      message:document.getElementById('categoryRemovalMessage').textContent,
      confirm:document.getElementById('categoryRemovalConfirm').textContent,
      danger:document.getElementById('categoryRemovalConfirm').classList.contains('danger'),
    }));
    assert.deepEqual(archiveDialog, {
      heading:'Archive Hygiene?',
      message:'This removes it from Home categories. You can restore it from Categories.',
      confirm:'Archive category',
      danger:false,
    });
    await page.click('#categoryRemovalConfirm');
    await page.waitForFunction(() => !document.getElementById('categoriesView').hidden);
    const archivedSystem = await page.evaluate(() => ({
      active:!!document.querySelector('#categoriesList [data-category-id="hygiene"]'),
      archived:!!document.querySelector('#archivedCategoriesList [data-category-id="hygiene"]'),
      homeTab:[...document.querySelectorAll('.cat-tab')].some(tab => tab.dataset.cat === 'hygiene'),
    }));
    assert.deepEqual(archivedSystem, { active:false, archived:true, homeTab:false });
    await page.click('#archivedCategoriesList [data-category-id="hygiene"] .restore-category-btn');
    assert.ok(await page.$('#categoriesList [data-category-id="hygiene"]'), 'restoring a shipped category returns its active card');

    const beforeOrder = await page.evaluate(() => categoryState.order.slice());
    await page.focus('#categoriesList [data-category-id="morning"] .category-grip');
    await page.keyboard.press('ArrowDown');
    const afterOrder = await page.evaluate(() => JSON.parse(localStorage.getItem('wavelength_categories_v1')).order);
    assert.notDeepEqual(afterOrder, beforeOrder);
    assert.equal(afterOrder[0], 'movement');

    const migrationExpected = await page.evaluate(async () => {
      const payload = createBackupPayload();
      const activeId = 'cat_11111111';
      const archivedId = 'cat_22222222';
      payload.version = 6;
      payload.firstName = 'Migration Check';
      payload.categoryState = {
        schemaVersion:1,
        catalogVersion:1,
        definitions:[
          ...DEFAULT_CATEGORY_DEFINITIONS.map(category => ({ ...category })),
          { id:activeId, name:'Reading', iconKey:'recovery', archived:false },
          { id:archivedId, name:'Old Focus', iconKey:'heart', archived:true },
        ],
        order:[activeId, 'morning', 'movement', 'mind', 'fuel', 'hygiene', 'evening', archivedId],
        assignments:[{ habitId:'affirm', categoryId:activeId }],
      };
      await importBackupFile(new File([JSON.stringify(payload)], 'wavelength-v6.json', { type:'application/json' }));
      return {
        activeId,
        archivedId,
        state:JSON.stringify(payload.state),
        habitOrder:JSON.stringify(payload.order),
      };
    });
    await page.reload({ waitUntil:'networkidle0' });
    const migratedV6 = await page.evaluate(({ activeId, archivedId }) => {
      const stored = JSON.parse(localStorage.getItem(CATEGORY_STATE_KEY));
      const active = stored.definitions.find(category => category.id === activeId);
      const archived = stored.definitions.find(category => category.id === archivedId);
      return {
        schemaVersion:stored.schemaVersion,
        order:stored.order,
        assignments:stored.assignments,
        active,
        activeIcon:getCategoryIcon(active),
        archived,
        archivedIcon:getCategoryIcon(archived),
        runtimeCategory:HABITS.find(habit => habit.id === 'affirm')?.cat,
        firstName:localStorage.getItem(FIRST_NAME_STORAGE_KEY),
        state:localStorage.getItem(STORAGE_KEY),
        habitOrder:localStorage.getItem(ORDER_KEY),
      };
    }, migrationExpected);
    assert.equal(migratedV6.schemaVersion, 2, 'a version-6 schema-v1 category document migrates to schema 2');
    assert.deepEqual(migratedV6.order,
      [migrationExpected.activeId, 'morning', 'movement', 'mind', 'fuel', 'hygiene', 'evening', migrationExpected.archivedId]);
    assert.deepEqual(migratedV6.assignments, [{ habitId:'affirm', categoryId:migrationExpected.activeId }]);
    assert.deepEqual(migratedV6.active,
      { id:migrationExpected.activeId, name:'Reading', iconKey:'recovery', archived:false });
    assert.equal(migratedV6.activeIcon, '🌿');
    assert.deepEqual(migratedV6.archived,
      { id:migrationExpected.archivedId, name:'Old Focus', iconKey:'heart', archived:true });
    assert.equal(migratedV6.archivedIcon, '❤️');
    assert.equal(migratedV6.runtimeCategory, migrationExpected.activeId);
    assert.equal(migratedV6.firstName, 'Migration Check');
    assert.equal(migratedV6.state, migrationExpected.state, 'version-6 import preserves completion/history state');
    assert.equal(migratedV6.habitOrder, migrationExpected.habitOrder, 'version-6 import preserves canonical habit order');

    await page.screenshot({ path:path.join(SHOT_DIR, `wavelength-categories-${THEME}.png`), fullPage:false });
    assert.deepEqual(errors, [], errors.join('\n'));
    console.log(`category personalization 390px ${THEME} Edge flow passed`);
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
