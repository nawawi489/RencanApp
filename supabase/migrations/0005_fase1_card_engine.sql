-- EMS V1.8.1 — Fase 1: Card Engine + Loop Eksekusi (WEDGE)
-- Tabel: initiatives (datar sementara), action_plans, action_plan_submissions,
--        action_plan_result_values, evidence_files, reviews,
--        card_completion_rules, card_guidance_contents, activity_logs, governance_violations.
-- Loop: Bukti → Nilai Hasil → Submit → Review (approve/reject) dengan anti self-approval,
--        evidence locking, dan submission versioning. RLS berbasis tanggung jawab.

-- ============================================================ HELPERS (permission & visibilitas)

-- Level role user saat ini (ceo/c_level/management/staff). SECURITY DEFINER agar bebas RLS.
create or replace function public.user_role_level()
returns text language sql stable security definer set search_path = '' as $$
  select rt.level
  from public.profiles p
  join public.role_templates rt on rt.id = p.role_template_id
  where p.id = auth.uid();
$$;

-- Apakah user punya permission tertentu. CEO selalu true; c_level/management punya default
-- membuat card eksekusi; selain itu lewat grant eksplisit di user_permissions.
create or replace function public.has_permission(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.user_role_level() = 'ceo', false)
    or (
      public.user_role_level() in ('c_level', 'management')
      and p_key in ('create_initiative', 'create_action_plan', 'create_strategy')
    )
    or exists (
      select 1
      from public.user_permissions up
      join public.permissions pm on pm.id = up.permission_id
      where up.user_id = auth.uid() and pm.key = p_key and up.granted
    );
$$;

create or replace function public.can_view_workspace()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_permission('view_all_workspace');
$$;

revoke execute on function public.user_role_level() from public, anon;
revoke execute on function public.has_permission(text) from public, anon;
revoke execute on function public.can_view_workspace() from public, anon;

-- ============================================================ TABLES

create table if not exists public.initiatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  target_result text,                       -- Target Hasil
  pic_id uuid references public.profiles (id) on delete set null,
  period_start date,
  period_end date,
  status text not null default 'draft' check (status in ('draft', 'active', 'done', 'archived')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.action_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  initiative_id uuid not null references public.initiatives (id) on delete cascade,
  name text not null,
  description text,
  pic_id uuid references public.profiles (id) on delete set null,        -- eksekutor wajib saat aktif
  reviewer_id uuid references public.profiles (id) on delete set null,   -- wajib saat aktif
  start_date date,
  deadline date,
  expected_output text,                     -- Output yang Diharapkan
  definition_of_done text,
  priority text check (priority in ('low', 'medium', 'high', 'urgent')),
  repeat_setting text not null default 'one_time' check (repeat_setting in ('one_time', 'repeat')),
  evidence_required boolean not null default true,
  result_value_required boolean not null default false,
  review_required boolean not null default true,
  status text not null default 'draft'
    check (status in ('draft', 'assigned', 'in_progress', 'submitted', 'done', 'revision', 'archived')),
  current_submission_id uuid,               -- FK ditambah setelah tabel submissions dibuat
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Anti self-review di level data: PIC tidak boleh sama dengan Reviewer (boleh keduanya null saat draft).
  constraint action_plans_pic_ne_reviewer
    check (pic_id is null or reviewer_id is null or pic_id <> reviewer_id)
);

create table if not exists public.action_plan_submissions (
  id uuid primary key default gen_random_uuid(),
  action_plan_id uuid not null references public.action_plans (id) on delete cascade,
  version_number int not null,
  submitted_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz not null default now(),
  note text,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  review_reason text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (action_plan_id, version_number)
);

alter table public.action_plans
  drop constraint if exists action_plans_current_submission_fk;
alter table public.action_plans
  add constraint action_plans_current_submission_fk
  foreign key (current_submission_id) references public.action_plan_submissions (id) on delete set null;

create table if not exists public.action_plan_result_values (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.action_plan_submissions (id) on delete cascade,
  label text,
  value_type text not null
    check (value_type in ('number', 'currency', 'percentage', 'boolean', 'text', 'option', 'link')),
  value_text text,                          -- representasi nilai (disimpan sebagai teks, ditafsir per value_type)
  created_at timestamptz not null default now()
);

create table if not exists public.evidence_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.action_plan_submissions (id) on delete cascade,
  kind text not null
    check (kind in ('file', 'photo', 'screenshot', 'pdf', 'link_gdrive', 'link_doc', 'text_note', 'report')),
  storage_path text,                        -- path di bucket Storage (untuk file/foto/pdf)
  url text,                                 -- link eksternal (gdrive/dokumen)
  text_content text,                        -- catatan teks / rekap laporan
  file_name text,
  mime_type text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  action_plan_id uuid not null references public.action_plans (id) on delete cascade,
  submission_id uuid not null references public.action_plan_submissions (id) on delete cascade,
  reviewer_id uuid references public.profiles (id) on delete set null,
  decision text not null check (decision in ('approve', 'reject')),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.card_completion_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  card_type text not null,
  required_fields jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (organization_id, card_type)
);

create table if not exists public.card_guidance_contents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,  -- null = bawaan sistem
  card_type text not null,
  title text not null,
  body text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.governance_violations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  violation_type text not null,
  entity_type text,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_action_plans_initiative on public.action_plans (initiative_id);
create index if not exists idx_action_plans_pic on public.action_plans (pic_id);
create index if not exists idx_action_plans_reviewer on public.action_plans (reviewer_id);
create index if not exists idx_submissions_action_plan on public.action_plan_submissions (action_plan_id);
create index if not exists idx_result_values_submission on public.action_plan_result_values (submission_id);
create index if not exists idx_evidence_submission on public.evidence_files (submission_id);
create index if not exists idx_reviews_action_plan on public.reviews (action_plan_id);
create index if not exists idx_activity_logs_entity on public.activity_logs (entity_type, entity_id);

-- updated_at otomatis (fungsi public.set_updated_at sudah ada dari Fase 0).
drop trigger if exists initiatives_set_updated_at on public.initiatives;
create trigger initiatives_set_updated_at
  before update on public.initiatives
  for each row execute function public.set_updated_at();

drop trigger if exists action_plans_set_updated_at on public.action_plans;
create trigger action_plans_set_updated_at
  before update on public.action_plans
  for each row execute function public.set_updated_at();

-- ============================================================ VISIBILITAS (SECURITY DEFINER, bebas RLS)

create or replace function public.can_access_initiative(p_initiative uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.initiatives i
    where i.id = p_initiative
      and i.organization_id = public.current_user_org()
      and (
        public.can_view_workspace()
        or i.pic_id = auth.uid()
        or i.created_by = auth.uid()
        or exists (
          select 1 from public.action_plans a
          where a.initiative_id = i.id
            and (a.pic_id = auth.uid() or a.reviewer_id = auth.uid())
        )
      )
  );
$$;

create or replace function public.can_access_action_plan(p_action_plan uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.action_plans a
    left join public.initiatives i on i.id = a.initiative_id
    where a.id = p_action_plan
      and a.organization_id = public.current_user_org()
      and (
        public.can_view_workspace()
        or a.pic_id = auth.uid()
        or a.reviewer_id = auth.uid()
        or a.created_by = auth.uid()
        or i.pic_id = auth.uid()
      )
  );
$$;

revoke execute on function public.can_access_initiative(uuid) from public, anon;
revoke execute on function public.can_access_action_plan(uuid) from public, anon;

-- ============================================================ ACTIVITY LOG (append-only)

create or replace function public.write_activity(
  p_entity_type text, p_entity_id uuid, p_action text, p_detail jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, detail)
  values (public.current_user_org(), auth.uid(), p_entity_type, p_entity_id, p_action, coalesce(p_detail, '{}'::jsonb));
end;
$$;

revoke execute on function public.write_activity(text, uuid, text, jsonb) from public, anon, authenticated;

-- Catat pembuatan card (initiative & action_plan) ke activity log.
create or replace function public.log_card_creation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, detail)
  values (new.organization_id, auth.uid(), tg_argv[0], new.id, 'create',
          jsonb_build_object('name', new.name, 'status', new.status));
  return new;
end;
$$;

revoke execute on function public.log_card_creation() from public, anon, authenticated;

drop trigger if exists initiatives_log_create on public.initiatives;
create trigger initiatives_log_create
  after insert on public.initiatives
  for each row execute function public.log_card_creation('initiative');

drop trigger if exists action_plans_log_create on public.action_plans;
create trigger action_plans_log_create
  after insert on public.action_plans
  for each row execute function public.log_card_creation('action_plan');

-- ============================================================ RPC: lifecycle & loop eksekusi

-- Aktifkan Initiative (Draft → Active). Kelengkapan: nama, target hasil, periode, PIC.
create or replace function public.activate_initiative(p_initiative_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.initiatives;
begin
  select * into i from public.initiatives where id = p_initiative_id;
  if not found then raise exception 'Initiative tidak ditemukan.'; end if;
  if not (i.created_by = auth.uid() or i.pic_id = auth.uid() or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Initiative ini.';
  end if;
  if i.status <> 'draft' then raise exception 'Initiative sudah diaktifkan.'; end if;
  if coalesce(trim(i.name), '') = '' or coalesce(trim(i.target_result), '') = ''
     or i.pic_id is null or i.period_start is null or i.period_end is null then
    raise exception 'Kelengkapan Initiative belum terpenuhi (nama, target hasil, periode, PIC wajib).';
  end if;
  update public.initiatives set status = 'active' where id = p_initiative_id;
  perform public.write_activity('initiative', p_initiative_id, 'activate', '{}'::jsonb);
end;
$$;

-- Aktifkan Action Plan (Draft → Assigned). Kelengkapan field wajib + anti self-review.
create or replace function public.activate_action_plan(p_action_plan_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.action_plans;
begin
  select * into a from public.action_plans where id = p_action_plan_id;
  if not found then raise exception 'Action Plan tidak ditemukan.'; end if;
  if not (a.created_by = auth.uid() or public.has_permission('manage_others_cards')
          or exists (select 1 from public.initiatives i where i.id = a.initiative_id and i.pic_id = auth.uid())) then
    raise exception 'Anda tidak berwenang mengaktifkan Action Plan ini.';
  end if;
  if a.status <> 'draft' then raise exception 'Action Plan sudah diaktifkan.'; end if;
  if coalesce(trim(a.name), '') = '' or a.pic_id is null or a.reviewer_id is null
     or a.start_date is null or a.deadline is null
     or coalesce(trim(a.expected_output), '') = '' or coalesce(trim(a.definition_of_done), '') = ''
     or a.priority is null then
    raise exception 'Kelengkapan Action Plan belum terpenuhi (nama, PIC, Reviewer, tanggal mulai, deadline, output, definition of done, prioritas wajib).';
  end if;
  if a.pic_id = a.reviewer_id then
    raise exception 'PIC dan Reviewer tidak boleh orang yang sama.';
  end if;
  update public.action_plans set status = 'assigned' where id = p_action_plan_id;
  perform public.write_activity('action_plan', p_action_plan_id, 'activate',
    jsonb_build_object('pic_id', a.pic_id, 'reviewer_id', a.reviewer_id));
end;
$$;

-- PIC mulai mengerjakan (Assigned → In Progress).
create or replace function public.start_action_plan(p_action_plan_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.action_plans;
begin
  select * into a from public.action_plans where id = p_action_plan_id;
  if not found then raise exception 'Action Plan tidak ditemukan.'; end if;
  if a.pic_id <> auth.uid() then raise exception 'Hanya PIC yang dapat memulai pekerjaan ini.'; end if;
  if a.status <> 'assigned' then raise exception 'Action Plan tidak dalam status Assigned.'; end if;
  update public.action_plans set status = 'in_progress' where id = p_action_plan_id;
  perform public.write_activity('action_plan', p_action_plan_id, 'start', '{}'::jsonb);
end;
$$;

-- Submit bukti + nilai hasil → membuat submission versi baru (Menunggu Review).
-- p_evidence: jsonb array [{kind, storage_path, url, text_content, file_name, mime_type}]
-- p_result_values: jsonb array [{label, value_type, value_text}]
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
  from public.action_plan_submissions where action_plan_id = p_action_plan_id;

  insert into public.action_plan_submissions (action_plan_id, version_number, submitted_by, note)
  values (p_action_plan_id, v_version, auth.uid(), nullif(trim(p_note), ''))
  returning id into v_submission_id;

  if p_evidence is not null and jsonb_typeof(p_evidence) = 'array' then
    for v_item in select * from jsonb_array_elements(p_evidence) loop
      insert into public.evidence_files
        (submission_id, kind, storage_path, url, text_content, file_name, mime_type, uploaded_by)
      values (
        v_submission_id,
        v_item ->> 'kind',
        v_item ->> 'storage_path',
        v_item ->> 'url',
        v_item ->> 'text_content',
        v_item ->> 'file_name',
        v_item ->> 'mime_type',
        auth.uid()
      );
    end loop;
  end if;

  if p_result_values is not null and jsonb_typeof(p_result_values) = 'array' then
    for v_item in select * from jsonb_array_elements(p_result_values) loop
      insert into public.action_plan_result_values (submission_id, label, value_type, value_text)
      values (
        v_submission_id,
        v_item ->> 'label',
        coalesce(v_item ->> 'value_type', 'text'),
        v_item ->> 'value_text'
      );
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

-- Review submission: approve → Selesai, reject → Revisi Diperlukan (alasan wajib).
-- Anti self-approval ditegakkan keras: PIC tidak boleh approve pekerjaannya sendiri.
create or replace function public.review_action_plan_submission(
  p_submission_id uuid, p_decision text, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.action_plan_submissions;
  a public.action_plans;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Keputusan review tidak valid.';
  end if;

  select * into s from public.action_plan_submissions where id = p_submission_id;
  if not found then raise exception 'Submission tidak ditemukan.'; end if;
  select * into a from public.action_plans where id = s.action_plan_id;

  -- Anti self-approval: blok keras (PIC tidak boleh me-review pekerjaannya sendiri).
  if a.pic_id = auth.uid() then
    raise exception 'PIC tidak boleh me-review pekerjaannya sendiri.';
  end if;

  -- Reviewer non-tunjuk: hanya boleh lewat permission manage_others_cards, dan dicatat sbg override governance.
  if a.reviewer_id <> auth.uid() then
    if public.has_permission('manage_others_cards') then
      insert into public.governance_violations
        (organization_id, user_id, violation_type, entity_type, entity_id, detail)
      values (a.organization_id, auth.uid(), 'reviewer_override', 'action_plan', a.id,
              jsonb_build_object('submission_id', p_submission_id, 'assigned_reviewer', a.reviewer_id));
    else
      raise exception 'Hanya Reviewer yang ditunjuk yang dapat me-review pekerjaan ini.';
    end if;
  end if;
  if s.review_status <> 'pending' or a.status <> 'submitted' then
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
  values (a.id, p_submission_id, auth.uid(), p_decision, nullif(trim(p_reason), ''));

  update public.action_plans
  set status = case when p_decision = 'approve' then 'done' else 'revision' end
  where id = a.id;

  perform public.write_activity('action_plan', a.id,
    case when p_decision = 'approve' then 'review_approve' else 'review_reject' end,
    jsonb_build_object('submission_id', p_submission_id, 'reason', nullif(trim(p_reason), '')));
end;
$$;

-- Hanya authenticated yang boleh memanggil RPC eksekusi.
revoke execute on function public.activate_initiative(uuid) from public, anon;
revoke execute on function public.activate_action_plan(uuid) from public, anon;
revoke execute on function public.start_action_plan(uuid) from public, anon;
revoke execute on function public.submit_action_plan(uuid, text, jsonb, jsonb) from public, anon;
revoke execute on function public.review_action_plan_submission(uuid, text, text) from public, anon;

-- ============================================================ RLS

alter table public.initiatives enable row level security;
alter table public.action_plans enable row level security;
alter table public.action_plan_submissions enable row level security;
alter table public.action_plan_result_values enable row level security;
alter table public.evidence_files enable row level security;
alter table public.reviews enable row level security;
alter table public.card_completion_rules enable row level security;
alter table public.card_guidance_contents enable row level security;
alter table public.activity_logs enable row level security;
alter table public.governance_violations enable row level security;

-- Initiatives: lihat sesuai tanggung jawab; buat/ubah sesuai permission.
create policy "initiatives_select" on public.initiatives
  for select to authenticated using (public.can_access_initiative(id));
create policy "initiatives_insert" on public.initiatives
  for insert to authenticated
  with check (organization_id = public.current_user_org()
              and created_by = auth.uid()
              and public.has_permission('create_initiative'));
create policy "initiatives_update" on public.initiatives
  for update to authenticated
  using (organization_id = public.current_user_org()
         and (created_by = auth.uid() or pic_id = auth.uid() or public.has_permission('manage_others_cards')))
  with check (organization_id = public.current_user_org());

-- Action Plans: lihat sesuai tanggung jawab; buat butuh permission; ubah oleh creator/PIC/Reviewer.
create policy "action_plans_select" on public.action_plans
  for select to authenticated using (public.can_access_action_plan(id));
create policy "action_plans_insert" on public.action_plans
  for insert to authenticated
  with check (organization_id = public.current_user_org()
              and created_by = auth.uid()
              and public.has_permission('create_action_plan'));
create policy "action_plans_update" on public.action_plans
  for update to authenticated
  using (organization_id = public.current_user_org()
         and (created_by = auth.uid() or pic_id = auth.uid()
              or reviewer_id = auth.uid() or public.has_permission('manage_others_cards')))
  with check (organization_id = public.current_user_org());

-- Submissions/result/evidence/reviews: SELECT mengikuti akses Action Plan.
-- Tidak ada policy INSERT/UPDATE/DELETE → hanya RPC (SECURITY DEFINER) yang menulis = evidence locking + versioning aman.
create policy "submissions_select" on public.action_plan_submissions
  for select to authenticated using (public.can_access_action_plan(action_plan_id));

create policy "result_values_select" on public.action_plan_result_values
  for select to authenticated
  using (exists (select 1 from public.action_plan_submissions s
                 where s.id = submission_id and public.can_access_action_plan(s.action_plan_id)));

create policy "evidence_select" on public.evidence_files
  for select to authenticated
  using (exists (select 1 from public.action_plan_submissions s
                 where s.id = submission_id and public.can_access_action_plan(s.action_plan_id)));

create policy "reviews_select" on public.reviews
  for select to authenticated using (public.can_access_action_plan(action_plan_id));

-- Aturan & guidance: dibaca semua anggota org; guidance sistem (org null) dibaca semua.
create policy "completion_rules_select" on public.card_completion_rules
  for select to authenticated
  using (organization_id is null or organization_id = public.current_user_org());

create policy "guidance_select" on public.card_guidance_contents
  for select to authenticated
  using (organization_id is null or organization_id = public.current_user_org());

-- Audit & governance: append-only (tulis via RPC/trigger). Baca dgn permission atau jika menyangkut diri.
create policy "activity_logs_select" on public.activity_logs
  for select to authenticated
  using (organization_id = public.current_user_org()
         and (public.has_permission('view_activity_log') or actor_id = auth.uid()));

create policy "governance_violations_select" on public.governance_violations
  for select to authenticated
  using (organization_id = public.current_user_org()
         and (public.has_permission('view_governance_violation') or user_id = auth.uid()));

-- ============================================================ STORAGE (bukti)

insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;

-- Upload & baca bukti oleh authenticated. Tidak ada policy update/delete → bukti terkunci di Storage.
drop policy if exists "evidence_objects_insert" on storage.objects;
create policy "evidence_objects_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'evidence');

drop policy if exists "evidence_objects_select" on storage.objects;
create policy "evidence_objects_select" on storage.objects
  for select to authenticated using (bucket_id = 'evidence');

-- ============================================================ SEED (guidance + completion rules)

insert into public.card_guidance_contents (organization_id, card_type, title, body)
select null::uuid, x.card_type, x.title, x.body
from (values
  ('initiative',
   'Initiative — Program eksekusi',
   'Initiative adalah program konkret untuk menjalankan strategi. Isi Target Hasil yang ingin dicapai, lalu pecah menjadi Action Plan. Jangan menulis pekerjaan harian di sini — itu tugas Action Plan.'),
  ('action_plan',
   'Action Plan — Siapa melakukan apa & kapan',
   'Action Plan adalah unit eksekusi paling konkret. Wajib punya PIC (eksekutor), Reviewer, deadline, Output yang Diharapkan, dan Definition of Done. PIC mengerjakan lalu submit Bukti + Nilai Hasil; Reviewer menilai. PIC tidak boleh me-review pekerjaannya sendiri.')
) as x (card_type, title, body)
where not exists (select 1 from public.card_guidance_contents g where g.card_type = x.card_type and g.organization_id is null);

-- Card Completion Rule bawaan (field wajib per jenis card) untuk org Nyantuy Group.
with org as (select id from public.organizations order by created_at limit 1)
insert into public.card_completion_rules (organization_id, card_type, required_fields)
select org.id, x.card_type, x.required_fields::jsonb
from org,
  (values
    ('initiative', '["name","target_result","pic_id","period_start","period_end"]'),
    ('action_plan', '["name","pic_id","reviewer_id","start_date","deadline","expected_output","definition_of_done","priority"]')
  ) as x (card_type, required_fields)
where not exists (
  select 1 from public.card_completion_rules r
  where r.card_type = x.card_type and r.organization_id = org.id
);
