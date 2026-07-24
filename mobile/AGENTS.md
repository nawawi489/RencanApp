# AGENTS.md — Rencanapp mobile

Operating manual for agents working in `mobile/`. Read before writing any code here.

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.
Do not assume APIs from memory — this project pins specific versions.

## Stack

- **Expo** `~56.0.12` (SDK 56) · **React Native** `0.85.3`
- **NativeWind** `5.0.0-preview.4` — a preview pin. Do NOT bump or "fix" the version; the preview is intentional and upgrades have broken styling before.
- **Supabase** for backend (auth, Postgres, RLS).
- Routing via **Expo Router** (`src/app/`).

## Supabase env & secrets posture

One posture, applied consistently — do **not** re-flag `eas.json` as inconsistent with the deploy workflow:

- **Real environments (staging + production): env-only.** The Supabase URL and anon key are **never committed**. They are injected at build/deploy time from CI env vars — CircleCI project env (`STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`; see `.circleci/config.yml` job `deploy-staging`) and, for the paused GitHub Actions fallback, `secrets.STAGING_SUPABASE_*`. The `preview` (staging) and `production` profiles in `eas.json` therefore carry no real key — `production` shows `REPLACE_PROD_ANON_KEY` placeholders on purpose.
- **Local development: the committed key is intentional and safe.** The `development` profile in `eas.json` hardcodes the **universal Supabase local-demo anon key** (`iss: supabase-demo`, `role: anon`) pointing at `http://localhost:54321`. That value is a public constant — identical for every `supabase start` install worldwide and published in Supabase docs — so it is not a secret, and committing it keeps local dev zero-config. Do **not** move it to env; that adds friction for zero security gain.

`eas.json` is strict JSON and cannot hold comments, which is why this rule lives here. RLS — not anon-key secrecy — is what protects data; the anon key is public by design and ships inside the client bundle regardless.

## Design tokens (binding)

`DESIGN.md` at the repo root is the **source of truth** for design tokens (color, typography, spacing, radius, elevation, motion, a11y). Before touching any UI in `src/`:

1. Read `DESIGN.md` first.
2. Register new tokens in `DESIGN.md`, then implement in `src/global.css` (`@theme` for brand) + NativeWind classes. Keep the two in sync.
3. Obey the binding a11y rules in `DESIGN.md §4`: touch target ≥44px; color must not be the only signal; solid fills with white text use `brand-dark` `#1564b3`.
4. Obey the naming rule in `DESIGN.md` / `PRD.md`: use `Rencanapp` for user-facing product copy; keep `RencanApp` only for repo/path/tooling identifiers that are already fixed.

## Commands

Run from `mobile/`:

- `npm test` — Jest (use `npm run test:ci` in CI / `--runInBand`)
- `npm run type-check` — `tsc --noEmit`
- `npm run lint` — `expo lint`
- `npm run web` / `npm run ios` / `npm run android` — dev server

Run tests and type-check before considering a change complete.

## Git hooks (auto-installed via `npm install`)

Repo memakai custom hooks path `.githooks/` (bukan `.git/hooks/`). `npm install`
di `mobile/` menjalankan `postinstall` yang set `git config core.hooksPath .githooks`
otomatis — jadi begitu Anda `cd mobile && npm install`, hook aktif.

Hook aktif saat ini:

- `pre-push` — jalankan type-check + lint + `jest --onlyChanged` kalau ada
  perubahan di `mobile/`. Skip otomatis kalau push hanya docs/wiki/CI.

Emergency bypass: `git push --no-verify` (skip hook lokal saja; CircleCI post-merge
tetap gate).

Verifikasi manual: `git config --get core.hooksPath` harus keluarin `.githooks`.
Kalau kosong, jalankan `git config core.hooksPath .githooks` sekali.

## Notes

- `mobile/CLAUDE.md` just re-exports this file (`@AGENTS.md`) — edit here, not there.
- PRD **V1.8.2** at the repo root is the current spec truth; wiki/code may still lag at V1.8.1.
- Before closing UI work, sanity-check product naming on login/header/onboarding and other visible copy surfaces.
