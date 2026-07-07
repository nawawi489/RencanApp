-- 0043 — Retention purge activity_logs (12 bulan, batch 10k/run, pg_cron nightly).
--
-- Latar: activity_logs (0005) append-only audit RPC mutasi (94 write_activity call
-- site di 22 migrasi). Tumbuh linear. Index (0042) menutup pola baca kronologis
-- admin, tapi tak menutup biaya storage + waktu backup restore untuk baris yang
-- praktis tak pernah dilihat lagi.
--
-- Window 12 bulan: cukup untuk siklus review tahunan HR (annual appraisal,
-- audit periode kalender). Data compliance-relevan (penalty override, close
-- period, governance violation) SUDAH terpisah di governance_violations (Fase 8)
-- yang TIDAK ikut purge — tabel itu punya kebijakan retensi sendiri.
--
-- Activation delay: parameter `p_activate_after` default 2026-08-06 (30 hari dari
-- deploy 2026-07-07). Selama window ini fungsi no-op — kita observasi baseline
-- growth curve dulu sebelum delete pertama jalan. Owner boleh mempercepat via
-- `select cron.schedule('purge-activity-logs', '...', 'select purge_old_activity_logs(12,10000,now()::date)')`
-- atau langsung memanggil fungsi dengan `p_activate_after => now()::date`.
--
-- Aman:
--   * Batch LIMIT 10k → cegah lock panjang tabel besar (>1M row)
--   * SECURITY DEFINER + revoke authenticated → RLS user tidak bisa hapus
--   * Grant hanya ke service_role (dipanggil cron internal) → tak bocor RPC user
--   * Return row_count → cron.job_run_details mencatat berapa row dihapus
--   * IF NOT EXISTS di extension → idempoten (rerun migrate up aman)

create extension if not exists pg_cron;

create or replace function public.purge_old_activity_logs(
  p_retention_months int default 12,
  p_batch_size int default 10000,
  p_activate_after date default '2026-08-06'
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count int;
begin
  -- Delayed activation: baseline observation window sebelum delete pertama.
  if current_date < p_activate_after then
    return 0;
  end if;

  -- Batch delete via CTE — PostgreSQL DELETE tak dukung LIMIT langsung.
  -- ORDER BY created_at agar batch pertama ambil yang paling tua (deterministic).
  with old as (
    select id from public.activity_logs
    where created_at < now() - make_interval(months => p_retention_months)
    order by created_at
    limit p_batch_size
  )
  delete from public.activity_logs
  where id in (select id from old);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke execute on function public.purge_old_activity_logs(int, int, date) from public;
revoke execute on function public.purge_old_activity_logs(int, int, date) from authenticated;
grant execute on function public.purge_old_activity_logs(int, int, date) to service_role;

-- Jadwal harian 20:00 UTC = 03:00 WIB. Jam sepi + tidak konflik dengan job lain:
--   * mark-overdue-instances (0007)      : */15 * * * *
--   * backfill-instances (0007)          : 5 0 * * *   (00:05 UTC)
--   * emit-deadline-notifications (0008) : 0 6 * * *   (06:00 UTC = 13:00 WIB)
select cron.schedule(
  'purge-activity-logs',
  '0 20 * * *',
  $$select public.purge_old_activity_logs();$$
);
