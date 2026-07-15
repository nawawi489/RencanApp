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
create unique index if not exists uq_push_deliveries_once
  on public.push_deliveries (notification_id, push_token_id);

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
