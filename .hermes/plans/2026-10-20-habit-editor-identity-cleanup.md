# Habit editor identity cleanup

## Approved scope
Remove the redundant system target summary from Add/Edit Habit, keeping useful target summaries on Home cards. Align Emoji and Habit name labels/control tops with consistent 6px spacing and 44px base controls; long-name textareas may still grow. Do not add layout complexity to preserve duplicate content. No runtime recommendation, parameter/save/schema, native, commit/push or release changes.

## Baseline and RED
- Previous accepted local HTML: `b90190024fd9cf3664b85f3c2ba68b223e2508b8f8aafd2c1178afa8410a6549`.
- Full baseline source/test manifest and HTML: `/home/ai_agent/.hermes/artifacts/wavelength/editor-identity-cleanup-20261020/`.
- Parent browser RED: `C:\Temp\wavelength-identity-cleanup\red\light-identity-evidence.json`. Existing editor duplicated target markup and had staggered geometry. The 71-case test reached actual assertions, including widths320/390/768, custom and active system identities.
- Intermediate candidate passed70/71; the remaining wide custom-name input was below44px. A scoped direct-input height rule fixed that without constraining growing textareas.

## Candidate
HTML SHA-256: `fc326999dd18394bc335ac572a15f2e34c4e15e381fd41b6476e1e0e30d5dcde`. All three proven mirrors match.

The exact `identity-only.patch` removes the target-summary element, styles and two preview-only helpers/listeners. Custom-duration selector visibility handling remains. Parameter normalization, runtime Home formatter/rendering, field validation and both Save functions are byte-identical to the baseline; see durable `preservation-audit.json`.

## Gates
- Parent focused actual Edge:71/71 cases pass in both Day/Night, including raw legacy multiline name retention, actual hydration parameter Save and24oz Home qualifier readback, no duplicate editor summary, aligned controls and growing textareas.
- Source: **56/56 PASS** after reviewed two-file oracle reconciliation. The initial55/56 result is retained; its sole failure required the now-removed editor preview, not Home/runtime behavior.
- Obsolete oracles: parent reviewed/applied only `tests/habit-target-qualifiers-regression.mjs` and `tests/browser/system-habit-parameters-e2e.cjs`. Positive assertions now require absent duplicate summary, stable read-only identity, labeled parameters and exact changed clock values. All substantive Home target, parameter/legacy storage, discard and error assertions remain intact. Exact oracle patch and before/after provenance are retained.
- Independent source/pixel review: PASS, no remaining bounded blockers. Parent also visually checked the settled hydration preview.
- Fresh complete browser matrix: **60/60 PASS across 30 suites** on the exact final source in `C:\Temp\wavelength-identity-cleanup\final-matrix`. This includes 56 theme-aware executions across light/dark and 4 legacy theme-unaware executions. Parent verified 150 screenshot hashes/dimensions, 850 actual navigation-response hashes, source/test seals, zero runtime errors and absence of all 60 owned browser profiles. In each theme, all 68 identity geometry records have zero label/control top-edge discrepancy and zero duplicate target summaries.
- Native/device/package/release/deployment: not in this phase, not performed.

Local source/browser phase accepted. Durable evidence, exact baseline-to-candidate diff, original RED and intermediate-failure traces, source logs, Home/save preservation audit, reviewed two-file oracle patch/provenance, final browser matrix and settled previews are retained under `/home/ai_agent/.hermes/artifacts/wavelength/editor-identity-cleanup-20261020/`. Machine-readable receipt: `.hermes/baselines/habit-editor-identity-cleanup/20261020/summary.json`. Prior-candidate receipts remain separate; no commit, push, deployment or device work occurred.
