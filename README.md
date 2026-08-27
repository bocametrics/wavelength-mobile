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
- Existing localStorage history and habit editing preserved; saved schedules are included in backups and strictly validated on import
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
```

All cross-build suites use the tracked desktop fixture at `tests/fixtures/friday_app_2026-07-12.html`, so they run from a clean repository checkout. When shared behavior changes, update both the external standalone desktop file and this byte-identical fixture.

Custom habit overrides are limited to text, note, weight, and valid nonempty weekday arrays. Imported structural fields are rejected, invalid legacy schedules safely fall back to every day, and displayed custom text is escaped before insertion into HTML.

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
