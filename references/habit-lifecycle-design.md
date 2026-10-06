# Habit lifecycle design contract

This document describes the implemented custom-habit creation, editing, archival, and restoration contract. `index.html` is canonical; the external desktop mirror and tracked desktop fixture are byte-identical compatibility builds. This is an extension of the existing Habit Editor, not the deferred editor redesign.

## Verification and release boundary

The lifecycle implementation and 390×844 browser acceptance are complete locally through checkpoint `351765567c25997328420fc91ce5cac7cd0902f1`. Phase 12 passed 38 source suites and 34 sequential browser runs across 17 suites. The lifecycle suite passed 12 scenarios and 234 assertions in each theme, with zero runtime errors and 16 accepted viewport screenshots. Fifteen browser suites honor Day/Night selection; two older suites ignore that environment, so their duplicate runs are not independent theme coverage.

The accepted source SHA-256 is `3ecf1ac335d4e356c6d2c1bf40182a68cfd4320f4f6548028e716c4c2e208c11`. See the [Phase 12 acceptance report](../.hermes/baselines/habit-lifecycle/phase12/final/report.md). This feature has not been pushed or deployed. Cache/native synchronization, simulator and physical-device verification, final sealed release review, and deployment remain Phase 14. Browser mocks establish native bridge behavior, not physical-device acceptance of this lifecycle release.

## Complete catalog versus active habits

- `DEFAULT_HABITS` contains shipped definitions. Editing a shipped habit uses the existing override document; it does not convert that habit into a custom definition.
- `ALL_HABITS` contains every retained shipped and custom identity, including archived habits, after applying shipped overrides and category assignments. Use it for canonical order, import validation, retained category references, completion/progress loading, and evidence validation.
- `HABITS` is the subset active on the current local date. Home and Manage use this current active set; today's tracking additionally applies the selected weekdays. Next Wave further excludes completed, recommendation-disabled, or otherwise ineligible habits.
- `getHabitsActiveOnDate(allHabits, habitCatalogState, date)` supplies the date-effective lifecycle subset. Historical eligibility also applies weekday schedules and existing shipped activation dates.

`reloadHabits(now)` loads overrides and lifecycle state, builds the complete catalog, derives the active subset for category validation, applies category state, assigns both runtime collections, and reconciles order against the complete catalog. Local-date rollover refreshes the active subset rather than retaining yesterday's view.

## Stored lifecycle schema

`HABIT_CATALOG_KEY` is `wavelength_habit_catalog_v1`; `HABIT_CATALOG_SCHEMA_VERSION` is 1. The document has exactly these root fields:

```json
{
  "schemaVersion": 1,
  "customDefinitions": [],
  "status": [
    {
      "habitId": "medication",
      "initialActive": true,
      "changes": [{ "date": "2026-10-05", "active": false }]
    }
  ]
}
```

The date above is illustrative. The one-time default migration uses the actual local migration date.

Custom definitions contain a stable opaque `habit_` ID, retained category ID, one emoji, normalized name and description, creation `activeFrom`, selected weekdays, and measurement configuration. Supported optional fields include a validated rhythm and preferred-time window. The persisted definition does not accept arbitrary recommendation context; the runtime builder makes custom habits recommendation-disabled. The catalog is bounded to 100 custom definitions.

Creation produces an opaque ID matching `^habit_[a-f0-9-]{8,64}$` case-insensitively and rejects collisions with shipped or custom identities. Editing, archiving, restoration, reassignment, reload, and backup round trips retain that ID.

Lifecycle status entries refer to known retained identities. Their `initialActive` value and sorted local-date `{ date, active }` changes define activity for any requested date. Normalization resolves repeated dates to their final state and removes redundant adjacent states. An identity with no status entry is active by default, subject to its creation or other eligibility dates.

## Date and history semantics

- A new custom habit receives `activeFrom` when it is successfully created. It cannot reduce historical percentages before that date. Edits preserve this date.
- `setHabitActiveOnDate(catalog, habitId, active, date, allHabits)` records archival with `active:false` or restoration with `active:true`.
- Archiving today removes the habit from today's active denominator and current surfaces immediately. It does not remove earlier completion, numeric progress, prospective evidence, configuration, category assignment, or its canonical ordering slot.
- Earlier dates still use their own lifecycle state. A previously completed habit remains part of its pre-archive historical denominator; an archived interval does not gain that habit merely because it is restored later.
- Repeated archive/restore operations on the same date collapse to the final state for that date. This is a date-effective catalog, not a sub-day event log.
- Today's percentage or streak result can change when today's eligible set changes. Preservation means retained history and correct date-effective eligibility, not a frozen displayed score.

Historical renderers pass `ALL_HABITS` and catalog state to their summary helpers. Catalog state is the fifth argument to `getElapsedWeekSummary` and the sixth to `getLast30DayTrend`. The same date-effective eligibility governs streaks, while existing weekday and measurement rules still apply.

For example, a fixture with 50 completions across seven 22-habit historical days and one 21-habit current day has 175 opportunities and a rounded 29% weighted average. Using today's 21-habit subset for all eight dates would incorrectly produce 30%.

## Lifecycle entry points

Home All and real category views render the shared action group after incomplete cards and before **Completed · N**. When no habits are scheduled, the existing empty-state message remains above the actions. Manage All and scoped Manage render the same actions after their rows, outside the reorder collection.

Exact entry labels:

- Primary: **Add a new habit**, with a decorative plus.
- Secondary: **Add an archived habit**, with a decorative restore arrow.

“Add” is the entry-point language because an inactive shipped habit may never have been personally tracked. The underlying operation and an individual archived row use restoration terminology. Labels omit ellipses. The actions never become habit cards, affect counts, enter canonical order, or acquire reorder grips.

The primary has a 64px minimum height and subtle solid border; the secondary has a 44px minimum height, with a 10px gap inside the group. Home's legacy reorder state hides the group. Actual Manage grip dragging hides its action host with `visibility:hidden`, retaining geometry during the drag. Manage All does not expose category-scoped reorder grips.

## Create and edit flow

Creating from a real category preselects it. Creating from All leaves Category unset and requires an explicit active real category; **All** is never assignable. The current Habit Editor opens with these defaults:

- Header **New Habit** and save action **Add habit**.
- Icon ⭐; blank required Habit name; blank optional Card description.
- All seven weekdays selected; **Check once** tracking; **No anchor**.

The UI requires a unique normalized name, at most 48 characters, and a description of at most 42 characters. Whitespace/NFKC normalization and deterministic Unicode-caseless comparison apply globally across active and archived identities, excluding only the edited identity itself. Unsafe controls and invisible/default-ignorable text are rejected, except supported shaping joiners and variation selectors. A nonempty valid schedule and valid measurement configuration are required.

New custom habits remain absent from Next Wave until a later editor design defines recommendation timing/context authoring. They still appear in tracking, completion totals, category views, and the published native habit snapshot when scheduled and active. A rhythm anchor is advisory and does not opt a custom habit into recommendations.

Creation journals catalog, category state, and complete order as one snapshot. Editing a custom habit uses its catalog definition, retains ID and `activeFrom`, and preserves supported fields the form cannot author. Measurement changes reconcile numeric progress and evidence atomically with the catalog/category changes; they do not silently leave incompatible progress behind. Shipped-habit editing retains the existing parameter/override path.

Edit mode uses the habit's title and the exact save label **Save**. **Archive habit** is available only in edit mode. **Reset habit defaults** is hidden for custom habits and in create mode. Successful creation returns to the actual Home or Manage origin and category scope. Toolbar Back, Escape, and browser/native Back ask **Discard unsaved changes?** for a changed draft; declining keeps it intact.

## Archive and restore flow

The edit-mode archive action is neutral and reversible. The native HTML dialog has the exact heading `Archive “{habit name}”?`, message **It will stop appearing in your daily habits. Your history will be kept.**, and actions **Archive habit** / **Cancel**. Cancellation, including dialog Escape, makes no lifecycle mutation. Successful archival returns through the editor's origin-aware management route; it does not delete the retained identity or data.

**Add an archived habit** opens **Archived habits** with the current category scope. Its introduction is **Restore a habit to start tracking it again.** Rows show full wrapping habit names, retained category, weekday summary, and **Restore**. Rows follow the retained canonical order, not the order in which habits were archived.

Exact empty-state copy:

- Global headline: **No archived habits yet**.
- Global explanation: **Habits you archive will appear here.**
- Scoped message: `No archived habits in {category name}` with no trailing period.
- **View all archived habits** appears only when archived identities exist outside the current category. It changes the archive scope without changing the original navigation destination.

Restoration is direct when the retained category is active. The habit retains its prior canonical slot and configuration. Home's incomplete/completed partition may place it in a different visible group if its retained completion already meets today's goal.

When the retained category is archived, restoration opens **Choose a category**. The message is **The habit’s previous category is archived. Choose an active category to restore it.** The labeled **Category** select contains active real categories, with **Restore habit** / **Cancel** actions. The lifecycle transition and category reassignment commit together. Cancellation and injected write failures preserve the earlier catalog, assignments, and runtime state; a failed commit leaves the chooser available for retry.

When no active category exists, no restoration mutation occurs. The live status says **Create or restore a category before restoring this habit.** The person can recover a category through Categories, then retry.

The one-time default example is **Take medication as prescribed** (`medication`), initially archived by the default catalog migration. Once restored into a persisted catalog, normal reloads do not reseed the migration or archive it again. Importing a legacy backup is a deliberate replacement operation and synthesizes a new legacy lifecycle catalog as described below.

## Category relationships

The [category personalization contract](category-personalization-design.md) distinguishes reversible archival from permanent deletion:

- Shipped-category archival is blocked only by currently active assigned habits, including active habits not scheduled today. Retained archived habits do not block it.
- Custom-category deletion is blocked by every retained reference in `ALL_HABITS`, whether active or archived. No habit or history is deleted to make a category removable.
- Restoring an archived habit into an archived category requires active-category reassignment; it does not implicitly restore the category.
- Category IDs, saved assignments, and order survive category archival. **All** remains virtual, protected, and unserialized.

## Backup v9 and persistence

`BACKUP_VERSION` is 9. `createBackupPayload()` contains `app`, `version`, `exportedAt`, `state`, `order`, `firstName`, `customHabits`, `habitCatalog`, `categoryState`, and `insightHistory`. Here `customHabits` means overrides for shipped habits; newly created definitions live in `habitCatalog.customDefinitions`.

Version 9 requires the lifecycle catalog and validates order against every retained identity, exactly once, including custom and archived habits. Strict validation rejects malformed catalog/schema shapes, colliding or unknown IDs, invalid text/configuration, invalid category references, incompatible completion/progress/evidence, and future-dated custom activation or lifecycle changes before the imported snapshot is written.

Versions 1–8 remain importable. They synthesize a schema-1 lifecycle catalog with no user-created definitions and the Medication archive transition on the import date, because those formats did not encode lifecycle state. Existing legacy order migrations remain supported. Versions 6–8 retain their validated category documents; versions 1–5 receive deterministic shipped categories. Category schemas 1 and 2 normalize to category schema 2, and older insight documents migrate to insight schema 2 as observed evidence.

Import validates the lifecycle catalog, builds complete/active catalogs, validates categories and complete order, then validates completion/progress and prospective evidence before committing all seven authoritative persisted documents:

1. State/progress: `wavelength_wpb`.
2. Complete canonical order: `wavelength_wpb_order`.
3. First Name: `wavelength_first_name`.
4. Insight evidence: `wavelength_insights_v1`.
5. Category state: `wavelength_categories_v1`.
6. Shipped-habit overrides: `wavelength_wpb_habits`.
7. Lifecycle catalog: `wavelength_habit_catalog_v1`.

`commitStorageSnapshot` records prior bytes under `wavelength_import_journal_v1` before authoritative writes, restores the prior snapshot on write failure, and clears the journal after completion. Startup recovery handles an outstanding journal. These guarantees assume usable browser storage; export/share a separate backup before moving installations or replacing device state. Appearance, native reminder preferences/permission, coordinates, and full hourly forecast timelines are not included in the backup.

Create, custom edit, archive, and restore use `assertHabitCatalogStorageIntegrity` before mutating retained lifecycle data. Unreadable, malformed, strict-invalid, or stale stored catalog data blocks the mutation rather than allowing an in-memory fallback to overwrite it. An absent catalog is accepted for initial migration/recovery. Runtime changes and queued native reminder refreshes follow successful lifecycle persistence; this is not a blanket assertion that every unrelated settings/import path reschedules native reminders.

## Accessibility and visual contract

- Plus/restore SVGs use `aria-hidden="true"`; accessible action names are the visible text, not spoken icon names.
- Lifecycle actions, Back, restore controls, and dialog buttons retain at least 44px touch targets. Disabled save states prevent invalid creation.
- Native HTML dialogs use `aria-labelledby`. Category, measurement, rhythm-selection, and threshold controls have explicit labels; Card description has an `aria-label`. The current habit-name and optional rhythm-note inputs remain placeholder-only, so this phase does not certify explicit labeling for every editor field. Status messages use the existing live announcement path.
- Keyboard focus-visible outlines remain visible. Archived-view Back/Escape/history exits return focus to the originating Home or Manage archive launch action. After scoped **View all archived habits**, lookup prefers the matching category and safely falls back to an available rerendered action.
- Archived names wrap, including long unbroken text, without ellipsis at 390px. The archived rows are separate from the fixed-height daily habit-card design and its legacy/user-text fallback behavior.
- Lifecycle copy meets WCAG AA regular-text contrast in settled Day/Night normal, hover, and keyboard-focus states. The Day-only `--lifecycle-accent` is `#20638d`; Night inherits the established accent. Global app accent tokens are unchanged.
- No horizontal overflow or fixed-dock obstruction is accepted on the tested 390×844 surfaces. Reduced-motion behavior and existing reorder cancellation cleanup remain intact.

## Regression ownership

- `tests/habit-lifecycle-regression.mjs`: catalog, migration, date eligibility, normalization, stable IDs, mutation integrity, custom create/edit.
- `tests/habit-backup-regression.mjs`: v9/legacy migration, strict references and seven-document rollback.
- `tests/habit-lifecycle-ui-regression.mjs`: shared actions, routing, exact copy, archive/restore and focus contracts.
- `tests/habit-lifecycle-visual-regression.mjs`: cross-build wrapping, scoped contrast token, and Manage drag visibility guards.
- `tests/category-personalization-regression.mjs`, history/streak, completed grouping, measurement, and native consumer suites: cross-surface invariants.
- `tests/browser/habit-lifecycle-e2e.cjs`: actual create/archive/restore, save origins, retained data/reload/reorder, recommendation-before/after archival, real widget publication and reminder scheduling with bridge-only mocks, injected rollback, history/dirty/focus paths, visual measurements and settled screenshots.

For a browser rerun, pass `WAVELENGTH_SOURCE_SHA256` explicitly for the served bytes, select `WAVELENGTH_THEME=light` and then `dark`, and execute sequentially with isolated profiles. The harness's fallback hash intentionally refers to the original RED baseline. Source-only documentation updates do not change the accepted app bytes or establish native/release parity.
