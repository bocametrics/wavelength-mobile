# Shared habit field model: release v51

The implementation integrates shared Duration, Water/Gratitude target retirement, Dinner timing and date-effective tracking. Release source `bfa822b983d7cc851ff08eeb26a0eb7e03e1ebdfb1805e699d2d95af284b5508` supersedes the historical local checkpoint below. It adds one reviewed default-parameter deletion branch, preserving params when no editable controls exist. Wake and In bed ordinary Save now round-trip nondefault times back to defaults without losing null rhythms or opaque windows. All 59 source suites and the fresh 72-run release browser matrix pass, including 21 boundary cases per theme, with 1,404 exact navigation responses, 154 screenshots and 72 removed profiles. The release plan tracks publication and physical-device acceptance separately. No native delivery is implied by these source/browser results.

## Authoring and runtime

- One `.eh-duration-minutes` number control for applicable shipped/custom habits. Check once, Count, and non-time Amount use independent planned minutes, including custom habits opted out of Next Wave.
- Amount units `min`, `mins`, `minute`, `minutes` are recognized after trimming and ASCII case folding for classification. Literal supported units retain their case and internal spacing. Existing measurement authoring still trims outside whitespace; no new measurement kind was introduced.
- Minute Amount Goal is authoritative. Duration is live read-only, including `input` and `change` on Track as, Goal and Unit. A new draft becoming minute Amount explicitly authors Goal mode; its previous independent draft duration is not a competing target.
- Decimal Goals are unchanged. Only internal whole-minute planning budgets use `Math.ceil`. Labels and editor values retain the exact Goal. Valid large Goals retain quantity precision; authored full-fit eligibility rejects intervals too short to fit the entire budget, including elapsed seconds, and schedules its cutoff refresh.
- Wake and In bed expose disabled `Not applicable` Duration; their real clock controls remain editable. In bed retains its internal 30-minute context. Wind down resolves Duration before all bedtime-relative context math. Wake-relative derivation is unchanged.
- Conflicting legacy minute Goal versus legacy duration requires visible `.eh-field-review`, showing both values. `use-goal` or `use-duration` sets the explicit Goal-mode intent. Unresolved Save returns before any storage mutation and brings the review into view. Cancel does not persist a resolution. Pending-review runtime keeps its previous duration/context.
- Legacy six duration parameter editors are removed. Legacy raw `params.durationMinutes` can remain for compatibility but is not authoritative after explicit shared intent.

## Raw storage/API contract

The existing `wavelength_habit_catalog_v1` key is deliberately retained. Its key suffix identifies the storage document lineage, not the current payload schema. There is no parallel catalog or new storage document.

Catalog schema 2 has exactly these allowed root fields:

```json
{"schemaVersion":2,"customDefinitions":[],"status":[],"fieldSettings":[]}
```

Schema 1 converts purely/idempotently to schema 2 with `fieldSettings: []`, without rewriting the existing document on load. An absent document is created once to persist Medication's initial archive date; quota failure leaves the previous usable in-memory fallback. This first-document creation is distinct from legacy conversion. Invalid stored/new-format catalog data pauses normal bootstrap rather than substituting writable defaults. An independently initialized recovery-file download preserves the exact raw storage bytes. That recovery envelope is not an ordinary backup, an automatic restore, or a working Import action on the paused page.

`fieldSettings` is an additive collection keyed by existing system/custom `habitId`, including archived IDs. IDs must be known and unique. The parent-frozen record allows `habitId`, `durationMode`, `plannedDuration`, `durationHistory`, and the strictly validated `targetMode`, `timingMode`, `trackingHistory` metadata described below:

```json
{"habitId":"strength","durationMode":"goal"}
```

Goal mode forbids an own `plannedDuration`. Current Goal/unit remain in their existing authoritative measurement home (system overrides or custom definition).

```json
{"habitId":"strength","durationMode":"planned","plannedDuration":15}
```

Planned mode requires an own `plannedDuration`: finite minutes of at least 0.01 whose rounded-up planning budget is a safe integer, or explicit null meaning no authored budget. Omitted record means legacy inheritance. Own null is not omission. Definitions and system overrides keep their existing strict formats. Completion Goals retain their existing precision and bounds; planning validation does not clamp them.

No arbitrary/unknown metadata is accepted. `targetMode:'standard'` is limited to Water/Gratitude. `timingMode:'preferred'` is allowed for non-clock anchors; `legacy-deadline` is Dinner-only. `trackingHistory` has a strict initial snapshot and ordered date/config changes. A snapshot is either exactly `{type:'unknown'}` or a canonical Check once/Count/Amount configuration with `planningMinutes`. The implementation uses the parent's unchanged normalization/planning API. Lifecycle changes preserve and deep-clone shared settings.

### Timestamped evidence-budget history

Changing a planning budget stages a `durationHistory` on the same record, e.g.:

```json
{"habitId":"beach","durationMode":"planned","plannedDuration":30,"durationHistory":[{"at":0,"minutes":20},{"at":1792500000000,"minutes":30}]}
```

- `minutes` here is a historical **whole-minute evidence/planning budget**, not another current target. It may be null for an unknown/unset budget.
- The first snapshot is the pre-foundation runtime budget at boundary 0. Later boundaries are strictly increasing safe-integer epoch milliseconds. Records/snapshots have strict allowlists; budgets are null or positive safe integers. This is not a date-only tracking epoch.
- Every edit compares the old actual date-effective runtime budget and the newly authored budget. An immediate change records the actual Save timestamp; a deferred tracking change records its local calendar boundary. Repeated edits replace the pending boundary rather than making never-active budgets historical. Defaults reset also records its returning budget.
- Runtime carries cloned history. Forecast proof validation resolves the budget as of `shownAt`, preserving earlier same-day proof while retaining strict interval-length validation for newer proof. The history does not infer historical quantities or units.
- Timestamp-only ordering cannot distinguish events at the same millisecond. A strictly validated optional `collidingMinutes` list admits only the captured budgets at that exact timestamp. It does not admit unrelated budgets or an obsolete budget afterward. The implementation never fabricates a future `lastAt + 1` boundary. No cryptographic provenance is claimed for user-authored backup contents.

## Transactions and backups

- System Save and defaults reset stage and journal five documents together: system overrides, catalog, category state, habit state, insight history. Runtime is published only after commit, and synchronous committed rendering suppresses late persistence.
- New custom Save retains its existing six-document journal; existing custom Save retains its existing five-document journal, including consent/settings preservation. Catalog field settings are inside those snapshots.
- Backup version is **11**. Imports explicitly retain versions **1 through 10** in addition to 11; version 10 was not dropped by replacing the previous constant. Existing strict nested validators apply. Catalog v1 migration happens in the actual import transaction, not as a prior mount/write step.
- Save and Reset stage date-effective tracking metadata instead of destructive measurement-type reconciliation. Save-time local date and activity determine cutover; own zero progress, done keys and completed Insights count as activity. A pending future date is retained when edited again. Past history starts unknown rather than inventing historical units. Recorded completion booleans and quantities remain unchanged.
- Editor authoring uses the latest stored source; Home/Next Wave/widget runtime projects the current date. Import reconciliation and unrelated habit creation also consume date-effective catalogs, not tomorrow's authored Goal. Pending tracking changes preserve today's configuration and its actually effective planning budget before anchor-relative derivation. A prior immediate Duration edit must survive a later deferred Goal edit; timestamped history still preserves earlier forecast budgets.
- During a deferred legacy minute conflict resolution, the captured current-day budget remains authoritative until the cutover. For example, resolving saved Goal 20/planned Duration 15 in favor of 15 after logging activity leaves today's Goal 20 and existing budget 15 intact; tomorrow uses the resolved Goal 15. Do not recompute today's budget from the old minute Goal, or valid prior forecast evidence can be discarded. Ordinary linked minute Goals still use their rounded-up Goal budget internally without rounding the displayed/saved Goal.
- Water/Gratitude retire legacy target authority through explicit review, using only common tracking controls. Dinner can explicitly keep its full legacy context, replace it with the common exact-minute preferred-time codec, or clear it with own null and a preferred-mode tombstone. Only Wake/In bed remain clock anchors.
- Numeric completion with no recorded quantity remains complete with unknown progress: widget progress is null; Home says “Completed · amount not recorded” and disables ambiguous quantity edits. Recorded zero remains known zero. Import reconciliation preserves completed evidence.

## Verification boundaries

The durable result manifests outside the candidate tree contain exact source/test SHA-256, actual Windows Edge navigation response hashes, case results, screenshots and owned-profile cleanup. Earlier failed attempts remain separate. The original feature RED assertions remain intact; boundary coverage expanded when review exposed additional paths. Obsolete current-version/control oracles were reviewed separately, retaining legacy import, raw-data, geometry, cue and atomicity assertions. Extraction harness repairs are test infrastructure, not product RED or behavior changes.

All 59 source suites pass on candidate `5c893bb0a4379ad7c9a1eb6d389453ebf99ec0bfe9f283f8ca9aa502cbac6a27`. Parent boundary checks pass 19/19 per theme, including deferred legacy resolution and exact forecast retention. The fresh 36-suite × 2-theme browser matrix passes 72/72. Its independent collector reconciles all source/test seals, 1,388 actual navigation hashes, 154 screenshot hashes/dimensions, zero unexpected runtime errors, the two intentional recovery bootstrap errors and all 72 removed profiles. Final-source visual recapture covers 48 states, byte-identical to the independently reviewed layouts. Earlier failed/superseded matrices remain separately retained, not converted into passes by targeted retries. Read-only generated `www` fixtures allow the existing shell source checks to run; they are not a new native build or package.

Focused migration, Duration, storage and tracking-edge results remain recorded separately by candidate and theme. Earlier passes do not transfer across source changes. Source-specific independent reviews are supplemented by the final parent-owned budget regression, read-only delta check, normal fractional-Goal projection check and complete final-source matrix/visual recapture. Native/package/widget/device/release acceptance is intentionally outside this local phase. No commit, push, deployment or native build was performed.
