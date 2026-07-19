# P3 — Production Provisioning Runbook (owner steps)

Operator guide for standing up the **production** Supabase project + Sentry, and
wiring them into EAS. Every step here is a human/owner action (account creation,
secret handling, dashboard config) — the coding agent cannot perform these.

> Status of the paired code work (branch `p3/env-sentry-hardening`, off `staging`):
> - **P0-3** mangled env var `EXPO_PUBLIC_APP_ENV` fixed across 5 files (Sentry
>   env tag + the dead `isProduction()` guards on the two dev routes).
> - **P3-F** placeholder guard added to `mobile/src/lib/env.ts` — a build whose
>   Supabase URL/anon key still say `REPLACE…` / `<…>` now fails fast instead of
>   booting at a fictional host.
> Land that branch before you rely on the verification steps below.

---

## 0. Prerequisites (must be true before you start)

- [ ] `p3/env-sentry-hardening` merged (P0-3 + P3-F). Without P0-3, **every**
      Sentry event — even from staging builds — is tagged `production`.
- [ ] **P0-5** landed: `0061_strategy_template_crud.sql` cross-tenant delete hole
      fixed. This must not reach prod. Blocks §P3-B only.
- [ ] Staging is ahead of prod: apply all pending migrations to **staging first**,
      so prod is never more advanced than staging.
- [ ] Baseline green: `cd mobile && npm test` (1405/1405) and `npm run type-check`.

## Owner decisions to lock first

| Decision | Recommendation | Notes |
|---|---|---|
| Supabase region | **Singapore `ap-southeast-1`** | Closest to Indonesian users. Jakarta is not a Supabase region — confirm the list in the dashboard at create time. |
| Sentry tier | **Free** for V1 | 5k errors/mo, 10k perf txns/mo, **30-day** retention. Upgrade only if you need longer forensics. |
| DB password custody | Password manager (e.g. 1Password shared vault) | Not a file in the repo. Manual on-demand rotation; scheduled rotation isn't worth the complexity for a 1-dev team. |
| Prod domain naming | Out of P3 scope — cross-check with owner | Staging uses `staging.rencanapp.com` (Cloudflare Worker proxy). Prod needs its own (`app.rencanapp.com`? apex?). |

---

## P3-A · Provision the production Supabase project

1. supabase.com/dashboard → **New project**. Name e.g. `rencanapp-production`.
   Region per decision above. Set a strong DB password → store in password manager.
2. Record from **Settings → API**: `Project URL`, `anon` (publishable) key,
   `service_role` key. Store the `service_role` key + DB password as **secrets**
   (never in the repo).
3. Enable the extensions the app uses. Cross-check against
   `supabase/config.toml` and existing migrations, but at minimum:
   - `pg_cron`  (push-fanout drainer schedule)
   - `pg_net`   (outbox → Edge HTTP egress)
   - `vault`    (service_role secret for the create-user Edge Function + drainer)

   Dashboard → **Database → Extensions**, or via SQL:
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   create extension if not exists supabase_vault;
   ```

> **anon vs service_role — do not swap.** The `anon` key is public by design
> (bundled into the client, RLS-protected). The `service_role` key is secret
> (server/Edge only, via Vault). Putting service_role in the client bypasses RLS.

---

## P3-B · Apply migrations to production

**Gate:** P0-5 (0061) must be fixed first, and staging must already hold the full
stack. Do not proceed otherwise.

1. Link the CLI to prod (interactive; you'll paste the DB password):
   ```bash
   supabase link --project-ref <PROD_PROJECT_REF>
   ```
2. Push the migration stack:
   ```bash
   supabase db push          # or: supabase migration up
   ```
3. Post-apply security scan — **expected baseline: 0 ERROR**
   (staging today: 0 ERROR, ~194 WARN, mostly benign function-exec advisories):
   - MCP: `get_advisors` type=`security` against the prod project, **or**
   - Dashboard → Advisors → Security.
4. Confirm the migration ledger matches staging (`list_migrations` on both →
   identical list).

---

## P3-C · Seed & bootstrap (production must have NO dummy data)

- [ ] **Do not** run `supabase/seed_staging.sql` — it contains staging-only users
      (Rina Jaya et al.). Permission templates come from migrations, not seeds.
- [ ] Create exactly one super-admin, by hand:
  1. Supabase **Auth → Users → Add user** (or Auth admin API) → real owner email.
  2. Insert the matching `profiles` row + one `organizations` row via SQL
     (SQL editor / `execute_sql`), linking the auth `user_id`.
- [ ] Verify RLS is enabled on **every** table (same query as the audit — expect
      the count to equal the table count, ~57/57):
  ```sql
  select count(*)                         as total,
         count(*) filter (where c.relrowsecurity) as rls_on
  from pg_tables t
  join pg_class c on c.oid = (t.schemaname||'.'||t.tablename)::regclass
  where t.schemaname = 'public';
  ```
- [ ] Anti-recurrence (bugs 0049/0067 — SELECT policies vanishing from live
      schema). Expect **0 rows**:
  ```sql
  select t.tablename
  from pg_tables t
  where t.schemaname = 'public'
    and (select c.relrowsecurity from pg_class c
         where c.oid = (t.schemaname||'.'||t.tablename)::regclass)
    and not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = t.tablename and p.cmd = 'SELECT');
  ```

---

## P3-D · Wire env vars into EAS (do not commit prod secrets)

**Chosen pattern (enforce it): secrets live in the EAS Dashboard, not `eas.json`.**
Today the staging path is mixed — `deploy-staging.yml:73` hardcodes the URL while
`:74` reads the anon key from `secrets.STAGING_SUPABASE_ANON_KEY`, and
`eas.json` commits the same anon key in plaintext. For prod, pick one and hold it.

1. EAS Dashboard → Project → **Environment Variables** → scope **`production`**:
   - `EXPO_PUBLIC_SUPABASE_URL` = prod Project URL
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` = prod anon key
2. In `mobile/eas.json`, under `build.production.env`, **leave the two keys empty**
   (empty string, not deleted) so the dashboard value wins and the committed file
   carries no secret. `.env.example` lines 8–11 already document this pattern.
   > The P3-F guard means a stray `REPLACE…` left in `eas.json` now hard-fails the
   > build rather than shipping — intentional. Empty is the correct state.
3. Verify the build reads env from the dashboard, not the repo file:
   ```bash
   cd mobile
   eas build --profile production --platform ios --dry-run
   ```

---

## P3-E · Sentry DSN

1. sentry.io → **New Project** → platform **React Native** → e.g.
   `rencanapp-mobile`. Copy the **DSN**.
2. EAS Dashboard → Environment Variables → add `EXPO_PUBLIC_SENTRY_DSN`:
   - scope **`production`** → prod project DSN
   - scope **`preview`** (staging) → same or a separate staging Sentry project DSN
3. For local documentation only, uncomment the DSN lines in `mobile/.env.staging`
   (line 7) and `mobile/.env.production.example` (line 23). **Do not** paste a real
   DSN into a committed file — keep the value in the dashboard.
4. Verify end-to-end:
   - `mobile/src/lib/sentry-init.ts:64` `initSentry` returns **non-null** when the
     DSN is present (it returns `null` today because the DSN is empty everywhere).
   - Build a preview, open route **`/dev-sentry-test`**, press a trigger button →
     event appears in the Sentry dashboard, tagged with the correct environment.

> **P0-3 dependency (now fixed on the branch):** the environment tag comes from
> `EXPO_PUBLIC_APP_ENV` via `resolveEnvironment()`. Before the fix, staging events
> were mis-tagged `production`. Confirm a staging trigger shows `staging`, and a
> prod trigger shows `production`, to prove the fix is live in the build.

---

## Out of scope this pass — P3-G (store submit)

`eas.json` `submit.production` is `{}`. Fill it only when App Store Connect / Play
Console accounts are ready:
- iOS: `ascAppId`, `appleTeamId`, `ascApiKeyPath` (or one interactive login)
- Android: `serviceAccountKeyPath`, `track` (`internal`/`alpha`/`beta`/`production`)

---

## Final acceptance (all must pass)

- [ ] `eas build --profile production --platform ios --local` succeeds; the bundle
      boots pointing at the **prod** Supabase project (env read from dashboard).
- [ ] `/dev-sentry-test` event lands in Sentry with environment tag `production`
      (and staging builds tag `staging`).
- [ ] `get_advisors` type=security on prod → **0 ERROR**.
- [ ] `list_migrations` staging == prod (identical ledger).
- [ ] RLS + SELECT-policy queries (§P3-C) return the expected counts / 0 rows.
