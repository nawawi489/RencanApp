-- 0073_strategy_template_crud.sql
-- PRD V1.83 §19: admin CRUD untuk strategy_templates (create/edit/disable).
--
-- Ganti draft awal 0061_strategy_template_crud.sql. Draft tersebut menambah
-- policy INSERT/UPDATE/DELETE hanya digatekan ke `has_permission(...)`
-- tanpa scope organisasi → admin org A bisa DELETE/UPDATE template milik
-- org B (cross-tenant). SELECT-nya juga masih `using (true)` (peninggalan
-- 0010:390 saat tabel dianggap "sistem"). V1.83 §19 mencabut template
-- sistem (0059 mengosongkan seed) → tabel efektif menjadi per-org.
--
-- Kebijakan setelah migrasi ini:
--   1. `strategy_templates.organization_id` NOT NULL, FK organizations.
--   2. Default kolom = `public.current_user_org()` supaya client-side INSERT
--      lama (mobile/src/lib/goals.ts:96) tak perlu ikut kirim org.
--   3. RLS 4-way (select/insert/update/delete) scope by `organization_id
--      = current_user_org()`; write juga digate `has_permission(
--      'manage_kpi_area_templates')` (kunci permission tak direname di
--      migrasi ini — inconsistency dengan UI yang cek 'manage_strategy_
--      templates' didokumentasikan sebagai follow-up terpisah).
--   4. `apply_goal_template` (0046:429) di-repro dengan filter
--      `strategy_templates.organization_id = v_org` supaya RPC (SECURITY
--      DEFINER, bypass RLS) tidak bisa menarik template lintas-org.
--   5. Kolom `is_active` (boolean not null default true) untuk soft-disable.
--   6. Rename label permission ke terminologi V1.83.
--
-- Backfill: 0059 sudah menghapus 19 seed template lama. Tabel tidak punya
-- INSERT policy sampai migrasi ini → tidak ada jalur untuk baris admin
-- tersimpan tanpa org. Untuk paranoia, DELETE baris organization_id IS
-- NULL yang mungkin ada dari environment eksperimental (idempoten;
-- production diperkirakan 0 baris).

begin;

-- ---------------------------------------------------------------- schema

alter table public.strategy_templates
  add column if not exists organization_id uuid references public.organizations (id) on delete cascade;

-- Buang baris tak-ter-atribusi sebelum NOT NULL (safety net; V1.83+ tak
-- pernah membiarkan baris NULL org sengaja).
delete from public.strategy_templates where organization_id is null;

alter table public.strategy_templates
  alter column organization_id set not null,
  alter column organization_id set default public.current_user_org();

create index if not exists idx_strategy_templates_org
  on public.strategy_templates (organization_id);

alter table public.strategy_templates
  add column if not exists is_active boolean not null default true;

comment on column public.strategy_templates.is_active is
  'Soft-disable: false menyembunyikan template dari picker tanpa hapus data.';

comment on column public.strategy_templates.organization_id is
  'V1.83 §19: template per-org (sistem bawaan dicabut). Default current_user_org() supaya INSERT app-side tak perlu kirim kolom ini.';

-- ---------------------------------------------------------------- RLS

-- SELECT: replace policy 0010 `kpi_area_templates_select` (using(true))
-- dengan scope org. `kpi_area_templates_select` mengikuti nama lama karena
-- tabel di-rename di 0045 tapi policy tidak ikut. Buang keduanya defensif.
drop policy if exists "kpi_area_templates_select" on public.strategy_templates;
drop policy if exists "strategy_templates_select" on public.strategy_templates;

create policy "strategy_templates_select"
  on public.strategy_templates
  for select to authenticated
  using (organization_id = public.current_user_org());

create policy "strategy_templates_insert"
  on public.strategy_templates
  for insert to authenticated
  with check (
    organization_id = public.current_user_org()
    and public.has_permission('manage_kpi_area_templates')
  );

create policy "strategy_templates_update"
  on public.strategy_templates
  for update to authenticated
  using (
    organization_id = public.current_user_org()
    and public.has_permission('manage_kpi_area_templates')
  )
  with check (
    organization_id = public.current_user_org()
    and public.has_permission('manage_kpi_area_templates')
  );

create policy "strategy_templates_delete"
  on public.strategy_templates
  for delete to authenticated
  using (
    organization_id = public.current_user_org()
    and public.has_permission('manage_kpi_area_templates')
  );

-- ---------------------------------------------------------------- RPC hardening
-- apply_goal_template dulu `from public.strategy_templates` tanpa filter org.
-- Karena SECURITY DEFINER bypass RLS, wizard org A bisa memicu insert Strategy
-- yang seeding namanya dari template milik org B (jika keduanya berbagi
-- goal_template_id). Sekarang ada organization_id, tutup lubang tersebut.

create or replace function public.apply_goal_template(
  p_goal_template_id uuid,
  p_pic_id uuid,
  p_period_start date,
  p_period_end date,
  p_targets jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare t public.goal_templates; v_goal uuid; v_org uuid;
begin
  if not public.has_permission('create_goal') then
    raise exception 'Anda tidak berwenang membuat Goal.';
  end if;
  select * into t from public.goal_templates where id = p_goal_template_id;
  if not found then raise exception 'Goal Template tidak ditemukan.'; end if;
  v_org := public.current_user_org();
  -- SECURITY DEFINER mem-bypass RLS: pastikan PIC (bila diisi) adalah anggota org pemanggil,
  -- agar tak bisa menetapkan PIC lintas-organisasi lewat RPC.
  if p_pic_id is not null and not exists (
    select 1 from public.profiles where id = p_pic_id and organization_id = v_org
  ) then
    raise exception 'PIC harus anggota organisasi yang sama.';
  end if;

  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, goal_template_id, created_by)
  values (v_org, t.name, p_pic_id, p_period_start, p_period_end, 'draft', t.id, auth.uid())
  returning id into v_goal;

  insert into public.strategies (organization_id, goal_id, name, target, pic_id, period_start, period_end, status, created_by)
  select v_org, v_goal, kt.name, nullif(trim(coalesce(p_targets ->> kt.id::text, '')), ''),
         p_pic_id, p_period_start, p_period_end, 'draft', auth.uid()
  from public.strategy_templates kt
  where kt.goal_template_id = p_goal_template_id
    and kt.organization_id = v_org
    and kt.is_active;

  perform public.write_activity('goal', v_goal, 'apply_template',
    jsonb_build_object('goal_template_id', p_goal_template_id));
  return v_goal;
end;
$function$;

-- ---------------------------------------------------------------- permission label

update public.permissions
  set label = 'Kelola Strategy Template'
  where key = 'manage_kpi_area_templates';

-- ---------------------------------------------------------------- sanity check

do $$
declare
  n_policies int;
  n_null_org int;
begin
  select count(*) into n_policies
    from pg_policies
   where tablename = 'strategy_templates';
  raise notice '0069: strategy_templates policies = % (expect 4: select + insert + update + delete)', n_policies;

  select count(*) into n_null_org from public.strategy_templates where organization_id is null;
  raise notice '0069: strategy_templates NULL org rows = % (expect 0)', n_null_org;
end $$;

commit;
