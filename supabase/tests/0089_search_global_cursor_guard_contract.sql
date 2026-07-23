-- BL-16 — kontrak guard cursor separuh pada `public.search_global` (DB-96..DB-101).
--
-- MASALAH YANG DIKUNCI. Guard bentuk-request FR-19 (0085) hanya menuntut `p_scopes`
-- berisi tepat satu scope; ia tidak menuntut KEDUA bagian cursor terisi. Semua cabang
-- memfilter dengan `(t.created_at, t.id) < (p_cursor_ts, p_cursor_id)`.
--
-- Postgres membandingkan tuple secara SHORT-CIRCUIT: selama `created_at < p_cursor_ts`
-- tegas, `id` tak pernah disentuh sehingga `p_cursor_id` NULL tak terasa. Bug muncul
-- HANYA pada kasus TIE — `created_at` persis sama dengan cursor, yaitu satu-satunya
-- kondisi `id` ada untuk memecahkannya. Di sana perbandingan jatuh ke `id < NULL` → NULL
-- → seluruh baris tie gugur TANPA error.
--
-- Cakupannya memang sempit (bukan "semua baris hilang"), dan klien tidak pernah
-- menghasilkannya — `useSearchScopePage` selalu mengirim kedua bagian dari kolom
-- non-null. Ia hanya terjangkau lewat panggilan API tangan. Yang membuatnya layak
-- diperbaiki adalah GEJALANYA: kehilangan data tanpa error, jadi tidak akan ada yang
-- melaporkannya.
--
-- POLA HARNESS: `begin;` / `do $$ … $$;` / `rollback;` dengan begin/rollback DI LUAR
-- blok do — `SET LOCAL` hanya berlaku bila ada transaksi eksplisit terbuka; tanpa itu
-- impersonasi tak pernah terjadi dan assertion otorisasi hijau tanpa menguji apa pun.
--
-- Seed sendiri, TIDAK bergantung data ambient: runner kontrak hanya menerapkan
-- `supabase/tests/_fixtures.sql` sebagai prelude.

begin;
do $$
declare
  v_org  uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';   -- Contract Fixtures Org
  v_ceo  uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  -- created_at IDENTIK — inilah satu-satunya kondisi yang membuat `id` menentukan.
  v_tie  timestamptz := '2026-01-01T00:00:00Z';
  -- Cursor id sengaja di atas kedua baris agar keduanya lolos komponen kedua tuple:
  -- kalau bentuk lengkap ikut kehilangan baris, penyebabnya bukan guard ini.
  v_hi   uuid := 'ffffffff-ffff-4fff-bfff-ffffffffffff';
  fails  text := '';
  n      int;
  v_state text;
  v_msg   text;
begin
  insert into public.goals (organization_id, name, pic_id, period_start, period_end,
                            status, target_value, created_by, created_at)
  values
    (v_org, 'bl16 tie satu', v_ceo, current_date, current_date+30, 'draft', '1', v_ceo, v_tie),
    (v_org, 'bl16 tie dua',  v_ceo, current_date, current_date+30, 'draft', '1', v_ceo, v_tie);

  perform set_config('request.jwt.claims',
          json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- ---- DB-96 — KONTROL POSITIF. Tanpa cursor, kedua baris tie terlihat. ----
  -- Tanpa ini seluruh assertion di bawah bisa hijau hanya karena seed tak tercari.
  select count(*) into n
  from public.search_global('bl16 tie', array['goal'], true, 30, null, null);
  if n <> 2 then
    fails := fails || 'DB-96 kontrol_positif_tanpa_cursor_bukan_2_baris(' || n || '); ';
  end if;

  -- ---- DB-97 — KONTROL KEDUA. Cursor tie dengan KEDUA bagian terisi tetap 2 baris. ----
  -- Ini yang membedakan "guard cursor separuh" dari "cursor tie rusak seluruhnya".
  select count(*) into n
  from public.search_global('bl16 tie', array['goal'], true, 30, v_tie, v_hi);
  if n <> 2 then
    fails := fails || 'DB-97 cursor_tie_lengkap_bukan_2_baris(' || n || '); ';
  end if;

  -- ---- DB-98 — INTI BL-16. ts terisi + id NULL WAJIB DITOLAK. ----
  -- Sebelum perbaikan bentuk ini mengembalikan 0 baris diam-diam (id < NULL → NULL).
  begin
    select count(*) into n
    from public.search_global('bl16 tie', array['goal'], true, 30, v_tie, null);
    fails := fails || 'DB-98 cursor_ts_tanpa_id_tidak_ditolak(mengembalikan ' || n || ' baris); ';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state <> '22023' then
      fails := fails || 'DB-98 errcode_bukan_22023(' || v_state || '); ';
    end if;
    -- FR-13: pesan WAJIB statis. Menyisipkan nilai dari baris atau dari aktor
    -- menjadikan exception bentuk-request ini sebuah oracle.
    if v_msg like '%' || v_ceo::text || '%'
       or v_msg like '%' || v_org::text || '%'
       or v_msg like '%' || v_hi::text || '%'
       or v_msg like '%bl16%' then
      fails := fails || 'DB-98 pesan_menyisipkan_nilai_aktor_atau_baris(oracle, FR-13); ';
    end if;
  end;

  -- ---- DB-99 — bentuk KEBALIKANNYA. id terisi + ts NULL juga WAJIB DITOLAK. ----
  -- Bentuk ini hari ini "aman" hanya secara kebetulan: setiap cabang menggerbangi
  -- filternya pada `p_cursor_ts is null`, sehingga cursor-nya diam-diam DIABAIKAN —
  -- pemanggil mengira ia memberi halaman, padahal menerima halaman pertama lagi.
  begin
    select count(*) into n
    from public.search_global('bl16 tie', array['goal'], true, 30, null, v_hi);
    fails := fails || 'DB-99 cursor_id_tanpa_ts_tidak_ditolak(mengembalikan ' || n || ' baris); ';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '22023' then
      fails := fails || 'DB-99 errcode_bukan_22023(' || v_state || '); ';
    end if;
  end;

  -- ---- DB-100 — kedua bagian NULL tetap SAH (bukan cursor sama sekali). ----
  -- Regresi yang paling mudah dibuat saat memperketat guard: menolak panggilan
  -- halaman pertama, yang justru bentuk paling umum.
  begin
    perform * from public.search_global('bl16 tie', array['goal'], true, 30, null, null);
  exception when others then
    fails := fails || 'DB-100 cursor_kosong_ditolak(' || sqlerrm || '); ';
  end;

  -- ---- DB-101 — guard multi-scope 0085 TIDAK BOLEH melemah. ----
  -- Cursor lengkap + lebih dari satu scope tetap ditolak; cursor lengkap + satu
  -- scope tetap diterima.
  begin
    perform * from public.search_global('bl16 tie', array['goal','task'], true, 30, v_tie, v_hi);
    fails := fails || 'DB-101 cursor_multi_scope_tidak_ditolak(regresi FR-19 0085); ';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '22023' then
      fails := fails || 'DB-101 multi_scope_errcode_bukan_22023(' || v_state || '); ';
    end if;
  end;

  begin
    perform * from public.search_global('bl16 tie', array['goal'], true, 30, v_tie, v_hi);
  exception when others then
    fails := fails || 'DB-101 cursor_satu_scope_ditolak(' || sqlerrm || '); ';
  end;

  if fails <> '' then
    raise exception 'FAIL 0089-DB-96..101: %', fails;
  end if;
  raise notice 'PASS 0089-DB-96..101: cursor sah hanya bila kedua bagian terisi atau keduanya NULL';
end $$;
rollback;
