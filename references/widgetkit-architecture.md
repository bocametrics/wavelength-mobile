# WidgetKit architecture

## Status

Phase 1 established the shared-data boundary. Phase 2 added the read-only `systemSmall` progress widget. Phase 3 added the read-only `systemMedium` Next Wave widget. These two families are the complete supported set: a read-only `systemLarge` surface would duplicate the ordered habits already available after one tap into Wavelength without adding enough glanceable value.

The Capacitor app remains the source of truth for habit state and Next Wave decisions. Whenever Home renders an authoritative Next Wave result, the native app publishes one compact snapshot to the shared App Group. WidgetKit decodes that snapshot and renders it in SwiftUI; it does not inspect the WebView DOM or read WebKit LocalStorage.

```text
Wavelength JavaScript decision engine
        |
        | versioned JSON snapshot
        v
Capacitor WidgetSnapshot plugin
        |
        | atomic replacement
        v
group.com.bocametrics.wavelength/widget-snapshot-v1.json
        |
        v
WidgetKit TimelineProvider and SwiftUI views
```

## Version 1 snapshot

The top-level fields are:

- `schemaVersion`: integer `1`.
- `revision`: snapshot generation time in Unix milliseconds.
- `generatedAt`: ISO 8601 generation timestamp.
- `dayKey`: local `YYYY-MM-DD` date represented by the snapshot.
- `timeZone`: device IANA time-zone identifier when available.
- `expiresAt`: local midnight. The entire snapshot fails closed after this time.
- `nextRefreshAt`: a soft opportunity for WidgetKit to request a newer snapshot, capped at `expiresAt`. It does not invalidate otherwise trustworthy guidance.
- `progress`: completed and total scheduled-habit counts.
- `nextWave`: allowlisted presentation fields only: state, eyebrow, habit ID, habit emoji, title, target label, detail, action label, and `freshUntil`.
- `habits`: today's scheduled habits in canonical user order, stable-partitioned with incomplete rows before completed rows. Each row contains only identity, presentation, completion, and optional measured-progress fields.

Raw LocalStorage, history, location, weather payloads, category definitions, user profile data, and recommendation evidence are never copied into the shared snapshot. Environmental copy expires at the earliest applicable recommendation boundary, source-freshness boundary, or local midnight.

The JavaScript recommendation engine may attach non-enumerable `recommendationBoundaryAt` and `recommendationSourceFreshUntil` metadata while authoring a result. These internal values help determine `freshUntil`, but they are deliberately excluded from the schema-v1 allowlist. The semantic boundary considers the earliest relevant phase transition across all open habits, not only the habit currently displayed. Source freshness covers observed daylight or AQI data that affected eligibility or selection. Swift receives only the final app-authored deadline and never recreates scheduling or recommendation logic. The complete timing policy is documented in [`widgetkit-freshness-contracts.md`](widgetkit-freshness-contracts.md).

## Native storage contract

- App Group: `group.com.bocametrics.wavelength`
- Snapshot file: `widget-snapshot-v1.json`
- Maximum encoded size: 64 KiB
- Write mode: atomic file replacement
- Supported schema: version 1 only
- Timeline reload kind: `WavelengthWidget`

The Swift bridge rejects unsupported schemas, non-JSON payloads, oversized snapshots, unavailable App Group containers, and failed writes. The browser/PWA build exposes no widget publisher and remains a no-op.

## Implemented `systemSmall` widget

The first visible widget shows today’s completed/total count inside a circular progress treatment. The extension:

- Preserves the `.systemSmall` progress presentation alongside the separately rendered `.systemMedium` family; large is intentionally not exposed.
- Reads at most 64 KiB from the shared snapshot file and accepts schema version 1 only.
- Rejects malformed JSON, invalid progress bounds, unavailable App Group storage, expired snapshots, and snapshots for a different local day.
- Uses the snapshot’s valid IANA time zone when checking `dayKey`, otherwise the device time zone.
- Adds a fail-closed timeline entry at `expiresAt`, ensuring yesterday’s progress disappears at local midnight even if WidgetKit delays a reload.
- Uses `nextRefreshAt` and `expiresAt` for timeline scheduling without treating either recommendation refresh opportunities or recommendation freshness as progress expiry.
- Shows an honest **Open Wavelength** recovery state when no valid snapshot is available.
- Uses semantic foregrounds, `containerBackground(for: .widget)`, `widgetRenderingMode`, and `widgetAccentable()` to adapt across full-color, accented/tinted, and vibrant contexts.
- Marks progress as privacy-sensitive and remains read-only; tapping the widget uses WidgetKit’s default app-launch behavior.

## Implemented `systemMedium` widget

The medium widget renders the current app-authored Next Wave presentation model. The extension does not repeat scheduling, weather, habit-selection, or recommendation logic. Because iOS already labels the widget **Wavelength**, the medium surface omits a redundant internal header and vertically centers its recommendation. The main block mirrors the in-app card with a 44-point rounded-square accent tile for the habit emoji on the left and a right-hand stack: uppercase eyebrow, stable habit title plus an optional `·` target, detail, and final 40-point-high action affordance.

- The schema-v1 `nextWave` object is required and is decoded only into its allowlisted state, eyebrow, habit ID, habit emoji, title, target label, detail, action label, and `freshUntil` fields. A missing or malformed object invalidates the whole snapshot.
- `freshUntil` may equal or outlive `nextRefreshAt`, but it must not exceed `expiresAt`. A recommendation is current only while `freshUntil` is later than the timeline date.
- Recommendation staleness does not invalidate valid same-day progress. At `freshUntil`, the medium timeline fails closed to an **Open Wavelength** recovery state while retaining progress for the small family; the whole snapshot still fails closed at `expiresAt`.
- Reload policy considers `nextRefreshAt`, `freshUntil`, and `expiresAt`, so the app’s earliest known boundary remains authoritative even when iOS delays a reload.
- Placeholder and gallery snapshots provide representative content for both implemented families without introducing a second decision engine.
- Quiet Moment uses the same tile-and-content renderer as every other app-authored Next Wave state, with the shared title **Nothing stands out right now.** Long copy is bounded with line limits and scaling. The eyebrow and title rows use the in-app card’s five-point separation, while the action keeps the app card’s 12-point top gap and 40-point minimum height. Primary and secondary semantic styles, widget accenting, and container backgrounds adapt to full-color, accented/tinted, and vibrant rendering modes.
- Recommendation content is privacy-sensitive. The final action is a visual launch affordance rather than a completion control; the widget remains read-only, with no direct completion, App Intent, weather lookup, or independent shared-state mutation.
- When the recommendation is genuinely stale or unavailable, the medium surface mirrors the same rounded-tile visual grammar and says **Open Wavelength** with **Open the app for an updated suggestion.** Merely opening or foregrounding the app recomputes and republishes; no manual refresh gesture is required.

## Supported families and limitations

1. `systemSmall`: today’s completion indicator — implemented in Phase 2.
2. `systemMedium`: current Next Wave recommendation — implemented in Phase 3.
3. `systemLarge`: intentionally not supported. The two compact widgets already provide progress and recommendation entry points, while the full app remains the better place to browse or complete ordered habits.

Both implemented widgets are read-only. Taps open Wavelength; direct completion through App Intents remains deferred until shared-state reconciliation is proven reliable. The extension depends on the containing app to publish fresh snapshots, and WidgetKit controls the exact reload time, so stale guidance always falls back rather than being recomputed in the extension.

## Final appearance verification

The final simulator matrix covers both supported families in light and dark system appearances:

- Ordinary Home Screen rendering was exercised with the system’s full-color appearance.
- The simulator’s real Home Screen customization was switched to its tinted appearance, exercising WidgetKit’s accented rendering mode and the production `.widgetAccentable()` grouping.
- The explicit `.vibrant` source branch was compiled and rendered through a QA-only forced-mode build in both color schemes. This verifies Wavelength’s semantic colors, clear background branch, hierarchy, and geometry; the actual desaturation and material effect remain system-controlled in the Lock Screen and low-light StandBy contexts where iOS selects vibrant rendering.

The QA-only snapshot, family, Home Screen customization, appearance, and forced rendering-mode changes are never committed. Verification restores the production snapshot, the original `systemSmall` Home Screen placement, the original customization archive, dark appearance, and the exact production widget source and artifact.

## Accessibility refinement verification

The follow-up simulator matrix covers `systemSmall` progress, medium Quiet Moment, and medium recovery in light and dark under two text profiles:

- Default Dynamic Type (`large`) with Bold Text off.
- Bold Text on with `extra-large` Dynamic Type.

All 12 captures passed independent visual review. The shorter Quiet Moment title remained fully visible. Recovery retained the 44-point tile and right-hand content stack. The small widget’s Dynamic-Type-aware `caption2` header and caption plus `title3` fraction remained legible without clipping, overlap, or contact with the unchanged progress ring. The accessibility variants are naturally denser, but they preserve the intended hierarchy.

## Physical-device acceptance

The signed production build was installed in place on the physical iPhone without uninstalling the existing app. An immediate pre/post-install comparison proved that installation preserved the WebKit LocalStorage contents. After launch, all non-telemetry values remained identical; the only semantic change was expected prospective Next Wave recommendation evidence recorded by the running app.

Both supported families were then added to the physical Home Screen and accepted in the production full-color appearance. The small widget rendered its centered **TODAY’S HABITS** hierarchy, completion fraction, **COMPLETED** caption, and progress ring. The medium widget rendered its rounded-square habit tile, eyebrow, title and target, detail, and **View habit** affordance. Both retained the external **Wavelength** system label, showed current content without clipping, truncation, or overlap, and opened Wavelength when tapped.

During the first refresh, the medium widget briefly displayed its honest open-app recovery state before the containing app republished a current snapshot; it then returned to the full recommendation and remained current during acceptance. This is the intended fail-closed behavior rather than stale-guidance rendering.
