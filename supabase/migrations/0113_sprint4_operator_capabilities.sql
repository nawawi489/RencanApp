-- =============================================================================
-- 0113 — Sprint 4: kapabilitas operator (S4-1, S4-2, S4-4, S4-5)
-- =============================================================================
-- Audit produksi menemukan lima kolom mandek: 5 tipe Card tak bisa disunting
-- pasca-buat (S4-1, S4-2), tak ada RPC yang menulis `profiles.is_active`
-- (S4-4), dan `role_template_id` hanya bisa diset sekali (S4-5). Admin
-- terpaksa `UPDATE` manual lewat SQL untuk mengoreksi salah ketik nama atau
-- memproses promosi — dukungan hari-kedua praktis mustahil.
--
-- Keputusan yang diambil di sini, agar tidak perlu ditebak ulang nanti:
--
--   • Field TERKUNCI pasca-aktivasi = dasar perhitungan skor. Menggesernya
--     setelah skor dihitung membuat angka historis tidak konsisten dengan
--     periodenya. Yang dikunci: periode (start/end/deadline/deadline_time),
--     target/contribution_pct, aturan submit (evidence_required,
--     result_value_required), dan parent (initiative_id/strategy_id/
--     action_plan_id — pindah parent = archive + recreate). Perubahan
--     deadline pasca-aktif tetap bisa lewat Deadline Change Request (S3-4).
--     RPC MENOLAK eksplisit dengan pesan spesifik, bukan mengabaikan diam-
--     diam — pemanggil harus tahu perubahannya tidak tersimpan (pola sama
--     dengan `update_goal` 0093:167).
--
--   • Kewenangan sunting Card = kewenangan aktivasinya. Menyunting Card
--     aktif setara beratnya dengan mengaktifkannya, jadi gerbang otorisasi
--     TIDAK boleh lebih longgar. `manage_others_cards` jadi override
--     administratif, konsisten dengan `activate_task` 0109 dan `update_goal`.
--
--   • `set_user_active` gate `manage_users_permissions`, bukan
--     `create_department` seperti `set_department_active` — pengguna dan
--     departemen dua kewenangan berbeda (menonaktifkan orang jauh lebih
--     berdampak). ANTI SELF-DEACTIVATE: mengunci diri sendiri = admin
--     terakhir bisa terkunci total tanpa jalur pulih. `update_user_role` ANTI
--     SELF-PROMOTE: eskalasi role diri sendiri adalah vektor serangan
--     insider klasik (siapa saja dengan `manage_users_permissions` bisa
--     memberi diri semua permission via role).
--
--   • Contract nama field JAUH lebih penting dari nama parameter — tapi tetap
--     dibuat konsisten dgn create_*_idempotent (0103) supaya diff patch dan
--     RPC sunting nyaman dibaca berdampingan.
-- =============================================================================

-- ============================================================ 1. update_task (S4-1)
create or replace function public.update_task(
  p_task_id uuid,
  p_name text,
  p_description text,
  p_pic_id uuid,
  p_reviewer_id uuid,
  p_priority text,
  p_start_date date,
  p_deadline date,
  p_deadline_time text,
  p_expected_output text,
  p_definition_of_done text,
  p_evidence_description text
) returns void language plpgsql security definer set search_path = '' as $$
declare t public.tasks; v_org uuid; v_name text; v_changed text[] := '{}';
begin
  v_org := public.current_user_org();
  select * into t from public.tasks where id = p_task_id and organization_id = v_org;
  if not found then raise exception 'Tugas tidak ditemukan.'; end if;

  if not (t.created_by = auth.uid() or t.pic_id = auth.uid() or t.reviewer_id = auth.uid()
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengubah Tugas ini.';
  end if;
  if t.status not in ('draft', 'assigned', 'in_progress', 'submitted', 'revision') then
    raise exception 'Tugas berstatus % tidak bisa diubah.', t.status;
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then raise exception 'Nama Tugas wajib diisi.'; end if;

  -- PIC & reviewer harus anggota organisasi yang sama & aktif (mirror update_goal).
  if p_pic_id is not null and not exists (
    select 1 from public.profiles p
     where p.id = p_pic_id and p.organization_id = v_org and p.is_active
  ) then
    raise exception 'PIC harus anggota organisasi yang sama dan aktif.';
  end if;
  if p_reviewer_id is not null and not exists (
    select 1 from public.profiles p
     where p.id = p_reviewer_id and p.organization_id = v_org and p.is_active
  ) then
    raise exception 'Reviewer harus anggota organisasi yang sama dan aktif.';
  end if;

  -- Periode & deadline terkunci pasca-draft. Ubah deadline pasca-aktif lewat DCR (S3-4).
  if t.status <> 'draft' then
    if p_start_date is distinct from t.start_date then
      raise exception 'Tanggal mulai Tugas terkunci setelah aktivasi.';
    end if;
    if p_deadline is distinct from t.deadline
       or p_deadline_time is distinct from t.deadline_time then
      raise exception 'Deadline Tugas terkunci setelah aktivasi. Gunakan Ajukan Ubah Deadline.';
    end if;
  end if;

  if v_name is distinct from t.name then v_changed := v_changed || 'name'::text; end if;
  if nullif(trim(coalesce(p_description,'')),'') is distinct from t.description then
    v_changed := v_changed || 'description'::text;
  end if;
  if p_pic_id is distinct from t.pic_id then v_changed := v_changed || 'pic_id'::text; end if;
  if p_reviewer_id is distinct from t.reviewer_id then
    v_changed := v_changed || 'reviewer_id'::text;
  end if;
  if nullif(trim(coalesce(p_priority,'')),'') is distinct from t.priority then
    v_changed := v_changed || 'priority'::text;
  end if;
  if p_start_date is distinct from t.start_date then
    v_changed := v_changed || 'start_date'::text;
  end if;
  if p_deadline is distinct from t.deadline
     or nullif(trim(coalesce(p_deadline_time,'')),'') is distinct from t.deadline_time then
    v_changed := v_changed || 'deadline'::text;
  end if;
  if nullif(trim(coalesce(p_expected_output,'')),'') is distinct from t.expected_output then
    v_changed := v_changed || 'expected_output'::text;
  end if;
  if nullif(trim(coalesce(p_definition_of_done,'')),'') is distinct from t.definition_of_done then
    v_changed := v_changed || 'definition_of_done'::text;
  end if;
  if nullif(trim(coalesce(p_evidence_description,'')),'') is distinct from t.evidence_description then
    v_changed := v_changed || 'evidence_description'::text;
  end if;

  update public.tasks
     set name                 = v_name,
         description          = nullif(trim(coalesce(p_description,'')),''),
         pic_id               = p_pic_id,
         reviewer_id          = p_reviewer_id,
         priority             = nullif(trim(coalesce(p_priority,'')),''),
         start_date           = p_start_date,
         deadline             = p_deadline,
         deadline_time        = nullif(trim(coalesce(p_deadline_time,'')),''),
         expected_output      = nullif(trim(coalesce(p_expected_output,'')),''),
         definition_of_done   = nullif(trim(coalesce(p_definition_of_done,'')),''),
         evidence_description = nullif(trim(coalesce(p_evidence_description,'')),'')
   where id = p_task_id;

  perform public.write_activity('task', p_task_id, 'update',
    jsonb_build_object('fields', v_changed, 'status', t.status));
end;
$$;

revoke execute on function public.update_task(uuid, text, text, uuid, uuid, text, date, date, text, text, text, text) from public, anon;
grant execute on function public.update_task(uuid, text, text, uuid, uuid, text, date, date, text, text, text, text) to authenticated;

-- ============================================================ 2. update_action_plan (S4-2a)
create or replace function public.update_action_plan(
  p_action_plan_id uuid,
  p_name text,
  p_description text,
  p_pic_id uuid,
  p_target_result text,
  p_period_start date,
  p_period_end date
) returns void language plpgsql security definer set search_path = '' as $$
declare ap public.action_plans; v_org uuid; v_name text; v_changed text[] := '{}';
begin
  v_org := public.current_user_org();
  select * into ap from public.action_plans
   where id = p_action_plan_id and organization_id = v_org;
  if not found then raise exception 'Rencana Aksi tidak ditemukan.'; end if;

  if not (ap.created_by = auth.uid() or ap.pic_id = auth.uid()
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengubah Rencana Aksi ini.';
  end if;
  if ap.status not in ('draft', 'active') then
    raise exception 'Rencana Aksi berstatus % tidak bisa diubah.', ap.status;
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then raise exception 'Nama Rencana Aksi wajib diisi.'; end if;

  if p_pic_id is not null and not exists (
    select 1 from public.profiles p
     where p.id = p_pic_id and p.organization_id = v_org and p.is_active
  ) then
    raise exception 'PIC harus anggota organisasi yang sama dan aktif.';
  end if;

  -- Periode & target terkunci pasca-aktivasi (dasar skor).
  if ap.status <> 'draft' then
    if p_period_start is distinct from ap.period_start
       or p_period_end is distinct from ap.period_end then
      raise exception 'Periode Rencana Aksi terkunci setelah aktivasi.';
    end if;
    if nullif(trim(coalesce(p_target_result,'')),'') is distinct from ap.target_result then
      raise exception 'Target hasil Rencana Aksi terkunci setelah aktivasi.';
    end if;
  end if;

  if p_period_start is not null and p_period_end is not null
     and p_period_end < p_period_start then
    raise exception 'Periode selesai tidak boleh mendahului periode mulai.';
  end if;

  if v_name is distinct from ap.name then v_changed := v_changed || 'name'::text; end if;
  if nullif(trim(coalesce(p_description,'')),'') is distinct from ap.description then
    v_changed := v_changed || 'description'::text;
  end if;
  if p_pic_id is distinct from ap.pic_id then v_changed := v_changed || 'pic_id'::text; end if;
  if nullif(trim(coalesce(p_target_result,'')),'') is distinct from ap.target_result then
    v_changed := v_changed || 'target_result'::text;
  end if;
  if p_period_start is distinct from ap.period_start
     or p_period_end is distinct from ap.period_end then
    v_changed := v_changed || 'period'::text;
  end if;

  update public.action_plans
     set name          = v_name,
         description   = nullif(trim(coalesce(p_description,'')),''),
         pic_id        = p_pic_id,
         target_result = nullif(trim(coalesce(p_target_result,'')),''),
         period_start  = p_period_start,
         period_end    = p_period_end
   where id = p_action_plan_id;

  perform public.write_activity('action_plan', p_action_plan_id, 'update',
    jsonb_build_object('fields', v_changed, 'status', ap.status));
end;
$$;

revoke execute on function public.update_action_plan(uuid, text, text, uuid, text, date, date) from public, anon;
grant execute on function public.update_action_plan(uuid, text, text, uuid, text, date, date) to authenticated;

-- ============================================================ 3. update_initiative (S4-2b)
create or replace function public.update_initiative(
  p_initiative_id uuid,
  p_name text,
  p_description text,
  p_pic_id uuid,
  p_reason text,
  p_main_risk text,
  p_alternative text,
  p_contribution_pct numeric,
  p_period_start date,
  p_period_end date
) returns void language plpgsql security definer set search_path = '' as $$
declare i public.initiatives; v_org uuid; v_name text; v_changed text[] := '{}';
begin
  v_org := public.current_user_org();
  select * into i from public.initiatives
   where id = p_initiative_id and organization_id = v_org;
  if not found then raise exception 'Inisiatif tidak ditemukan.'; end if;

  if not (i.created_by = auth.uid() or i.pic_id = auth.uid()
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengubah Inisiatif ini.';
  end if;
  if i.status not in ('draft', 'active') then
    raise exception 'Inisiatif berstatus % tidak bisa diubah.', i.status;
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then raise exception 'Nama Inisiatif wajib diisi.'; end if;

  if p_pic_id is not null and not exists (
    select 1 from public.profiles p
     where p.id = p_pic_id and p.organization_id = v_org and p.is_active
  ) then
    raise exception 'PIC harus anggota organisasi yang sama dan aktif.';
  end if;

  -- Periode & contribution_pct terkunci pasca-aktivasi (dasar skor).
  if i.status <> 'draft' then
    if p_period_start is distinct from i.period_start
       or p_period_end is distinct from i.period_end then
      raise exception 'Periode Inisiatif terkunci setelah aktivasi.';
    end if;
    if p_contribution_pct is distinct from i.contribution_pct then
      raise exception 'Kontribusi Inisiatif terkunci setelah aktivasi.';
    end if;
  end if;

  if p_period_start is not null and p_period_end is not null
     and p_period_end < p_period_start then
    raise exception 'Periode selesai tidak boleh mendahului periode mulai.';
  end if;

  if v_name is distinct from i.name then v_changed := v_changed || 'name'::text; end if;
  if nullif(trim(coalesce(p_description,'')),'') is distinct from i.description then
    v_changed := v_changed || 'description'::text;
  end if;
  if p_pic_id is distinct from i.pic_id then v_changed := v_changed || 'pic_id'::text; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is distinct from i.reason then
    v_changed := v_changed || 'reason'::text;
  end if;
  if nullif(trim(coalesce(p_main_risk,'')),'') is distinct from i.main_risk then
    v_changed := v_changed || 'main_risk'::text;
  end if;
  if nullif(trim(coalesce(p_alternative,'')),'') is distinct from i.alternative then
    v_changed := v_changed || 'alternative'::text;
  end if;
  if p_contribution_pct is distinct from i.contribution_pct then
    v_changed := v_changed || 'contribution_pct'::text;
  end if;
  if p_period_start is distinct from i.period_start
     or p_period_end is distinct from i.period_end then
    v_changed := v_changed || 'period'::text;
  end if;

  update public.initiatives
     set name             = v_name,
         description      = nullif(trim(coalesce(p_description,'')),''),
         pic_id           = p_pic_id,
         reason           = nullif(trim(coalesce(p_reason,'')),''),
         main_risk        = nullif(trim(coalesce(p_main_risk,'')),''),
         alternative      = nullif(trim(coalesce(p_alternative,'')),''),
         contribution_pct = p_contribution_pct,
         period_start     = p_period_start,
         period_end       = p_period_end
   where id = p_initiative_id;

  perform public.write_activity('initiative', p_initiative_id, 'update',
    jsonb_build_object('fields', v_changed, 'status', i.status));
end;
$$;

revoke execute on function public.update_initiative(uuid, text, text, uuid, text, text, text, numeric, date, date) from public, anon;
grant execute on function public.update_initiative(uuid, text, text, uuid, text, text, text, numeric, date, date) to authenticated;

-- ============================================================ 4. set_user_active (S4-4)
create or replace function public.set_user_active(
  p_target_user_id uuid, p_active boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_row public.profiles; v_actor uuid := auth.uid();
begin
  if not public.has_permission('manage_users_permissions') then
    raise exception 'Anda tidak berwenang mengelola pengguna.';
  end if;
  if p_active is null then
    raise exception 'Status aktif wajib diisi.';
  end if;
  -- ANTI SELF-DEACTIVATE: satu admin bisa menonaktifkan dirinya sendiri dan
  -- (bila admin terakhir) mengunci seluruh organisasi. Cek sederhana dulu;
  -- last-admin check ditambahkan bila insiden benar terjadi.
  if p_target_user_id = v_actor and p_active is false then
    raise exception 'Anda tidak bisa menonaktifkan akun Anda sendiri.';
  end if;

  v_org := public.current_user_org();
  select * into v_row from public.profiles
   where id = p_target_user_id and organization_id = v_org;
  if not found then
    raise exception 'Pengguna tidak ditemukan di organisasi ini.';
  end if;

  if v_row.is_active = p_active then
    return; -- idempoten: no-op, tidak ada activity log spam
  end if;

  update public.profiles
     set is_active = p_active, updated_at = now()
   where id = p_target_user_id and organization_id = v_org;

  perform public.write_activity(
    'profile', p_target_user_id,
    case when p_active then 'user_activated' else 'user_deactivated' end,
    jsonb_build_object('name', v_row.full_name, 'email', v_row.email)
  );
end;
$$;

revoke execute on function public.set_user_active(uuid, boolean) from public, anon;
grant execute on function public.set_user_active(uuid, boolean) to authenticated;

-- ============================================================ 5. update_user_role (S4-5)
create or replace function public.update_user_role(
  p_target_user_id uuid, p_role_template_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_row public.profiles;
  v_actor uuid := auth.uid();
  v_new_name text;
  v_old_name text;
begin
  if not public.has_permission('manage_users_permissions') then
    raise exception 'Anda tidak berwenang mengelola role pengguna.';
  end if;
  if p_role_template_id is null then
    raise exception 'Role template wajib diisi.';
  end if;
  -- ANTI SELF-PROMOTE: siapa saja dengan manage_users_permissions bisa
  -- menaikkan role diri ke apa pun. Ditolak eksplisit.
  if p_target_user_id = v_actor then
    raise exception 'Anda tidak bisa mengubah role Anda sendiri.';
  end if;

  v_org := public.current_user_org();
  select * into v_row from public.profiles
   where id = p_target_user_id and organization_id = v_org;
  if not found then
    raise exception 'Pengguna tidak ditemukan di organisasi ini.';
  end if;

  -- Role template WAJIB milik organisasi yang sama.
  select name into v_new_name from public.role_templates
   where id = p_role_template_id and organization_id = v_org;
  if v_new_name is null then
    raise exception 'Role template tidak ditemukan di organisasi ini.';
  end if;

  if v_row.role_template_id = p_role_template_id then
    return; -- idempoten
  end if;

  select name into v_old_name from public.role_templates
   where id = v_row.role_template_id;

  update public.profiles
     set role_template_id = p_role_template_id, updated_at = now()
   where id = p_target_user_id and organization_id = v_org;

  perform public.write_activity(
    'profile', p_target_user_id, 'role_reassigned',
    jsonb_build_object(
      'name', v_row.full_name,
      'email', v_row.email,
      'old_role_id', v_row.role_template_id,
      'old_role_name', v_old_name,
      'new_role_id', p_role_template_id,
      'new_role_name', v_new_name
    )
  );
end;
$$;

revoke execute on function public.update_user_role(uuid, uuid) from public, anon;
grant execute on function public.update_user_role(uuid, uuid) to authenticated;
