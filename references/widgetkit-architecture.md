# WidgetKit architecture

## Status

Phase 1 establishes the shared-data boundary. It does not add a visible widget extension yet.

The Capacitor app remains the source of truth for habit state and Next Wave decisions. Whenever Home renders an authoritative Next Wave result, the native app publishes one compact snapshot to the shared App Group. Future WidgetKit views decode that snapshot and render it in SwiftUI; they do not inspect the WebView DOM or read WebKit LocalStorage.

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

## Planned widget families

1. `systemSmall`: today's completion indicator.
2. `systemMedium`: current Next Wave recommendation.
3. `systemLarge`: Next Wave plus several ordered habits.

The first widget release is read-only. Taps open Wavelength; direct completion through App Intents remains deferred until shared-state reconciliation is proven reliable.
