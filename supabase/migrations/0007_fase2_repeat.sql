-- EMS V1.8.1 — Fase 2: Action Plan Repeat
-- Repeat = setting pada action_plans (bukan entity baru). Menambah:
--   action_plan_repeat_rules (1/Action Plan) + action_plan_instances (pekerjaan terjadwal).
-- Loop eksekusi per-instance memakai pola Fase 1 (submission versioning, evidence locking,
-- anti-self-approval) tetapi terhadap snapshot pic/reviewer kolom instance.
-- Job sistem (pg_cron) menandai instance Terlewat + backfill. Compliance = metrik read-only.
-- Spec: specs/fase-2-action-plan-repeat.md (K1..K8).

-- ============================================================ ALTER tabel existing

-- K5: timezone organisasi (deadline_at dihitung pada zona ini). Tidak ada di 0001.
alter table public.organizations
  add column if not exists timezone text not null default 'Asia/Jakarta';

-- K8: severity governance violation. Tidak ada di 0005.
alter table public.governance_violations
  add column if not exists severity text
  check (severity in ('low', 'medium', 'high', 'critical'));

-- ============================================================ TABEL: repeat rules

create table if not exists public.action_plan_repeat_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  action_plan_id uuid not null references public.action_plans (id) on delete cascade,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'custom')),
  weekdays int[],            -- frequency='weekly' (0=Min..6=Sab)
  month_days int[],          -- frequency='monthly' (1..31)
  custom_dates date[],       -- frequency='custom'
  repeat_start_date date not null,
  repeat_end_date date not null,
  time_of_day time not null,
  missed_rule text not null default 'strict'
    check (missed_rule in ('strict', 'grace_period', 'overdue_allowed')),
  grace_period_minutes int,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (action_plan_id),
  constraint repeat_rules_period_order check (repeat_start_date <= repeat_end_date),
  constraint repeat_rules_grace_consistency check (
    (missed_rule = 'grace_period' and grace_period_minutes is not null and grace_period_minutes > 0)
    or (missed_rule <> 'grace_period' and grace_period_minutes is null)),
  constraint repeat_rules_custom_dates check (
    frequency <> 'custom' or (custom_dates is not null and array_length(custom_dates, 1) > 0)),
  constraint repeat_rules_weekly_days check (
    frequency <> 'weekly' or (weekdays is not null and array_length(weekdays, 1) > 0)),
  constraint repeat_rules_monthly_days check (
    frequency <> 'monthly' or (month_days is not null and array_length(month_days, 1) > 0))
);

-- ============================================================ TABEL: instances

create table if not exists public.action_plan_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  action_plan_id uuid not null references public.action_plans (id) on delete cascade,
  repeat_rule_id uuid not null references public.action_plan_repeat_rules (id) on delete cascade,
  instance_date date not null,
  instance_time time not null,                 -- snapshot rule.time_of_day
  deadline_at timestamptz not null,            -- instance_date + instance_time @ org timezone
  pic_id uuid references public.profiles (id) on delete set null,        -- snapshot immutable
  reviewer_id uuid references public.profiles (id) on delete set null,   -- snapshot immutable
  status text not null default 'assigned'
    check (status in ('assigned', 'in_progress', 'submitted', 'done', 'revision', 'missed', 'archived')),
  current_submission_id uuid,                  -- FK ditambah setelah kolom submissions diperluas
  missed_reason text,
  submitted_at timestamptz,
  submitted_late boolean not null default false,
  late_minutes int,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (action_plan_id, instance_date),
  -- K4: anti-self-approval di level instance (constraint parent tidak melindungi baris ini).
  constraint instances_pic_ne_reviewer
    check (pic_id is null or reviewer_id is null or pic_id <> reviewer_id)
);

-- ============================================================ K7: submission ↔ instance + versioning per-instance

alter table public.action_plan_submissions
  add column if not exists action_plan_instance_id uuid
  references public.action_plan_instances (id) on delete cascade;

-- FK instance.current_submission_id → submissions (kini kolom submissions ada).
alter table public.action_plan_instances
  drop constraint if exists action_plan_instances_current_submission_fk;
alter table public.action_plan_instances
  add constraint action_plan_instances_current_submission_fk
  foreign key (current_submission_id) references public.action_plan_submissions (id) on delete set null;

-- Ganti unique(action_plan_id, version_number) dengan 2 partial unique:
--   one-time → versi unik per action_plan; per-instance → versi unik per instance.
alter table public.action_plan_submissions
  drop constraint if exists action_plan_submissions_action_plan_id_version_number_key;

create unique index if not exists uq_submission_version_onetime
  on public.action_plan_submissions (action_plan_id, version_number)
  where action_plan_instance_id is null;

create unique index if not exists uq_submission_version_instance
  on public.action_plan_submissions (action_plan_instance_id, version_number)
  where action_plan_instance_id is not null;

-- ============================================================ INDEX

create index if not exists idx_repeat_rules_action_plan on public.action_plan_repeat_rules (action_plan_id);
create index if not exists idx_instances_action_plan on public.action_plan_instances (action_plan_id);
create index if not exists idx_instances_pic on public.action_plan_instances (pic_id);
create index if not exists idx_instances_reviewer on public.action_plan_instances (reviewer_id);
create index if not exists idx_instances_deadline on public.action_plan_instances (deadline_at)
  where status in ('assigned', 'in_progress');
create index if not exists idx_submissions_instance on public.action_plan_submissions (action_plan_instance_id);

-- updated_at otomatis.
drop trigger if exists repeat_rules_set_updated_at on public.action_plan_repeat_rules;
create trigger repeat_rules_set_updated_at
  before update on public.action_plan_repeat_rules
  for each row execute function public.set_updated_at();

drop trigger if exists instances_set_updated_at on public.action_plan_instances;
create trigger instances_set_updated_at
  before update on public.action_plan_instances
  for each row execute function public.set_updated_at();

-- ============================================================ ACTIVITY LOG (konteks sistem/cron)

-- write_activity Fase 1 memakai auth.uid()/current_user_org() yang NULL di konteks cron.
-- Versi sistem menerima org/actor eksplisit dan menandai detail.source='system_cron' (AC-27).
create or replace function public.write_activity_system(
  p_org uuid, p_actor uuid, p_entity_type text, p_entity_id uuid, p_action text, p_detail jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, detail)
  values (p_org, p_actor, p_entity_type, p_entity_id, p_action,
          coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('source', 'system_cron'));
end;
$$;

revoke execute on function public.write_activity_system(uuid, uuid, text, uuid, text, jsonb)
  from public, anon, authenticated;

-- ============================================================ RPC: konfigurasi repeat rule

-- Upsert repeat rule + set action_plans.repeat_setting='repeat'.
-- Immutability guard (K4/FR-A5): rule terkunci begitu instance lahir.
create or replace function public.set_action_plan_repeat_rule(
  p_action_plan_id uuid,
  p_frequency text,
  p_weekdays int[],
  p_month_days int[],
  p_custom_dates date[],
  p_repeat_start_date date,
  p_repeat_end_date date,
  p_time_of_day time,
  p_missed_rule text,
  p_grace_period_minutes int
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  a public.action_plans;
  v_rule_id uuid;
begin
  select * into a from public.action_plans where id = p_action_plan_id;
  if not found then raise exception 'Action Plan tidak ditemukan.'; end if;
  if not (a.created_by = auth.uid() or public.has_permission('manage_others_cards')
          or exists (select 1 from public.initiatives i where i.id = a.initiative_id and i.pic_id = auth.uid())) then
    raise exception 'Anda tidak berwenang mengatur Repeat untuk Action Plan ini.';
  end if;

  -- Terkunci bila sudah ada instance (periode berjalan tak boleh diubah diam-diam).
  if exists (select 1 from public.action_plan_instances ins where ins.action_plan_id = p_action_plan_id) then
    raise exception 'Repeat Rule terkunci: instance sudah dibuat untuk Action Plan ini.';
  end if;

  insert into public.action_plan_repeat_rules
    (organization_id, action_plan_id, frequency, weekdays, month_days, custom_dates,
     repeat_start_date, repeat_end_date, time_of_day, missed_rule, grace_period_minutes, created_by)
  values
    (a.organization_id, p_action_plan_id, p_frequency,
     nullif(p_weekdays, '{}'::int[]), nullif(p_month_days, '{}'::int[]), nullif(p_custom_dates, '{}'::date[]),
     p_repeat_start_date, p_repeat_end_date, p_time_of_day, p_missed_rule, p_grace_period_minutes, auth.uid())
  on conflict (action_plan_id) do update
    set frequency = excluded.frequency,
        weekdays = excluded.weekdays,
        month_days = excluded.month_days,
        custom_dates = excluded.custom_dates,
        repeat_start_date = excluded.repeat_start_date,
        repeat_end_date = excluded.repeat_end_date,
        time_of_day = excluded.time_of_day,
        missed_rule = excluded.missed_rule,
        grace_period_minutes = excluded.grace_period_minutes,
        updated_at = now()
  returning id into v_rule_id;

  update public.action_plans set repeat_setting = 'repeat' where id = p_action_plan_id;

  perform public.write_activity('action_plan', p_action_plan_id, 'set_repeat_rule',
    jsonb_build_object('rule_id', v_rule_id, 'frequency', p_frequency));

  return v_rule_id;
end;
$$;

-- ============================================================ RPC: generate instances (eager + cron backfill)

-- p_action_plan_id NOT NULL → eager (dipanggil dari activate, seluruh periode).
-- p_action_plan_id NULL     → cron-wide backfill untuk semua repeat aktif s/d p_through_date.
-- Idempoten via unique(action_plan_id, instance_date) + on conflict do nothing.
create or replace function public.generate_action_plan_instances(
  p_action_plan_id uuid, p_through_date date
) returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_through date;
  v_tz text;
  v_total int := 0;
  v_ins int;
begin
  for r in
    select rr.*, a.pic_id as ap_pic, a.reviewer_id as ap_reviewer, a.organization_id as ap_org
    from public.action_plan_repeat_rules rr
    join public.action_plans a on a.id = rr.action_plan_id
    where (p_action_plan_id is not null and rr.action_plan_id = p_action_plan_id)
       or (p_action_plan_id is null and a.repeat_setting = 'repeat' and a.status = 'in_progress')
  loop
    v_through := least(r.repeat_end_date, coalesce(p_through_date, r.repeat_end_date));
    if v_through < r.repeat_start_date then continue; end if;

    select coalesce(o.timezone, 'Asia/Jakarta') into v_tz
      from public.organizations o where o.id = r.ap_org;

    with candidate as (
      select g::date as instance_date
      from generate_series(r.repeat_start_date::timestamp, v_through::timestamp, interval '1 day') as g
      where r.frequency = 'daily'
         or (r.frequency = 'weekly'  and extract(dow from g)::int = any (r.weekdays))
         or (r.frequency = 'monthly' and extract(day from g)::int = any (r.month_days))
      union
      select cd
      from unnest(coalesce(r.custom_dates, '{}'::date[])) as cd
      where r.frequency = 'custom' and cd between r.repeat_start_date and v_through
    )
    insert into public.action_plan_instances
      (organization_id, action_plan_id, repeat_rule_id, instance_date, instance_time,
       deadline_at, pic_id, reviewer_id, status)
    select r.ap_org, r.action_plan_id, r.id, c.instance_date, r.time_of_day,
           (c.instance_date + r.time_of_day) at time zone v_tz,
           r.ap_pic, r.ap_reviewer, 'assigned'
    from candidate c
    on conflict (action_plan_id, instance_date) do nothing;

    get diagnostics v_ins = row_count;
    v_total := v_total + v_ins;
  end loop;

  -- Logging hanya untuk eager (konteks user); cron memakai write_activity_system di mark-overdue.
  if p_action_plan_id is not null and v_total > 0 then
    perform public.write_activity('action_plan', p_action_plan_id, 'instances_generated',
      jsonb_build_object('count', v_total));
  end if;

  return v_total;
end;
$$;

-- ============================================================ RPC: aktivasi (cabang repeat)

-- Aktifkan Action Plan. Cabang repeat: validasi rule, set in_progress, generate eager.
create or replace function public.activate_action_plan(p_action_plan_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.action_plans;
  rule public.action_plan_repeat_rules;
  v_count int;
begin
  select * into a from public.action_plans where id = p_action_plan_id;
  if not found then raise exception 'Action Plan tidak ditemukan.'; end if;
  if not (a.created_by = auth.uid() or public.has_permission('manage_others_cards')
          or exists (select 1 from public.initiatives i where i.id = a.initiative_id and i.pic_id = auth.uid())) then
    raise exception 'Anda tidak berwenang mengaktifkan Action Plan ini.';
  end if;
  if a.status <> 'draft' then raise exception 'Action Plan sudah diaktifkan.'; end if;
  if a.pic_id = a.reviewer_id then
    raise exception 'PIC dan Reviewer tidak boleh orang yang sama.';
  end if;

  -- Cabang REPEAT: deadline dari repeat rule, bukan action_plans.deadline.
  if a.repeat_setting = 'repeat' then
    select * into rule from public.action_plan_repeat_rules where action_plan_id = p_action_plan_id;
    if not found then raise exception 'Repeat Rule belum diatur untuk Action Plan ini.'; end if;
    if coalesce(trim(a.name), '') = '' or a.pic_id is null or a.reviewer_id is null
       or coalesce(trim(a.expected_output), '') = '' or coalesce(trim(a.definition_of_done), '') = ''
       or a.priority is null then
      raise exception 'Kelengkapan Action Plan belum terpenuhi (nama, PIC, Reviewer, output, definition of done, prioritas wajib).';
    end if;
    update public.action_plans set status = 'in_progress' where id = p_action_plan_id;
    v_count := public.generate_action_plan_instances(p_action_plan_id, rule.repeat_end_date);
    perform public.write_activity('action_plan', p_action_plan_id, 'activate_repeat',
      jsonb_build_object('pic_id', a.pic_id, 'reviewer_id', a.reviewer_id, 'instances', v_count));
    return;
  end if;

  -- Cabang ONE TIME (perilaku Fase 1).
  if coalesce(trim(a.name), '') = '' or a.pic_id is null or a.reviewer_id is null
     or a.start_date is null or a.deadline is null
     or coalesce(trim(a.expected_output), '') = '' or coalesce(trim(a.definition_of_done), '') = ''
     or a.priority is null then
    raise exception 'Kelengkapan Action Plan belum terpenuhi (nama, PIC, Reviewer, tanggal mulai, deadline, output, definition of done, prioritas wajib).';
  end if;
  update public.action_plans set status = 'assigned' where id = p_action_plan_id;
  perform public.write_activity('action_plan', p_action_plan_id, 'activate',
    jsonb_build_object('pic_id', a.pic_id, 'reviewer_id', a.reviewer_id));
end;
$$;

-- ============================================================ RPC: tandai Terlewat (job)

-- Race-safe (FR-E5): hanya target instance assigned/in_progress TANPA submission & TANPA
-- submitted_at; penentu = submitted_at vs deadline (per missed_rule), bukan urutan eksekusi.
-- overdue_allowed tidak pernah auto-missed.
create or replace function public.mark_overdue_instances(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select i.id, i.organization_id, i.action_plan_id, i.pic_id, i.deadline_at,
           rr.missed_rule, rr.grace_period_minutes
    from public.action_plan_instances i
    join public.action_plan_repeat_rules rr on rr.id = i.repeat_rule_id
    where i.status in ('assigned', 'in_progress')
      and i.current_submission_id is null
      and i.submitted_at is null
      and rr.missed_rule <> 'overdue_allowed'
      and p_now > (case when rr.missed_rule = 'grace_period'
                        then i.deadline_at + make_interval(mins => coalesce(rr.grace_period_minutes, 0))
                        else i.deadline_at end)
  loop
    update public.action_plan_instances
      set status = 'missed', missed_reason = 'deadline_passed'
      where id = r.id;

    insert into public.governance_violations
      (organization_id, user_id, violation_type, entity_type, entity_id, detail, severity)
    values (r.organization_id, r.pic_id, 'instance_missed', 'action_plan_instance', r.id,
            jsonb_build_object('action_plan_id', r.action_plan_id, 'deadline_at', r.deadline_at), 'medium');

    perform public.write_activity_system(r.organization_id, null, 'action_plan_instance', r.id,
      'instance_marked_overdue', jsonb_build_object('action_plan_id', r.action_plan_id));

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ============================================================ RPC: submit per instance

-- Mengisi action_plan_id parent (agar RLS submission/evidence Fase 1 berlaku) + action_plan_instance_id.
-- Versi per-instance. review_required=false → instance langsung 'done'. Parent tidak berubah status.
create or replace function public.submit_action_plan_instance(
  p_instance_id uuid, p_note text, p_evidence jsonb, p_result_values jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  ins public.action_plan_instances;
  a public.action_plans;
  v_version int;
  v_submission_id uuid;
  v_item jsonb;
  v_now timestamptz := now();
  v_effective_deadline timestamptz;
  v_late boolean := false;
  v_late_minutes int := null;
begin
  select * into ins from public.action_plan_instances where id = p_instance_id;
  if not found then raise exception 'Instance tidak ditemukan.'; end if;
  if ins.pic_id <> auth.uid() then raise exception 'Hanya PIC yang dapat submit instance ini.'; end if;
  if ins.status = 'missed' then raise exception 'Instance sudah Terlewat dan tidak dapat disubmit.'; end if;
  if ins.status not in ('assigned', 'in_progress', 'revision') then
    raise exception 'Instance tidak dalam status yang bisa disubmit.';
  end if;

  select * into a from public.action_plans where id = ins.action_plan_id;

  if a.evidence_required
     and (p_evidence is null or jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) = 0) then
    raise exception 'Bukti wajib dilampirkan sebelum submit.';
  end if;
  if a.result_value_required
     and (p_result_values is null or jsonb_typeof(p_result_values) <> 'array' or jsonb_array_length(p_result_values) = 0) then
    raise exception 'Nilai Hasil wajib diisi sebelum submit.';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_version
  from public.action_plan_submissions where action_plan_instance_id = p_instance_id;

  insert into public.action_plan_submissions
    (action_plan_id, action_plan_instance_id, version_number, submitted_by, note)
  values (ins.action_plan_id, p_instance_id, v_version, auth.uid(), nullif(trim(p_note), ''))
  returning id into v_submission_id;

  if p_evidence is not null and jsonb_typeof(p_evidence) = 'array' then
    for v_item in select * from jsonb_array_elements(p_evidence) loop
      insert into public.evidence_files
        (submission_id, kind, storage_path, url, text_content, file_name, mime_type, uploaded_by)
      values (v_submission_id, v_item ->> 'kind', v_item ->> 'storage_path', v_item ->> 'url',
              v_item ->> 'text_content', v_item ->> 'file_name', v_item ->> 'mime_type', auth.uid());
    end loop;
  end if;

  if p_result_values is not null and jsonb_typeof(p_result_values) = 'array' then
    for v_item in select * from jsonb_array_elements(p_result_values) loop
      insert into public.action_plan_result_values (submission_id, label, value_type, value_text)
      values (v_submission_id, v_item ->> 'label', coalesce(v_item ->> 'value_type', 'text'), v_item ->> 'value_text');
    end loop;
  end if;

  -- Keterlambatan dihitung vs deadline efektif (grace menambah toleransi). submitted_at = waktu server.
  v_effective_deadline := ins.deadline_at;
  if v_now > v_effective_deadline then
    v_late := true;
    v_late_minutes := ceil(extract(epoch from (v_now - v_effective_deadline)) / 60.0)::int;
  end if;

  update public.action_plan_instances
  set status = case when a.review_required then 'submitted' else 'done' end,
      current_submission_id = v_submission_id,
      submitted_at = v_now,
      submitted_late = v_late,
      late_minutes = v_late_minutes,
      reviewed_at = case when a.review_required then null else v_now end
  where id = p_instance_id;

  -- review_required=false → submission langsung dianggap disetujui (paritas Fase 1 done).
  if not a.review_required then
    update public.action_plan_submissions set review_status = 'approved' where id = v_submission_id;
  end if;

  perform public.write_activity('action_plan', ins.action_plan_id, 'submit_instance',
    jsonb_build_object('instance_id', p_instance_id, 'submission_id', v_submission_id, 'version', v_version));

  return v_submission_id;
end;
$$;

-- ============================================================ RPC: review per instance

create or replace function public.review_action_plan_instance_submission(
  p_submission_id uuid, p_decision text, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.action_plan_submissions;
  ins public.action_plan_instances;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Keputusan review tidak valid.';
  end if;

  select * into s from public.action_plan_submissions where id = p_submission_id;
  if not found then raise exception 'Submission tidak ditemukan.'; end if;
  if s.action_plan_instance_id is null then
    raise exception 'Submission ini bukan submission instance.';
  end if;
  select * into ins from public.action_plan_instances where id = s.action_plan_instance_id;

  -- Anti self-approval: terhadap KOLOM INSTANCE (K4).
  if ins.pic_id = auth.uid() then
    raise exception 'PIC tidak boleh me-review pekerjaannya sendiri.';
  end if;

  if ins.reviewer_id <> auth.uid() then
    if public.has_permission('manage_others_cards') then
      insert into public.governance_violations
        (organization_id, user_id, violation_type, entity_type, entity_id, detail, severity)
      values (ins.organization_id, auth.uid(), 'reviewer_override', 'action_plan_instance', ins.id,
              jsonb_build_object('submission_id', p_submission_id, 'assigned_reviewer', ins.reviewer_id), 'medium');
    else
      raise exception 'Hanya Reviewer yang ditunjuk yang dapat me-review instance ini.';
    end if;
  end if;

  if s.review_status <> 'pending' or ins.status <> 'submitted' then
    raise exception 'Submission ini sudah direview atau tidak menunggu review.';
  end if;
  if p_decision = 'reject' and coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan penolakan wajib diisi.';
  end if;

  update public.action_plan_submissions
  set review_status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      review_reason = nullif(trim(p_reason), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_submission_id;

  insert into public.reviews (action_plan_id, submission_id, reviewer_id, decision, reason)
  values (ins.action_plan_id, p_submission_id, auth.uid(), p_decision, nullif(trim(p_reason), ''));

  update public.action_plan_instances
  set status = case when p_decision = 'approve' then 'done' else 'revision' end,
      reviewed_at = now()
  where id = ins.id;

  perform public.write_activity('action_plan', ins.action_plan_id,
    case when p_decision = 'approve' then 'review_instance_approve' else 'review_instance_reject' end,
    jsonb_build_object('instance_id', ins.id, 'submission_id', p_submission_id, 'reason', nullif(trim(p_reason), '')));
end;
$$;

-- ============================================================ RPC: repeat compliance (read-only)

-- Compliance = instance selesai TEPAT WAKTU ÷ total seharusnya (exclude archived).
-- On-time: status='done' & submitted_at <= deadline efektif (Strict: deadline; Grace: +grace;
-- Overdue Allowed: submit>deadline TIDAK on-time — K2). NULL/baris kosong untuk one_time.
create or replace function public.get_repeat_compliance(p_action_plan_id uuid)
returns table (
  expected_count int, on_time_count int, missed_count int, done_count int, compliance numeric
) language plpgsql security definer set search_path = '' as $$
declare
  a public.action_plans;
begin
  select * into a from public.action_plans where id = p_action_plan_id;
  if not found or a.repeat_setting <> 'repeat' then
    return;  -- one_time / tak ada → tabel kosong (compliance dianggap NULL di klien).
  end if;
  if not public.can_access_action_plan(p_action_plan_id) then
    return;
  end if;

  return query
  with ev as (
    select i.status, i.submitted_at,
           case when rr.missed_rule = 'grace_period'
                then i.deadline_at + make_interval(mins => coalesce(rr.grace_period_minutes, 0))
                else i.deadline_at end as effective_deadline
    from public.action_plan_instances i
    join public.action_plan_repeat_rules rr on rr.id = i.repeat_rule_id
    where i.action_plan_id = p_action_plan_id
      and i.status <> 'archived'
  )
  select
    count(*)::int as expected_count,
    count(*) filter (where status = 'done' and submitted_at is not null and submitted_at <= effective_deadline)::int as on_time_count,
    count(*) filter (where status = 'missed')::int as missed_count,
    count(*) filter (where status = 'done')::int as done_count,
    case when count(*) = 0 then null
         else round(
           count(*) filter (where status = 'done' and submitted_at is not null and submitted_at <= effective_deadline)::numeric
           / count(*)::numeric, 4)
    end as compliance
  from ev;
end;
$$;

-- ============================================================ K7/AC-40: fix versioning submit_action_plan (one-time)

-- where-clause penghitung versi kini memfilter action_plan_instance_id is null
-- agar submission one-time tidak bercampur dengan submission instance.
create or replace function public.submit_action_plan(
  p_action_plan_id uuid, p_note text, p_evidence jsonb, p_result_values jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  a public.action_plans;
  v_version int;
  v_submission_id uuid;
  v_item jsonb;
begin
  select * into a from public.action_plans where id = p_action_plan_id;
  if not found then raise exception 'Action Plan tidak ditemukan.'; end if;
  if a.pic_id <> auth.uid() then raise exception 'Hanya PIC yang dapat submit pekerjaan ini.'; end if;
  if a.status not in ('assigned', 'in_progress', 'revision') then
    raise exception 'Action Plan tidak dalam status yang bisa disubmit.';
  end if;

  if a.evidence_required
     and (p_evidence is null or jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) = 0) then
    raise exception 'Bukti wajib dilampirkan sebelum submit.';
  end if;
  if a.result_value_required
     and (p_result_values is null or jsonb_typeof(p_result_values) <> 'array' or jsonb_array_length(p_result_values) = 0) then
    raise exception 'Nilai Hasil wajib diisi sebelum submit.';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_version
  from public.action_plan_submissions
  where action_plan_id = p_action_plan_id and action_plan_instance_id is null;

  insert into public.action_plan_submissions (action_plan_id, version_number, submitted_by, note)
  values (p_action_plan_id, v_version, auth.uid(), nullif(trim(p_note), ''))
  returning id into v_submission_id;

  if p_evidence is not null and jsonb_typeof(p_evidence) = 'array' then
    for v_item in select * from jsonb_array_elements(p_evidence) loop
      insert into public.evidence_files
        (submission_id, kind, storage_path, url, text_content, file_name, mime_type, uploaded_by)
      values (v_submission_id, v_item ->> 'kind', v_item ->> 'storage_path', v_item ->> 'url',
              v_item ->> 'text_content', v_item ->> 'file_name', v_item ->> 'mime_type', auth.uid());
    end loop;
  end if;

  if p_result_values is not null and jsonb_typeof(p_result_values) = 'array' then
    for v_item in select * from jsonb_array_elements(p_result_values) loop
      insert into public.action_plan_result_values (submission_id, label, value_type, value_text)
      values (v_submission_id, v_item ->> 'label', coalesce(v_item ->> 'value_type', 'text'), v_item ->> 'value_text');
    end loop;
  end if;

  update public.action_plans
  set status = 'submitted', current_submission_id = v_submission_id
  where id = p_action_plan_id;

  perform public.write_activity('action_plan', p_action_plan_id, 'submit',
    jsonb_build_object('submission_id', v_submission_id, 'version', v_version));

  return v_submission_id;
end;
$$;

-- ============================================================ GRANTS / REVOKES

-- RPC user-context: hanya authenticated.
revoke execute on function public.set_action_plan_repeat_rule(uuid, text, int[], int[], date[], date, date, time, text, int) from public, anon;
revoke execute on function public.submit_action_plan_instance(uuid, text, jsonb, jsonb) from public, anon;
revoke execute on function public.review_action_plan_instance_submission(uuid, text, text) from public, anon;
revoke execute on function public.get_repeat_compliance(uuid) from public, anon;

-- RPC cron-wide / job: revoke dari authenticated (hanya dipanggil internal definer + pg_cron/service_role).
revoke execute on function public.generate_action_plan_instances(uuid, date) from public, anon, authenticated;
revoke execute on function public.mark_overdue_instances(timestamptz) from public, anon, authenticated;

-- ============================================================ RLS

alter table public.action_plan_repeat_rules enable row level security;
alter table public.action_plan_instances enable row level security;

-- Hanya SELECT (semua tulis lewat RPC SECURITY DEFINER). Visibilitas ikut parent action plan.
drop policy if exists "repeat_rules_select" on public.action_plan_repeat_rules;
create policy "repeat_rules_select" on public.action_plan_repeat_rules
  for select to authenticated using (public.can_access_action_plan(action_plan_id));

drop policy if exists "instances_select" on public.action_plan_instances;
create policy "instances_select" on public.action_plan_instances
  for select to authenticated using (public.can_access_action_plan(action_plan_id));

-- ============================================================ JOB INFRA (pg_cron)

create extension if not exists pg_cron;

-- Jadwalkan job (idempoten: unschedule dulu bila sudah ada).
do $$
begin
  perform cron.unschedule('mark-overdue-instances');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('backfill-instances');
exception when others then null;
end $$;

select cron.schedule('mark-overdue-instances', '*/15 * * * *',
  $$select public.mark_overdue_instances()$$);
select cron.schedule('backfill-instances', '5 0 * * *',
  $$select public.generate_action_plan_instances(null, current_date)$$);
