# Category personalization design contract

This document defines the shipped mobile-first Categories, Manage Category, and Category Editor behavior. `index.html` is canonical; `../friday_app_2026-07-12.html` is its byte-identical compatibility mirror.

The custom-habit lifecycle extension is implemented and browser-verified locally; native synchronization and release/device verification for that extension remain Phase 14. See the [habit lifecycle design contract](habit-lifecycle-design.md) for exact creation, archive/restore, historical eligibility, and backup v9 behavior.

## Management shell

- When a management route is open, `html[data-management-open="true"] body` has no inherited top padding. The sticky management header owns safe-area spacing with `env(safe-area-inset-top)` and starts at the top of the viewport.
- Management headings are centered at 17px (`1.0625rem`), weight 600, line-height 1.2. The left and right 44px header tracks keep the title centered.
- Categories, Manage Category, and Category Editor use an icon-only SVG Back control with `aria-label="Back"`. Category Editor balances it with an empty 44px right slot.
- Category and Manage Category rows fill the same content column as Home habit cards. Their identity text is 16px/500; Manage descriptions remain a separate 14px row.
- **+ Add a Category** fills the content column, is at least 50px high, uses 16px/600 text, and has explicit pressed, focus-visible, and hover-capable-device states.

## Reordering

- Category and category-scoped habit rows use a visible 2×3 six-dot marker that is 9px wide while retaining a 44px interaction target.
- Keyboard users reorder with Arrow Up and Arrow Down. A persistence callback may rerender the list, so focus returns to the replacement grip found by the row's stable category or habit ID.
- Touch requires a deliberate 250ms hold. Before that threshold, movement cancels without reordering.
- Arming creates a fresh full-card `.category-drag-proxy`, fixed to the source card's original left position and width. It tracks only the pointer's vertical delta with `translate3d`; horizontal finger drift cannot move it.
- The source row remains in the list as a same-height `.category-drag-placeholder`. Before each prospective move, row rectangles are captured; after insertion, neighboring rows animate from their old positions with a FLIP-style transform and `requestAnimationFrame`.
- On every armed release, including within the original slot, the proxy settles to the current placeholder before cleanup; persistence runs only when the row actually changed position. Pointer cancellation restores the original order and removes all proxy, placeholder, inline transform, capture, and body interaction state.
- `prefers-reduced-motion: reduce` removes proxy and row transitions, commits a changed order immediately, and leaves the same reorder and cleanup behavior intact.
- Scoped Manage renders **Add a new habit** and **Add an archived habit** after its active rows, outside `.manage-habit-row` and the reorder collection. They have no grip, do not change canonical order, and never enter the drag proxy. During an armed Manage drag, the action host becomes `visibility:hidden` without collapsing the geometry.
- The complete canonical habit order retains active and archived identities. Category-scoped reordering changes the visible active category slots while preserving archived and out-of-category slots. Restoration reuses an identity's retained slot rather than appending it as a new habit.

## Active and retained category references

- `ALL_HABITS` contains every retained shipped/custom identity, including archived habits. `HABITS` is the current local-date active subset; a selected weekday controls today's tracking but does not make an active habit removable from category validation.
- Shipped **Archive category** is reversible and blocked only by active assigned habits. Its helper reads `Move N active habits first` (singular **habit** for one). Archived habits can retain assignments to an archived category without blocking that archival.
- Custom **Delete category** is permanent and blocked by any retained reference, including an archived habit. With active references only, its helper is `Move N active habits first`; with archived references only, `Reassign N archived habits before deleting` (both use singular **habit** for one). Mixed references use `Move N active and reassign M archived habits first`. Deletion must not erase a habit or its history to satisfy the blocker.
- Restoring a habit whose retained category is archived requires choosing an active real category. The category assignment and habit restoration commit atomically; the previous category is not silently restored. If no active category exists, the UI asks the person to create or restore a category before retrying, without mutating the habit.
- Creating from scoped Home or Manage preselects that category. Creating from All requires an explicit active real category. Scoped **Add an archived habit** opens the matching archive list, with **View all archived habits** only when archived identities exist elsewhere.

## Category Editor

- The header contains only Back, the centered **New Category** or **Edit Category** title, and the balancing empty slot. The primary action lives at the end of the content card.
- The action reads **Add Category** when creating and **Save Changes** when editing. It fills the card, is at least 52px high, uses 16px/600 text, and exposes disabled, pressed, and focus-visible states.
- Category name and custom emoji inputs render at 16px (`1rem`) with weight 500 and line-height 1.25 to avoid iOS focus autozoom. The editor opens without automatically focusing a field, so it does not summon the keyboard before the user is oriented.
- **Category icon** contains a curated quick-pick radiogroup and a **Choose another emoji** text field. The helper explicitly tells the user to use the emoji keyboard, and a separate preview shows the accepted icon.
- A web text field cannot force iOS or Android to open the emoji keyboard. Wavelength validates the user's input after they choose the keyboard themselves; native keyboard presentation is not an app guarantee.
- New categories default to the curated star. Existing custom emoji preload. Choosing a curated icon clears custom emoji. Entering one valid emoji clears the visual curated selection and updates the preview.
- Name and emoji listeners update validation live. Empty or invalid names, duplicate names, and invalid custom emoji disable submit. Invalid emoji sets `aria-invalid="true"`.
- Category editor drafts track `categoryEditorDirty`. Toolbar Back, Escape, and browser/native Back ask `Discard unsaved changes?`; declining keeps the editor and draft intact. A successful save clears dirty state and returns through the existing origin-aware management hierarchy.
- User-controlled names and emoji are written with `textContent` or escaped text, never unsafe `innerHTML`.

## Emoji and category schema

- `CATEGORY_SCHEMA_VERSION` is 2. `CATEGORY_STATE_KEY` remains `wavelength_categories_v1` so local data migrates in place.
- `normalizeCategoryState` accepts schema 1 and schema 2 documents and always returns schema 2. IDs, category order, sparse habit assignments, archive state, curated `iconKey`, and all existing category data are preserved.
- A category definition may include `emoji` only when `normalizeCategoryEmoji` accepts exactly one emoji grapheme. Validation uses `Intl.Segmenter` with grapheme granularity and accepts an Extended Pictographic grapheme (including joined sequences), a two-Regional-Indicator flag, or a keycap emoji. Text, empty input, and multiple emoji are rejected.
- `getCategoryIcon(category)` returns a valid custom emoji first, then the category's curated `CATEGORY_ICON_MAP` value, then the curated star fallback.
- Home tabs, active category rows, archived rows, and habit-editor category options all use `getCategoryIcon`. Existing shipped and curated custom categories continue to store only `iconKey`.
- `addCategoryDefinition` and `updateCategoryDefinition` accept an optional final emoji argument after `habits`. Custom emoji persists beside a fallback `iconKey` (star by default); invalid input throws an error containing `one emoji`.

## Backup migration

- Backups use `BACKUP_VERSION = 9`, including `habitCatalog` for custom definitions and date-effective archive/restore status alongside `categoryState`.
- Imports accept versions 1–9. Versions 6 and later must contain `categoryState`; older versions receive deterministic shipped defaults. Versions 1–8 synthesize the legacy lifecycle catalog with no custom definitions and the Medication archive transition on the import date. Version 9 requires its own strictly validated catalog.
- A version-6 backup containing category schema 1 migrates through `normalizeCategoryState` to schema 2. The category storage key does not change.
- Import first builds the complete and date-effective active habit catalogs. Category validation checks retained references against the complete catalog while using the active subset for category-archive blockers. Version-9 order must include every retained identity exactly once, including archived/custom habits.
- Category normalization occurs before the journaled seven-document storage snapshot commit. Invalid category/emoji references, malformed lifecycle data, or future-dated activation/transitions reject the outer import before its authoritative writes. Write failures roll back state, order, First Name, evidence, categories, shipped overrides, and lifecycle catalog together.

## Protected invariants

- **All** remains virtual, protected, unserialized, and unavailable as an assignment destination.
- Category changes never alter habit IDs, completion history, recommendation context, or out-of-category canonical order.
- Archive requires no active assigned habits; deletion requires no retained assigned habits. Archive preserves category identity, metadata, assignment references, and order. Deleting an unreferenced custom category removes only its definition and ordering slot.
- The service-worker cache version, generated native web tree, native project, and signing state are outside this UI/schema change.
