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

  -- DB-18/24/30/36/42/48 — p_scopes null = SELURUH scope yang dirilis ikut.
  --
  -- Assertion dipecah per-scope, bukan satu count total. Bentuk lamanya (`= 7`) benar saat
  -- hanya 7 scope card yang dirilis, tetapi menjadi salah begitu BL-10d menambahkan scope
  -- audit: menyisipkan sebuah card memicu log otomatis ber-action `create`, dan nama entitas
  -- log itu cocok dengan kata kunci yang sama. Count total karena itu ikut bertambah —
  -- perilaku yang BENAR, tetapi membuat assertion agregat pecah karena alasan yang tidak
  -- ada hubungannya dengan apa yang hendak diuji.
  select count(*) into n
  from public.search_global('bl10w3', null, true, 30, null, null)
  where scope in ('goal','strategy','initiative','action_plan','task',
                  'development_area','problem_statement');
  if n <> 7 then fails := fails || 'DB-18 scope_null_harus_memuat_7_card(dapat ' || n || '); '; end if;

  -- Kontrol positif untuk sifat "seluruh scope": bila scope audit sudah dirilis, ia HARUS
  -- ikut muncul di hasil scope-null. Tanpa ini, assertion di atas tetap hijau pada
  -- implementasi yang diam-diam membatasi scope-null hanya ke card.
  select count(*) into n
  from public.search_global('bl10w3', null, true, 30, null, null)
  where scope = 'activity_log';
  if n < 1 then
    fails := fails || 'DB-18 scope_null_tidak_menjangkau_audit(' || n || ' baris activity_log); ';
  end if;

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

  -- Catatan: assertion `raise exception` PINDAH ke Wave 5 dalam bentuk yang dipertajam.
  -- Larangan mutlak "nol raise exception" benar selama Wave 3 (belum ada cursor), tetapi
  -- menjadi SALAH begitu FR-19 diimplementasi — FR-13 mengizinkan tepat satu exception:
  -- error bentuk-request cursor, yang tidak bergantung identitas maupun data aktor.
  -- Yang diuji di Wave 5 adalah SIFAT exception-nya, bukan jumlahnya nol.
  if v_body ilike '%map_legacy_entity_type%' then
    fails := fails || 'DB-28 action_plan_memakai_map_legacy_entity_type(dilarang 6.4); ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0085-DB-16..52: %', fails;
  end if;
  raise notice 'PASS 0085-DB-16..52: enam scope card sisanya (kontrol positif, negatif, scope-null, lintas-org, nol raise exception)';
end $$;
rollback;

-- ============================================================================
-- Wave 4 — cabang `chat` lewat DELEGASI (DB-53..DB-56)
--
-- DB-53 adalah bukti FR-2 yang sesungguhnya: `search_chat_messages` ditukar dengan stub
-- kanari di dalam transaksi, lalu hasil `search_global` harus IKUT BERUBAH. Ini jauh lebih
-- kuat daripada memeriksa `prosrc` — salin-tempel yang diformat ulang lolos pemeriksaan
-- teks, tetapi tidak lolos pertukaran perilaku ini.
--
-- Batas yang harus disadari (§9.2 Concern #9): teknik ini menuntut `create or replace`
-- mempertahankan tanda tangan 5-arg dan tipe hasil 9-kolom PERSIS, dan hanya sah dijalankan
-- sebagai pemilik fungsi (postgres) — jadi ia menguji DB lokal/CI, bukan staging.
--
-- PEMILIHAN AKTOR — jangan diganti tanpa mengecek dua syarat sekaligus:
--   (a) ia anggota `chat_room_members` dari room yang memuat pesan uji, DAN
--   (b) `profiles.organization_id`-nya SAMA dengan `chat_messages.organization_id` room itu.
-- Keanggotaan saja tidak cukup: `search_chat_messages` juga menggerbang per organisasi,
-- sehingga anggota lintas-org mendapat nol baris dan test terbaca seperti "delegasi mati"
-- padahal gerbangnya justru bekerja benar.
--
-- Ini bukan hipotetis. Aktor `…0001` memenuhi (a) tetapi tidak (b), karena prelude
-- `_fixtures.sql` memindahkannya ke org DCR-05 sementara pesan uji ada di org Nyantuy.
-- Prelude itu commit dan tidak pernah di-reset antar-berkas, jadi pengamatan yang diambil
-- SEBELUM suite kontrak pernah jalan bisa tidak berlaku lagi sesudahnya.
-- Query pemilih aktor yang benar:
--   select m.member_id, p.organization_id = cm.organization_id
--   from public.chat_room_members m
--   join public.chat_messages cm on cm.chat_room_id = m.chat_room_id
--   join public.profiles p on p.id = m.member_id
--   where cm.body ilike '%<kata-kunci-uji>%' group by 1,2;
-- ============================================================================

begin;
do $$
declare
  v_org  uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';   -- Contract Fixtures Org
  v_ceo  uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';   -- CEO Fixture (org yang sama)
  v_room uuid;
  fails  text := '';
  n      int;
  got    text;
  v_len  int;
begin
  -- Menyemai SENDIRI room + keanggotaan + pesan.
  --
  -- Versi pertama blok ini mengandalkan data chat yang kebetulan ada di DB pengembang
  -- (dari `seed_dummy.sql`) dan HIJAU secara lokal — lalu MERAH di CI. Sebabnya:
  -- `scripts/ci/run-db-contract-tests.sh` hanya menerapkan `supabase/tests/_fixtures.sql`
  -- sebagai prelude, dan berkas itu punya NOL chat room maupun pesan.
  --
  -- Aturan yang berlaku untuk blok mana pun sesudah ini: jangan pernah bergantung pada
  -- data ambient. Kalau sebuah test butuh baris, ia yang membuatnya.
  -- `chat_rooms.action_plan_id` NOT NULL, jadi rantai induknya ikut disemai.
  declare v_goal uuid; v_strat uuid; v_init uuid; v_ap uuid;
  begin
    insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, target_value, created_by)
      values (v_org, 'bl10chat goal', v_ceo, current_date, current_date+30, 'draft', '1', v_ceo) returning id into v_goal;
    insert into public.strategies (organization_id, goal_id, name, pic_id, period_start, period_end, status, created_by)
      values (v_org, v_goal, 'bl10chat strategy', v_ceo, current_date, current_date+30, 'draft', v_ceo) returning id into v_strat;
    insert into public.initiatives (organization_id, strategy_id, name, pic_id, status, created_by)
      values (v_org, v_strat, 'bl10chat initiative', v_ceo, 'draft', v_ceo) returning id into v_init;
    insert into public.action_plans (organization_id, initiative_id, name, pic_id, status, created_by)
      values (v_org, v_init, 'bl10chat action plan', v_ceo, 'draft', v_ceo) returning id into v_ap;

    insert into public.chat_rooms (organization_id, action_plan_id, name)
      values (v_org, v_ap, 'bl10 chat room') returning id into v_room;
    insert into public.chat_room_members (chat_room_id, member_id) values (v_room, v_ceo);
    insert into public.chat_messages (organization_id, chat_room_id, author_id, body)
      values (v_org, v_room, v_ceo, 'Mohon kirim draft desain sebelum Jumat');
  end;

  perform set_config('request.jwt.claims',
          json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- DB-53a — KONTROL POSITIF sebelum penukaran: cabang chat memang hidup.
  select count(*) into n from public.search_global('draft', array['chat'], true, 30, null, null);
  if n < 1 then
    fails := fails || 'DB-53a kontrol_positif_chat_nol_baris(cabang chat mati? delegasi tak terpasang?); ';
  end if;

  -- DB-56 — proyeksi memilih kolom yang benar, bukan sekadar "ada baris".
  select string_agg(distinct scope, ',') into got
  from public.search_global('draft', array['chat'], true, 30, null, null);
  if coalesce(got,'') <> 'chat' then
    fails := fails || 'DB-56 scope_bukan_chat(' || coalesce(got,'<nol>') || '); ';
  end if;

  select count(*) into n
  from public.search_global('draft', array['chat'], true, 30, null, null)
  where parent_id is null;
  if n <> 0 then
    fails := fails || 'DB-56 parent_id_null(deep-link ke room hilang, ' || n || ' baris); ';
  end if;

  select count(*) into n
  from public.search_global('draft', array['chat'], true, 30, null, null)
  where status is not null;
  if n <> 0 then
    fails := fails || 'DB-56 status_harus_null_untuk_chat(' || n || ' baris); ';
  end if;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0085-DB-53a/56: %', fails;
  end if;
  raise notice 'PASS 0085-DB-53a/56: cabang chat hidup + proyeksi kolom benar';
end $$;
rollback;

-- DB-53b — PERTUKARAN KANARI. Blok terpisah supaya penukaran fungsi benar-benar
-- ter-rollback dan tidak mencemari blok lain.
begin;

create or replace function public.search_chat_messages(
  p_query text, p_room_id uuid default null, p_limit int default 20,
  p_before timestamptz default null, p_before_id uuid default null)
returns table (message_id uuid, chat_room_id uuid, room_name text, initiative_id uuid,
               author_id uuid, author_name text, snippet text,
               created_at timestamptz, body_similarity real)
language sql stable security definer set search_path = ''
as 'select ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''::uuid,
           ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''::uuid,
           ''KANARI-STUB''::text, null::uuid, null::uuid, ''KANARI''::text,
           repeat(''K'', 400)::text, now(), 0::real';

do $$
declare
  -- Aktor fixtures, BUKAN aktor seed_dummy: runner kontrak hanya menerapkan _fixtures.sql.
  -- Stub kanari mengembalikan barisnya tanpa memandang input, jadi blok ini tidak butuh
  -- data chat — tetapi aktornya tetap harus ada di DB yang bersih.
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  fails text := '';
  got   text;
  v_len int;
begin
  perform set_config('request.jwt.claims',
          json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- DB-53b — hasil search_global HARUS ikut berubah. Kalau body-nya disalin-tempel
  -- alih-alih didelegasikan, baris kanari tidak akan pernah muncul.
  select string_agg(distinct title, ',') into got
  from public.search_global('draft', array['chat'], true, 30, null, null);
  if coalesce(got,'') <> 'KANARI-STUB' then
    fails := fails || 'DB-53b delegasi_tidak_murni: stub tidak terlihat, dapat ['
                   || coalesce(got,'<nol>') || ']; ';
  end if;

  -- DB-55 — truncation 240 dilakukan oleh search_global sendiri, bukan diwarisi.
  -- Stub sengaja mengembalikan snippet 400 char.
  select max(length(snippet)) into v_len
  from public.search_global('draft', array['chat'], true, 30, null, null);
  if coalesce(v_len,0) <> 240 then
    fails := fails || 'DB-55 truncation_240_tidak_berlaku(panjang=' || coalesce(v_len,0) || '); ';
  end if;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0085-DB-53b/55: %', fails;
  end if;
  raise notice 'PASS 0085-DB-53b/55: delegasi terbukti (stub kanari terlihat) + truncation 240 milik search_global';
end $$;
rollback;

-- ============================================================================
-- Wave 5 — cursor keyset, anti-oracle, nol-emisi audit, pengunci NG-6
-- (DB-61..DB-74, plus DB-52 dipertajam)
-- ============================================================================

begin;
do $$
declare
  v_org  uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo  uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  fails  text := '';
  n      int;
  v_body text;
  v_ts   timestamptz; v_id uuid;
  p1 text; p2 text; p3 text;
  d_nomatch text; d_filtered text;
  a_before bigint; a_after bigint; g_before bigint; g_after bigint;
  i int;
begin
  -- seed 7 baris untuk uji paging 3 halaman
  for i in 1..7 loop
    insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, target_value, created_by)
    values (v_org, 'bl10w5 page ' || lpad(i::text, 2, '0'), v_ceo,
            current_date, current_date+30, 'draft', '1', v_ceo);
  end loop;

  perform set_config('request.jwt.claims',
          json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- ---- DB-61/62/63 — cursor: HANYA sah bila p_scopes berisi tepat satu scope ----
  -- Exception di sini adalah error BENTUK-REQUEST (FR-19): tidak bergantung identitas
  -- maupun data aktor, jadi ia bukan oracle.
  begin
    perform * from public.search_global('bl10w5', array['goal','task'], true, 5, now(), gen_random_uuid());
    fails := fails || 'DB-61 cursor_multi_scope_tidak_ditolak; ';
  exception when others then null;   -- diharapkan
  end;

  begin
    perform * from public.search_global('bl10w5', null, true, 5, now(), gen_random_uuid());
    fails := fails || 'DB-62 cursor_dgn_scope_null_tidak_ditolak; ';
  exception when others then null;   -- diharapkan
  end;

  begin
    perform * from public.search_global('bl10w5', array['goal'], true, 5, now(), gen_random_uuid());
  exception when others then
    fails := fails || 'DB-63 cursor_satu_scope_ditolak(' || sqlerrm || '); ';
  end;

  -- ---- DB-64 — tiga halaman: tanpa duplikasi, tanpa kehilangan ----
  select string_agg(title, ',' order by title) into p1
  from public.search_global('bl10w5 page', array['goal'], true, 3, null, null);
  select sort_ts, sort_id into v_ts, v_id
  from public.search_global('bl10w5 page', array['goal'], true, 3, null, null)
  order by sort_ts asc, sort_id asc limit 1;

  select string_agg(title, ',' order by title) into p2
  from public.search_global('bl10w5 page', array['goal'], true, 3, v_ts, v_id);
  select sort_ts, sort_id into v_ts, v_id
  from public.search_global('bl10w5 page', array['goal'], true, 3, v_ts, v_id)
  order by sort_ts asc, sort_id asc limit 1;

  select string_agg(title, ',' order by title) into p3
  from public.search_global('bl10w5 page', array['goal'], true, 3, v_ts, v_id);

  if (select count(*) from (
        select unnest(string_to_array(coalesce(p1,''), ',')) x
        union all select unnest(string_to_array(coalesce(p2,''), ','))
        union all select unnest(string_to_array(coalesce(p3,''), ','))
      ) s where x <> '') <> 7 then
    fails := fails || 'DB-64 total_3_halaman_bukan_7(' || coalesce(p1,'') || ' | '
                   || coalesce(p2,'') || ' | ' || coalesce(p3,'') || '); ';
  end if;
  if (select count(distinct x) from (
        select unnest(string_to_array(coalesce(p1,''), ',')) x
        union all select unnest(string_to_array(coalesce(p2,''), ','))
        union all select unnest(string_to_array(coalesce(p3,''), ','))
      ) s where x <> '') <> 7 then
    fails := fails || 'DB-64 ada_duplikasi_lintas_halaman; ';
  end if;

  -- ---- DB-67 — scope tak dikenal = 0 baris, TANPA exception (FR-22) ----
  begin
    select count(*) into n from public.search_global('bl10w5', array['scope_tidak_dikenal'], true, 5, null, null);
    if n <> 0 then fails := fails || 'DB-67 scope_tak_dikenal_mengembalikan_baris(' || n || '); '; end if;
  exception when others then
    fails := fails || 'DB-67 scope_tak_dikenal_melempar_exception(' || sqlerrm || '); ';
  end;

  -- ---- DB-68/69 — ANTI-ORACLE setara-byte ----
  -- (i) tidak match apa pun  vs  (ii) match baris yang seluruhnya tersaring otorisasi.
  -- Keduanya WAJIB menghasilkan payload identik dan tidak melempar apa pun.
  select coalesce(md5(string_agg(t::text, '|' order by t::text)), 'KOSONG') into d_nomatch
  from public.search_global('zzz-tidak-akan-cocok-zzz', array['goal'], false, 5, null, null) t;

  select coalesce(md5(string_agg(t::text, '|' order by t::text)), 'KOSONG') into d_filtered
  from public.search_global('bl10w5-victim', array['goal'], false, 5, null, null) t;

  if d_nomatch <> d_filtered then
    fails := fails || 'DB-68 digest_berbeda(nomatch=' || d_nomatch || ' filtered=' || d_filtered || '); ';
  end if;

  -- ---- DB-70 — nol emisi audit (FR-32) ----
  execute 'reset role';
  select count(*) into a_before from public.activity_logs;
  select count(*) into g_before from public.governance_violations;
  perform set_config('request.jwt.claims',
          json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  for i in 1..25 loop
    perform * from public.search_global('bl10w5', array['goal'], true, 5, null, null);
    perform * from public.search_global('zzz', null, true, 5, null, null);
  end loop;
  execute 'reset role';
  select count(*) into a_after from public.activity_logs;
  select count(*) into g_after from public.governance_violations;
  if a_after <> a_before then
    fails := fails || 'DB-70 activity_logs_bertambah(' || (a_after - a_before) || '); ';
  end if;
  if g_after <> g_before then
    fails := fails || 'DB-70 governance_violations_bertambah(' || (g_after - g_before) || '); ';
  end if;

  -- ---- DB-52 DIPERTAJAM + DB-66 — badan fungsi, komentar dilucuti ----
  select regexp_replace(
           regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g'),
           '/\*.*?\*/', '', 'gs')
    into v_body
  from pg_proc where proname = 'search_global';

  -- FR-13 mengizinkan TEPAT SATU exception: error bentuk-request cursor. Yang dilarang
  -- adalah exception yang bergantung identitas/data aktor. Karena itu assertion diarahkan
  -- ke SIFATNYA, bukan ke jumlah nol yang akan salah begitu FR-19 diimplementasi.
  if v_body !~* 'raise exception' then
    fails := fails || 'DB-52 tidak_ada_validasi_bentuk_request_cursor(FR-19 belum diimplementasi?); ';
  end if;
  if v_body ~* 'raise exception[^;]*(auth\.uid|can_access|has_permission|current_user_org)' then
    fails := fails || 'DB-52 ada_raise_exception_bergantung_identitas(oracle, FR-13); ';
  end if;

  -- DB-66 — tanpa OFFSET (paging keyset, bukan offset)
  if v_body ~* '\moffset\M' then
    fails := fails || 'DB-66 memakai_OFFSET(paging harus keyset); ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0085-DB-52/61..70: %', fails;
  end if;
  raise notice 'PASS 0085-DB-52/61..70: cursor bentuk-request + paging 3 halaman + scope tak dikenal + anti-oracle setara-byte + nol emisi audit';
end $$;
rollback;

-- ============================================================================
-- Pengunci NG-6 (DB-72..DB-74) — tiga jaring agar tak ada yang "merapikan" search_cards
-- ============================================================================
begin;
do $$
declare
  v_ceo    uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_org    uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  fails    text := '';
  v_src    text;
  n_cards  int;
  n_global int;
  v_digest text;
  -- Baseline P5 (Wave 0). PERINGATAN, bukan penegak — lihat DB-74.
  c_baseline constant text := 'e8d46e73c3144369b20d872f89e39ad2';
begin
  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, target_value, created_by)
  values (v_org, 'bl10ng6 wildcard', v_ceo, current_date, current_date+30, 'draft', '1', v_ceo);

  select prosrc into v_src from pg_proc where proname = 'search_cards';

  -- DB-72 — bug FR-6 di search_cards SENGAJA dipertahankan
  if v_src ilike '%escape%' then
    fails := fails || 'DB-72 search_cards_kini_memakai_escape(NG-6 dilanggar: jangan perbaiki di PR ini); ';
  end if;

  perform set_config('request.jwt.claims',
          json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- DB-73 — PENEGAK UTAMA: perbedaan PERILAKU berpasangan.
  -- search_cards: '%' masih wildcard hidup (bug dipertahankan) -> ada baris.
  -- search_global: '%%' literal -> nol baris.
  select count(*) into n_cards  from public.search_cards('%', null, false);
  select count(*) into n_global from public.search_global('%%', array['goal'], true, 30, null, null);

  if n_cards = 0 then
    fails := fails || 'DB-73 search_cards_wildcard_mati(perilakunya berubah -> NG-6 dilanggar); ';
  end if;
  if n_global <> 0 then
    fails := fails || 'DB-73 search_global_wildcard_hidup(' || n_global || ' baris; escaping bocor); ';
  end if;

  execute 'reset role';

  -- DB-74 — PERINGATAN, bukan penegak (§9.5 Concern #4)
  select md5(prosrc) into v_digest from pg_proc where proname = 'search_cards';
  if v_digest <> c_baseline then
    raise warning 'DB-74: digest search_cards berubah (% -> %); bila ini perbaikan yang disengaja, perbarui baseline P5 — NG-6 sesungguhnya ditegakkan DB-73',
                  c_baseline, v_digest;
  end if;

  if fails <> '' then
    raise exception 'FAIL 0085-DB-72..74: %', fails;
  end if;
  raise notice 'PASS 0085-DB-72..74: NG-6 terkunci lewat perbedaan perilaku (digest hanya peringatan)';
end $$;
rollback;
