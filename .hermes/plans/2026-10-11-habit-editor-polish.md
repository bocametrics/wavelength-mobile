# Habit Editor, timing and widget polish implementation

## Scope and authorization

David completed screenshot review and authorized staged implementation without pausing after each stage. Ask only when a visual decision or approval is genuinely needed. Mobile/iPhone presentation is primary; maintain shared HTML mirrors without adding desktop-specific polish work.

The later user-directed boundary takes precedence over autonomous staging: finish the authored-cue phase, then pause before native/package/device/release. That phase was accepted and paused as requested; the user then explicitly resumed native acceptance. Physical installation and release still require their separate applicable gates.

Baseline: `50554c591b43bc35de2d14c45d2b73577b095831`, branch `feat/habit-editor-polish`. Initial source gate: 38/38 suites passed, clean tracked state, identical canonical/desktop/fixture HTML. Baseline HTML SHA-256: `715f688d9e38062bbc8f11c3da6d2124d285833392f038da0b332f1cddb44b88`.

## Invariants

- No physical uninstall or reset. Before any device install, scoped readable backups and semantic comparison are mandatory.
- Preserve stable habit IDs, creation dates, retained order/category, completion/progress, Insights evidence and existing archived states.
- New title/description authoring budgets are 30/32; old valid 48/42 custom definitions and longer legacy system overrides remain load/import-compatible. Enforce a new budget only on a field actually changed; editing another field must not shorten or invalidate an unchanged legacy value.
- Categories remain navigation-only. Never infer timing, medical advice, outdoor exposure, adaptive variants or recommendation eligibility from category/name.
- Choosing a cue must not silently enable Next Wave or push notifications.
- Existing custom habits remain recommendation-off unless the user explicitly opts in.
- Parent-owned new RED assertions are immutable for implementation children. Update obsolete old-copy/limit contracts deliberately in the parent, without weakening retained behavior or backup safety assertions.
- Keep generated assets transformation-aware; do not hand-edit `www/` or packaged native public files.
- Full source, sequential browser matrix, independent sealed review, native build/interaction/visual acceptance and physical preservation precede release/deployment claims.

## Stage 1: Editor/readability/validation

- Manage titles show full text with wrapping; scoped descriptions clamp at two lines; content-driven height and vertically centered controls. Category title truncation and Home card structure stay unchanged.
- Standalone accessible back chevron, centered editor title, no header Add/Save. Full-width primary Add habit / Save after form fields; Archive/reset remain separate.
- Category full-width first; selectable Emoji grouped with Habit name. Reuse quick picks and arbitrary single-grapheme emoji support from Category editor. Preserve the star default; permit custom emoji selection/edit.
- Labels above fields; live counters on label rows: title `0 / 30`, description `0 / 32`.
- Amount: Goal and Unit together; separate Add per tap. Examples are placeholders `e.g. 16`, `e.g. ounces`, `e.g. 2`, not stored defaults. Preserve entered values during switching/revisiting.
- Field-specific visible errors for target/step/unit/cue threshold/etc. Do not swallow errors or incorrectly mark a valid name invalid. Explain blocked Save, retain dirty draft, use appropriate blur/save error timing.
- Adopt recommended plain-language `Habit cue` and `Cue message (optional)` as bounded copy decisions. Same feature name for built-in managed cues, secondary `Set by Wavelength`. Stacked full-width cue/threshold/message fields. Exact approved helper: `Shown on the habit card when cue conditions are met.`
- Required evidence: parent RED/GREEN source + model tests; actual 390px Day/Night browser scenarios, legacy unrelated-save and field-edit boundaries, emoji, Amount invalid/valid cases, original navigation/dirty guards, geometry and runtime errors.

## Stage 2: Explicit custom timing and recommendation contract

- Persist explicit Include in Next Wave opt-in, Preferred time/time of day with Any time, and Indoor/Outdoor/Either.
- Define the minimal strict backward-compatible model after the independent read-only audit; old backups default to manual, unknown/malformed fields fail closed before writes.
- Derive generic runtime recommendation context only from authored configuration. Respect date, weekdays, completion, archival, cooldown and time boundaries; preserve shipped selector priorities and existing environmental rules.
- Solar cues apply across settings; outdoor does not automatically require daylight. Either must not be presented as outdoor exposure. External weather never represents room conditions.
- Custom cue messages activate only on valid matching conditions/time window. Missing/stale/future/timezone-incompatible data must not imply activation. Neutral context may remain outside activation.
- Separate advisory cue display from recommendation gates. Do not invent environmental/adaptive guidance or necessary duration from a habit name or count target.
- Protect atomic saves, backup round trips, notification/widget publication and evidence normalization with parent tests across all impacted surfaces.

## Stage 3: Built-in concise copy

Audit actual defaults and choose meaning-preserving copy within title 30 / description 32. Baseline over-budget entries: beach/cardio/learn/goals/breakfast/medication/dinner/sunscreen/sleep. Do not mechanically slice strings or overwrite personalized notes. Record exact old/new copy in documentation and verify real rendered fit rather than assume character count ensures one line.

## Stage 4: Settings native containment and widget typography

- Settings reminder input currently passes Edge card-boundary tests but the physical screenshot shows overflow. Verify installed-version/assets separately, reproduce actual WKWebView behavior and correct root cause rather than merely clipping. Native picker remains usable; reminder settings and scheduling preserved. Test 390px and narrower bounds plus real native Day/Night.
- Medium eyebrow matches small `TODAY'S HABITS` `.caption2` semibold. Reduce specifically the medium habit-title size modestly (roughly one point), preserving Dynamic Type and semibold hierarchy. Supporting text/icon/action/spacing remain unchanged unless evidence requires a bounded fix.

## Stage 5: Consolidated acceptance and release

- Synchronize documentation, mirrors/native assets, source contracts and browser expectations.
- Run every source suite, SW syntax/parity/diff/security checks and npm audit.
- Run full sequential Day/Night browser matrix with owned disposable profiles plus new targeted behavior/visual scenarios. Inspect exact screenshot inventory and errors, not only process exits.
- Obtain independent fail-closed review of sealed source and exact changed files.
- Build detached/pinned Mac candidate, validate signatures/App Groups/public parity and native interactions, including Settings time picker and small/medium widgets.
- Show consolidated screenshots for visual acceptance if needed. No per-stage permission prompts.
- Before signed physical install: fresh preinstall backup; in-place install only; read back package/launch/process and immediate/postlaunch semantic data. Attribute later user edits separately.
- Commit/push/deploy after applicable gates; verify local/origin/Pages/pinned-Mac/package/installed-device alignment and selected live flows. Preserve durable release evidence and disclose provisioning deadlines.

## Current release checkpoint

Exact restored App/Widget **1.0 (3)** / cache `wavelength-mobile-v50` is installed and running after recovery from an accidental downgrade. App/Widget profile expiries are **2026-10-23T00:05:05UTC** / **2026-10-23T00:05:06UTC**. Publication is authorized but has not occurred; final publication seal/review and remote/Pages readback remain separate gates. See `docs/habit-editor-native-acceptance.md` for the current bounded recovery status.

All 12 immediate pre/post-install raw rows matched before launch. Strict postlaunch preservation **failed**: exactly one derived current-day recommendation `lastShownAt` refreshed; all other existing values remained intact. No repair/rollback was performed. “Looks good” confirms the restored interface only. OS pending requests/scheduling, real delivery/tap-through, physical picker/reminder/widget human gates and tinted/accented/vibrant modes remain unverified. Private evidence and backups remain outside the repository. Earlier counts, pauses, install-in-progress claims and old signing deadlines below are historical checkpoints, not current status.

## Progress

- [x] User feedback complete; implementation authorized.
- [x] Baseline source gate and clean repository verified.
- [x] Feature branch created.
- [x] Stage 1 parent RED/GREEN and browser acceptance.
- [x] Stage 2 explicit timing/Next Wave/backup/cue source/browser contracts; historical pause honored before explicit native resume.
- [x] Stage 3 concise default copy and documentation (accepted with Stage 1).
- [x] Stage 4 exact-production simulator Settings containment/picker and declared 16-case full-color WidgetKit acceptance.
- [ ] Remaining native enabled scheduling/delivery, additional widget host modes and physical iPhone acceptance.
- [x] Exact-source 1.0 (3)/cache50 recovery, installed-app and running-process readback; immediate 12-row preservation.
- [ ] Strict postlaunch preservation (failed: one existing derived timestamp refreshed).
- [ ] Stage 5 final publication seal/review and deployment/readback; historical local review does not establish published alignment.

### Historical Stage 2 and subsequent acceptance checkpoints

The isolated read-only settings foundation and journal-entry prevalidation passed independent review and 38 existing browser runs at HTML `4ea32c9672512fdc9affca5f53c477d6a5b539ba29a854832a88683631277a0b`. Backup v10 transfer is accepted at HTML `489bdae53fbd0f2c8c8a1cbbf21ed681e2e1788cfde58a044b03acd4dad34a2b`: 43 source suites, 70 targeted transfer cases, 40 full-browser runs and 15 independent importer/render probe groups. The exact scope and compatibility/rollback boundaries are documented in `docs/habit-editor-stage2-storage.md`.

The pure context foundation is accepted at HTML `a19c069918060799e5e28447df7b0aee6c1cd8e4ffe5f210ff38c459b5157a83` after 44 source suites, 40 full-browser runs and eight independent actual-source probe groups; its checkpoint left the nine ordinary callers unchanged and manual. Selection safeguards subsequently passed at `840f76daef4d2e3b4609130e29560615fc06954dd367cdc564a232f43db9349e`, preserving shipped purpose and metadata while keeping generic late copy neutral. Runtime consent is now accepted at `264bb900ce44fcd99431cb08eaea3ef0e1fe4ce1391e61e04c0c4f38376abf47`: 46 source suites, 56 targeted cases, 42 full-browser runs and 15 independent actual-source groups with 387 observations. All nine callers now use explicit validated current/incoming configuration; missing, disabled or invalid remains manual. Those gates included 67 unchanged parent tests and three byte-identical builds.

Custom Include/Setting authoring and its Save-return/Forward repairs are accepted at `54a57289e033c5e8c02541906a034176835be4c5abd970423972a2bbd1140d3f`: 47 source suites, 100 targeted actual Edge cases, 46 full-browser runs, 61 independent actual-source groups and 70 immutable tests. Separate same-flow route ancestry preserves navigation while only a fresh successful Save grants one-use committed-render authorization; normal later renders still persist.

Pure custom timing is accepted at `5c1f5b021a6dca676211fa7bc3e0565c60a84e746ce16f8eba869b8c8eb9f270`: 48 source suites, 14 cross-build foundation groups, 46 full-browser runs, 18 independent groups and 71 immutable tests. Live Preferred time/Any time authoring subsequently reproduced parent RED and is now accepted at `c35aa3a39e9bf84e9b07269fa0446d30ced28152d3e6419a908d6712323a1570`: 49 source suites, 68 targeted actual Edge cases, all 48 fresh browser runs across 24 suites, eight parent-inspected screenshots and eight independent actual-source Node groups. The 73 sealed tests and three mirrors remain verified. Any time explicitly clears only timing; exact minute values, legacy Saved windows, retained clock drafts, field-specific validation and atomic rollback/Forward behavior pass. Receipt: `stage2/timing-editor-green/parent/ACCEPTANCE.json`.

Complete authored-cue source/browser acceptance is recorded at `61cc592f111b8bd1c3b9fa90e0185cba2a6054a25cb4bdb5d46123123d721e42`: 54 source suites, 54 strengthened final integration groups, 28 focused actual Edge cases, ten real JavaScript callback receipts, six inspected mobile screenshots and all 52 fresh full-browser runs across 26 suites, with 80 immutable tests and three mirrors verified. Independent complete-phase review found no blocker; its original 36/39 exploratory result and three null-timer oracle failures remain preserved alongside separate reviewer/parent 3/3 diagnostics, not relabeled 39/39. Actual weather/AQI/hourly dependencies survive authored-copy/evidence replacement, including invalid cue provenance. Whole-phase reversal of ten changed/five added functions recovers c35 byte-exactly, leaving unrelated timing/writers/schemas/UI frozen. Receipt: `stage2/authored-cue-selected-dependency-green/parent/ACCEPTANCE.json`.

**Native work resumed explicitly after the authored-cue pause.** Production simulator reminder containment/picker persistence and the declared 16-case full-color WidgetKit matrix are now accepted at unchanged HTML61cc and Swiftf8377. Fresh 56 source suites, 82 test seals, 52 browser runs, independent 664-assertion small-layout review, exact 41-file package provenance and complete simulator restoration passed. The matrix combines 14 correct fresh rows with two genuine Quiet Moment follow-ups on the identical candidate; earlier wrong-state captures and failures remain retained. Enabled reminder scheduling/delivery, tinted/vibrant host modes, physical signing/preservation and release remain open. No canonical native sync, commit, push, deployment or physical installation has occurred. See docs/habit-editor-native-acceptance.md and stage4/widget-accepted/ACCEPTANCE.json.

**Subsequent finish-through-release authorization:** the user authorized the remaining work and reiterated staying focused on completion. Additional notification/debugger investigations have been stopped without accepting their missing evidence. Final metadata cache50/App+Widget build3 passed parent-owned RED→GREEN. Canonical native sync is now complete; all56 source suites, transformed-web/exact-SW parity, syntax/diff checks and npm audit0 passed, with HTML61cc/Swiftf8377 and81 other tests unchanged. Whole local source/security/preservation review is parent-verified (116 groups,2,100 baseline comparisons,1,440 preferred minutes); it does not imply device or delivery acceptance. A fresh complete browser regression and isolated GUI-signed physical build are in progress. Fresh immediate preinstall backups, in-place installation and immediate/postlaunch semantic verification still precede release. No physical install, commit, push or deployment has occurred at this preparation checkpoint. Receipts: stage5/final-release-metadata/GREEN.json and stage5/final-batch-source-review-parent.json.
