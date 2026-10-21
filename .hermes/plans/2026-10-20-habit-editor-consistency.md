# Habit editor consistency

## Approved scope
David completed screenshot feedback and approved the consolidated proposal in Telegram. Local implementation and source/browser acceptance only. No deployment, commit/push, native build, device install, notification investigation, recommendation redesign, or schema extension.

Shared field order: emoji/name, description, category, Track as with conditional goal/unit/increment, Repeat, Duration, timing (Wake time/Bedtime exceptions), Setting, Include in Next Wave, full cue details. Shared controls and spacing; managed system fields read-only and actual values shown. Unsupported custom Duration shown unavailable, not authored. System notice: “Wavelength habit” / “Some fields are managed by Wavelength and can’t be edited.”

Strength: Duration with minimum semantics in helper. Winddown: Duration with screen-free-before-bed explanation. Dinner: Preferred time with finish-by explanation, unchanged deadline behavior. Settings links open existing Wake/Bedtime editors, no duplicate state. Reset becomes accessible text-style button and confirms its actual scope before writes. Complete system cue type/threshold/unit/message. Keep labels close to own controls and separate field groups.

All 22 default names/descriptions already fit actual 30/32 limits; no default copy edits needed. Existing user overrides, multiline content, literal units, managed rhythm including null, opaque timing, category assignments, scheduling, measurement transactions and Back/Forward behavior must be preserved.

## Baseline and RED
- Base: a7eb71a (clean source tree before parent acceptance test).
- Source/mirror and unchanged test manifest: /home/ai_agent/.hermes/cache/scratch/wavelength-editor-consistency-20261020/baseline-manifest.json
- Baseline source suites: 56/56 pass, per-suite logs and results in baseline-source under that directory.
- Parent test: tests/browser/habit-editor-consistency-e2e.cjs
- Actual Edge RED: C:\Temp\wavelength-consistency-red\light-evidence.json. 182 executed checks; expected missing consistency requirements fail. Initial dependency/Windows shell invocation errors preceded the valid RED and are not product failures.

## Phases and gates
1. Inventory and actual-browser RED: complete. Original source56/56 passed; corrected original browser baseline52/52 existing runs passed, with the new consistency requirement RED in both themes.
2. Exact implementation diff review and local application: complete. Final HTML SHA-256 `d2f52f05c2105034064c79964b14b108415e7d5fdcc296b4ad8669b8323c11fe`; all three HTML copies match, including the sibling desktop compatibility mirror. The sibling’s original baseline is backed up in scratch.
3. Focused real-browser checks: complete on the exact final source, both themes. Per theme, 187 shared-layout checks and35 preservation scenarios pass. Coverage includes all active system habits, an independently corrected all-default renderer inventory, untouched/explicitly cleared saved windows, own null, raw multiline cues, Settings anchor persistence/return,320/390px geometry and settled control text contrast. Two inline scripts parse; whitespace diff check passes.
4. Fresh complete regression: final56/56 source suites and56/56 browser runs across28 suites PASS. There are52 theme-aware runs across light/dark and4 legacy theme-unaware runs. Seven demonstrably obsolete test oracles were reviewed with before/after hashes and positive replacement assertions. Native behavior is not inferred from browser mocks.
5. Independent read-only code review: final exact-candidate review PASS, no remaining bounded blockers. Parent verified142 screenshot hashes/dimensions,838 actual navigation-response hashes, source/test seals, zero runtime errors and absence of56 owned browser profiles. Settled Day/Night previews were visually inspected. Local source/browser gate accepted; documentation and durable evidence retained.
6. Native picker, WidgetKit/package, physical device, deployment/release: not in this phase and untested.

## Acceptance records
- Machine-readable parent receipt: `.hermes/baselines/habit-editor-consistency/20261020/summary.json`.
- Durable full evidence root: `/home/ai_agent/.hermes/artifacts/wavelength/editor-consistency-20261020/`. The copied browser tree contains336 files independently hash-compared with the actual run; its manifest is retained. Source logs, original shared-mirror backup, exact source/oracle patches, test hashes and settled preview images are retained there too.
- Final matrix raw root: `C:\Temp\wavelength-consistency-parent\final-browser-v5`.
- Git base remains `a7eb71ae57efd29475ccadbb91e87fa8372353d2`; no commit, push, deployment, package build, native notification investigation or device install occurred.

Review corrections: disabled archived anchor links now explain restoration before any navigation begins. Reset warns that tracking-type changes remove this habit’s historical amounts/counts, without changing the old reconciliation behavior. Valid noncanonical system timing is shown honestly as Saved window and preserved untouched; explicit clear has separate intent and real-browser regression. Default names/descriptions were audited across all22 shipped habits and need no shortening.

Harness/evidence history is retained separately: initial missing dependency/shell quoting, invalid `night` token, one external503, a direct-renderer history race, opacity-zero contrast samples before transition settlement, and the archived-default stale-row fixture were not accepted as product defects. Intermediate mixed-candidate diagnostic matrices are not used as final acceptance. The first final-source pass exposed the unchanged third mirror; restoring required parity fixed it without weakening a test. The final fresh56-run matrix has no failures.
