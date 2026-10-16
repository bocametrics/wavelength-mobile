# Habit Editor polish: Stage 1

Historical accepted checkpoint: the exclusions below describe Stage 1 only. Later custom opt-in, timing and authored cues are implemented; see the README and [current recovery/native status](habit-editor-native-acceptance.md). This record does not establish current physical-device or publication acceptance.

## Scope

This stage changes editor presentation, authoring validation, Manage readability, and the approved concise built-in copy. It does not add recommendation opt-in, custom preferred-time/environment authoring, cue activation changes, backup fields, native production edits, or generated Capacitor sync.

- Category is the first full-width field. Emoji quick picks and custom single-grapheme input sit with Habit name. ⭐ remains the editable default; saves persist the chosen emoji in the actual custom-definition catalog.
- A standalone SVG Back button is named `Back`; the centered header has no Save. Full-width Add habit / Save follows the fields and precedes separate Archive/reset actions. Original scoped origins and dirty navigation guards remain.
- Habit name and Card description have label-row live counters, with raw authoring budgets 30 and 32. Both raw and normalized bounds are checked before saving; repeated spaces cannot make an over-budget draft appear valid through normalization. The pure `getHabitEditorValidationErrors` is shared by UI validity, real create/edit draft normalizers, and managed saves.
- Stored custom definitions retain their strict 48/42 acceptance; valid existing fields are grandfathered independently. Unchanged legacy system descriptions retain original spaces and LF/CRLF bytes on unrelated saves and reload. Editing one field does not force a change to the other.
- Over-budget saved editable fields use auto-growing, wrapping textareas and per-field explanations: unchanged copy may stay until that field is edited. Multiline saved descriptions also use textareas; their initial display representation is compared separately from the raw original to preserve CRLF. New and short single-line fields keep their input controls and 30/32 limits. System titles remain locked and can wrap.
- Amount pairs Goal and Unit, followed by Add per tap and a preview of the actual configured plus action. `e.g. 16`, `e.g. ounces`, and `e.g. 2` are placeholders; newly unconfigured Amount fields are blank. Mode changes retain entered values. Units are not corrected or interpreted.
- Inline errors and accessibility descriptions identify the bad field, not every field in an invalid form. A visible blocked-save explanation remains available. New or changed names, units and cue messages reject unsafe/invisible-only content, including zero-width spaces and bidi controls; visible Unicode and joined emoji remain supported. Unchanged valid legacy units/cue messages remain save-compatible. Untouched blank fields are not immediately red; blur, populated invalid values, explicit cue selection, and save attempts reveal relevant errors.
- Custom Habit cue controls stack full width, including thresholds labeled °F, UV index, or AQI. No cue is available. Cue message (optional) has the exact helper “Shown on the habit card when cue conditions are met.” Built-in Habit cue values remain read-only, explained by “Set by Wavelength.” Existing managed overrides, including explicit null, custom thresholds and messages, survive unrelated saves. Underlying rhythm/cue semantics do not change.
- Manage names wrap anywhere, descriptions clamp to two lines, and row heights grow around vertically centered controls. Category-row truncation and Home-card CSS remain unchanged.

### Preservation and transactional saves

Untouched custom cue messages preserve LF, CRLF, tabs and the complete catalog JSON through Save and reload. Multiline cues use auto-growing textareas with separate raw/display snapshots; textarea newline normalization must not rewrite the saved original. Newly authored or changed unsafe messages remain blocked.

System-habit edits stage overrides, category assignments, completion/progress, streak and Insights reconciliation before one journaled four-document commit. Runtime state changes only after that commit succeeds. A storage failure restores all affected storage and runtime values, leaves the dirty editor draft open, and shows an accessible retry message. Synchronous committed-snapshot rendering cannot issue separate late persistence calls; ordinary subsequent renders retain their existing behavior.

## Exact concise-copy audit

Only shipped defaults change; saved personalized or target-derived descriptions are not rewritten. Stable IDs, configurations, categories, active dates, order, history, evidence, and backup rules are retained.

| Habit ID | Field | Old copy | New copy |
|---|---|---|---|
| beach | Description | Walk, roll, hike, swim, or paddle | Walk, roll, hike, swim or paddle |
| cardio | Description | Run, bike, dance, or do intervals | Run, bike, dance or do intervals |
| learn | Description | Practice, recall, or focused research | Practice, recall or research |
| goals | Description | Name the few outcomes that matter most | Name the outcomes that matter |
| breakfast | Description | Choose what works for your morning | Choose what suits your morning |
| medication | Description | Follow your prescribed directions | Follow prescribed directions |
| dinner | Description | Leave time to wind down before bed | Leave time to wind down for bed |
| sunscreen | Description | Shade, clothing, hat, or sunscreen | Shade, clothing, hat, sunscreen |
| sleep | Description | Make room for a full night's sleep | Allow a full night's sleep |
| sunscreen | Title | Sun protection before outdoor time | Use sun protection outdoors |

The exact former sunscreen default title is recognized as canonical legacy copy when loading/importing overrides, rather than mistaken for personalization. Unrecognized personalized system titles remain read-only and preserved. This does not generically rewrite former default notes.

## Scoped native Settings time-field correction

The parent's actual iOS 26.5 WKWebView scratch-app experiment measured 432 rows, without production JavaScript, storage, notifications, or physical-phone changes. At 390px in Day mode with 16px input text and 13:00 selected, `appearance: auto` forced computed `box-sizing: content-box`: the 328px content track produced a 354px input (26px of added padding/borders), extending outside its card. Explicit border-box, fixed grid track, and flex-column variants did not release that native sizing behavior.

The exact scoped correction is:

```css
#nextWaveNotificationTime { -webkit-appearance: none; appearance: none; }
```

In that same native preview, appearance-none computed border-box and yielded a 328×44px input within the 328px track. The 72-case baseline had 72 overflows; the 72-case appearance-none variant had none, covering Day/Night, 320/375/390/414px, 00:00/13:00/23:59, and 16/24/32px text. Retained native geometry evidence: `/home/ai_agent/.hermes/artifacts/wavelength/habit-editor-polish/native-timefield-boxsizing/geometry-results.json`.

The production change is scoped to that ID, not a global appearance reset. It retains `type="time"`, the existing Reminder time label, 44px minimum height, change handlers, and reminder scheduling. It adds no clipping, fixed-width, or negative-gutter workaround.

The isolated iOS 26.5 scratch picker tests passed in Day and Night: real taps opened the native picker, Done without editing preserved 13:00 without change events, and a native hour-wheel edit produced 14:00 with trusted input/change events. The field remained 328×44px and visually contained. The picker exposes Reset and Done, not Cancel; no-change dismissal is not cancellation. Native picker chrome was light in both web themes. These two XCTest cases used a baseline HTML/CSS snapshot with the scoped fix, not the final production package. Final package parity, reminder persistence/scheduling, widget visuals and physical-iPhone acceptance remain pending. Evidence: `/home/ai_agent/.hermes/artifacts/wavelength/habit-editor-polish/native-timefield-picker/REPORT.md`.

## Browser evidence and remaining acceptance gates

`tests/browser/habit-editor-polish-e2e.cjs` uses real Windows Edge at 390×844 in independent disposable profiles. It records the exact served HTML hash, harness hash, named assertions, measured geometry, screenshot hashes/inventory, runtime errors, and pass/failure JSON. It exercises actual input/select/click events and saves to disposable LocalStorage; seeded legacy records never touch user data.

The parent reconciled obsolete selector, counter/layout and retired-default-caption expectations, then locked all 40 source and 19 browser test files. Repair agents changed no tests. The parent subsequently added six real preservation/fault cases and replaced the obsolete separate-save source assertion with four-document atomic-commit/no-late-write assertions, preserving completion/Insights reconciliation coverage.

Final Stage 1 HTML SHA-256: `8757a7edc9efa6f0630a2a8c9fb9a99134e0128a4524905ce349efbe2790a502`. All 40 source suites passed. The complete parent-owned browser matrix passed 38/38 runs across 19 suites, with driver hashes and served-source hashes verified. Focused Day/Night and supplementary evidence passed 212/212 checks; an independent bounded repair probe passed 9/9 cases with zero runtime errors. The final independent repair verdict found no remaining logic or security issues within its scope. All three HTML mirrors matched.

Final browser and source receipts live under `/home/ai_agent/.hermes/artifacts/wavelength/habit-editor-polish/stage1/review-fix2/parent/`; earlier RED and exploratory failures remain retained rather than overwritten. These results do not establish full native, physical-device or release acceptance. Custom Next Wave configuration and uniform cue activation are still separate Stage 2 work.
