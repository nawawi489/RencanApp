-- Migration 0082 contract test — BL-04.
-- Yang dijaga di sini adalah invariant yang selama ini TIDAK dijaga siapa pun: isi
-- `minimum_breakdown_rules` harus memakai penamaan yang sama dengan yang dibaca
-- `check_minimum_breakdown_compliance`. Sejak rename 0045 keduanya berbeda diam-diam, dan tidak
-- ada satu pun gate yang merah — 3 dari 6 aturan fail-open permanen tanpa error, tanpa log.
--
-- Pola: `raise notice 'PASS'` bila lolos, `raise exception 'FAIL: ...'` bila gagal.
-- Jalankan:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0082_mbr_rule_naming_contract.sql

-- ============================================================ 0082-DB-1: nol alias legacy tersisa
do $$
declare v_legacy int;
begin
  select count(*) into v_legacy from public.minimum_breakdown_rules
  where parent_card_type = 'kpi_area' or child_card_type = 'kpi_area';

  if v_legacy > 0 then
    raise exception 'FAIL 0082-DB-1: % baris aturan masih memakai alias legacy kpi_area', v_legacy;
  end if;
  raise notice 'PASS 0082-DB-1';
end $$;

-- ============================================================ 0082-DB-2: tiap cabang RPC menemukan aturannya
-- Inilah tes yang akan merah kalau seseorang menambah level kartu baru / mengganti nama lagi tanpa
-- ikut memindahkan baris aturan. Pasangan di bawah = persis cabang di
-- check_minimum_breakdown_compliance.
do $$
declare fails text := ''; r record;
begin
  for r in
    select * from (values
      ('goal',              'strategy'),
      ('strategy',          'initiative'),
      ('initiative',        'action_plan'),
      ('action_plan',       'task'),
      ('development_area',  'problem_statement'),
      ('problem_statement', 'action_plan')
    ) as v (parent, child)
  loop
    if not exists (
      select 1 from public.minimum_breakdown_rules m
      where m.organization_id is null
        and m.parent_card_type = r.parent
        and m.child_card_type  = r.child
    ) then
      fails := fails || format('no_system_rule_for_%s→%s; ', r.parent, r.child);
    end if;
  end loop;

  if fails <> '' then
    raise exception 'FAIL 0082-DB-2: %', fails;
  end if;
  raise notice 'PASS 0082-DB-2';
end $$;

-- ============================================================ 0082-DB-3: CHECK menolak penamaan legacy
do $$
declare v_rejected boolean := false;
begin
  begin
    insert into public.minimum_breakdown_rules (organization_id, parent_card_type, child_card_type)
    values (null, 'kpi_area', 'strategy');
  exception when check_violation then
    v_rejected := true;
  end;

  if not v_rejected then
    -- Bersihkan bila ternyata lolos, supaya kegagalan ini tidak mengotori DB tes berikutnya.
    delete from public.minimum_breakdown_rules
    where organization_id is null and parent_card_type = 'kpi_area';
    raise exception 'FAIL 0082-DB-3: CHECK masih menerima parent_card_type kpi_area';
  end if;
  raise notice 'PASS 0082-DB-3';
end $$;

-- ============================================================ 0082-DB-4: activate_problem_statement menghitung tabel yang benar
-- Turunan Problem Statement adalah Rencana Aksi (`action_plans.problem_statement_id`). Versi lama
-- menghitung `public.initiatives` — tabel yang tidak punya kolom itu — sehingga aktivasi PS mati
-- dengan 42703 begitu aturannya diset blokir_aktivasi.
do $$
declare v_src text; fails text := '';
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'activate_problem_statement';

  if position('current_minimum_breakdown_rule(''problem_statement'', ''action_plan'')' in v_src) = 0 then
    fails := fails || 'lookup_pair_not_problem_statement_action_plan; ';
  end if;
  if position('from public.initiatives' in v_src) > 0 then
    fails := fails || 'still_counts_initiatives; ';
  end if;
  if position('from public.action_plans' in v_src) = 0 then
    fails := fails || 'does_not_count_action_plans; ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0082-DB-4: %', fails;
  end if;
  raise notice 'PASS 0082-DB-4';
end $$;

-- ============================================================ 0082-DB-5: ACL check_minimum_breakdown_compliance
-- authenticated HARUS bisa (klien memanggilnya langsung untuk indikator Kelengkapan Perencanaan);
-- anon/PUBLIC tidak. PUBLIC EXECUTE-nya adalah sisa DROP ... CASCADE di 0046 (pola yang sama
-- dengan yang dijaga contract 0066).
do $$
declare fails text := '';
begin
  if not has_function_privilege('authenticated',
      'public.check_minimum_breakdown_compliance(text,uuid)', 'EXECUTE') then
    fails := fails || 'authenticated_cannot_execute; ';
  end if;
  if has_function_privilege('anon',
      'public.check_minimum_breakdown_compliance(text,uuid)', 'EXECUTE') then
    fails := fails || 'anon_still_executable; ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0082-DB-5: %', fails;
  end if;
  raise notice 'PASS 0082-DB-5';
end $$;
