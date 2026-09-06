# Per-Habit Preference Windows — Implementation Scope

## Goal

Let David set optional recommendation timing preferences per habit in Manage. Next Wave uses these to derive phases (ideal, flexible, late, closing) instead of relying solely on system defaults. Categories remain navigation-only; timing comes from explicit per-habit preferences.

## What already exists

- `getEffectiveRecommendationContext(habit, preferenceWindow)` — validates a 5-boundary override (`eligibleStart`, `idealStart`, `idealEnd`, `lateStart`, `eligibleEnd`) and merges it into the habit's context. Already used by `getNextWaveSuggestion` via `preferenceWindows?.[habit.id]`.
- `getNextWaveSuggestion(..., preferenceWindows = null)` — already accepts a per-habit preference map and passes it through to `getHabitRecommendationFit`.
- `buildRuntimeHabits` — merges stored overrides (params, text, note, days, rhythm, measurement) into runtime habits. The `context` is derived from system params via `deriveSystemHabitContext`.
- `normalizeCustomHabitOverrides` — whitelists known fields per habit ID. Currently allows: `text`, `note`, `weight` (discarded), `params`, `days`, `measurement`, `target`, `step`, `unit`, `rhythm`.
- `saveManageModal` — reads visible rows, builds `changes` per habit, merges with existing overrides.
- `SYSTEM_HABIT_PARAMETER_DEFS` — defines typed parameters (time, duration, quantity, count) for 11 system habits. Each generates a title and derives context.
- `deriveSystemHabitContext` — derives `start`, `idealStart`, `urgencyStart`, `end`, `duration` from system params (bedtime, dinner time, wind-down duration).

## What does NOT exist yet

- No `preferenceWindow` field in overrides or backup payload.
- No way for the user to set preference windows in the Manage UI.
- `renderNextWave` calls `getNextWaveSuggestion` with `preferenceWindows = null` (not wired).
- `scheduleNextWaveContextRefresh` calls `getNextWaveRefreshDelay` without preference windows.
- No backup schema field for preference windows.

## Design decisions

### Which habits get preference windows?

**System habits with timing context** (start/idealStart/end in their shipped context). These are the habits where Next Wave already has timing phases. Non-timing habits (`recommend: false`, like supplements/medication) don't need windows.

Eligible habits (have `context.start` and `context.end`):
- wake, stretch, strength, cardio, meditate, learn, journal, goals
- breakfast, lunch, dinner
- sunscreen, floss, winddown, gratitude, sleep

Not eligible (no timing context or `recommend: false`):
- supplements, medication (explicit `recommend: false`)

### What does the user set?

Two time boundaries the user can adjust:
- **Ideal start** — "I prefer to do this around ___"
- **Ideal end** — "...but it still fits until ___"

The system derives the rest:
- `eligibleStart` = idealStart - 60 min (or the system default start, whichever is earlier)
- `lateStart` = idealEnd (the "flexible" phase ends when the ideal window ends)
- `eligibleEnd` = the system default end (or idealEnd + 60 min, whichever is later)

This keeps it simple: the user names their preferred window, the system extends it with grace periods. If the user clears both fields, the system defaults return.

**Alternative (simpler):** Just "Preferred time" — a single time input. The system derives idealStart ± 30 min. Even simpler, but loses the ability to say "I prefer morning but anytime before noon is fine."

**Recommendation:** Start with the simpler version — one "Preferred time" input per eligible habit. The system sets `idealStart = preferred - 15min`, `idealEnd = preferred + 15min`. This is the minimum viable personalization. Expand to start/end windows later if David wants more control.

### UI placement

In Manage, below the existing parameter controls (time picker, duration dropdown, etc.), add a "Preferred time" field for habits that have timing context but don't already have a time parameter (i.e., habits that aren't `wake`, `dinner`, `sleep` — those already have a time parameter that drives their context).

Habits that already have a time parameter (`wake`, `dinner`, `sleep`) already control their timing via that parameter. So the preference window is for habits like `stretch`, `meditate`, `cardio`, `sunscreen`, `floss`, etc. — habits with fixed system timing that David might want to shift.

### Persistence

- Store as `preferenceWindow` in the habit override: `{ id: 'stretch', preferenceWindow: { idealStart: 420, idealEnd: 480 } }`
- `normalizeCustomHabitOverrides` adds `preferenceWindow` to `allowedFields`.
- `normalizePreferenceWindow(value)` validates: object with optional `idealStart` and `idealEnd` as integers 0–1440, `idealStart < idealEnd` if both present.
- `buildRuntimeHabits` merges `preferenceWindow` into the runtime habit.
- `renderNextWave` reads `preferenceWindow` from runtime habits and passes a map to `getNextWaveSuggestion`.
- Backup payload includes `preferenceWindows` map; import restores it. Schema bump to v5.

### Next Wave integration

- `renderNextWave` builds `preferenceWindows` map from `HABITS` (any habit with `.preferenceWindow`).
- `getHabitRecommendationFit` already accepts `preferenceWindow` and calls `getEffectiveRecommendationContext`.
- `getEffectiveRecommendationContext` already validates the 5-boundary shape. For the MVP (idealStart + idealEnd only), we need a helper that expands the two boundaries into five:
  ```js
  function expandPreferenceWindow(idealStart, idealEnd, systemContext) {
    const eligibleStart = Math.max(0, idealStart - 60);
    const lateStart = idealEnd;
    const eligibleEnd = systemContext?.end || Math.min(1440, idealEnd + 60);
    return { eligibleStart, idealStart, idealEnd, lateStart, eligibleEnd };
  }
  ```
- `scheduleNextWaveContextRefresh` passes `preferenceWindows` to `getNextWaveRefreshDelay`.

## Implementation plan (ordered)

### Phase 1: Data layer
1. `normalizePreferenceWindow(value, strict)` — validate and normalize.
2. Add `preferenceWindow` to `allowedFields` in `normalizeCustomHabitOverrides`.
3. `buildRuntimeHabits` — merge `preferenceWindow` into runtime habit.
4. `expandPreferenceWindow(preferenceWindow, systemContext)` — expand 2 boundaries into 5.
5. Wire `getEffectiveRecommendationContext` to accept the expanded window (or adjust it to accept the 2-boundary shape).

### Phase 2: Next Wave integration
6. `renderNextWave` — build `preferenceWindows` map from `HABITS` and pass to `getNextWaveSuggestion`.
7. `scheduleNextWaveContextRefresh` — pass `preferenceWindows` to `getNextWaveRefreshDelay`.
8. Verify existing Next Wave behavior is unchanged when no preferences are set.

### Phase 3: Manage UI
9. `renderManageModal` — add "Preferred time" input for eligible habits (those with `context.start` but no existing time parameter).
10. `saveManageModal` — read preferred time, convert to `idealStart`/`idealEnd`, store as `preferenceWindow`.
11. Default-equivalence suppression (like params): don't store if it matches the system default.

### Phase 4: Backup & import
12. `createBackupPayload` — include `preferenceWindows` map.
13. `importBackupFile` — restore `preferenceWindows`, validate, merge into overrides.
14. Schema bump to v5. Accept v4 (no preferenceWindows) gracefully.

### Phase 5: Tests & verification
15. Regression: `tests/preference-windows-regression.mjs` — normalization, expansion, default suppression, backup round-trip, strict import validation.
16. E2E: `tests/browser/preference-windows-e2e.cjs` — set a preferred time in Manage, verify Next Wave respects it, verify clearing restores defaults, verify backup round-trip.
17. 390px Day/Night visual verification.

## What this does NOT change

- Categories remain navigation-only.
- Habit titles remain invariant (system titles from params, custom titles from text).
- System habit parameter locking (all 22 defaults locked) is unchanged.
- Existing timing for `wake`, `dinner`, `sleep` (time parameters) is unchanged — those already control their context.
- `recordInsightSuggestion` / insight history / condition cards are unchanged.
- The dock, Settings, First Name, and scoped Manage are unchanged.

## Open questions for David

1. **MVP shape:** One "Preferred time" input (system sets ±15 min ideal window), or two inputs (ideal start + ideal end)?
2. **Which habits:** All habits with timing context, or only non-parameterized ones (excluding wake/dinner/sleep which already have time parameters)?
3. **Grace period:** Is 60 min before / after the ideal window the right default for the "eligible" phase? Or should it be tighter (30 min)?
4. **Backup version:** OK to bump to v5? v4 backups remain importable (preferenceWindows defaults to empty).
