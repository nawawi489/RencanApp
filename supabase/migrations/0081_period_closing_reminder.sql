-- EMS — B-1 score-period-end-nudge: pengingat periode skoring akan/sudah berakhir.
-- Spec: wiki/concepts/score-period-end-nudge.md (keputusan owner 2026-07-20).
--
-- MASALAH: finalisasi periode (jembatan Score/Ranking) dan buka-periode keduanya MANUAL.
-- Tidak ada yang memberi tahu admin bahwa periode akan/sudah berakhir, sehingga gejala bug
-- lama bisa muncul kembali tanpa ada bug: periode berlalu, tombol tak ditekan, ranking tak
-- pernah terbit, dan People screen tetap menampilkan "Peringkat tampil setelah periode ditutup."
--
-- DESAIN: meniru preseden emit_deadline_notifications (0008:973) — pola yang sudah terbukti.
--   * H-7 / H-3 / H-1 sebelum period_end → pengingat "akan berakhir"
--   * period_end sudah lewat & masih 'active' → pengingat "belum difinalisasi", SETIAP HARI
--     sampai ditutup. Ini kondisi paling berbahaya (periode terlanjur lewat + terlupakan),
--     jadi justru di sinilah jaring pengamannya tidak boleh berhenti.
--   * dedupe_date = org_today(org) → partial unique uq_notifications_dedupe (0008:145)
--     menjamin SATU notifikasi per penerima per periode per hari, berapa kali pun cron jalan.
--   * Tanggal SELALU dihitung server via org_today (timezone org) — CF-3 melarang client
--     mengirim tanggal.
--
-- SENGAJA TIDAK: menyentuh periode 'draft' (belum dijalankan, bukan terlupakan); auto-finalisasi
-- (ireversibel per ADR score-period-immutability, tidak boleh dipicu timer); eskalasi ke atasan.

-- --------------------------------------------------- 1. Tipe notifikasi baru
-- Superset dari 0038 (13 tipe) + period_closing_reminder.
-- Tipe BARU (bukan reuse deadline_reminder) karena inlineAction() di notifications.tsx
-- men-hardcode href '/task/...' — reuse akan mengarahkan admin ke layar yang salah.
alter table public.notifications
  drop constraint if exists notifications_type_check,
  add constraint notifications_type_check check (type = any (array[
    'review_request','approved','rejected','deadline_reminder','repeat_due','instance_missed',
    'comment','mention','governance_warning',
    'deadline_change_requested','deadline_change_approved','deadline_change_rejected',
    'deadline_change_revision_requested',
    'period_closing_reminder'
  ]));

-- --------------------------------------------------- 2. Push whitelist
-- Tambah ke fallback fail-closed is_push_worthy (0063:225). Org tetap bisa override lewat
-- settings key notification_rule_push_types. Body lain dipertahankan verbatim.
create or replace function public.is_push_worthy(p_type text, p_org uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := coalesce(p_org, public.current_user_org());
  v_types jsonb;
begin
  if v_org is not null then
    select value into v_types
    from public.settings
    where organization_id = v_org and key = 'notification_rule_push_types';

    -- Kalau key ada DAN valid array — pakai override org.
    if v_types is not null and jsonb_typeof(v_types) = 'array' then
      return exists (select 1 from jsonb_array_elements_text(v_types) as t where t = p_type);
    end if;
  end if;

  -- Fail-closed: whitelist Fase 1 terkode (revision_requested BUKAN NotificationType — copy
  -- semantik "perlu revisi" di-cover oleh tipe 'rejected' + kolom resolution='revision_requested').
  -- 0081: + period_closing_reminder (B-1) — admin jarang membuka app tanpa alasan, sedangkan
  -- pemicu membuka app justru sering kali notifikasinya sendiri.
  return p_type = any (array[
    'review_request',
    'approved',
    'rejected',
    'deadline_reminder',
    'repeat_due',
    'instance_missed',
    'period_closing_reminder'
  ]);
end;
$$;

-- --------------------------------------------------- 3. Emitter
create or replace function public.emit_period_closing_reminders()
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_recipient uuid;
  v_selisih int;
  v_title text;
  v_body text;
  v_count int := 0;
begin
  for r in
    select ps.id, ps.organization_id, ps.period_name, ps.period_end,
           public.org_today(ps.organization_id) as today
    from public.period_snapshots ps
    where ps.status = 'active'
  loop
    v_selisih := r.period_end - r.today;

    -- Gate kadens: H-7 / H-3 / H-1, atau sudah terlewat (harian sampai difinalisasi).
    if v_selisih not in (7, 3, 1) and v_selisih >= 0 then
      continue;
    end if;

    if v_selisih >= 0 then
      v_title := 'Periode skoring akan berakhir';
      v_body := r.period_name || ' berakhir ' || v_selisih ||
                ' hari lagi. Finalisasi untuk menerbitkan peringkat.';
    else
      v_title := 'Periode skoring belum difinalisasi';
      v_body := r.period_name || ' sudah berakhir ' || abs(v_selisih) ||
                ' hari lalu. Peringkat belum terbit sampai periode difinalisasi.';
    end if;

    -- Penerima: pemegang manage_score_formula di org tsb, mengikuti semantik has_permission
    -- (0016:41-53) — CEO by role, ATAU delegasi eksplisit lewat user_permissions.
    for v_recipient in
      select p.id
      from public.profiles p
      join public.role_templates rt on rt.id = p.role_template_id
      where p.organization_id = r.organization_id
        and p.is_active
        and (
          rt.level = 'ceo'
          or exists (
            select 1
            from public.user_permissions up
            join public.permissions pr on pr.id = up.permission_id
            where up.user_id = p.id and up.granted and pr.key = 'manage_score_formula'
          )
        )
    loop
      -- dedupe_date = hari-lokal-org → satu notif per penerima per periode per hari.
      perform public.emit_notification(
        r.organization_id, v_recipient, null, 'period_closing_reminder',
        'period_snapshot', r.id, v_title, v_body, r.today);
      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.emit_period_closing_reminders() from public, anon, authenticated;

-- --------------------------------------------------- 4. Jadwal harian
-- 07:00 UTC = 14:00 WIB. Slot terpakai: 06:00 (deadline), 20:00 (purge activity),
-- 03:00 (purge push), 00:05 (backfill), */15 (overdue), */1 (push drainer).
-- Pola unschedule-dulu (0007:652) supaya migrasi idempoten saat di-apply ulang.
do $$
begin
  perform cron.unschedule('emit-period-closing-reminders');
exception when others then null;
end $$;

select cron.schedule(
  'emit-period-closing-reminders',
  '0 7 * * *',
  $$select public.emit_period_closing_reminders()$$
);
