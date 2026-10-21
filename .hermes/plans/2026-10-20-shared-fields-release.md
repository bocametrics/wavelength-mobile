# Shared habit fields: publication and physical iPhone release

## Authorization and exact source

David authorized commit, publication and in-place phone installation. He also requested checking Xcode's iOS 27.1 Components offer and removing a previous copy if genuinely redundant because Mac storage is limited.

Release HTML: `bfa822b983d7cc851ff08eeb26a0eb7e03e1ebdfb1805e699d2d95af284b5508`. This supersedes the historical local checkpoint `5c893bb0a4379ad7c9a1eb6d389453ebf99ec0bfe9f283f8ca9aa502cbac6a27`, whose passing results remain retained but do not accept later bytes. Pre-commit review found an ordinary Wake/In bed Save returning to default retained stale nondefault params. Actual Edge RED proved both failures. One reviewed deletion branch fixes editable default-valued params without changing unavailable legacy params. Original 19 boundary cases remain intact, with two ordinary Save/reload cases appended.

## Verified source/browser gates

- Fresh complete release matrix: **72/72 sequential actual Edge runs**, all 36 suites across both theme batches. Evidence collector verified 1,404 navigation responses, 154 screenshots, all 72 removed owned profiles, zero unexpected runtime errors and exactly two expected malformed-catalog recovery errors.
- Source suites: **59/59**, with per-suite test hashes and source seal.
- Expanded boundary suite: **21/21 per theme**. Null rhythms, opaque windows and dependent bedtime windows are preserved through default round trips.
- Visual recapture: **48/48 states**, byte-identical to independently reviewed layouts, with 96 exact-source navigations and no new geometry/heuristic flags. Existing weekday-button and visually hidden checkbox heuristic flags remain recorded, not silently claimed absent.
- Independent full staged review reported only the clock-default P2 and no security concerns. Bounded follow-up verified the exact repair diff, unchanged original assertions, 15/15 independent pure probes and parent RED/GREEN evidence. It does not replace the fresh full matrix.

## Release metadata

- PWA cache `wavelength-mobile-v50` → `wavelength-mobile-v51`.
- App/Widget `1.0 (3)` → `1.0 (4)` in all four Debug/Release configurations.
- Current-release shell assertions separately observed RED for cache and build, then GREEN after metadata updates and canonical native-web generation.
- No native Swift, dependency, signing-team or capability changes. Signing team is an isolated build argument, not committed source.

## Remaining publication/device gates

1. **Mac preflight PASS:** pinned SSH, GUI owner `wavelength`, one Xcode 27.1 installation and installed physical iOS 27.1 SDK. Paired physical iPhone 16e reachable on iOS 26.6.1. GUI signing keychain is unlocked/readable/writable. Existing App/Widget profiles include the phone and expire 2026-10-23 UTC; read back the actual built profiles, do not assume renewal. Approximately 17 GiB free at preflight. Shared Mac checkout is preserved at its existing older commit with signing and deleted Package.resolved deltas; no repair, sync or reset of that checkout.
2. **Commit/publication OPEN:** stage only owned reviewed files, seal exact index, commit/push release branch, verify PR merge and Pages deployment commit, compare live HTML/SW bytes and exercise bounded real-browser flows. No publication claim from a push alone.
3. **Physical build/install OPEN:** build a hash-sealed exact release commit in a fresh isolated Mac directory through GUI-owned execution. Verify build exit, signatures, App/Widget IDs, profile expiry/device inclusion, App Group entitlements and full synced-to-packaged web parity. Refresh the readable phone backup immediately before install. Install in place, never uninstall. Verify exact immediate prelaunch LocalStorage equality, installed version, launch/process and separately report postlaunch semantic deltas. Native picker, widget appearance matrix and notification delivery remain untested unless explicitly exercised; do not expand these as incidental release work.
4. **Components decision COMPLETE, no deletion required:** the 15.9 GB offer is the iOS 27.1 simulator runtime, not a missing physical SDK or duplicate Xcode. Skip the unnecessary download. Existing 26.5 and 27.0 runtimes have retained simulator test state and are not accidental duplicates. No runtime, simulator data or Xcode installation was deleted.

Preflight data safety: readable app-data paths backed up except OS-owned SplashBoard cache, with 34 archive members individually reconciled, 12 LocalStorage keys, SQLite integrity OK and two equal independent WebKit copies. This is not a whole-device/root-container backup. Fresh pre-install and post-install backups are still required.

## Evidence

Durable release artifact root: `/home/ai_agent/.hermes/artifacts/wavelength/shared-fields-release-20261020/`. Principal records: `anchor-final-matrix-verification.json`, `anchor-visual-verification.json`, `independent-anchor-followup.json`, `anchor-application.diff`, original blocked review/seals and metadata RED logs. Failed/aborted and superseded runs remain separate.

Historical feature acceptance root: `/home/ai_agent/.hermes/artifacts/wavelength/editor-shared-model-20261020/`.
