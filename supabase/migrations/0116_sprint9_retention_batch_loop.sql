-- 0116 — Sprint 9 S9-5: retensi yang mengejar volume.
--
-- Latar:
--   * 0043 mem-purge activity_logs via single batch 10k baris per malam.
--     Dengan 94 titik penulisan aktif, jendela 12 bulan tak akan pernah
--     tercapai — arrival rate melampaui 10k/hari begitu tenant tumbuh.
--   * Tabel notifications (0008) sama sekali belum punya kebijakan retensi.
--     Notifikasi push/inbox akumulasi tanpa batas: cepat menjadi tumpukan
--     ratusan-ribu baris per organisasi aktif.
--
-- Solusi:
--   1. Buka `purge_old_activity_logs` menjadi loop batch — lanjut memotong
--      selama batch penuh, berhenti begitu sisa < batch_size (habis) atau
--      hit p_max_batches (cap agar cron run tidak jadi long transaction).
--   2. Buat `purge_old_notifications` dgn pola identik — retensi default
--      6 bulan (notifikasi lebih ephemeral daripada audit log, sudah harus
--      dibaca dalam 30-60 hari; menyimpan 6 bulan memberi buffer generous).
--   3. Jadwalkan cron nightly untuk notifications, jam sepi yang tak
--      bertabrakan dgn purge activity_logs.
--
-- Aman:
--   * Loop dilakukan per-batch, BUKAN dalam satu transaksi besar — setiap
--     iterasi DELETE terpisah, sehingga vacuum bisa masuk di antaranya dan
--     kunci tidak bertahan menit-menit.
--   * `p_max_batches` = 500 (default) × 10k = 5M baris/run — cukup untuk
--     mengejar backlog beberapa hari sekaligus, masih di bawah horizon
--     `statement_timeout` default Supabase.
--   * `p_activate_after` dipertahankan sebagai gerbang: reset ke 30 hari
--     dari deploy sprint (2026-08-27) untuk beri organisasi eksisting
--     window observasi baseline sebelum notifikasi mulai dihapus.
--   * Return int = total baris terhapus (bukan hanya batch terakhir) →
--     `cron.job_run_details` tetap merefleksikan volume sesungguhnya.

-- Drop schedule lama supaya recreate function tak orphan (schedule tidak
-- referensi definisi fungsi via oid, hanya via string — tapi rebuild
-- schedule di bawah memastikan cadence & command sinkron).
select cron.unschedule('purge-activity-logs')
where exists (select 1 from cron.job where jobname = 'purge-activity-logs');

-- Drop tanda tangan lama (3-arg) supaya penambahan `p_max_batches` tidak jadi
-- overload — `create or replace` di PostgreSQL TIDAK menggantikan lintas
-- signature, ia membuat overload baru. Overload akan bikin caller 3-arg
-- lama (0043 contract test) mendapat "function is not unique".
drop function if exists public.purge_old_activity_logs(int, int, date);

create or replace function public.purge_old_activity_logs(
  p_retention_months int default 12,
  p_batch_size int default 10000,
  p_activate_after date default '2026-08-06',
  p_max_batches int default 500
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int := 0;
  v_batch int;
  v_iter int := 0;
begin
  if current_date < p_activate_after then
    return 0;
  end if;

  if p_batch_size <= 0 or p_max_batches <= 0 then
    return 0;
  end if;

  loop
    v_iter := v_iter + 1;
    with old as (
      select id from public.activity_logs
      where created_at < now() - make_interval(months => p_retention_months)
      order by created_at
      limit p_batch_size
    )
    delete from public.activity_logs
    where id in (select id from old);

    get diagnostics v_batch = row_count;
    v_total := v_total + v_batch;

    exit when v_batch < p_batch_size or v_iter >= p_max_batches;
  end loop;

  return v_total;
end;
$$;

revoke execute on function public.purge_old_activity_logs(int, int, date, int) from public;
revoke execute on function public.purge_old_activity_logs(int, int, date, int) from authenticated;
grant execute on function public.purge_old_activity_logs(int, int, date, int) to service_role;

-- Reset schedule ke signature baru (default args tetap dipakai).
select cron.schedule(
  'purge-activity-logs',
  '0 20 * * *',
  $$select public.purge_old_activity_logs();$$
);

create or replace function public.purge_old_notifications(
  p_retention_months int default 6,
  p_batch_size int default 10000,
  p_activate_after date default '2026-08-27',
  p_max_batches int default 500
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int := 0;
  v_batch int;
  v_iter int := 0;
begin
  if current_date < p_activate_after then
    return 0;
  end if;

  if p_batch_size <= 0 or p_max_batches <= 0 then
    return 0;
  end if;

  loop
    v_iter := v_iter + 1;
    with old as (
      select id from public.notifications
      where created_at < now() - make_interval(months => p_retention_months)
      order by created_at
      limit p_batch_size
    )
    delete from public.notifications
    where id in (select id from old);

    get diagnostics v_batch = row_count;
    v_total := v_total + v_batch;

    exit when v_batch < p_batch_size or v_iter >= p_max_batches;
  end loop;

  return v_total;
end;
$$;

revoke execute on function public.purge_old_notifications(int, int, date, int) from public;
revoke execute on function public.purge_old_notifications(int, int, date, int) from authenticated;
grant execute on function public.purge_old_notifications(int, int, date, int) to service_role;

-- Jam sepi 20:30 UTC = 03:30 WIB, 30 menit setelah purge-activity-logs mulai
-- (menghindari kontensi write pool bersamaan).
select cron.schedule(
  'purge-notifications',
  '30 20 * * *',
  $$select public.purge_old_notifications();$$
);
