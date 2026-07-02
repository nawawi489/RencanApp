# Prototype Fidelity Mode Design

Date: 2026-07-01
Project: `d:\Projects\RencanApp`
Status: Approved for design, pending spec review
Primary reference: `design.html`

## Goal

Build a fidelity mode inside the mobile app that matches `design.html` as closely as possible across all screens, using prototype-aligned demo data instead of live data.

The user's explicit target is not "close enough" fidelity. The target is visual parity with the prototype:

- Same layout structure
- Same section order
- Same primary copy
- Same visual tokens
- Same demo content and surface states
- Same navigation feel where feasible in Expo Router

## Problem Statement

The current mobile app is directionally aligned with the prototype but diverges in multiple ways:

- `DESIGN.md` intentionally canonizes tokens that differ from the prototype
- Current screens use live domain data, which prevents stable 1:1 rendering
- Some surfaces have richer or different information architecture than the prototype
- Theme behavior currently supports dark mode, while the prototype is light-first

This makes the current app unsuitable for a strict prototype fidelity audit. A dedicated fidelity path is required.

## Non-Goals

This design does not try to:

- Improve product logic unrelated to prototype fidelity
- Refactor domain behavior unless needed to preserve fidelity boundaries
- Replace live mode immediately
- Preserve current token decisions in fidelity mode when they conflict with `design.html`

## User Decisions Already Locked

The following decisions were explicitly approved during brainstorming:

- Scope is all screens, not just the five primary tabs
- Fidelity should use prototype-like demo data, not live data
- Fidelity mode may override the current canonical design decisions in the repo
- When the current app conflicts with the prototype, the prototype wins

## Recommended Approach

Three approaches were considered:

1. Replace the existing UI directly
2. Add fidelity mode inside the app
3. Build a separate prototype subtree

Recommended: add a dedicated fidelity mode inside the app.

Reasoning:

- It is the safest path to achieve 1:1 parity without destroying the existing live implementation
- It allows route-by-route migration and verification
- It isolates prototype data and tokens cleanly
- It creates a reversible path: the fidelity implementation can later become the default UI or remain a demo mode

## High-Level Architecture

The app will gain a prototype fidelity layer controlled by a mode flag.

That mode flag controls four concerns:

1. Tokens
2. Demo fixtures
3. Screen composition
4. Simplified behavior needed to preserve prototype parity

The prototype fidelity layer will use the current routes, but route content will be adapted to render fidelity screens instead of the live implementation whenever fidelity mode is enabled.

## Source of Truth

Visual and interaction truth for fidelity mode:

- `design.html` is the primary visual source of truth
- Existing conformance docs are secondary guidance only
- Current app behavior is not authoritative when it conflicts with `design.html`

The fidelity implementation should prefer literal alignment with the prototype over consistency with the current codebase.

## Proposed Folder Structure

Prototype fidelity code lives under:

```text
mobile/src/prototype/
  tokens/
    theme.ts
    typography.ts
    spacing.ts
  fixtures/
    home.ts
    notifications.ts
    workspace.ts
    inbox.ts
    menu.ts
    ...
  ui/
    shell/
    cards/
    forms/
    overlays/
  screens/
    home.tsx
    notifications.tsx
    workspace.tsx
    inbox.tsx
    menu.tsx
    ...
  adapters/
    home-adapter.tsx
    notifications-adapter.tsx
    ...
  utils/
    fidelity-mode.ts
    prototype-copy.ts
```

### Responsibility Boundaries

- `tokens/` defines exact prototype-aligned values
- `fixtures/` stores demo content per surface
- `ui/` stores reusable prototype-focused building blocks
- `screens/` assembles complete prototype screens
- `adapters/` bridges current routes to fidelity screens
- `utils/` contains flag and copy helpers, not layout logic

## Naming Strategy

Naming should track the prototype's visual language rather than the existing domain-heavy language.

Examples:

- `TodayCard`
- `PriorityRail`
- `SnapshotTeamCard`
- `WorkspaceHubCard`
- `InboxRoomRow`
- `MenuQuickAccessGrid`

Rules:

- Visual components must not query data directly
- Fixtures must not contain UI logic
- Adapters must not redesign layout
- Screen modules should stay close to the structure visible in `design.html`

## Route Strategy

Routes remain the same from the user's perspective.

When fidelity mode is enabled:

- Existing Expo Router routes render fidelity adapters
- Adapters return prototype screens and prototype fixtures
- Live hooks are bypassed unless a screen explicitly needs controlled bridging

This preserves:

- Stable URLs
- Stable navigation tests
- A clean migration path if fidelity mode later becomes the default UI

## Data Strategy

Fidelity mode uses demo fixtures rather than live data.

Reasoning:

- Prototype parity requires deterministic content
- Live data would constantly create visual drift
- Some prototype screens depend on curated content density and text length

Fixture requirements:

- Home must mirror prototype priority counts, hero copy, and focus cards
- Notifications must include "Baru" and "Sebelumnya" content blocks
- Workspace must mirror orb percentages, counts, and CTA layout
- Inbox must mirror room labels, preview text, timestamps, and unread indicators
- Menu must mirror quick-access layout, grouping, and copy
- Detail and form screens must mirror field presence, ordering, helper text, and calls to action

## Token Strategy

Fidelity mode may override current repo canonicals.

That includes:

- Brand hue
- Typography
- Radius and spacing values
- Surface colors
- Shadow treatment
- Copy tokens
- Theme behavior

Fidelity mode must force the prototype visual system even if it conflicts with `DESIGN.md`.

Important constraint:

- This override is scoped to fidelity mode, not the whole app by default

## Theme Strategy

Fidelity mode is light-only unless a specific screen in `design.html` proves otherwise.

Implications:

- Current dark-mode support is ignored in fidelity mode
- Theme adapters must prevent dark styling from bleeding into fidelity screens
- Verification should always happen in light mode

## Migration Order

The implementation should proceed in this sequence:

1. Global shell
2. Five primary tabs
3. Non-form subscreens
4. Detail screens
5. Form screens
6. Modal, sheet, and helper surfaces

Recommended delivery batches:

1. Tokens + shell + Home
2. Notifications + Workspace
3. Inbox + Menu
4. People + ranking + profile
5. Performance and development details
6. New/edit flows, modal flows, sheets, and helper surfaces

## Shell Requirements

The shell must match the prototype before deeper screens are migrated.

Required shell elements:

- Topbar structure
- Search pill treatment
- Avatar treatment
- Bottom navigation layout and active treatment
- Page kicker behavior
- Phone-shell width and spacing rhythm, where feasible in Expo web/native

## Definition of "Match Persis"

A screen is considered matched only if:

- Major layout blocks are identical in structure
- Section order matches the prototype
- Primary copy matches the prototype
- Color, radius, border, spacing, and shadow are visually indistinguishable or platform-equivalent
- Icons, badges, chips, CTA labels, and progress treatment match
- Visible states shown in the prototype are present in the app

Anything visually obvious in a side-by-side comparison counts as a fidelity miss.

There is no "close enough" acceptance threshold for this mode.

## Acceptance Criteria

### Per-screen acceptance

- The route opens the correct prototype-aligned surface
- All major prototype elements are present
- Copy and labels match the prototype
- Demo fixture content matches the intended prototype state
- Fidelity mode remains light-only
- Navigation between screens follows the prototype's expected flow

### Systemic acceptance

- Global shell is consistent across all fidelity screens
- Prototype tokens do not accidentally mix with current live-mode tokens
- No error toasts or unrelated runtime errors are visible during fidelity mode
- Turning fidelity mode off returns control to the current live implementation

## Testing Strategy

Testing should prioritize signal over noise.

Three layers of verification:

1. Visual comparison
2. Structural verification
3. Route smoke testing

### Visual comparison

- Open the app route in fidelity mode
- Open the corresponding state in `design.html`
- Compare side-by-side
- Record gaps in layout, copy, tokens, and behavior

### Structural verification

- Confirm component presence
- Confirm section order
- Confirm CTA presence and label fidelity
- Confirm fixture content alignment

### Regression checks

- Route opens without crash
- Mode switching does not break navigation
- Adapters do not regress live mode when disabled

### Automated tests

Avoid broad snapshot tests at the start.

Prefer focused tests for:

- Fidelity mode gating
- Adapter selection
- Fixture mapping
- Route smoke behavior

The primary evidence of success remains visual comparison, not only unit tests.

## Risks

### Platform rendering mismatch

Expo, React Native Web, and `react-native-css` may not render every HTML/CSS detail exactly like the prototype.

Mitigation:

- Build prototype-focused primitives where needed
- Judge completion by visual equivalence, not implementation sameness

### Scope creep

Because the target is all screens, unrelated improvements could derail delivery.

Guardrail:

- Only change what improves prototype fidelity

### Live-mode bleed

Existing hooks, theme logic, and domain state may leak into fidelity mode.

Mitigation:

- Keep strict adapter and fixture boundaries
- Keep fidelity screens data-isolated

### Ambiguous conflicts

Current app and docs may disagree with the prototype.

Rule:

- `design.html` wins in fidelity mode

## Exit Strategy

Once all screens match, two exit paths remain open:

1. Keep fidelity mode as a demo or QA mode
2. Promote fidelity mode to the main UI and retire the old implementation gradually

This design intentionally keeps both futures possible.

## Implementation Guardrails

- Do not redesign beyond the prototype
- Do not optimize live mode during fidelity work unless necessary
- Do not preserve current repo token decisions if they reduce fidelity
- Do not accept data-driven visual drift in fidelity mode
- Prefer deterministic fixtures over runtime variability

## Summary

This design introduces a prototype fidelity mode inside the existing app, using:

- Exact prototype-oriented tokens
- Demo fixtures for deterministic visual states
- Dedicated prototype screens and primitives
- Route adapters instead of new public routes
- Strict side-by-side visual verification

Success means the app stops being merely inspired by `design.html` and becomes a faithful rendering of it.
