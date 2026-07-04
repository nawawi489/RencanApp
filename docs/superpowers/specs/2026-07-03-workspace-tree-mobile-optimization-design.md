# Workspace Tree Mobile Optimization Design

Date: 2026-07-03
Project: `d:\Projects\RencanApp`
Status: Approved for design, pending spec review
Primary references: `mobile/src/screens/workspace-screen.tsx`, `mobile/src/components/workspace-kind-pill.tsx`, `mobile/src/hooks/use-workspace.ts`

## Goal

Improve the mobile Workspace tree so deeply nested cards remain readable and performant without changing the current one-screen tree navigation model.

The user explicitly chose to keep the existing tree interaction instead of switching to drill-down navigation. This design therefore optimizes the current model rather than replacing it.

Primary outcomes:

- Reduce horizontal overflow on deep nesting
- Give card titles more readable space on mobile
- Compress secondary actions so the UI feels lighter at level 3-5
- Reduce unnecessary rerenders and repeated tree calculations
- Keep Performance and Development panes behaviorally consistent

## Problem Statement

The current Workspace tree is functionally rich but visually and operationally strained on mobile.

Main issues in the current implementation:

- Indentation grows too aggressively across 5 levels, causing deep cards to drift too far right
- Action rows consume too much horizontal space relative to the available mobile width
- Progress orb size is acceptable for root cards, but too heavy for deep nested rows
- Tree rows are defined in a single large screen module with limited memoization boundaries
- Progress rollup queries and derived values are recomputed repeatedly as expansion state changes
- Performance and Development trees use the same general pattern but still duplicate layout pressure and rerender costs

This combination creates two visible product risks:

1. Deep tree nodes become hard to read and can visually break near the right edge
2. Expanding and collapsing large trees becomes more expensive than necessary

## Non-Goals

This design does not try to:

- Replace the tree with drill-down navigation
- Move nested entities into separate screens
- Redesign the Workspace hub entry cards
- Change business rules, permissions, MBR gating, or period-lock behavior
- Rewrite Workspace into a new architecture outside the current route structure
- Virtualize the full recursive tree in this batch

## User Decisions Already Locked

The following decisions were explicitly approved:

- Keep the current nested tree on one screen
- Apply the same optimization direction to both Performance and Development
- Prioritize readability and performance over strict adherence to the previous visual lock
- Accept controlled spec drift where needed for mobile usability

## Approaches Considered

Three approaches were considered:

1. Minimal visual tuning only
2. Focused tree optimization within the current architecture
3. Navigation redesign into hybrid or full drill-down

Recommended: focused tree optimization within the current architecture.

Reasoning:

- It solves the user's current pain directly without changing the mental model
- It reduces layout breakage with relatively small, reviewable code changes
- It keeps risk lower than a navigation redesign
- It creates room for a later virtualization or drill-down phase if data volume grows further

## High-Level Design

The implementation will optimize the current tree in four coordinated layers:

1. Layout compression
2. Action row compaction
3. Progress orb scaling
4. Render and query stabilization

These four layers are intentionally incremental. Each one improves the tree on its own, but together they address the full mobile pain point.

## Layout Compression

The current indent scale in `TREE_LEVEL_INDENT` uses a constant 16px step up to 80px. That is too expensive on a narrow mobile viewport once the tree reaches level 4-5.

The new layout strategy:

- Reduce indent growth so level progression remains visually clear without consuming most of the row width
- Keep the colored left border per entity type as the primary hierarchy cue
- Keep the connector line, but retune its geometry to match the smaller gutter
- Preserve the existing card silhouette and category pill system

Design intent:

- Hierarchy should be understood from border color + connector + slight nesting, not from large horizontal shifts
- The deepest card should still have enough width for a two-line title and a compact action row

Expected impact:

- Deep nodes stop colliding with the right edge as early
- Text truncation is reduced without changing the information architecture
- Visual depth remains understandable on a phone screen

## Action Row Compaction

The current `CardActionRow` spends too much space on expand/collapse text and on wide spacing between secondary actions.

The action row will be compacted with these rules:

- Keep the current behavior model: expand/collapse, more menu, optional add button
- Preserve visible add labels such as `+ KPI Area`, `+ Strategy`, `+ Initiative`, and `+ Plan`
- Make the expand control more compact so it behaves like a lightweight disclosure control rather than a dominant text button
- Reduce horizontal padding and inter-control spacing where it does not harm tap comfort
- Keep tap targets accessible even if the visible control becomes more compact

Design intent:

- The action row should support the card, not dominate it
- Deep rows should give priority to title readability and quick scanning

Expected impact:

- More usable width for title and status area
- Less visual clutter in nested rows
- Better consistency between root rows and deep rows

## Progress Orb Scaling

The current `TreeProgressOrb` uses one visual size for all tree levels. That creates unnecessary density on deeply nested cards.

The new strategy:

- Keep the same orb semantics and color mapping
- Scale the orb down for nested rows where horizontal space is scarce
- Preserve the numeric percentage because it remains a useful at-a-glance cue
- Simplify or tighten visual spacing around the orb label so it does not push the card content outward

Design intent:

- Root cards may remain more prominent
- Deep rows should emphasize title and structure first, metric second

Expected impact:

- Reduced horizontal pressure on level 3-5 rows
- Cleaner balance between content and metric
- Better mobile fit without removing progress visibility

## Render Boundaries

The current tree structure is composed in one large screen file with many inline callbacks and no memo boundary around row components.

The optimization strategy is focused rather than architectural:

- Add memo boundaries to stable tree row components
- Stabilize repeated handlers and reusable style/config objects where that materially reduces rerenders
- Avoid recomputing child progress inputs when the corresponding subtree is collapsed
- Keep lazy child fetching as-is because it already prevents some unnecessary work

Important constraint:

- This batch does not attempt a full tree virtualization rewrite
- The goal is to reduce waste in the existing rendering model first

Expected impact:

- Expanding one branch should cause fewer unrelated row rerenders
- Repeated menu toggles and local state changes should have narrower UI cost
- The tree remains easier to reason about than a larger refactor would allow

## Query and Derived Data Strategy

The current `useCardProgress(ids)` sorts IDs on every call and is used repeatedly across row containers.

The data optimization strategy:

- Keep the current one-query-per-visible-container model
- Stabilize the incoming ID lists as much as practical before calling the hook
- Reduce repeated `sort()` churn for unchanged visible subtrees
- Keep `null` progress behavior intact so missing data still renders as `—`

This is intentionally conservative. It improves the hot path without changing the server contract or RPC behavior.

## Component Scope

Primary files expected to change:

- `mobile/src/components/workspace-kind-pill.tsx`
- `mobile/src/components/ui.tsx`
- `mobile/src/screens/workspace-screen.tsx`
- `mobile/src/hooks/use-workspace.ts`

Possible test updates:

- `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx`
- `mobile/src/components/__tests__/tree-progress-orb.test.tsx`
- New focused tests if memo-safe layout helpers or progress sizing logic are extracted

## Responsibility Boundaries

- `workspace-kind-pill.tsx` remains the source of truth for indentation and category border identity
- `ui.tsx` remains the source of truth for tree orb rendering
- `workspace-screen.tsx` remains the source of truth for tree composition and row actions
- `use-workspace.ts` remains the source of truth for card progress queries

This batch should not introduce a second parallel source of truth for tree spacing or progress behavior.

## Error Handling

Existing behavior remains authoritative:

- Lazy child fetch still shows local skeleton, error, and empty state
- Progress unavailable still renders `—`
- Past-period restrictions, permission gating, and MBR guard behavior remain unchanged

The optimization work must not regress these flows while compacting the UI.

## Performance Expectations

This batch should measurably improve perceived performance, but it does not promise infinite-scale rendering.

Success criteria:

- Expanding a branch does not visibly jank on moderate data
- Deep rows remain readable at mobile width
- Progress and action controls no longer crowd out the title as aggressively
- Performance and Development panes behave similarly under the same nesting pressure

Known limit after this batch:

- The root panes still use `ScrollView` plus nested `.map()` composition
- Extremely large trees may still eventually need flattening or virtualization

That follow-up is explicitly outside this design unless the current batch proves insufficient.

## Testing Strategy

Testing should stay focused on regression-prone behavior rather than snapshot noise.

Recommended coverage:

- Indent helper values and any derived sizing helpers
- Tree orb size behavior if size becomes level-aware
- Existing tree interactions still work after compaction
- Performance and Development pane rendering still expose the expected controls

Manual verification must cover:

- Goal → KPI Area → Strategy → Initiative → Action Plan nesting on narrow width
- Development Area → Problem Statement → Initiative → Action Plan nesting on narrow width
- Expand/collapse readability at levels 3-5
- Add-button visibility and disabled styling under past period and MBR guard states

## Rollout Order

Recommended implementation order:

1. Tighten indent scale and connector geometry
2. Compact `CardActionRow` and leaf-row action treatment
3. Make tree orb size level-aware
4. Add memo boundaries and stabilize hot callbacks
5. Reduce repeated progress-hook churn
6. Update focused tests and run diagnostics

This order keeps the work reviewable and makes it easier to isolate regressions.

## Risks

- Visual drift from the previous Workspace lock is intentional, but should stay confined to Workspace tree surfaces
- Over-compaction could reduce tap clarity if hit targets are not preserved
- Memoization can create stale-prop bugs if dependency boundaries are chosen poorly
- Progress sizing changes must not create inconsistent semantics between levels

## Final Recommendation

Proceed with a focused optimization pass that keeps the current one-screen Workspace tree, compresses layout at deep levels, reduces action-row pressure, scales nested progress visuals, and narrows rerender scope without attempting a full navigation or virtualization rewrite.
