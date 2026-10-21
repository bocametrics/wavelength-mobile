# Shared habit field model — local implementation phase

## Authorization and boundary

David approved the consolidated field-model suggestions and the one-way minute rule: editable Amount Goal drives read-only Duration. A previously entered draft Duration is visibly replaced before Save; conflicting previously saved values require explicit review rather than a silent winner.

One phase, with several implementation workstreams. A focused foundation pass does not close this phase. Local source/browser only: no commit, push, publication, native build, simulator work, device installation, notification investigation, or recommendation-engine redesign.

## Release follow-up

The local acceptance below is a historical checkpoint at source `5c893bb...`. Pre-commit review subsequently reproduced an ordinary anchor-clock Save returning to default that retained stale nondefault params. Release source `bfa822b983d7cc851ff08eeb26a0eb7e03e1ebdfb1805e699d2d95af284b5508` adds the narrow reviewed correction and two parent-owned RED→GREEN cases without changing the original assertions. Fresh release acceptance passes 59 source suites, 72 browser runs, 21 boundary cases per theme and 48 unchanged visual states. See `2026-10-20-shared-fields-release.md` for publication/device gates. The earlier completion receipt is retained, not reused as acceptance of later bytes.

## Sealed starting point

- Base commit: `a7eb71ae57efd29475ccadbb91e87fa8372353d2`.
- Accepted pre-change HTML: `fc326999dd18394bc335ac572a15f2e34c4e15e381fd41b6476e1e0e30d5dcde`.
- Preserve all existing uncommitted editor consistency, typography, identity and preservation work.
- Parity targets: `index.html`, `tests/fixtures/friday_app_2026-07-12.html`, sibling `../friday_app_2026-07-12.html`.
- Baseline manifest and exact HTML: `/home/ai_agent/.hermes/artifacts/wavelength/editor-shared-model-20261020/`.
- Original inventory: 56 source suites, 30 browser suites. Expanded parent inventory: 56 source suites, 32 browser suites before any new pure-model tests.

## Implementation contract

1. **Shared Duration:** one authored planning value for applicable custom/system habits. Check once, Count, and non-minute Amount may have independent planned duration. Amount measured in recognized minutes uses Goal as its only active authority; derive the read-only Duration live and again at Save/runtime. Literal saved units are preserved. Initial recognized aliases: `min`, `mins`, `minute`, `minutes`, case-insensitive after external trim. Do not infer semantics from arbitrary substrings.
2. **Precision:** preserve the exact valid completion Goal, including fractional or large values. A whole-minute scheduling budget may round upward internally, never round/clamp the saved Goal. Oversized planning cannot silently become a different target or a feasible opportunity.
3. **Anchors:** Wake time and Bedtime remain editable, single-source exceptions. Their shared Duration slot is disabled, Not applicable. In bed's existing internal recommendation budget is not user sleep duration. Wind down remains duration-based before Bedtime; resolve effective duration before deriving all dependent boundaries.
4. **Water/Gratitude:** retire bespoke Water amount and Good things editor controls in favor of generic measurement fields. Preserve existing tracking choices until explicitly reviewed/changed. Do not reinterpret legacy 16 oz as a daily goal or increment. Water without an Amount goal requires explicit numeric setup; old values are provenance, not a fabricated quantity. Gratitude may offer Count Goal 3 for explicit confirmation, never retroactively manufacture counted things from old checkmarks.
5. **Dinner:** use common Preferred time authoring/codec. Clearly identify grandfathered finish-by timing; explicit Keep retains its full legacy semantics, Replace acknowledges conversion to common Preferred time, Clear removes deadline authority and preference without default resurrection. Preserve dual deadline/window records until reviewed. In common mode, do not retain a hidden 19:00 end/18:00 urgency. Cover midnight and 23:59 without fallback to the old context.
6. **Storage/transfer:** use a versioned shared-settings representation, strict field validation, and pure/idempotent legacy adaptation. Planned contract: catalog schema 2 with shared per-habit field settings; backup 11 explicitly accepts imports 1–10 as well. Do not accidentally drop backup 10 by replacing the old version constant in its accepted-version array. Invalid/newer documents must not silently become writable defaults.
7. **History:** ordinary `reconcileMeasurementTypeChanges` is not a migration; it deletes historical numeric progress and can synthesize today's quantities from a Boolean. Preserve historical raw quantities, units, kinds and completion meaning through reload/export/import/subsequent ordinary persistence. Date-effective configuration follows the reviewed activity-sensitive cutover contract below; the implemented migration preserves raw history and earned-completion semantics. No silent resets or invented measurements.
8. **Atomicity:** stage every affected document and derived runtime/Insights projection before one journal transaction. Publish globals only after successful commit. Cover every written key's fault/retry boundary, dirty drafts, Back/Forward Save, archived habits, raw copy, own-null rhythm/preferences, opaque windows, peer records, category/order/lifecycle state, and later normal persistence.

## Parent-owned RED evidence

Two actual-Edge suites were added before any production implementation:

- `tests/browser/shared-habit-duration-e2e.cjs`: 16 cases per theme, 15 intended missing-feature failures plus runtime-cleanliness pass. Each theme captured 31 navigation response hashes matching the sealed baseline; no page errors; owned profiles removed.
- `tests/browser/shared-habit-field-migration-e2e.cjs`: 16 cases per theme, 13 intended failures and 3 preservation/baseline passes. Each theme captured 30 matching navigation hashes, an exhaustive 1,440-minute codec check, no page errors, owned profiles removed. The mode-conversion case demonstrates historical fractional progress loss in current code.

Raw evidence, summaries and original RED tests are sealed in the artifact root. Initial Windows launcher failure from missing WSLENV was harness setup, not product RED. Corrected runs invoked actual assertions with explicit propagated environment.

## Active workstreams and gates

- Duration/minutes, Water/Gratitude, Dinner and tracking integration: implemented and locally applied from final candidate `/mnt/c/Temp/wavelength-shared-budget-final/WavelengthMobile`. Original feature RED assertions remain intact; additional parent boundary/bootstrap cases cover review findings.
- Historical measurement semantics: read-only audit complete, with current-config validation and done-to-target inference corroborated in source. Safe cutover decision: when a habit already has today's completion or an own progress entry (including zero), changed tracking semantics start next calendar day; otherwise they may start today. Keep authored/editor settings separate from date-effective Home/Next Wave/widget projection. Preserve `state.done` as recorded evidence and unknown legacy quantities without inventing units or targets. Tracking epochs do not need a fourth measurement kind: only Check once, Count and Amount remain. Duration provenance for forecast validation must also handle changes earlier on the same date, not just date-only epochs. Implementation and migration acceptance passed on the exact final source recorded below.
- Additional parent RED coverage was then appended, without weakening the original assertions: numeric completion without a recorded quantity, today-versus-tomorrow authoring/runtime separation, immediate setup on an untouched day, and both past-day and controlled same-day forecast evidence after a Duration edit. Expanded migration suite: 21 cases/theme, 17 intended failures and 4 baseline passes; each theme has 40 matching navigation hashes, zero page errors, and verified owned-profile removal. Original 16-case, intermediate 20-case and final 21-case RED evidence are retained separately.
- Source contracts, focused Day/Night, fresh complete sequential browser matrix and source-specific code/pixel review chain: PASS, with final-source reconciliation recorded below.
- Native/package/device/release gates: intentionally out of scope and untested.

## Final acceptance and audit trail

Before applying an isolated implementation, inspect and retain its exact diff against the accepted source, with no unexplained checkout replacement. Reconcile only demonstrably obsolete current-version oracles, retaining legacy migration and evidence assertions; preserve old/new test hashes and exact source identity for oracle-only edits. No dead compatibility controls or unreachable code solely to satisfy regexes.

The exact final candidate must pass every source suite and the full frozen browser/theme product after all repairs, with source/test/navigation hashes, actual theme verification, settled Day/Night screenshots, screenshot copied-byte hashes/dimensions, zero unexpected runtime errors with explicitly accounted-for corrupt-catalog recovery errors, and owned-profile cleanup. Independently review preservation and visuals. Keep failed runs as failed, not retroactively accepted by targeted retries. Synchronize README/phase receipts only with verified acceptance claims.

After application, all 59 source suites passed again from the main checkout. Fresh main-origin Edge verification passed 16 Duration/Goal Save/reload cases per theme (32/32 total), with all 66 navigation responses matching the accepted source, zero runtime errors and both owned profiles removed. These are additional main-checkout checks, not a replacement or rerun of the complete 72-run candidate matrix. Receipts: `post-application/source/summary.json` and `post-application/browser-smoke.json` under the audit root below.

## Final local source/browser acceptance

- Final HTML SHA-256: `5c893bb0a4379ad7c9a1eb6d389453ebf99ec0bfe9f283f8ca9aa502cbac6a27`. Main index, tracked fixture and sibling desktop mirror match exactly. All 95 source/browser test-file hashes match the sealed final candidate after application.
- Source suites: 59/59. Fresh actual Windows Edge browser matrix: 72/72 sequential runs across all 36 suites and both theme batches. Parent final boundary suite: 19/19 per theme. The new cold-bootstrap suite covers four valid saved custom cue arms plus runtime cleanliness.
- Matrix evidence: 1,388 actual navigation responses match the source, 154 screenshot hashes/dimensions verified, all 72 owned profiles absent, zero unexpected runtime errors. Two deliberately malformed-catalog recovery cases each produce their single expected bootstrap error; these are not hidden or counted as unexpected failures.
- Visual acceptance: 12 meaningful editor states × 320/390 widths × Day/Night, 48/48 final-source recaptures. Geometry/values match the independently reviewed predecessor, and all 48 PNG byte hashes are identical. No changed-control clipping/overflow or redundant editor target summary. This is browser presentation, not native picker/device acceptance.
- Review chain: independent complete integration review; bounded follow-up confirming import/current-day Goal and retained Duration repairs; independent constants-relocation and obsolete-oracle review; independent settled pixel review. Final budget-only repair was parent-reviewed read-only with an actual RED→GREEN regression, strict forecast retention through reload/import, a normal fractional-Goal projection check and the complete final-source matrix. No blanket claim that an earlier source review alone accepts later bytes.
- Additional verified repairs include exact-timestamp forecast budgets, truthful saved-value conflicts and recovery, archive-date first persistence, unavailable system timing/opaque window preservation, pending peer activity during new-habit creation, date-effective import reconciliation and valid custom-cue cold startup. Resolving legacy Goal20/Duration15 after activity retains today's existing budget15 and valid forecast evidence while the resolved Goal15 begins tomorrow.
- The final app/test/documentation application is deliberately uncommitted and undeployed. Existing uncommitted work was hash-checked against the retained preservation backup before applying only the sealed file manifest. No native build, `www` regeneration, notification experiment, simulator/device installation, push or publication was performed.

Durable audit root: `/home/ai_agent/.hermes/artifacts/wavelength/editor-shared-model-20261020/`. Key records: `final-matrix-verification.json`, `application-sealed/candidate.diff`, `application-sealed/manifest.json`, `application-readback.json`, `main-before-application/manifest.json`, and `final-budget-repair/visual-revalidation.json`. Failed/superseded runs and corrected harness attempts remain separate; a superseded 72/72 pass is explicitly not phase acceptance after the additional legacy-budget defect was reproduced.
