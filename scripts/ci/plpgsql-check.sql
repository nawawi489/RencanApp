-- S3-3 — plpgsql_check gate (Sprint 3).
--
-- Jalankan `plpgsql_check_function_tb` atas SELURUH fungsi plpgsql di skema
-- `public` dan gagalkan bila ada issue level `error`. Ini gerbang paling
-- berdaya-ungkit terhadap seluruh kelas bug rename (0045 initiatives→
-- action_plans, `deadline`→`tasks`, dst.): badan `create or replace function`
-- tidak diperiksa saat dibuat, jadi kolom hilang / rename yang bocor lolos
-- sampai runtime. plpgsql_check menemukannya di CI.
--
-- Level:
--   - `error`   → gate merah (kolom tidak ada, tipe tak kompatibel, dll.)
--   - `warning` → dilog `notice`, TIDAK menggagalkan build (nanti mungkin,
--                 tapi buat baseline dulu supaya PR normal tidak merah
--                 karena warning legacy).
--   - `performance` / `security` → ignore untuk gate ini.
--
-- Skema lain (`auth`, `storage`, `graphql`, `extensions`, `net`, `pgsodium`,
-- ...) tidak ikut — kita hanya berwenang atas `public`.

create extension if not exists plpgsql_check;

do $$
declare
  err_count int;
  warn_count int;
  detail record;
begin
  -- Warnings dilog ke `notice` supaya kelihatan di log CI tanpa memerahkan build.
  warn_count := 0;
  for detail in
    select p.proname, chk.lineno, chk.statement, chk.message
    from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace,
      lateral plpgsql_check_function_tb(p.oid) chk
    where n.nspname = 'public'
      and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
      and chk.level = 'warning'
    order by p.proname, chk.lineno
  loop
    warn_count := warn_count + 1;
    raise notice 'plpgsql_check WARNING %.% (line %, stmt %): %',
      'public', detail.proname, detail.lineno, detail.statement, detail.message;
  end loop;
  if warn_count > 0 then
    raise notice 'plpgsql_check: % warning(s) total (non-blocking).', warn_count;
  end if;

  -- Errors dikumpulkan dulu supaya SEMUA muncul di log sebelum gate merah,
  -- bukan cuma yang pertama.
  --
  -- Allowlist false-positive (per-function, per-substring pesan). Setiap entri
  -- WAJIB punya komentar rasional. Kalau baris di sini tumbuh > 5, refactor
  -- fungsi yang bermasalah — jangan tambahkan allowlist.
  --
  -- ⋮ calculate_period_scores: fungsi membuat `create temporary table
  --   pg_temp._calc_metrics` di runtime lalu SELECT dari sana. plpgsql_check
  --   tidak menjalankan CREATE, hanya statik-check, sehingga tabel dianggap
  --   tidak ada. Perilaku produksi baik-baik saja (0100_calculate_period_scores_setbased.sql).
  err_count := 0;
  for detail in
    select p.proname, chk.lineno, chk.statement, chk.message
    from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace,
      lateral plpgsql_check_function_tb(p.oid) chk
    where n.nspname = 'public'
      and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
      and chk.level = 'error'
      and not (
        p.proname = 'calculate_period_scores'
        and chk.message like '%pg_temp._calc_metrics%'
      )
    order by p.proname, chk.lineno
  loop
    err_count := err_count + 1;
    raise warning 'plpgsql_check ERROR %.% (line %, stmt %): %',
      'public', detail.proname, detail.lineno, detail.statement, detail.message;
  end loop;

  if err_count > 0 then
    raise exception 'plpgsql_check gate: % error(s) di fungsi plpgsql skema public. Lihat log di atas.', err_count;
  end if;
  raise notice 'plpgsql_check gate: OK (0 error, % warning).', warn_count;
end $$;
