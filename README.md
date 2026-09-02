# Wavelength Mobile — iPhone deployment target

This folder is the iPhone-first, installable version of Wavelength. Shared behavior fixes are mirrored to the desktop HTML file at `../friday_app_2026-07-12.html`.

## What is ready

- Mobile-first layout with iPhone safe-area support
- 44px-class touch targets, visible reorder controls, and pointer-based handle dragging
- Web App Manifest and Apple Home Screen icon
- Standalone/full-screen presentation when installed
- Offline app shell via service worker
- Fixed **Home / Insights** dock with iPhone safe-area clearance
- Backup/share and import controls under **Manage Habits**
- Per-habit Monday–Sunday schedules under **Manage Habits**, with all seven days selected by default
- Three per-habit measurement types: **Check once**, **Count**, and **Amount** with a configurable goal, increment, and unit
- Existing localStorage history and habit editing preserved; saved schedules, measurement settings, daily progress, and prospective insight evidence are included in version-2 backups and strictly validated on import
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

The `weight` field (w1/w2) is no longer editable in Manage and is not written to new saves or exports. Old version-1 and version-2 backups containing `weight` are accepted on import for backward compatibility, but the field is discarded during normalization. New backups use version 3 to identify the parameter schema.

System-designed habits (the built-in defaults) carry typed parameters that generate their display titles and derive their Next Wave recommendation windows. Parameters include clock times (e.g. bedtime), durations (e.g. meditation minutes), quantities (e.g. water ounces), and counts (e.g. gratitude items). Every system habit title is locked; system anchors remain visible as system-managed summaries rather than editable controls; descriptions, schedules, and tracking remain fully editable. Legacy title overrides like "In bed by 11:30 PM" migrate to structured parameters on load; unrecognized custom titles survive unchanged as read-only legacy labels. Bedtime is intentionally constrained to an evening window so its derived sleep and wind-down windows never cross midnight.

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

Rhythm anchors do not change streaks, daily targets, or completion logic. They remain advisory context for choosing the right form of the same intention.

### Your next wave

The Home view begins with a single **Your next wave** recommendation in the former Streak-card position. It considers only habits that are scheduled today and not yet complete, then combines their state with the current time and available environmental readings. The priority order is: adapt activity when AQI is unfavorable, protect against active UV, use time-sensitive daylight, surface a favorable outdoor window, reinforce hydration in heat, then offer one time-appropriate open habit. When every scheduled habit is complete, the card changes to a calm completion message.

The recommendation leads with the habit action and keeps the condition secondary, for example **Now is a good time for your outdoor walk** with `Good air quality · AQI 43` beneath it. **View habit** selects the relevant category, scrolls to that habit, and briefly highlights it without changing completion. Completing or updating a habit immediately advances the recommendation. If location is denied or data is unavailable, the card still chooses a helpful habit-based fallback rather than showing a technical weather error.

AQI health guidance always follows the fixed US AQI bands: a custom movement threshold may be stricter than 100, but it can never loosen the outdoor-opportunity safety ceiling above 100. An explicit `rhythm: null` suppresses environmental opportunity copy for that habit, including sunrise-specific daylight advice. Wavelength schedules a refresh just after local midnight and also checks the date on `visibilitychange` and `pageshow`, so an installed app resumed after sleeping does not retain yesterday’s habits or recommendation.

The checked-in 390px Edge flow is `tests/browser/next-wave-e2e.cjs`. On the WSL/Windows test host, copy it to `C:\Temp\wavelength-next-wave-e2e.cjs`, serve the repository on port 8773, then run `cmd.exe /c "cd /d C:\Temp && node wavelength-next-wave-e2e.cjs"`. Set `WAVELENGTH_ORIGIN` and `WAVELENGTH_URL` to rerun the same assertions against the deployed Pages build.

## Home and Insights

The fixed bottom dock separates action from reflection:

- **Home** contains the greeting, Your next wave, category controls, today's habits, and Reset today.
- **Insights** begins with Streak/Today completion, followed by This week and a rolling Last 30 days trend. Evidence-qualified adaptive cards appear beneath those progress summaries.

The dock buttons explicitly expose `aria-current="page"`, meet the 44px touch-target floor, and reserve enough bottom and safe-area space that the last card remains scrollable above the dock.

In normal tracking mode, every category keeps incomplete habits first and moves completed habits beneath a quiet **Completed · N** heading. Both groups preserve their relative positions from the saved canonical order; completion is a view-only partition and never rewrites `wavelength_wpb_order`. **Reorder** temporarily removes the partition and heading, showing every card in canonical order with completed styling intact. This makes Reorder an honest preview of the next fresh day. Unmarking a check-once habit or reducing a measured habit below its target returns it to the active group immediately.

**Your next wave** treats categories as navigation rather than timing rules. Shipped habits now carry independent recommendation context: useful start/end windows, ideal timing, genuine urgency where a real opportunity closes, indoor/outdoor setting, expected duration, and whether daylight is required. The selector first asks whether an open habit makes sense now, then whether its opportunity is opening or closing, and finally whether a bounded adaptive version can preserve the goal. Good AQI can strengthen an eligible outdoor opportunity but cannot override darkness, insufficient remaining daylight, or a more urgent practical window. A 20-minute outdoor habit enters a calm daylight-closing phase during its final 15-minute margin and becomes ineligible once its full duration no longer fits before sunset; both transitions schedule automatic rerenders. If nothing honestly fits, the card says so instead of forcing a recommendation. The card also rerenders at static timing and solar boundaries, while visibility/pageshow recovery still handles iOS background throttling. Outdoor movement has the first explicit goal-preserving alternative: before 9 PM, darkness or too little remaining daylight can shift it to ten minutes of gentle indoor movement; after the movement window itself has passed, it is not recommended. Literal targets close when they pass, so **In bed by 10 PM** is not suggested after 10 PM.

Completion-response toasts reserve the dock plus iPhone safe-area footprint. Their settled rectangle is browser-tested to remain at least 8px above the fixed Home/Insights dock in both themes, so encouragement such as milestone and completion messages is never painted underneath navigation.

**This week** keeps its seven-day calendar strip, but its percentage counts only elapsed eligible days through today. Future days remain visible without lowering the result before they happen. **Last 30 days** plots each elapsed day’s scheduled-habit completion rate on a 0–100% line chart and shows a weighted average plus the exact number of tracked days. A faint dashed line marks that weighted rolling average behind the solid daily series, making recent above/below-baseline days visible without adding another score or duplicate plot label. The stored app-creation timestamp anchors the beginning of tracking, so a real zero-completion first day remains visible while earlier dates are gaps rather than invented zeroes. The header pairs the week number with the year instead of repeating the month already shown in the full date.

### Prospective evidence and adaptive cards

Wavelength does not reconstruct past conditions. After the forecast and AQI requests have both settled, it records the final context-aware recommendation shown that day under `wavelength_insights_v1`. Each bounded record contains the habit and reason, exact readings used, the source channel actually present, observation/first-shown/last-shown timestamps, and optional View habit and completion timestamps. It never stores coordinates or a city in this evidence ledger. Completion evidence is reversible when a habit is unmarked, removed when Reset today or a goal edit invalidates it, and retained for at most 400 dates.

Condition cards remain hidden until there are at least 10 distinct relevant days. Eligible cards rotate one at a time and always disclose the exact numerator and denominator, for example **8 of 10 high-UV days met with protection** plus **Observed in your history · Based on 10 recorded high-UV days**. Current card families are Sun-wise, Heatwise, Morning light, and literal poor-air movement completion. None claims that movement occurred indoors or that a checkbox produced a medical outcome.

**A flexible win** may appear sooner when one of the last 30 days contains at least two distinct verified context-aware completions. It names the actions that stayed on track without assigning a hidden composite score. Rescue-swap or “waves ridden” claims are intentionally deferred until Wavelength can record explicit approved alternatives rather than infer substitutions from coincidental completions.

Mobile backups now use version 3 and carry both the normalized insight ledger and structured system-habit parameters. Version-1 backups remain importable and begin with no reconstructed historical evidence; version-2 backups retain their validated insight ledger. Version-2 and version-3 evidence is validated against imported habit completion history before any storage write.

The complete dock/evidence browser flow is `tests/browser/navigation-insights-e2e.cjs`. It verifies 390px layout, safe-area clearance, exact-source/no-coordinate storage, View habit, reversible completion, gated reports, atomic invalid-v2 rejection, and v1 compatibility.

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
node tests/last-30-days-regression.mjs
node tests/schedule-regression.mjs
node tests/measurement-regression.mjs
node tests/default-habits-regression.mjs
node tests/navigation-insights-regression.mjs
node tests/next-wave-regression.mjs
```

All cross-build suites use the tracked desktop fixture at `tests/fixtures/friday_app_2026-07-12.html`, so they run from a clean repository checkout. When shared behavior changes, update both the external standalone desktop file and this byte-identical fixture.

Custom habit overrides are limited to text, note, typed system parameters, valid nonempty weekday arrays, valid measurement settings, and valid rhythm settings. Legacy `weight` values are accepted only for backward-compatible import and are discarded during normalization. Rhythm overrides require a supported anchor type; threshold-based anchors require finite positive numbers, optional rhythm notes are limited to 60 characters and one concise clause, and `rhythm: null` records an explicit opt-out from a shipped default anchor. Imported structural fields, invalid parameter, measurement, or rhythm combinations, and malformed progress are rejected. Invalid legacy schedules safely fall back to every day, legacy habits without measurement settings remain Check once, and displayed custom text is escaped before insertion into HTML.

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
