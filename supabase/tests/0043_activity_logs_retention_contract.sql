-- Migration 0043 contract test — retention purge activity_logs.
--
-- Pola fase7: `raise notice 'PASS'` bila lolos, `raise exception 'FAIL: ...'` bila gagal.
-- Jalankan (butuh role postgres/owner):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0043_activity_logs_retention_contract.sql

-- ============================================================ 0043-DB-1: fungsi ada dengan signature benar
do $$
declare fails text := '';
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'purge_old_activity_logs'
  ) then
    fails := fails || 'function_missing; ';
  end if;

  -- Signature wajib (int, int, date) → int agar cron & test dapat memanggil
  -- dengan p_activate_after override.
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'purge_old_activity_logs'
      and pg_get_function_arguments(p.oid)
        ilike '%p_retention_months integer%p_batch_size integer%p_activate_after date%'
  ) then
    fails := fails || 'wrong_signature; ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0043-DB-1: %', fails;
  end if;
  raise notice 'PASS 0043-DB-1';
end $$;

-- ============================================================ 0043-DB-2: SECURITY DEFINER (bukan invoker)
do $$
declare fails text := '';
begin
  -- prosecdef=true berarti SECURITY DEFINER. Bila false, RLS user bisa memanggil
  -- fungsi tanpa berhenti di layar delete → tidak boleh.
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'purge_old_activity_logs'
      and p.prosecdef = true
  ) then
    fails := fails || 'not_security_definer; ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0043-DB-2: %', fails;
  end if;
  raise notice 'PASS 0043-DB-2';
end $$;

-- ============================================================ 0043-DB-3: authenticated TIDAK punya execute
do $$
declare fails text := '';
begin
  -- Bila authenticated bisa memanggil purge, user API mana pun bisa menghapus
  -- audit trail lewat rpc.call — melanggar prinsip DEFINER-only mutation.
  if has_function_privilege('authenticated', 'public.purge_old_activity_logs(int, int, date, int)', 'EXECUTE') then
    fails := fails || 'authenticated_has_execute; ';
  end if;

  -- service_role WAJIB punya execute (dipanggil pg_cron sebagai role ini).
  if not has_function_privilege('service_role', 'public.purge_old_activity_logs(int, int, date, int)', 'EXECUTE') then
    fails := fails || 'service_role_missing_execute; ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0043-DB-3: %', fails;
  end if;
  raise notice 'PASS 0043-DB-3';
end $$;

-- ============================================================ 0043-DB-4: cron job 'purge-activity-logs' terdaftar
do $$
declare fails text := '';
begin
  if not exists (
    select 1 from cron.job where jobname = 'purge-activity-logs'
  ) then
    fails := fails || 'cron_job_missing; ';
  end if;

  -- Schedule wajib 20:00 UTC (03:00 WIB) — job lain di 0007/0008 tidak konflik.
  if not exists (
    select 1 from cron.job where jobname = 'purge-activity-logs'
      and schedule = '0 20 * * *'
  ) then
    fails := fails || 'wrong_schedule; ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0043-DB-4: %', fails;
  end if;
  raise notice 'PASS 0043-DB-4';
end $$;

-- ============================================================ 0043-DB-5: activation delay = no-op sampai p_activate_after
do $$
declare
  before_activation date := current_date + interval '1 day';
  result int;
begin
  -- Panggil dengan activation_date di masa depan → fungsi WAJIB return 0
  -- (bahkan bila ada baris tua di tabel).
  select public.purge_old_activity_logs(12, 10000, before_activation) into result;

  if result <> 0 then
    raise exception 'FAIL 0043-DB-5: expected 0 during delay window, got %', result;
  end if;
  raise notice 'PASS 0043-DB-5';
end $$;

-- ============================================================ 0043-DB-6: dengan activation forced, delete baris > retention
do $$
declare
  org_id uuid;
  user_id uuid;
  old_id uuid := gen_random_uuid();
  fresh_id uuid := gen_random_uuid();
  deleted int;
  old_still_exists bool;
  fresh_still_exists bool;
begin
  -- Sisipkan 2 baris test: 1 tua (2 tahun lalu), 1 baru (kemarin).
  -- Ambil org/user yang ada agar FK tidak error; skip bila tak ada seed.
  select id into org_id from public.organizations limit 1;
  select id into user_id from public.profiles limit 1;

  if org_id is null or user_id is null then
    raise notice 'SKIP 0043-DB-6: no org/profile seed';
    return;
  end if;

  insert into public.activity_logs (id, organization_id, actor_id, entity_type, entity_id, action, created_at)
    values (old_id, org_id, user_id, '__test_purge_old', old_id, 'test', now() - interval '2 years');
  insert into public.activity_logs (id, organization_id, actor_id, entity_type, entity_id, action, created_at)
    values (fresh_id, org_id, user_id, '__test_purge_fresh', fresh_id, 'test', now() - interval '1 day');

  -- Force activation dengan tanggal masa lalu → fungsi jalan sungguhan.
  -- (current_date - integer) = date; hindari `- interval '1 day'` yang jadi timestamp
  -- dan tak match signature p_activate_after date.
  select public.purge_old_activity_logs(12, 10000, current_date - 1) into deleted;

  -- Baris tua harus hilang, baris baru harus tetap.
  select exists (select 1 from public.activity_logs where id = old_id) into old_still_exists;
  select exists (select 1 from public.activity_logs where id = fresh_id) into fresh_still_exists;

  -- Cleanup baris fresh yang sengaja disisipkan (baris old sudah dihapus fungsi).
  delete from public.activity_logs where id = fresh_id;

  if old_still_exists then
    raise exception 'FAIL 0043-DB-6: old row (2y) not deleted';
  end if;
  if not fresh_still_exists then
    raise exception 'FAIL 0043-DB-6: fresh row (1d) wrongly deleted';
  end if;
  if deleted < 1 then
    raise exception 'FAIL 0043-DB-6: expected >=1 deleted, got %', deleted;
  end if;
  raise notice 'PASS 0043-DB-6';
end $$;
