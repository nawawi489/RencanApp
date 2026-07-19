-- Push Notifications Fase 2 — server-side infrastructure (spec: specs/push-notifications.md).
--
-- Migrasi ini akan bertumbuh melalui task Fase 2-A .. Fase 2-F:
--   [2-A ini] push_tokens + push_deliveries tabel + RLS + FK + index
--   [2-B]     register_push_token + unregister_push_token RPC (SECURITY DEFINER, anti-hijack)
--   [2-C]     is_push_worthy() fail-closed
--   [2-F]     pg_net + pg_cron + vault SERVICE_ROLE + drainer schedule + retention purge
--
-- Prinsip:
--   - Tulis client TIDAK PERNAH langsung ke tabel; semua via RPC SECURITY DEFINER.
--   - push_deliveries hanya SERVICE_ROLE (bypass RLS) — zero policy, zero grant.
--   - Konvensi FK: public.profiles (bukan auth.users). Konsisten seluruh repo.

-- ============================================================ push_tokens
create table if not exists public.push_tokens (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  expo_token      text not null,
  platform        text not null,
  device_id       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  constraint push_tokens_platform_check check (platform in ('ios','android'))
);

-- Unique agar upsert by expo_token bekerja & mencegah token duplikat lintas-user.
create unique index if not exists uq_push_tokens_expo on public.push_tokens (expo_token);

-- Partial index: drainer paling sering scan token aktif per recipient.
create index if not exists idx_push_tokens_recipient_active
  on public.push_tokens (user_id) where revoked_at is null;

-- RLS: SELECT own-row (org + user match). Tak ada policy INSERT/UPDATE/DELETE — semua via RPC.
alter table public.push_tokens enable row level security;

create policy "push_tokens_select_own"
  on public.push_tokens for select to authenticated
  using (organization_id = public.current_user_org() and user_id = auth.uid());

-- Revoke DML dari authenticated + anon + public — defense-in-depth di atas absent-policy.
revoke insert, update, delete on public.push_tokens from authenticated, anon, public;
-- SELECT tetap perlu supaya policy select_own bisa jalankan; DML di-block.
grant select on public.push_tokens to authenticated;

-- ============================================================ push_deliveries (outbox)
create table if not exists public.push_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  notification_id     uuid not null references public.notifications(id) on delete cascade,
  push_token_id       uuid not null references public.push_tokens(id) on delete cascade,
  status              text not null default 'pending',
  -- Retry backoff (owner decision 2026-07-15): exponential 2^attempts menit, cap 6 attempts.
  attempts            int  not null default 0,
  next_attempt_at     timestamptz not null default now(),
  provider_ticket_id  text,
  provider_receipt_id text,
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint push_deliveries_status_check
    check (status in ('pending','sent','failed','receipt_ok','receipt_error'))
);

-- Idempotency: satu baris notifikasi → maks satu push per token.
-- CONSTRAINT (bukan hanya INDEX) supaya bisa dipakai di ON CONFLICT ON CONSTRAINT — hindari
-- shadowing kolom vs RETURNS TABLE OUT params di claim_push_deliveries.
alter table public.push_deliveries
  drop constraint if exists uq_push_deliveries_once,
  add constraint uq_push_deliveries_once unique (notification_id, push_token_id);

-- Drainer scan predikat utama: status='pending' + next_attempt_at <= now().
create index if not exists idx_push_deliveries_pending_ready
  on public.push_deliveries (next_attempt_at)
  where status = 'pending';

-- Retention harian purge butuh index cheap ini.
create index if not exists idx_push_deliveries_created_at
  on public.push_deliveries (created_at);

-- RLS enabled (defense-in-depth), ZERO policy → hanya SERVICE_ROLE bypass yang bisa akses.
alter table public.push_deliveries enable row level security;

-- Revoke ALL PRIVILEGES dari semua role client (termasuk TRUNCATE/REFERENCES/TRIGGER default).
-- Hanya SERVICE_ROLE (postgres) yang punya akses.
revoke all privileges on public.push_deliveries from authenticated, anon, public;

comment on table public.push_tokens is
  'Registrasi Expo push token per (user, device). Ditulis eksklusif via register_push_token / unregister_push_token RPC. RLS SELECT own-row.';
comment on table public.push_deliveries is
  'Outbox fan-out push. Ditulis eksklusif oleh drainer Edge Function via SERVICE_ROLE. Tidak diekspos client.';
comment on column public.push_deliveries.next_attempt_at is
  'Exponential backoff: now() + interval ''1 min'' * pow(2, least(attempts,6)). Cap ~1 jam. Max 6 attempts lalu status=''failed''.';

-- ============================================================ register_push_token (SECURITY DEFINER + anti-hijack)
-- Upsert by expo_token. Kalau token existing dimiliki user lain (revoked_at IS NULL):
-- audit push_token_transferred + rate-limit 3/24 jam, lalu transfer kepemilikan.
-- Audit meta_json = {from_user_id, to_user_id, device_id, platform} — JANGAN pernah expo_token (leak guard).
create or replace function public.register_push_token(
  p_expo_token text,
  p_platform text,
  p_device_id text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_existing_id uuid;
  v_existing_owner uuid;
  v_existing_revoked timestamptz;
  v_transfer_count int;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  -- Fetch caller's active org.
  select organization_id into v_org
  from public.profiles where id = v_uid and is_active = true;
  if v_org is null then
    raise exception 'user_inactive_or_no_org' using errcode = '28000';
  end if;

  -- Existing row (kalau ada).
  select id, user_id, revoked_at into v_existing_id, v_existing_owner, v_existing_revoked
  from public.push_tokens where expo_token = p_expo_token;

  -- Case A: token baru — insert.
  if v_existing_id is null then
    insert into public.push_tokens (organization_id, user_id, expo_token, platform, device_id)
    values (v_org, v_uid, p_expo_token, p_platform, p_device_id);
    return;
  end if;

  -- Case B: milik caller sendiri — refresh (idempotent + re-activate kalau revoked).
  if v_existing_owner = v_uid then
    update public.push_tokens
       set organization_id = v_org,
           platform = p_platform,
           device_id = coalesce(p_device_id, device_id),
           revoked_at = null,
           updated_at = now()
     where id = v_existing_id;
    return;
  end if;

  -- Case C: milik user lain. Kalau owner sudah revoke, transfer bebas tanpa rate-limit (audit tetap).
  -- Kalau owner masih aktif (revoked_at IS NULL), tunduk rate-limit anti-hijack (3 transfer/actor/24h).
  if v_existing_revoked is null then
    select count(*) into v_transfer_count
    from public.activity_logs
    where actor_id = v_uid
      and action = 'push_token_transferred'
      and created_at > now() - interval '1 day';
    if v_transfer_count >= 3 then
      raise exception 'Terlalu banyak perpindahan token. Coba lagi besok.'
        using errcode = '54000';  -- program_limit_exceeded
    end if;
  end if;

  -- Audit key-only — WAJIB sebelum transfer (jangan pernah tulis expo_token ke meta_json).
  perform public.write_activity(
    'push_token',
    v_existing_id,
    'push_token_transferred',
    jsonb_build_object(
      'from_user_id', v_existing_owner,
      'to_user_id',   v_uid,
      'device_id',    p_device_id,
      'platform',     p_platform
    )
  );

  -- Transfer kepemilikan.
  update public.push_tokens
     set organization_id = v_org,
         user_id = v_uid,
         platform = p_platform,
         device_id = coalesce(p_device_id, device_id),
         revoked_at = null,
         updated_at = now()
   where id = v_existing_id;
end;
$$;

revoke all on function public.register_push_token(text, text, text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;

-- ============================================================ unregister_push_token
-- Idempotent: set revoked_at=now() untuk baris milik caller yang belum revoked. No-op kalau tidak ada baris cocok.
create or replace function public.unregister_push_token(p_expo_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  update public.push_tokens
     set revoked_at = now(), updated_at = now()
   where expo_token = p_expo_token
     and user_id = v_uid
     and revoked_at is null;
end;
$$;

revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.unregister_push_token(text) to authenticated;

-- ============================================================ is_push_worthy(p_type, p_org) — fail-closed
-- Whitelist push-worthy ORTOGONAL terhadap notifications.type (spec FR-PN-12). Dua context caller:
--   1. Client (authenticated): pass p_type saja → resolve org dari current_user_org().
--   2. Drainer (SERVICE_ROLE, no auth.uid): pass (p_type, p_org) explicit.
-- Kalau settings key 'notification_rule_push_types' belum diset admin → fail-closed ke whitelist Fase 1
-- (6 tipe: review_request, approved, rejected, deadline_reminder, repeat_due, instance_missed).
-- Query WAJIB filter (organization_id, key) — unique key adalah pasangan (0014).
create or replace function public.is_push_worthy(p_type text, p_org uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := coalesce(p_org, public.current_user_org());
  v_types jsonb;
begin
  if v_org is not null then
    select value into v_types
    from public.settings
    where organization_id = v_org and key = 'notification_rule_push_types';

    -- Kalau key ada DAN valid array — pakai override org.
    if v_types is not null and jsonb_typeof(v_types) = 'array' then
      return exists (select 1 from jsonb_array_elements_text(v_types) as t where t = p_type);
    end if;
  end if;

  -- Fail-closed: whitelist Fase 1 terkode (revision_requested BUKAN NotificationType — copy
  -- semantik "perlu revisi" di-cover oleh tipe 'rejected' + kolom resolution='revision_requested').
  return p_type = any (array[
    'review_request',
    'approved',
    'rejected',
    'deadline_reminder',
    'repeat_due',
    'instance_missed'
  ]);
end;
$$;

revoke all on function public.is_push_worthy(text, uuid) from public, anon;
grant execute on function public.is_push_worthy(text, uuid) to authenticated;

comment on function public.is_push_worthy(text, uuid) is
  'Push-worthy filter. Org override via settings key notification_rule_push_types (jsonb array). Fail-closed ke whitelist Fase 1 terkode saat key absent/invalid.';

-- ============================================================ claim_push_deliveries — atomic FOR UPDATE SKIP LOCKED
-- Two-phase: (1) materialize baris push_deliveries baru untuk notifikasi yang belum di-fanout,
-- (2) claim batch pending secara atomic dengan lease 5 menit (jaga-jaga drainer crash).
-- Canonical drainer query — WAJIB match AC-FAN-6 kontrak.
create or replace function public.claim_push_deliveries(p_limit int default 100)
returns table(
  delivery_id     uuid,
  notification_id uuid,
  push_token_id   uuid,
  expo_token      text,
  platform        text,
  title           text,
  body            text,
  type            text,
  entity_type     text,
  entity_id       uuid,
  attempts        int
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed uuid[];
begin
  -- Step 1: materialize new deliveries for unhandled push-worthy notifications (dedupe via unique).
  insert into public.push_deliveries (notification_id, push_token_id, status, attempts, next_attempt_at)
  select n.id, pt.id, 'pending', 0, now()
  from public.notifications n
  join public.push_tokens pt
    on pt.organization_id = n.organization_id
   and pt.user_id = n.recipient_id
   and pt.revoked_at is null
  where n.is_read = false
    and n.resolved_at is null
    and n.created_at > now() - interval '1 hour'
    and public.is_push_worthy(n.type, n.organization_id)
  on conflict on constraint uq_push_deliveries_once do nothing;

  -- Step 2: claim batch atomic. FOR UPDATE SKIP LOCKED cegah dua drainer klaim baris sama.
  -- Lease 5 menit: kalau drainer crash pre-update, baris di-retry setelah 5 menit.
  with locked as (
    select pd.id
    from public.push_deliveries pd
    where pd.status = 'pending'
      and pd.next_attempt_at <= now()
      and pd.attempts < 6
    order by pd.next_attempt_at
    limit p_limit
    for update skip locked
  ),
  leased as (
    update public.push_deliveries pd
      set next_attempt_at = now() + interval '5 minutes',
          updated_at = now()
      from locked
      where pd.id = locked.id
      returning pd.id
  )
  select array_agg(id) into v_claimed from leased;

  if v_claimed is null then return; end if;

  -- Step 3: return joined view. coalesce title/body = fail-closed defensive (FR-PN-22).
  return query
  select
    pd.id,
    pd.notification_id,
    pd.push_token_id,
    pt.expo_token,
    pt.platform,
    coalesce(n.title, 'Pembaruan baru')::text,
    coalesce(n.body,  'Ada pembaruan yang perlu ditinjau.')::text,
    n.type,
    n.entity_type,
    n.entity_id,
    pd.attempts
  from public.push_deliveries pd
  join public.notifications n on n.id = pd.notification_id
  join public.push_tokens   pt on pt.id = pd.push_token_id
  where pd.id = any(v_claimed);
end;
$$;

-- Hanya SERVICE_ROLE (postgres) yang execute — verify_jwt=false + secret key di Edge Function.
revoke all on function public.claim_push_deliveries(int) from public, anon, authenticated;

comment on function public.claim_push_deliveries(int) is
  'Drainer atomic claim: materialize + FOR UPDATE SKIP LOCKED + 5-min lease. SERVICE_ROLE only.';

-- ============================================================ bump_push_delivery_backoff — exponential backoff
-- Formula owner decision: next = now() + interval ''1 min'' * pow(2, least(attempts_after, 6)).
-- Max 6 attempts total; setelah bump ke-6 → status=''failed'' (tidak dipoll lagi).
create or replace function public.bump_push_delivery_backoff(p_id uuid, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts int;
  v_next int;
begin
  select attempts into v_attempts
  from public.push_deliveries where id = p_id;
  if v_attempts is null then return; end if;

  v_next := v_attempts + 1;

  if v_next >= 6 then
    update public.push_deliveries
      set attempts = v_next,
          status   = 'failed',
          error    = p_error,
          updated_at = now()
      where id = p_id;
  else
    update public.push_deliveries
      set attempts = v_next,
          next_attempt_at = now() + (interval '1 minute' * pow(2, least(v_next, 6))::int),
          error = p_error,
          updated_at = now()
      where id = p_id;
  end if;
end;
$$;

revoke all on function public.bump_push_delivery_backoff(uuid, text) from public, anon, authenticated;

comment on function public.bump_push_delivery_backoff(uuid, text) is
  'Exponential backoff (owner decision): attempts+1, next_at=now()+1min*pow(2,least(attempts,6)). Max 6 attempts → failed.';

-- ============================================================ INFRASTRUCTURE: pg_net + vault + cron drainer + retention
-- Owner decision 2026-07-15: pg_net + pg_cron transport, 2 guardrail wajib.
-- G-1: SERVICE_ROLE di vault (bukan embedded di cron command).
-- G-2: REVOKE USAGE schema net dari semua role client.

-- pg_net sudah enabled di stack lokal + hosted. Idempoten: CREATE IF NOT EXISTS.
create extension if not exists pg_net;
-- pg_cron sudah enabled sejak 0007. Idempoten.
create extension if not exists pg_cron;

-- Guardrail G-2: blokir akses langsung HTTP egress dari role client.
-- Pada Supabase HOSTED, postgres = superuser → REVOKE langsung berhasil.
-- Pada Supabase LOCAL, schema net owned by supabase_admin, postgres bukan superuser →
-- REVOKE menghasilkan WARNING "no privileges could be revoked". Untuk local:
--   docker exec supabase_db_supabase psql -U supabase_admin -d postgres \
--     -c "revoke usage on schema net from public, authenticated, anon;"
revoke usage on schema net from public, authenticated, anon;

-- Guardrail G-1: secret disimpan di vault, di-resolve runtime oleh cron command.
-- vault.create_secret() mengenkripsi value — jangan raw INSERT ke vault.secrets.
-- Nilai '___PLACEHOLDER___' WAJIB diganti post-deploy via Supabase Dashboard > Vault
-- atau `supabase secrets set` sebelum drainer aktif.
-- Pada Supabase LOCAL, vault.create_secret() butuh supabase_admin role:
--   docker exec supabase_db_supabase psql -U supabase_admin -d postgres \
--     -c "select vault.create_secret('actual_key', 'service_role_key', '...');"
--     -c "select vault.create_secret('https://xxx.supabase.co', 'project_url', '...');"
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'service_role_key') then
    perform vault.create_secret(
      '___PLACEHOLDER___',
      'service_role_key',
      'Supabase SERVICE_ROLE key untuk push-fanout Edge Function drainer'
    );
  end if;
  if not exists (select 1 from vault.secrets where name = 'project_url') then
    perform vault.create_secret(
      '___PLACEHOLDER___',
      'project_url',
      'Supabase project base URL (hosted: https://xxx.supabase.co, lokal: http://kong:8000)'
    );
  end if;
exception when insufficient_privilege then
  raise notice 'vault.create_secret requires supabase_admin on local — run manually (see migration comments)';
end $$;

-- Unschedule dulu kalau rerun migration (idempoten pattern dari 0007).
do $$ begin perform cron.unschedule('push-fanout-drainer'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('push-deliveries-purge'); exception when others then null; end $$;

-- Cron drainer: tiap 1 menit (owner decision cadence).
-- Vault lookup at runtime: service_role_key + project_url di-resolve tiap invokasi.
-- Existing cron: overdue */15, backfill 5 0, deadline 0 6, purge-logs 0 20.
select cron.schedule(
  'push-fanout-drainer',
  '* * * * *',
  $$select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
           || '/functions/v1/push-fanout',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                     where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  )$$
);

-- Retention: purge push_deliveries > 30 hari (owner decision retensi).
-- 03:00 UTC = 10:00 WIB, jam sepi, tidak konflik dengan job lain.
-- Index idx_push_deliveries_created_at (defined above) makes this DELETE cheap.
select cron.schedule(
  'push-deliveries-purge',
  '0 3 * * *',
  $$delete from public.push_deliveries where created_at < now() - interval '30 days'$$
);
