# WidgetKit architecture

## Status

Phase 1 established the shared-data boundary. Phase 2 adds the first visible surface: a read-only `systemSmall` progress widget. The medium and large families remain future phases.

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
- `nextRefreshAt`: the earliest known decision boundary, including active 15-minute completion cues and 60-minute progress-pause cues, capped at `expiresAt`. Persisting cue deadlines makes the widget fail closed even when iOS suspends the containing app before its JavaScript expiry timer runs.
- `progress`: completed and total scheduled-habit counts.
- `nextWave`: allowlisted presentation fields only: state, eyebrow, habit ID, title, target label, detail, and `freshUntil`.
- `habits`: today's scheduled habits in canonical user order, stable-partitioned with incomplete rows before completed rows. Each row contains only identity, presentation, completion, and optional measured-progress fields.

Raw LocalStorage, history, location, weather payloads, category definitions, user profile data, and recommendation evidence are never copied into the shared snapshot. Environmental copy expires at the earliest applicable recommendation boundary, source-freshness boundary, or local midnight.

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

- Supports only `.systemSmall`; medium and large are intentionally not exposed yet.
- Reads at most 64 KiB from the shared snapshot file and accepts schema version 1 only.
- Rejects malformed JSON, invalid progress bounds, unavailable App Group storage, expired snapshots, and snapshots for a different local day.
- Uses the snapshot’s valid IANA time zone when checking `dayKey`, otherwise the device time zone.
- Adds a fail-closed timeline entry at `expiresAt`, ensuring yesterday’s progress disappears at local midnight even if WidgetKit delays a reload.
- Uses `nextRefreshAt` and `expiresAt` for timeline scheduling without treating recommendation freshness as progress expiry.
- Shows an honest **Open Wavelength** recovery state when no valid snapshot is available.
- Uses semantic foregrounds, `containerBackground(for: .widget)`, `widgetRenderingMode`, and `widgetAccentable()` to adapt across full-color, accented/tinted, and vibrant contexts.
- Marks progress as privacy-sensitive and remains read-only; tapping the widget uses WidgetKit’s default app-launch behavior.

## Planned widget families

1. `systemSmall`: today’s completion indicator — implemented in Phase 2.
2. `systemMedium`: current Next Wave recommendation — planned.
3. `systemLarge`: Next Wave plus several ordered habits — planned.

The first widget release is read-only. Taps open Wavelength; direct completion through App Intents remains deferred until shared-state reconciliation is proven reliable.
