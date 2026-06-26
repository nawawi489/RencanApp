-- 0015 — QA follow-up fixes (laporan manual QA 2026-06-26, branch feat/fase-7-people-score)
-- Menutup temuan yang bisa diperbaiki lewat DDL/migrasi:
--   F-1  evidence_files.kind  → tambah 'link_generic' ke whitelist (Notion/Figma/link non-GDrive)
--   F-3  settings              → drop duplicate unique index (sisakan settings_org_key_uniq)
--   F-4  RLS policies          → bungkus auth.uid() jadi (select auth.uid()) (initplan caching)
--   F-5  handle_new_user       → hormati app_metadata.role_level (service-role only) saat provisioning
--   F-6  observability tables   → composite index (entity_type, entity_id)
--
-- DI LUAR SCOPE migrasi (lihat laporan §5):
--   F-2  leaked-password protection — toggle dashboard Auth → Security (bukan DDL).
--   F-7  notif body — kosmetik, ditunda.
--   F-8  smoke-test mobile (Detox/EAS) — tooling, ditunda.

set local search_path = public, pg_catalog;

-- ============================================================ F-3: duplicate unique index
-- public.settings punya 2 unique identik pada (organization_id, key). Yang auto-generated
-- (_key_key) di-back oleh UNIQUE CONSTRAINT, jadi drop constraint-nya (index ikut hilang).
-- Pertahankan settings_org_key_uniq.
alter table public.settings drop constraint if exists settings_organization_id_key_key;

-- ============================================================ F-1: evidence kind whitelist
-- Tambah 'link_generic' agar UI bisa kirim link non-GDrive/Doc (Notion, Figma, dsb)
-- tanpa DDL berikutnya. Nilai lama tetap valid.
alter table public.evidence_files drop constraint if exists evidence_files_kind_check;
alter table public.evidence_files add constraint evidence_files_kind_check
  check (kind = any (array[
    'file', 'photo', 'screenshot', 'pdf',
    'link_gdrive', 'link_doc', 'link_generic',
    'text_note', 'report'
  ]));

-- ============================================================ F-6: composite (entity_type, entity_id)
-- activity_logs sudah punya idx_activity_logs_entity. Lengkapi 2 hot table sisanya.
create index if not exists idx_notifications_entity
  on public.notifications (entity_type, entity_id);
create index if not exists idx_governance_violations_entity
  on public.governance_violations (entity_type, entity_id);

-- ============================================================ F-5: handle_new_user role provisioning
-- Default tetap 'staff'. app_metadata (raw_app_meta_data) HANYA bisa di-set service_role /
-- Admin API — TIDAK bisa di-set user saat self-signup — jadi aman dipakai untuk memilih
-- role non-staff pada provisioning admin/seed tanpa UPDATE susulan. Fallback ke staff bila
-- key absen atau levelnya tak ditemukan di org.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org   uuid;
  v_role  uuid;
  v_level text;
begin
  select id into v_org from public.organizations order by created_at limit 1;

  v_level := nullif(new.raw_app_meta_data ->> 'role_level', '');

  select id into v_role from public.role_templates
    where organization_id = v_org
      and level = coalesce(v_level, 'staff')
    order by created_at limit 1;

  if v_role is null then
    select id into v_role from public.role_templates
      where organization_id = v_org and level = 'staff'
      order by created_at limit 1;
  end if;

  insert into public.profiles (id, organization_id, role_template_id, full_name, email)
  values (new.id, v_org, v_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email);
  return new;
end; $function$;

-- ============================================================ F-4: auth.uid() initplan caching
-- Bungkus tiap `auth.uid()` jadi `(select auth.uid())` agar dievaluasi 1× per query
-- (di-cache InitPlan) bukan per-row. Semantik identik (fungsi STABLE) — murni optimasi.
-- Idempoten: lewati policy yang sudah ter-wrap.
do $$
declare
  r   record;
  sql text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual,'') like '%auth.uid()%' or coalesce(with_check,'') like '%auth.uid()%')
      and coalesce(qual,'')       !~* 'select\s+auth\.uid'
      and coalesce(with_check,'') !~* 'select\s+auth\.uid'
  loop
    sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if r.qual is not null then
      sql := sql || format(' using (%s)', replace(r.qual, 'auth.uid()', '(select auth.uid())'));
    end if;
    if r.with_check is not null then
      sql := sql || format(' with check (%s)', replace(r.with_check, 'auth.uid()', '(select auth.uid())'));
    end if;
    execute sql;
  end loop;
end $$;
