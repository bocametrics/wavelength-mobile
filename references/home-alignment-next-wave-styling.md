# Home alignment and Next Wave styling contract

## Scope

This batch changes Home presentation only. It does not change recommendation selection, wording, navigation, Insights cards, persistence, schemas, or native bridges.

## Home alignment

- The app header and divider stay in ordinary document flow; they are not sticky or fixed.
- At widths up to 600px, the category rail remains horizontally scrollable and extends through the safe-area-aware 14px page gutters.
- The rail uses an additional 4px optical inset at both ends:
  - left: `calc(max(14px, env(safe-area-inset-left)) + 4px)`
  - right: `calc(max(14px, env(safe-area-inset-right)) + 4px)`
- Matching `scroll-padding-left` and `scroll-padding-right` preserve that inset when a category pill snaps to `scroll-snap-align: start`.
- The section label, centered-dot separator, and live completed/scheduled count form the left title group: `TODAY'S HABITS · 3/20`. The count has no spaces around `/` and remains visually secondary.
- Manage Habits and Manage Categories remain the right-side action group, preserve their IDs and ARIA labels, use 44px targets, and have a 4px gap.

## Next Wave surface

- Card background: `linear-gradient(135deg, var(--surface), var(--accent-faint))`.
- Card border: `1px solid var(--accent-border)`.
- Icon tile: 44×44px, `13px` radius, and `var(--accent-soft)` fill.

## Verification

`tests/home-final-styling-regression.mjs` protects this source contract in both shared builds. `tests/browser/typography-e2e.cjs` covers the rendered 390px geometry and normal-flow header behavior.
