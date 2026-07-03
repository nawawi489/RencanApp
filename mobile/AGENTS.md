# AGENTS.md — RencanApp mobile

Operating manual for agents working in `mobile/`. Read before writing any code here.

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.
Do not assume APIs from memory — this project pins specific versions.

## Stack

- **Expo** `~56.0.12` (SDK 56) · **React Native** `0.85.3`
- **NativeWind** `5.0.0-preview.4` — a preview pin. Do NOT bump or "fix" the version; the preview is intentional and upgrades have broken styling before.
- **Supabase** for backend (auth, Postgres, RLS).
- Routing via **Expo Router** (`src/app/`).

## Design tokens (binding)

`DESIGN.md` at the repo root is the **source of truth** for design tokens (color, typography, spacing, radius, elevation, motion, a11y). Before touching any UI in `src/`:

1. Read `DESIGN.md` first.
2. Register new tokens in `DESIGN.md`, then implement in `src/global.css` (`@theme` for brand) + NativeWind classes. Keep the two in sync.
3. Obey the binding a11y rules in `DESIGN.md §4`: touch target ≥44px; color must not be the only signal; solid fills with white text use `brand-dark` `#1564b3`.

## Commands

Run from `mobile/`:

- `npm test` — Jest (use `npm run test:ci` in CI / `--runInBand`)
- `npm run type-check` — `tsc --noEmit`
- `npm run lint` — `expo lint`
- `npm run web` / `npm run ios` / `npm run android` — dev server

Run tests and type-check before considering a change complete.

## Notes

- `mobile/CLAUDE.md` just re-exports this file (`@AGENTS.md`) — edit here, not there.
- PRD **V1.8.2** at the repo root is the current spec truth; wiki/code may still lag at V1.8.1.
