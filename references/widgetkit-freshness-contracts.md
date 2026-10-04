# WidgetKit freshness contracts

## Authority boundary

Wavelength’s JavaScript engine is the sole recommendation authority. WidgetKit validates and renders the latest App Group snapshot; it does not run habit eligibility, scheduling, weather, or recommendation logic.

Opening or foregrounding Wavelength recomputes and republishes the recommendation. The extension cannot invent a newer suggestion while the containing app has not run.

## Soft refresh and hard expiry

The schema-v1 snapshot separates two timing concepts:

- `nextRefreshAt` is a soft opportunity for WidgetKit to request newer data. Crossing it does not invalidate otherwise trustworthy guidance.
- `nextWave.freshUntil` is the hard semantic deadline. Once reached, the medium widget fails closed to recovery while valid same-day progress can continue powering `systemSmall`.

Swift requires `freshUntil >= nextRefreshAt` and `freshUntil <= expiresAt`. Timeline policy considers all three dates, but recovery begins only at `freshUntil` or when the snapshot is otherwise invalid.

## JavaScript-authored semantic deadlines

Recommendation results may carry non-enumerable `recommendationBoundaryAt` and `recommendationSourceFreshUntil` metadata while JavaScript authors the snapshot. These internal fields never enter the schema-v1 allowlist. JavaScript derives `freshUntil` from the earliest applicable hard bound:

- Forecast-dependent guidance: the validated 90-minute forecast-copy limit.
- Completion cue: 15 minutes after the source completion.
- Progress-pause cue: 60 minutes after the last interaction. An active cooldown caps the published guidance even when it temporarily rotates selection to a different habit.
- Urgent or closing guidance: the actual meaningful closing boundary.
- Ordinary guidance: the earliest relevant recommendation-phase transition across all open habits, not only the habit currently displayed.
- Quiet Moment: the earliest point when an open habit becomes eligible or timely.
- All states: local midnight is the absolute cap.

Observed environmental conditions retain their existing source-specific hard limits. When daylight or AQI affects eligibility or selection, the result carries the corresponding observed-source deadline even if the displayed recommendation uses generic or Quiet Moment copy. When several hard bounds apply, the earliest trustworthy deadline wins.

## Recovery behavior

Recovery is reserved for a missing, malformed, unsupported, wrong-day, expired, or semantically stale recommendation. The medium card uses the same rounded-tile visual grammar as normal Next Wave states:

- Headline: **Open Wavelength**
- Detail: **Open the app for an updated suggestion.**

The copy avoids implying that a manual refresh gesture is necessary.

## Deferred enhancement

A versioned, app-authored timeline of future recommendations could reduce recovery further when the app has not run. It is intentionally deferred because it would require future-entry invalidation, completion reconciliation, weather handling, and a broader schema contract.
