-- BL-10 PR-1 — kontrak struktural `public.search_global` (Wave 1: DB-1..DB-5).
--
-- Cakupan berkas ini bertambah per wave; Wave 1 hanya menguji KERANGKA: tanda tangan,
-- properti fungsi, bentuk keluaran, dan ACL. Perilaku (guard biaya, per-scope, cursor,
-- anti-oracle) menyusul di wave berikutnya.
--
-- POLA HARNESS (dipakai seluruh berkas, disalin dari 0067_cross_org_isolation_contract.sql:118-148):
--   begin;  do $$ … $$;  rollback;
--   `begin;`/`rollback;` WAJIB di luar blok do — `SET LOCAL` hanya berlaku bila ada transaksi
--   eksplisit terbuka; tanpa itu ia no-op berwarning, impersonasi tak pernah terjadi, dan
--   assertion otorisasi berjalan sebagai superuser sehingga hijau tanpa menguji apa pun.
--   JANGAN `rollback` di dalam blok do (tidak legal saat transaksi eksplisit terbuka).
--   JANGAN `set local row_security = off` pada blok penguji reduksi-RLS — ia mematikan
--   hal yang sedang diuji.
--
-- Rencana: specs/bl-10-pr1-tdd-plan.md §5 Wave 1 · Spec: specs/bl-10-search-scope-38.md §6.2

begin;
do $$
declare
  fails text := '';
  v_args text;
  v_result text;
  v_secdef boolean;
  v_volatile "char";
  v_config text[];
  v_has_authenticated boolean;
  v_has_anon boolean;
  v_has_public boolean;
  v_oid oid;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'search_global';

  if v_oid is null then
    raise exception 'FAIL 0085-DB-1..5: fungsi public.search_global belum ada';
  end if;

  -- DB-1 — tanda tangan persis (§6.2 dibekukan)
  select pg_get_function_arguments(v_oid) into v_args;
  if v_args <> 'p_query text, p_scopes text[] DEFAULT NULL::text[], '
             ||'p_include_archived boolean DEFAULT false, p_limit integer DEFAULT 5, '
             ||'p_cursor_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, '
             ||'p_cursor_id uuid DEFAULT NULL::uuid'
  then
    fails := fails || 'DB-1 tanda_tangan_tidak_cocok: [' || v_args || ']; ';
  end if;

  -- DB-2 — security definer + stable + search_path terkunci
  select p.prosecdef, p.provolatile, p.proconfig into v_secdef, v_volatile, v_config
  from pg_proc p where p.oid = v_oid;

  if not coalesce(v_secdef, false) then
    fails := fails || 'DB-2 bukan_security_definer; ';
  end if;
  if v_volatile <> 's' then
    fails := fails || 'DB-2 provolatile=' || v_volatile || ' (harus s/STABLE — penegak mekanis G6 nol-emisi audit); ';
  end if;
  if v_config is null or not exists (
    select 1 from unnest(v_config) c where c like 'search_path=%'
  ) then
    fails := fails || 'DB-2 proconfig_tanpa_search_path; ';
  end if;

  -- DB-3 — sembilan kolom keluaran, berurutan, bertipe tepat
  select pg_get_function_result(v_oid) into v_result;
  if v_result <> 'TABLE(scope text, id uuid, parent_id uuid, title text, subtitle text, '
               ||'snippet text, status text, sort_ts timestamp with time zone, sort_id uuid)'
  then
    fails := fails || 'DB-3 kolom_keluaran_tidak_cocok: [' || v_result || ']; ';
  end if;

  -- DB-4 — tanpa kolom payload jsonb (larangan §6.2)
  if v_result ilike '%payload%' or v_result ilike '%jsonb%' then
    fails := fails || 'DB-4 ada_kolom_payload_atau_jsonb; ';
  end if;

  -- DB-5 — ACL: authenticated boleh, anon & PUBLIC tidak (FR-35)
  -- has_function_privilege('public', …) menjawab grant PUBLIC, yang TIDAK ikut tercabut
  -- oleh `revoke … from authenticated` saja (preseden 0066:22-31).
  select has_function_privilege('authenticated', v_oid, 'EXECUTE') into v_has_authenticated;
  select has_function_privilege('anon',          v_oid, 'EXECUTE') into v_has_anon;
  select has_function_privilege('public',        v_oid, 'EXECUTE') into v_has_public;

  if not v_has_authenticated then fails := fails || 'DB-5 authenticated_tidak_boleh_execute; '; end if;
  if v_has_anon              then fails := fails || 'DB-5 anon_masih_boleh_execute; ';          end if;
  if v_has_public            then fails := fails || 'DB-5 PUBLIC_masih_boleh_execute; ';        end if;

  if fails <> '' then
    raise exception 'FAIL 0085-DB-1..5: %', fails;
  end if;
  raise notice 'PASS 0085-DB-1..5: kerangka search_global (tanda tangan, secdef/stable/search_path, 9 kolom, tanpa payload, ACL)';
end $$;
rollback;

-- ============================================================================
-- Wave 2 — guard biaya DIGABUNG cabang `goal` (DB-6..DB-10)
--
-- Digabung sengaja: selama search_global masih selalu `return;`, seluruh assertion guard
-- ("length<2 → 0 baris", "clamp → ≤30", "escape → 0 baris") hijau palsu. Cabang `goal`
-- adalah kontrol positif yang memberi test guard taringnya.
-- ============================================================================

begin;
do $$
declare
  v_org  uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';   -- Contract Fixtures Org
  v_ceo  uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  fails  text := '';
  n      int;
  got    text;
begin
  -- Seed diskriminatif §9.4: metakarakter LIKE sebagai LITERAL di dalam nama.
  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, target_value, created_by)
  values
    (v_org, 'bl10 ab',   v_ceo, current_date, current_date+30, 'draft', '1', v_ceo),
    (v_org, 'bl10 a%b',  v_ceo, current_date, current_date+30, 'draft', '1', v_ceo),
    (v_org, 'bl10 a_b',  v_ceo, current_date, current_date+30, 'draft', '1', v_ceo),
    (v_org, 'bl10 a\b',  v_ceo, current_date, current_date+30, 'draft', '1', v_ceo);

  perform set_config('request.jwt.claims',
          json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- DB-6 — KONTROL POSITIF. Tanpa ini seluruh assertion di bawah tak bermakna.
  select count(*) into n from public.search_global('bl10 ab', array['goal'], true, 30, null, null);
  if n < 1 then fails := fails || 'DB-6 kontrol_positif_nol_baris(cabang goal mati?); '; end if;

  -- DB-7 — length<2 = EARLY RETURN, bukan exception (FR-13: exception = oracle)
  begin
    select count(*) into n from public.search_global('a', array['goal'], true, 30, null, null);
    if n <> 0 then fails := fails || 'DB-7 query_1_char_mengembalikan_baris; '; end if;
  exception when others then
    fails := fails || 'DB-7 query_pendek_melempar_exception(' || sqlerrm || '); ';
  end;

  -- DB-8 — truncation 200 char: query 250 char yang berbeda HANYA di char 201-250
  -- harus memberi hasil identik dengan 200 char pertamanya.
  select count(*) into n from public.search_global(rpad('bl10 ab', 200, 'x') || repeat('Z', 50),
                                                   array['goal'], true, 30, null, null);
  declare m int; begin
    select count(*) into m from public.search_global(rpad('bl10 ab', 200, 'x'),
                                                     array['goal'], true, 30, null, null);
    if n <> m then fails := fails || 'DB-8 truncation_200_tidak_berlaku(' || n || ' vs ' || m || '); '; end if;
  end;

  -- DB-9 — escaping, PASANGAN DISKRIMINATIF per metakarakter (§9.4).
  -- Tiap pasangan meng-assert DUA ARAH: yang muncul DAN yang tidak.
  select string_agg(title, ',' order by title) into got
  from public.search_global('a%', array['goal'], true, 30, null, null);
  if coalesce(got,'') <> 'bl10 a%b' then
    fails := fails || 'DB-9 escape_persen: harap [bl10 a%b] dapat [' || coalesce(got,'<nol>') || ']; ';
  end if;

  select string_agg(title, ',' order by title) into got
  from public.search_global('a_', array['goal'], true, 30, null, null);
  if coalesce(got,'') <> 'bl10 a_b' then
    fails := fails || 'DB-9 escape_underscore: harap [bl10 a_b] dapat [' || coalesce(got,'<nol>') || ']; ';
  end if;

  select string_agg(title, ',' order by title) into got
  from public.search_global('a\b', array['goal'], true, 30, null, null);
  if coalesce(got,'') <> 'bl10 a\b' then
    fails := fails || 'DB-9 escape_backslash: harap [bl10 a\b] dapat [' || coalesce(got,'<nol>') || ']; ';
  end if;

  -- DB-10 — clamp limit 1..30, default 5
  select count(*) into n from public.search_global('bl10', array['goal'], true, 100, null, null);
  if n > 30 then fails := fails || 'DB-10 limit_100_tidak_di-clamp_ke_30(' || n || '); '; end if;
  select count(*) into n from public.search_global('bl10', array['goal'], true, 0, null, null);
  if n <> 1 then fails := fails || 'DB-10 limit_0_harus_clamp_ke_1(dapat ' || n || '); '; end if;
  select count(*) into n from public.search_global('bl10', array['goal'], true, null, null, null);
  if n <> 4 then fails := fails || 'DB-10 limit_null_default_5(seed 4 baris, dapat ' || n || '); '; end if;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0085-DB-6..10: %', fails;
  end if;
  raise notice 'PASS 0085-DB-6..10: guard biaya + cabang goal (kontrol positif, early-return, truncation, escaping 3 metakarakter, clamp)';
end $$;
rollback;

-- ============================================================================
-- Wave 3 — enam scope card sisanya (DB-16..DB-52)
--
-- Pola per scope identik dengan `goal` di Wave 2: kontrol positif, negatif, scope-null,
-- dan isolasi lintas-org. Blok ini menegakkan bahwa SETIAP cabang punya gate, bukan
-- hanya cabang pertama.
-- ============================================================================

begin;
do $$
declare
  v_org   uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo   uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_orgB  uuid;
  v_goal  uuid; v_strat uuid; v_init uuid; v_ap uuid; v_da uuid;
  fails   text := '';
  n       int;
  v_body  text;
begin
  -- FR-18 — satu-satunya created_at yang spec tandai belum terverifikasi
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='tasks' and column_name='created_at') then
    fails := fails || 'DB-34 tasks.created_at_tidak_ada(FR-18); ';
  end if;

  -- rantai induk di org bersama
  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, target_value, created_by)
    values (v_org, 'bl10w3 goal', v_ceo, current_date, current_date+30, 'draft', '1', v_ceo) returning id into v_goal;
  insert into public.strategies (organization_id, goal_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, v_goal, 'bl10w3 strategy', v_ceo, current_date, current_date+30, 'draft', v_ceo) returning id into v_strat;
  insert into public.initiatives (organization_id, strategy_id, name, pic_id, status, created_by)
    values (v_org, v_strat, 'bl10w3 initiative', v_ceo, 'draft', v_ceo) returning id into v_init;
  insert into public.action_plans (organization_id, initiative_id, name, pic_id, status, created_by)
    values (v_org, v_init, 'bl10w3 action_plan', v_ceo, 'draft', v_ceo) returning id into v_ap;
  insert into public.tasks (organization_id, action_plan_id, name, pic_id, status, created_by)
    values (v_org, v_ap, 'bl10w3 task', v_ceo, 'draft', v_ceo);
  insert into public.development_areas (organization_id, name, pic_id, status, created_by)
    values (v_org, 'bl10w3 development_area', v_ceo, 'draft', v_ceo) returning id into v_da;
  insert into public.problem_statements (organization_id, development_area_id, name, pic_id, status, created_by)
    values (v_org, v_da, 'bl10w3 problem_statement', v_ceo, 'draft', v_ceo);

  perform set_config('request.jwt.claims',
          json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- DB-16/22/28/34/40/46 — KONTROL POSITIF per scope (tanpa ini sisanya tak bermakna)
  select count(*) into n from public.search_global('bl10w3 strategy',          array['strategy'],          true, 30, null, null);
  if n <> 1 then fails := fails || 'DB-16 strategy_kontrol_positif(' || n || '); '; end if;
  select count(*) into n from public.search_global('bl10w3 initiative',        array['initiative'],        true, 30, null, null);
  if n <> 1 then fails := fails || 'DB-22 initiative_kontrol_positif(' || n || '); '; end if;
  select count(*) into n from public.search_global('bl10w3 action_plan',       array['action_plan'],       true, 30, null, null);
  if n <> 1 then fails := fails || 'DB-28 action_plan_kontrol_positif(' || n || '); '; end if;
  select count(*) into n from public.search_global('bl10w3 task',              array['task'],              true, 30, null, null);
  if n <> 1 then fails := fails || 'DB-34 task_kontrol_positif(' || n || '); '; end if;
  select count(*) into n from public.search_global('bl10w3 development_area',  array['development_area'],  true, 30, null, null);
  if n <> 1 then fails := fails || 'DB-40 development_area_kontrol_positif(' || n || '); '; end if;
  select count(*) into n from public.search_global('bl10w3 problem_statement', array['problem_statement'], true, 30, null, null);
  if n <> 1 then fails := fails || 'DB-46 problem_statement_kontrol_positif(' || n || '); '; end if;

  -- DB-17/23/29/35/41/47 — negatif: kata kunci tak cocok = 0 baris, BUKAN error
  begin
    select count(*) into n from public.search_global('zzzz-tidak-ada-zzzz', null, true, 30, null, null);
    if n <> 0 then fails := fails || 'DB-17 negatif_mengembalikan_baris(' || n || '); '; end if;
  exception when others then
    fails := fails || 'DB-17 negatif_melempar_exception(' || sqlerrm || '); ';
  end;

  -- DB-18/24/30/36/42/48 — p_scopes null = seluruh scope yang dirilis ikut (7 baris seed)
  select count(*) into n from public.search_global('bl10w3', null, true, 30, null, null);
  if n <> 7 then fails := fails || 'DB-18 scope_null_harus_7_baris(dapat ' || n || '); '; end if;

  execute 'reset role';

  -- ---- isolasi lintas-org: baris org LAIN tidak boleh terlihat -------------
  insert into public.organizations (name) values ('bl10w3-victim-org') returning id into v_orgB;
  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, target_value, created_by)
    values (v_orgB, 'bl10w3 goal', v_ceo, current_date, current_date+30, 'draft', '1', v_ceo);
  insert into public.development_areas (organization_id, name, pic_id, status, created_by)
    values (v_orgB, 'bl10w3 development_area', v_ceo, 'draft', v_ceo);

  perform set_config('request.jwt.claims',
          json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- DB-19/43 — lintas-org: tepat 1 (milik org sendiri), bukan 2
  select count(*) into n from public.search_global('bl10w3 goal', array['goal'], true, 30, null, null);
  if n <> 1 then fails := fails || 'DB-19 lintas_org_goal(' || n || ' baris, harap 1); '; end if;
  select count(*) into n from public.search_global('bl10w3 development_area', array['development_area'], true, 30, null, null);
  if n <> 1 then fails := fails || 'DB-43 lintas_org_devarea(' || n || ' baris, harap 1); '; end if;

  execute 'reset role';

  -- DB-52 — nol `raise exception` di badan fungsi, DENGAN KOMENTAR DILUCUTI (§9.5 Concern #2).
  -- Komentar header FR-7 memang memuat frasa "raise exception"; assertion teks atas badan
  -- mentah akan merah karena dokumentasi yang benar. Yang diuji adalah KODE, bukan komentar.
  select regexp_replace(
           regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g'),
           '/\*.*?\*/', '', 'gs')
    into v_body
  from pg_proc where proname = 'search_global';

  if v_body ilike '%raise exception%' then
    fails := fails || 'DB-52 ada_raise_exception_di_badan(FR-13: exception = oracle); ';
  end if;
  if v_body ilike '%map_legacy_entity_type%' then
    fails := fails || 'DB-28 action_plan_memakai_map_legacy_entity_type(dilarang 6.4); ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0085-DB-16..52: %', fails;
  end if;
  raise notice 'PASS 0085-DB-16..52: enam scope card sisanya (kontrol positif, negatif, scope-null, lintas-org, nol raise exception)';
end $$;
rollback;
