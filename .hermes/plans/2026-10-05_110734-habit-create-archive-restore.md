# Habit Creation, Archive, and Restore Implementation Plan

> **For Hermes:** Use the Wavelength RED-in-parent/GREEN-in-child workflow to implement this plan task-by-task. Do not deploy until the sealed review and every acceptance gate pass.

**Goal:** Let people create a custom habit, archive any habit without losing identity or history, and restore archived habits through a calm, category-aware mobile flow.

**Architecture:** Preserve the shipped `DEFAULT_HABITS` plus sparse system overrides. Add a versioned habit-catalog document for user-created habit definitions and date-effective active/archive transitions. Build one complete catalog for validation/history and derive the active runtime catalog for Home, Manage, Next Wave, reminders, and widgets. Reuse the current Habit Editor in create mode without undertaking the separate editor redesign.

**Tech stack:** Single-file HTML/CSS/JavaScript PWA, LocalStorage with journaled writes, Node `.mjs` source regressions, Playwright/Edge 390px browser E2E, Capacitor 8, WidgetKit snapshot bridge, GitHub Pages.

---

## 1. Approved product contract

### 1.1 Home and category actions

Render the action group after incomplete habit cards and before `Completed · N`:

- Primary card: **Add a new habit**
- Secondary action: **Restore an archived habit**
- Primary icon: visual plus, `aria-hidden="true"`; accessible name contains no spoken “plus.”
- Secondary icon: restore arrow, not another plus.
- Sentence case; no ellipses.
- The action group never contributes to habit counts, completion percentages, canonical order, or drag targets.
- If no habit is scheduled today, keep the existing calm empty-state message and render the action group beneath it.

Visual contract:

- Same content-column width and `--radius-sm` as habit cards.
- Primary action is 64px minimum height, not the 104px habit-card height.
- Subtle solid 1px border and surface tint; do not use disabled-looking gray text or a dashed/drop-target treatment.
- Secondary control sits 8–12px below and retains a 44px minimum touch target.
- Verify text/background/border contrast in Day and Night.

### 1.2 Manage Habits actions

Render the same action group after the scoped Manage list:

- **Manage All Habits:** create mode requires an explicit category.
- **Manage Morning** (or another real category): create mode preselects that category.
- The action group is outside `.manage-habit-row`, has no reorder grip, and cannot enter the reorder collection.
- Existing category-scoped reorder semantics remain unchanged.

### 1.3 Create mode

Opening **Add a new habit** launches the existing Habit Editor shell in create mode:

- Header: **New Habit**
- Save action: **Add habit**
- From a real category: category is preselected.
- From All: category starts at `Choose a category`; saving remains blocked until chosen.
- Habit name: blank and required, maximum 48 characters.
- Card description: blank and optional, maximum 42 characters.
- Icon: default to ⭐ for this release. Icon selection belongs to the later Habit Editor redesign.
- Repeat: all seven days selected.
- Track as: Check once.
- Rhythm anchor: No anchor.
- Preferred-time/recommendation authoring is not added in this release. New custom habits are ordinary trackable habits but are excluded from Next Wave until a later editor design gives users an explicit recommendation contract.
- New custom habits begin on their creation date, so they do not retroactively alter earlier reporting denominators.
- Successful save returns to the exact launch origin and shows `✓ Habit added`.
- Back/Escape/browser/native Back use the existing dirty-draft guard.

### 1.4 Archive mode

For an existing habit, add a neutral secondary action at the bottom of the editor:

- Label: **Archive habit**
- Confirmation title: `Archive “<habit name>”?`
- Confirmation body: `It will stop appearing in your daily habits. Your history will be kept.`
- Actions: **Archive habit** and **Cancel**
- Archive is reversible and must not use permanent-delete danger styling.
- `Reset habit defaults` remains available only for shipped/system habits.
- Custom habits have no permanent-delete action in this scope.

Archiving takes effect immediately for the current local date:

- The habit leaves Home, active category lists, Manage, Next Wave, generic reminder eligibility, and widget progress.
- Existing completion/progress records and prospective insight evidence are not deleted.
- If the habit was completed today, that record remains stored but the now-archived habit leaves today’s active denominator.
- Repeated archive/restore actions on the same day collapse to the final state for that local date.

### 1.5 Archived habits screen

Add an origin-aware full-screen management view:

- Heading: **Archived habits**
- Intro: `Restore a habit to start tracking it again.`
- Each row shows icon, habit name, retained category name, schedule summary, and an explicit **Restore** button.
- Restoration is one habit at a time; do not add batch selection in this scope.
- From All, show all currently archived habits in canonical order.
- From a real category, show archived habits retained in that category first.
- If archived habits exist elsewhere, show **View all archived habits**.
- All empty state: **No archived habits yet** with `Habits you archive will appear here.`
- Scoped empty state: **No archived habits in Morning** (dynamic category name).
- Successful direct restore keeps the archived screen open, removes the restored row, and announces `Habit restored to <Category>.`

If the retained category is archived:

- Do not silently restore the category.
- Restore opens a small category-choice dialog populated only with active real categories.
- Confirming atomically changes the habit’s category and restores it.

### 1.6 Category-removal relationship

Revisit category emptiness now that habit archive exists:

- Archiving a shipped category counts only active habits; archived habits do not prevent the reversible category archive.
- Permanently deleting a custom category remains blocked if either active or archived habits retain that category.
- Guidance distinguishes active from archived blockers, for example `Restore or move 2 archived habits first.`
- An archived habit may retain an archived shipped category. Restoration then requires an active category choice as described above.

### 1.7 Default archived example

`medication` / **Take medication as prescribed** is archived by the one-time catalog migration.

- Existing completion history, progress, overrides, category, and canonical order remain intact.
- The migration records the archive transition on the local migration date so prior dates remain historically eligible.
- A new installation begins with Medication archived from its creation/start date.
- Once restored, subsequent loads or upgrades must never rearchive it.

---

## 2. Data model and invariants

### 2.1 New LocalStorage document

Add `HABIT_CATALOG_KEY = 'wavelength_habit_catalog_v1'` and schema version 1:

```js
{
  schemaVersion: 1,
  customDefinitions: [
    {
      id: 'habit_<opaque uuid>',
      cat: 'morning',
      icon: '⭐',
      text: 'Walk after lunch',
      note: '',
      activeFrom: '2026-10-05',
      days: [0,1,2,3,4,5,6],
      measurement: 'check'
    }
  ],
  status: [
    {
      habitId: 'medication',
      initialActive: true,
      changes: [{ date: '2026-10-05', active: false }]
    }
  ]
}
```

Rules:

- Custom IDs use an opaque `habit_` UUID/fallback token and are immutable.
- Reject collisions with shipped and custom IDs.
- Validate one emoji grapheme for `icon`; default ⭐.
- Validate category, name, note, schedule, measurement, rhythm, and optional fields using existing helpers.
- Limit user-created definitions to 100 to bound import/storage work.
- Sort and deduplicate status changes by date; one final change per habit/date; reject unknown IDs.
- Collapse adjacent status changes that do not change state.
- Never serialize runtime-only Next Wave context for a custom habit.

### 2.2 Runtime collections

Introduce explicit names instead of overloading `HABITS`:

- `ALL_HABITS`: shipped runtime habits plus validated custom definitions, with category assignments applied; includes currently archived habits for history/import validation.
- `HABITS`: the subset active on the current local date; remains the collection used by Home, Manage, Next Wave, reminders, and widget publication.
- `getHabitsActiveOnDate(allHabits, catalogState, date)`: date-aware subset for reports and historical daily statistics.
- `isHabitActiveOnDate(habitId, catalogState, date)`: resolves baseline plus status transitions.

`reloadHabits(now)` must rebuild both collections in this order:

1. Normalize system overrides.
2. Normalize/load the habit catalog.
3. Combine shipped and custom definitions.
4. Normalize/apply category state against the complete catalog.
5. Assign `ALL_HABITS`.
6. Derive `HABITS` for `now`.
7. Reconcile canonical order against the complete catalog without deleting archived IDs.

### 2.3 History preservation

- `normalizeStoredState`, progress validation, and insight-history validation use `ALL_HABITS`, not only the active subset.
- Home, Next Wave, widgets, and future notification requests use current `HABITS`.
- Historical week/30-day calculations obtain the active subset for each date before schedule filtering.
- Custom `activeFrom` prevents a newly created habit from appearing before creation.
- Archive status transitions prevent a currently archived habit from disappearing from dates before archive.
- Existing behavior in which schedule/config edits recalculate reports remains unchanged; this feature must not add destructive history rewrites.

### 2.4 Category normalization

Extend category normalization inputs to distinguish the complete catalog from current activity:

- Assignments may reference any known shipped/custom habit.
- Active habits must resolve to active real categories.
- Archived habits may retain an archived category.
- Shipped-category archive emptiness checks current active habits only.
- Custom-category deletion checks all retained habits, including archived ones.

### 2.5 Canonical order

- `userOrder` contains every shipped/custom habit ID exactly once, including archived IDs.
- Creating a habit appends it to canonical order. This makes it last within its filtered category without disturbing other categories’ relative positions.
- Archiving never removes or moves the ID.
- Restoring returns it to its previous relative slot.
- Version-9 import validates order against the complete imported catalog.

---

## 3. Backup and migration contract

Bump `BACKUP_VERSION` from 8 to 9.

Version 9 includes:

```js
habitCatalog: normalizeHabitCatalogState(...)
```

Import order is fail-closed and atomic:

1. Validate/synthesize the habit catalog.
2. Build the complete imported catalog.
3. Validate category state against it.
4. Validate canonical order against it.
5. Validate completion/progress state against it.
6. Validate prospective insight evidence against it.
7. Commit state, order, name, evidence, category state, system overrides, and habit catalog in one journaled snapshot.

Migration:

- Versions 1–8 synthesize schema 1 with no custom definitions and the one-time Medication archive transition on the import date.
- Existing local installs without the catalog key receive the same migration once and persist the new document.
- Existing order compatibility for `daylight` and `supplements` remains intact.
- Version-9 round trips must preserve custom IDs, archive periods, retained categories, order, history, and empty archived sets.
- Malformed custom definitions, duplicate IDs, unknown archive IDs, future-invalid dates, or inconsistent category/order references reject the whole import without partial writes.

---

## 4. Navigation and state

Extend the management history payload with explicit editor/archived origins:

```js
{
  viewId,
  managementOrigin,
  categoryId,
  habitEditorMode: 'create' | 'edit',
  habitEditorOrigin: 'home' | 'manage' | 'archived',
  habitId,
  archivedScope: 'all' | '<category-id>'
}
```

Required flows:

- Home All → New Habit → Save/Back → Home All.
- Home Morning → New Habit → category preselected → Save/Back → Home Morning.
- Manage All → New Habit → Save/Back → Manage All.
- Manage Morning → New Habit → category preselected → Save/Back → Manage Morning.
- Home/Manage → Archived habits → Back → exact origin.
- Existing habit → Edit → Archive → exact parent Manage page.
- Archived view → restore → remain in archived view.
- Browser/native Back and Escape reproduce toolbar Back behavior.
- Dirty create/edit drafts block every exit path until discarded or saved.

No second route stack or modal navigation system should be introduced; extend `showManagementView`, `restoreManagementRoute`, and the existing opaque management-flow ID.

---

## 5. TDD implementation sequence

### Task 1: Capture and approve visual baselines

**Files:** No source edits.

1. Capture deployed 390×844 Day/Night screenshots for Home All, one category with completed habits, Manage All, and one scoped Manage page.
2. Record current commit `3126b14` and cache-busted URLs.
3. Confirm the screenshots expose the intended insertion points.

Expected: eight baseline screenshots, zero source changes.

### Task 2: Add failing habit-catalog model tests

**Create:** `tests/habit-lifecycle-regression.mjs`

Cover both mobile and desktop fixture:

- schema defaults and Medication migration;
- opaque ID generation/collision rejection;
- custom definition validation and 100-item cap;
- active-on-date resolution before/on/after archive and restore;
- same-day transition collapse;
- all-vs-active runtime derivation;
- custom `activeFrom` behavior;
- order reconciliation preserving archived/custom IDs;
- strict malformed input rejection.

Run:

```bash
node tests/habit-lifecycle-regression.mjs
```

Expected RED: catalog functions/constants are missing.

### Task 3: Implement catalog normalization and migration

**Modify:** `index.html` around data/runtime state (`DEFAULT_HABITS`, `buildRuntimeHabits`, `reloadHabits`, state/order helpers).

Implement:

- catalog constants and pure normalization helpers;
- custom ID creation;
- date-effective state helpers;
- `ALL_HABITS` + active `HABITS` derivation;
- idempotent Medication migration;
- complete-catalog order reconciliation.

Run Task 2 test until GREEN, then run:

```bash
node tests/default-habits-regression.mjs
node tests/category-personalization-regression.mjs
node tests/streak-regression.mjs
```

Commit checkpoint: `feat: add versioned habit lifecycle catalog`.

### Task 4: Add failing category/history integration tests

**Modify:** `tests/habit-lifecycle-regression.mjs`
**Modify:** `tests/category-personalization-regression.mjs`
**Modify:** `tests/last-30-days-regression.mjs`

Assert:

- archived habits retain category assignments;
- archived habits do not block shipped-category archive;
- archived habits do block custom-category deletion;
- restore to archived category requires reassignment;
- pre-archive dates still include the habit;
- archive date excludes it;
- restoring today preserves today’s stored completion;
- completion/progress/evidence normalization preserves archived IDs.

Expected RED before implementation.

### Task 5: Implement category and date-aware history integration

**Modify:** `index.html` category normalizer/removal helpers, daily-stat/report callers, state and evidence validation.

- Pass complete catalog plus active-state context explicitly.
- Keep current-day consumers on active `HABITS`.
- Switch historical daily calculations to per-date active subsets.
- Preserve archived records during load/save/import.
- Update category-option guidance for archived blockers.

Run Task 4 tests until GREEN plus:

```bash
node tests/completed-grouping-regression.mjs
node tests/navigation-insights-regression.mjs
node tests/prospective-forecast-evidence-regression.mjs
node tests/widget-snapshot-regression.mjs
node tests/native-notifications-regression.mjs
```

Commit checkpoint: `feat: preserve history across habit archive states`.

### Task 6: Add failing backup-v9 tests

**Modify:** `tests/navigation-insights-regression.mjs` or create `tests/habit-backup-regression.mjs` if isolation is clearer.

Cover:

- v1–v8 migration to v9 semantics;
- v9 custom+archived round trip;
- empty archived set remains empty after restore/import;
- malformed catalog fails before writes;
- simulated write failure recovers every touched key;
- order/category/state/evidence cross-reference validation.

Expected RED: backup version/catalog field missing.

### Task 7: Implement backup-v9 atomic import/export

**Modify:** `index.html` `BACKUP_VERSION`, `createBackupPayload`, `importBackupFile`, journal snapshot fields.

Run Task 6 until GREEN and rerun all older backup/navigation tests.

Commit checkpoint: `feat: back up custom and archived habits`.

### Task 8: Add failing source-level UI contract tests

**Create:** `tests/habit-lifecycle-ui-regression.mjs`

Assert exact copy, landmarks, controls, route fields, event bindings, and placement contracts:

- Home action markup is between active and completed content.
- Manage action group exists outside reorder rows.
- New/Edit mode labels differ correctly.
- Archive confirmation copy is exact.
- Archived empty states and View all link are exact.
- plus/restore SVGs are hidden from assistive technology.
- custom habits default to ⭐ and recommendation-disabled.

Expected RED before markup/logic changes.

### Task 9: Implement Home and Manage launch surfaces

**Modify:** `index.html` CSS, Home `renderHabits`, Manage rendering, listeners.

- Build one shared DOM/markup helper for the two-action group.
- Insert it at the approved Home partition point.
- Append it after Manage rows without matching reorder selectors.
- Preserve the existing no-scheduled-habits message.
- Open create/archived flows with explicit category and origin.

Run Task 8 until partial GREEN and rerun completed-grouping/category UX tests.

### Task 10: Implement create-mode Habit Editor

**Modify:** `index.html` Habit Editor route/render/save functions.

- Separate create/edit mode state.
- Render a blank custom definition draft with approved defaults.
- Add required category placeholder for All.
- Reuse current validation and controls; do not redesign layout.
- Save the custom definition, category, lifecycle state, and order atomically.
- Return to exact origin and preserve dirty-draft guards.

Add tests for duplicate/blank names, category requirement, no selected day, measurement validation, 42/48 limits, reload persistence, and no retroactive schedule.

Commit checkpoint: `feat: create custom habits`.

### Task 11: Implement archive, archived list, and restore

**Modify:** `index.html` Habit Editor actions/dialogs, new archived management view, routing, category chooser.

- Add neutral archive confirmation.
- Record current-date inactive transition without deleting data.
- Render scoped/all archived lists in canonical order.
- Restore directly when retained category is active.
- Require category choice when it is archived.
- Keep screen open and announce status through toast/live region.
- Hide/reset defaults appropriately for custom habits.

Complete Task 8 GREEN.

Commit checkpoint: `feat: archive and restore habits`.

### Task 12: Add 390px browser E2E

**Create:** `tests/browser/habit-lifecycle-e2e.cjs`

Run every scenario in Day and Night at 390×844:

1. Home All placement with active and completed habits.
2. Category placement and preselected category.
3. All create flow requiring category.
4. Manage scoped and Manage All create flows.
5. Create, reload, complete, and reorder a custom habit.
6. Archive completed/incomplete system and custom habits.
7. Verify counts, Next Wave, reminders mock, and widget mock exclude archived habits.
8. Restore with active category and with archived-category reassignment.
9. Empty/scoped archived states plus View all.
10. Back/Escape/history and dirty-draft paths.
11. No horizontal overflow, no text clipping, 44px targets, focus-visible states, and WCAG AA copy contrast.
12. Confirm the add/restore controls are never treated as habit cards or drag rows.

Capture settled screenshots for:

- Home All with completed partition;
- one category;
- Manage scoped;
- New Habit from category;
- Archived habits populated;
- Archived habits empty;
- archive confirmation;
- restore category chooser.

### Task 13: Update design and user documentation

**Create:** `references/habit-lifecycle-design.md`
**Modify:** `references/category-personalization-design.md`
**Modify:** `README.md`

Document:

- complete/active catalog distinction;
- lifecycle/date semantics;
- create defaults and Next Wave exclusion;
- archive/restore UX and category relationships;
- backup v9 migration and preservation guarantees;
- exact UI copy and accessibility contract.

Commit checkpoint: `docs: document habit lifecycle flows`.

### Task 14: Mirror, cache, native sync, and full verification

**Modify/generated:**

- `index.html`
- `../friday_app_2026-07-12.html` (byte-identical mirror)
- `tests/fixtures/friday_app_2026-07-12.html`
- `sw.js` cache version
- `www/` via `npm run native:web && npm run native:sync`

Run in order:

```bash
cp index.html ../friday_app_2026-07-12.html
cp ../friday_app_2026-07-12.html tests/fixtures/friday_app_2026-07-12.html
for test in tests/*.mjs; do node "$test" || exit 1; done
node --check sw.js
cmp -s index.html ../friday_app_2026-07-12.html
cmp -s ../friday_app_2026-07-12.html tests/fixtures/friday_app_2026-07-12.html
npm audit
npm run native:web
npm run native:sync
node tests/capacitor-shell-regression.mjs
git diff --check
```

Then:

- Run the entire existing browser E2E matrix plus the new lifecycle flow sequentially.
- Compare post-change 390px Day/Night screenshots against the approved baselines.
- Confirm widget snapshot, native reminders, category UX, completed grouping, typography, and Next Wave have no regressions.
- Run the static added-lines security scan.
- Generate the deterministic tree manifest.
- Dispatch a sealed independent review against the exact manifest; fail closed on data loss, ID instability, import atomicity, history deletion, unsafe rendering, copy mismatch, or navigation defects.
- Build/install/launch on the remote Mac simulator after WSL gates pass.
- Before physical-device install, back up WebKit state and compare semantic state after install/launch. Do not uninstall.
- Deploy only after the reviewed SHA, local source, native package, origin, and Pages bytes agree.

---

## 6. Files expected to change

- `index.html`
- `../friday_app_2026-07-12.html`
- `sw.js`
- `README.md`
- `references/category-personalization-design.md`
- `references/habit-lifecycle-design.md` (new)
- `tests/fixtures/friday_app_2026-07-12.html`
- `tests/habit-lifecycle-regression.mjs` (new)
- `tests/habit-lifecycle-ui-regression.mjs` (new)
- `tests/habit-backup-regression.mjs` (new if not folded into an existing suite)
- `tests/category-personalization-regression.mjs`
- `tests/last-30-days-regression.mjs`
- `tests/navigation-insights-regression.mjs`
- `tests/browser/habit-lifecycle-e2e.cjs` (new)
- generated `www/` and Capacitor sync outputs where the existing repository contract requires them

---

## 7. Primary risks and controls

### Data loss from validating against active habits only

**Risk:** Archived IDs could be stripped from completion, progress, or evidence.

**Control:** Validate persistent history against `ALL_HABITS`; use active subsets only for current behavior. Add archive→reload→restore round-trip tests with byte/semantic comparisons.

### Retroactive reporting distortion

**Risk:** New/archived habits could change earlier denominators.

**Control:** Custom `activeFrom` plus date-effective lifecycle changes; historical stats derive the catalog active on each date.

### Re-archiving Medication

**Risk:** A default migration could overwrite a user’s restore choice.

**Control:** Persist schema-1 catalog state on first migration; absence alone triggers migration. Test empty status after restore across reload and v9 backup/import.

### Category orphaning

**Risk:** Restoring a habit whose category is archived/deleted could make it invisible.

**Control:** Allow retained archived shipped categories but require active-category choice on restore; block permanent custom-category deletion while any retained habit references it.

### Order corruption

**Risk:** Filtering archived habits out of canonical order could move restored habits.

**Control:** Keep all IDs in `userOrder`; filter only at render time. Cross-artifact tests assert exact slots before archive and after restore.

### Next Wave making invented recommendations

**Risk:** A user-created habit without a recommendation contract receives fabricated timing guidance.

**Control:** Custom habits start recommendation-disabled. The later Habit Editor redesign can introduce explicit timing/context authoring deliberately.

### Drag/reorder collision

**Risk:** Add action is captured as a reorder row or dashed styling reads as a drop target.

**Control:** Solid border; distinct classes; no `data-habit-id`; reorder selectors remain `.manage-habit-row[data-habit-id]` only.

### Single-file change breadth

**Risk:** Catalog, navigation, backup, and UI edits in one large file can mask regressions.

**Control:** RED-first focused suites, bounded commits, full cross-build parity, sequential browser matrix, sealed exact-tree review, and native parity verification.

---

## 8. Definition of done

The feature is complete only when all of the following are proven:

- The approved add/restore hierarchy appears in all three locations.
- Category launch context and All-category requirement behave exactly as specified.
- A custom habit survives reload, backup/import, reorder, completion, archive, and restore with one stable ID.
- Medication is archived exactly once by migration and stays restored after the user restores it.
- Archived habits leave every active consumer but keep stored history/evidence.
- Earlier dates are not changed by later create/archive transitions.
- Category archive/delete relationships have no orphan path.
- Every copy string and empty state matches the approved contract.
- Day/Night 390px screenshots pass visual and accessibility review.
- All source, browser, desktop-parity, native-package, simulator, security, and sealed-review gates pass.
- README and design references match the shipped behavior.
- Deployment and physical-device installation preserve existing data and are verified by readback, not assumed from command success.
