# Wavelength Mobile — iPhone deployment target

This folder is the iPhone-first, installable version of Wavelength. Shared behavior fixes are mirrored to the desktop HTML file at `../friday_app_2026-07-12.html`.

## What is ready

- Mobile-first layout with iPhone safe-area support
- 44px-class touch targets, visible reorder controls, and pointer-based handle dragging
- Web App Manifest and Apple Home Screen icon
- Standalone/full-screen presentation when installed
- Offline app shell via service worker
- Backup/share and import controls under **Manage Habits**
- Per-habit Monday–Sunday schedules under **Manage Habits**, with all seven days selected by default
- Three per-habit measurement types: **Check once**, **Count**, and **Amount** with a configurable goal, increment, and unit
- Existing localStorage history and habit editing preserved; saved schedules, measurement settings, and daily progress are included in backups and strictly validated on import
- Pending-day-aware streaks: an unfinished today does not erase a qualifying streak through yesterday
- Three appearance modes: **System**, **Day**, and **Night**, shared across iPhone, Android, and desktop
- Time-consistent greeting icons and a roomier mobile streak card with the decorative left icon suppressed at widths up to 600px

## Appearance behavior

Open **Manage Habits → Appearance** and choose:

- **System** — follows the device's light/dark setting and updates live when it changes
- **Day** — always uses Wavelength's high-contrast coastal light palette
- **Night** — always uses the original dark palette

Existing installations without a saved appearance preference start in Night to avoid an unexpected visual change. New installations start in System. The choice is stored under `wavelength_theme` and does not alter habit history or backup data.

Day mode keeps the completed-card background subtle, uses a brighter Night-family blue for completed checkboxes and the large streak count, and uses separate vivid/dark success greens for chart graphics and chart text. The split preserves cross-theme color identity while meeting the 3:1 non-text/large-text and 4.5:1 regular-text contrast floors.

Android Chrome uses the active palette for browser/PWA chrome through the dynamic `theme-color` metadata. The manifest remains standalone-installable, all three appearance buttons meet the 44px mobile touch-target minimum, and the System mode uses the standard `prefers-color-scheme` media query on Android, iOS, Windows, and other modern platforms.

## Habit measurement types

Open **Manage Habits → Track as** for any habit:

- **Check once** preserves the original tap-to-complete behavior.
- **Count** tracks whole-number repetitions toward a goal, such as 3 glasses or 2 sessions. Use the `−` and `+1` controls on the habit card.
- **Amount** tracks a quantity toward a goal using a chosen increment and unit, such as 64 oz in 12 oz increments or 30 min in 10 min increments. Goals, increments, and recorded amounts support up to two decimal places.

Count and Amount habits count as one completed habit only after their goal is reached. Their individual increments do not inflate Today's Habits, streaks, weekly percentages, or category totals. When an amount increment crosses the goal, Wavelength records the full amount, so 60 oz followed by `+12 oz` becomes 72 / 64 oz. The add control then stops; subtracting removes one full configured increment.

Changing a goal recalculates today's completion from the amount already recorded without rewriting that amount or earlier completion history. Existing completed checkmarks remain completed if a habit is first converted to Count or Amount. Changing a habit's measurement type removes that habit's incompatible numeric progress across all dates, while prior completion snapshots remain intact for streaks and weekly totals. **Reset today** clears both checkmarks and measured progress for the current date.

## Card layout and Reorder mode

Every habit card uses the same fixed height (104px on a 390px iPhone viewport), regardless of measurement type. Measured progress appears as a compact chip inline with the habit note, plus a 3px progress bar along the card's bottom edge — not a full-width meter that grows the card. The `−` and `+` controls sit in a vertical 40px rail on the right.

The `weight` field (w1/w2) remains editable in Manage for stored-data compatibility, but no longer appears on the daily card — it never entered a computation (daily count, streaks, ring).

**Reorder mode** is separate from tracking. Tap **↕ Reorder** to swap the `−/+` steppers for up/down arrows and a right-side drag grip; the hint line appears only in this mode. Tap **✓ Done** (or press Escape) to return to tracking. Card completion is suppressed while reordering.

## Rhythm anchors

A habit can be anchored to an environmental condition so Wavelength can surface context-aware guidance on the card. Manage offers three optional anchor families: solar timing, feels-like temperature, and environmental quality. Together they provide six concrete choices plus **No anchor**:

| Type | Meaning |
|------|---------|
| `none` | No anchor; explicitly choosing it overrides a shipped default |
| `sunrise` | Within 1 hour of sunrise |
| `sunset` | Within 1 hour of sunset |
| `temp-above` | Feels-like temperature exceeds a threshold |
| `temp-below` | Feels-like temperature is below a threshold |
| `uv-above` | UV index reaches or exceeds a threshold |
| `aqi-below` | US AQI is at or below a threshold |

When live environmental data loads from Open-Meteo, `updateRhythmAnchors()` updates a small accent-colored label on each anchored card. The forecast endpoint supplies feels-like temperature, sunrise, sunset, and UV index; Open-Meteo's air-quality endpoint supplies US AQI. Live labels use a compact `reading · meaning/action` pattern, while no-data fallbacks retain the configured threshold. AQI labels name the standard US AQI category instead of narrating a numeric comparison. An optional custom action is limited to 60 characters and rejects dense comparison punctuation or phrasing; invalid local legacy notes are dropped without removing their anchor, while strict backup imports reject them. Exact former shipped notes migrate to the current concise defaults. Manage does not persist rhythm overrides that are identical to shipped defaults.

Rhythm anchors do not change streaks, daily targets, or completion logic. They are advisory labels that help you choose the right form of the same intention.

### Card copy

Habit titles, descriptions, and rhythm labels stay on one line in daily cards and use an ellipsis when the available width is exhausted, including beside Count or Amount steppers. Manage limits new title edits to 48 characters and new description edits to 80 characters. Wider legacy custom values remain import-compatible and display safely with ellipsis rather than being silently destroyed.

### Reviewed default habits

Default habit names and notes are location-agnostic. If location is available, Wavelength uses the user's actual local conditions for four defaults:

| Habit | Default anchor | Purpose |
|-------|----------------|---------|
| Get outdoor light after waking | Sunrise | Connect the morning cue to local daylight |
| Drink 16 oz water | Feels-like above 85°F | Surface a concise extra-water cue during heat |
| Outdoor walk or movement | US AQI at or below 100 | Identify a more favorable outdoor-air window |
| Sun protection before outdoor time | UV index at or above 3 | Surface protection when UV reaches the configured cue |

The other 18 defaults intentionally have no anchor because their natural cue is a schedule, meal, prescription, supplement routine, or personal routine rather than an environmental condition. The daylight and supplements habits start on August 28, 2026, so they do not lower completion percentages for earlier dates. Existing saved order is preserved with new habits appended. Current 22-habit backups import unchanged, 21-habit backups append `supplements`, and older 20-habit backups append `daylight` then `supplements`; any other missing, unknown, or duplicate IDs remain invalid. If location permission is denied or unavailable, Wavelength stays location-neutral; it does not substitute West Palm Beach or any other city. Every habit remains usable, and environmental labels stay advisory. Choosing **No anchor** on any of the four anchored defaults is saved as an explicit opt-out and survives reloads, backups, and imports.

## Streak behavior

Only habits scheduled for a date appear in **Today's Habits** or count toward that date's totals. The displayed count, progress ring, weekly percentages, and category totals all use the scheduled set as their denominator. Changing a habit's selected weekdays recalculates those views immediately; an unscheduled completion remains stored but does not inflate the visible totals.

A scheduled day qualifies after `min(5, habits scheduled that day)` habits are completed. This keeps the target attainable on lighter days. While today is below its target, the displayed current streak is counted through the previous scheduled day. A date with no scheduled habits is a rest day: it neither extends nor breaks the streak. A missed scheduled day still breaks the current chain.

Current and longest streaks are recalculated from stored completion history under the current weekday schedule. Sparse schedules scan to the earliest stored completion rather than using a fixed calendar-day cap.

Run the regression coverage for both mobile and desktop builds with:

```bash
node tests/streak-regression.mjs
node tests/theme-regression.mjs
node tests/greeting-responsive-regression.mjs
node tests/schedule-regression.mjs
node tests/measurement-regression.mjs
node tests/default-habits-regression.mjs
```

All cross-build suites use the tracked desktop fixture at `tests/fixtures/friday_app_2026-07-12.html`, so they run from a clean repository checkout. When shared behavior changes, update both the external standalone desktop file and this byte-identical fixture.

Custom habit overrides are limited to text, note, weight, valid nonempty weekday arrays, valid measurement settings, and valid rhythm settings. Rhythm overrides require a supported anchor type; threshold-based anchors require finite positive numbers, optional rhythm notes are limited to 60 characters and one concise clause, and `rhythm: null` records an explicit opt-out from a shipped default anchor. Imported structural fields, invalid measurement or rhythm combinations, and malformed progress are rejected. Invalid legacy schedules safely fall back to every day, legacy habits without measurement settings remain Check once, and displayed custom text is escaped before insertion into HTML.

## Requirement for iPhone installation

The folder must be published at an **HTTPS URL**. Opening a Windows `file://` path or OneDrive filesystem path on an iPhone cannot provide a proper installable/offline web app.

## Once published

1. Open the HTTPS URL in Safari on the iPhone.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Launch Wavelength from its Home Screen icon.

## Moving data between Wavelength Mobile installations

1. In Wavelength Mobile, open **Manage Habits**.
2. Select **Backup / Share** to create a JSON backup.
3. Send the JSON file to the other device (AirDrop, Files, email to self, etc.).
4. On the destination app, open **Manage Habits → Import backup** and choose that JSON file.

### Existing Windows `file://` data

The original desktop file stores data inside that browser/file origin. A new HTTPS iPhone installation cannot read it automatically. If preserving the existing desktop history matters, add a one-time export control to the original desktop build or re-enter the current habit customizations on the iPhone. Do not assume the old data has migrated until an imported backup has been verified.

## Publish options

Preferred: GitHub Pages from this folder or another static HTTPS host such as Cloudflare Pages/Netlify. No server-side code is required.
