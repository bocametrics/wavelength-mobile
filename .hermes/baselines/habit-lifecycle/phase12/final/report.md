# Habit lifecycle Phase 12 acceptance

**Verdict: PASS.** The complete local browser acceptance gate and sealed independent review passed. Nothing was pushed or deployed. Native/device/release validation remains Phase 14; design and user documentation remains Phase 13.

## Verified gates

- 17 browser suites, 34 sequential real-Edge runs: all passed.
- 15 suites honor Day/Night environment selection. `navigation-insights-e2e.cjs` and `next-wave-e2e.cjs` ignore that environment; their duplicate runs are not claimed as independent theme coverage.
- The new lifecycle suite passed all 12 scenarios and 234 assertions in each theme, at 390×844, with zero page or console errors.
- 38 source suites passed, with service-worker/browser-harness syntax and diff-integrity checks passing.
- Three HTML artifacts are byte-identical, SHA-256 `3ecf1ac335d4e356c6d2c1bf40182a68cfd4320f4f6548028e716c4c2e208c11`.
- Sixteen distinct 390×844 lifecycle screenshots were visually accepted and hash-verified. The final full-batch screenshots are byte-identical to those visually accepted by the parent.
- Lowest sampled lifecycle-copy contrast: Day 4.6776:1; Night 5.7193:1. Normal, hover, and keyboard-focus measurements are taken after visible management animations finish.
- Sealed review `deleg_0e70d7b5`: passed, no logic errors or security concerns. Its pending-full-batch condition was subsequently satisfied by the parent-verified 34/34 batch.

## Corrections made during acceptance

1. Archived names now wrap, including unbroken custom names, instead of clipping medication's full title.
2. A scoped lifecycle accent darkens Day action copy without changing the global app accent or Night palette.
3. Manage lifecycle actions hide during an actual grip drag without collapsing layout. This is bounded visual consistency hardening alongside the existing Home reorder-hiding behavior, not an additional feature.
4. Seven legacy browser contracts were reconciled with approved lifecycle rules: active-habit category guidance, backup v9, initial active count 21, and historical date-effective denominators. No unrelated assertions were removed. The historical oracle independently asserts 50 completions over 175 opportunities, rounded to 29%, across eight days.

The parent reproduced the original clipping/contrast/drag failures before fixes and added the immutable cross-build `habit-lifecycle-visual-regression.mjs` RED guard. Parent browser hardening added successful creation from Home All and both Manage scopes, actual before/after archive of a live incomplete recommendation, actual widget publication changes, complementary dirty Escape/Back paths, and explicit settled normal/hover/focus measurements. An enter-animation frame initially produced a false contrast signal; correcting measurement settling, not production color requirements, resolved it.

## Coverage and scope

The suite covers placement, scoped/default creation, explicit category validation, save routing, reload, completion, real keyboard reorder, completed/incomplete shipped/custom archive, cancellation, retained identity/configuration/order/progress/history/evidence, actual active counts and Next Wave, boundary-mocked native widget publication/reminder scheduling, restore and archived-category reassignment, fired per-write rollback injection, empty/scoped archive lists, conditional View all, browser history and dirty guards, focus restoration, clipping/overflow/44px targets/contrast, and actual touch-drag exclusion/cleanup.

Native mocks replace only bridge boundaries; this is not physical iOS reminder/widget acceptance. Layout and contrast measurements target lifecycle surfaces, not an exhaustive redesign of every editor control. Existing management-row ellipsis is baseline behavior; newly introduced archived rows expose the complete retained name.

## Evidence

- `summary.json`: parent-verified aggregate, exact denominators, source hash, screenshot hashes, limitations.
- `browser-results.json`: all 34 source-bound driver runs and their scratch log paths.
- `source-results.json`: complete source-suite execution records.
- `light-evidence.json`, `dark-evidence.json`: every lifecycle assertion, measurements, native-boundary calls, and screenshot hashes.
- `screenshots/`: sixteen final viewport images.
- Earlier RED findings remain preserved in the parent Phase 12 directory; this final report supersedes their acceptance status, not their audit history.

## Reproduction

Serve the repository at port 8791. Copy `tests/browser/habit-lifecycle-e2e.cjs` to the Windows Puppeteer workspace and verify byte identity. Set `NODE_PATH` to the installed Windows `puppeteer-core`, `WAVELENGTH_THEME` to `light` or `dark`, `WAVELENGTH_ORIGIN=http://127.0.0.1:8791`, an output directory, and `WAVELENGTH_SOURCE_SHA256=3ecf1ac335d4e356c6d2c1bf40182a68cfd4320f4f6548028e716c4c2e208c11`. Run both themes sequentially with isolated profiles. The harness deliberately retains the original RED-baseline hash as its default, so the accepted source hash must be explicit.
