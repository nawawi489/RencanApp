-- 0100_write_idempotency_keys.sql — client_request_id dedup for non-idempotent writes.
--
-- WHY: PR #197 stopped the AUTOMATIC write-retry (React Query mutations.retry=false),
-- but a user who taps Save/Send again after a lost-ACK network error still creates a
-- genuine duplicate. This migration closes that residual manual-retry vector for the
-- six non-idempotent write paths: goals, action_plans, tasks, initiatives,
-- problem_statements (direct inserts) and chat_messages (send_chat_message RPC).
--
-- MECHANISM:
--   • Add nullable `client_request_id uuid` to each of the six tables.
--   • A PLAIN (not CONCURRENTLY — the new nullable column matches zero existing rows
--     so the partial index builds instantly inside this txn) partial unique index
--     scoped to the natural owner. NULL keys never dedup.
--   • Five `create_<entity>_idempotent` SECURITY INVOKER RPCs replace the client's raw
--     `.insert()`: INSERT ... ON CONFLICT DO NOTHING, then re-SELECT the existing row on
--     conflict. This returns the ORIGINAL row (AC-1) using only INSERT+SELECT privileges
--     (no UPDATE policy needed, no audit-trigger churn) and is race-safe.
--   • send_chat_message rewritten 6->7 params (+ p_client_request_id), same DO NOTHING
--     dedup, DROP + re-grant ACL (a DROP resets EXECUTE to PUBLIC — re-revoke anon/public).
--
-- Contract: supabase/tests/0100_write_idempotency_keys_contract.sql (0100-DB-1..6).

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.goals              add column if not exists client_request_id uuid;
alter table public.action_plans       add column if not exists client_request_id uuid;
alter table public.tasks              add column if not exists client_request_id uuid;
alter table public.initiatives        add column if not exists client_request_id uuid;
alter table public.problem_statements add column if not exists client_request_id uuid;
alter table public.chat_messages      add column if not exists client_request_id uuid;

-- ---------------------------------------------------------------------------
-- 2. Partial unique indexes (plain — zero existing rows match the predicate)
-- ---------------------------------------------------------------------------
create unique index if not exists goals_client_request_id_uidx
  on public.goals (organization_id, created_by, client_request_id)
  where client_request_id is not null;
create unique index if not exists action_plans_client_request_id_uidx
  on public.action_plans (organization_id, created_by, client_request_id)
  where client_request_id is not null;
create unique index if not exists tasks_client_request_id_uidx
  on public.tasks (organization_id, created_by, client_request_id)
  where client_request_id is not null;
create unique index if not exists initiatives_client_request_id_uidx
  on public.initiatives (organization_id, created_by, client_request_id)
  where client_request_id is not null;
create unique index if not exists problem_statements_client_request_id_uidx
  on public.problem_statements (organization_id, created_by, client_request_id)
  where client_request_id is not null;
create unique index if not exists chat_messages_client_request_id_uidx
  on public.chat_messages (chat_room_id, author_id, client_request_id)
  where client_request_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Direct-insert idempotent RPCs (SECURITY INVOKER — caller's RLS applies)
--    organization_id/created_by derived server-side from auth.uid() (mirrors
--    getOrgContext); client passes only its New* fields + the key.
-- ---------------------------------------------------------------------------
create or replace function public.create_goal_idempotent(
  p_name text,
  p_description text default null,
  p_pic_id uuid default null,
  p_period_start date default null,
  p_period_end date default null,
  p_target_value text default null,
  p_client_request_id uuid default null
) returns public.goals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_row public.goals;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi.' using errcode = '42501'; end if;
  select organization_id into v_org from public.profiles where id = v_uid;

  insert into public.goals (organization_id, created_by, client_request_id,
                            name, description, pic_id, period_start, period_end, target_value)
  values (v_org, v_uid, p_client_request_id,
          p_name, p_description, p_pic_id, p_period_start, p_period_end, p_target_value)
  on conflict (organization_id, created_by, client_request_id) where client_request_id is not null
    do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.goals
     where organization_id = v_org and created_by = v_uid and client_request_id = p_client_request_id;
  end if;
  return v_row;
end;
$$;

create or replace function public.create_action_plan_idempotent(
  p_name text,
  p_target_result text default null,
  p_pic_id uuid default null,
  p_period_start date default null,
  p_period_end date default null,
  p_description text default null,
  p_initiative_id uuid default null,
  p_problem_statement_id uuid default null,
  p_team_id uuid default null,
  p_client_request_id uuid default null
) returns public.action_plans
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_row public.action_plans;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi.' using errcode = '42501'; end if;
  select organization_id into v_org from public.profiles where id = v_uid;

  insert into public.action_plans (organization_id, created_by, client_request_id,
                                   name, target_result, pic_id, period_start, period_end,
                                   description, initiative_id, problem_statement_id, team_id)
  values (v_org, v_uid, p_client_request_id,
          p_name, p_target_result, p_pic_id, p_period_start, p_period_end,
          p_description, p_initiative_id, p_problem_statement_id, p_team_id)
  on conflict (organization_id, created_by, client_request_id) where client_request_id is not null
    do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.action_plans
     where organization_id = v_org and created_by = v_uid and client_request_id = p_client_request_id;
  end if;
  return v_row;
end;
$$;

create or replace function public.create_task_idempotent(
  p_action_plan_id uuid,
  p_name text,
  p_pic_id uuid default null,
  p_reviewer_id uuid default null,
  p_start_date date default null,
  p_deadline date default null,
  p_deadline_time text default null,
  p_expected_output text default null,
  p_definition_of_done text default null,
  p_priority text default null,
  p_evidence_required boolean default false,
  p_result_value_required boolean default false,
  p_evidence_description text default null,
  p_description text default null,
  p_client_request_id uuid default null
) returns public.tasks
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_row public.tasks;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi.' using errcode = '42501'; end if;
  select organization_id into v_org from public.profiles where id = v_uid;

  insert into public.tasks (organization_id, created_by, client_request_id,
                            action_plan_id, name, pic_id, reviewer_id, start_date, deadline,
                            deadline_time, expected_output, definition_of_done, priority,
                            evidence_required, result_value_required, evidence_description, description)
  values (v_org, v_uid, p_client_request_id,
          p_action_plan_id, p_name, p_pic_id, p_reviewer_id, p_start_date, p_deadline,
          p_deadline_time, p_expected_output, p_definition_of_done, p_priority,
          p_evidence_required, p_result_value_required, p_evidence_description, p_description)
  on conflict (organization_id, created_by, client_request_id) where client_request_id is not null
    do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.tasks
     where organization_id = v_org and created_by = v_uid and client_request_id = p_client_request_id;
  end if;
  return v_row;
end;
$$;

create or replace function public.create_initiative_idempotent(
  p_strategy_id uuid,
  p_name text,
  p_description text default null,
  p_reason text default null,
  p_main_risk text default null,
  p_alternative text default null,
  p_pic_id uuid default null,
  p_period_start date default null,
  p_period_end date default null,
  p_contribution_pct numeric default null,
  p_client_request_id uuid default null
) returns public.initiatives
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_row public.initiatives;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi.' using errcode = '42501'; end if;
  select organization_id into v_org from public.profiles where id = v_uid;

  insert into public.initiatives (organization_id, created_by, client_request_id,
                                  strategy_id, name, description, reason, main_risk, alternative,
                                  pic_id, period_start, period_end, contribution_pct)
  values (v_org, v_uid, p_client_request_id,
          p_strategy_id, p_name, p_description, p_reason, p_main_risk, p_alternative,
          p_pic_id, p_period_start, p_period_end, p_contribution_pct)
  on conflict (organization_id, created_by, client_request_id) where client_request_id is not null
    do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.initiatives
     where organization_id = v_org and created_by = v_uid and client_request_id = p_client_request_id;
  end if;
  return v_row;
end;
$$;

create or replace function public.create_problem_statement_idempotent(
  p_development_area_id uuid,
  p_name text,
  p_description text default null,
  p_pic_id uuid default null,
  p_period_start date default null,
  p_period_end date default null,
  p_impact text default null,
  p_initial_evidence text default null,
  p_client_request_id uuid default null
) returns public.problem_statements
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_row public.problem_statements;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi.' using errcode = '42501'; end if;
  select organization_id into v_org from public.profiles where id = v_uid;

  insert into public.problem_statements (organization_id, created_by, client_request_id,
                                         development_area_id, name, description, pic_id,
                                         period_start, period_end, impact, initial_evidence)
  values (v_org, v_uid, p_client_request_id,
          p_development_area_id, p_name, p_description, p_pic_id,
          p_period_start, p_period_end, p_impact, p_initial_evidence)
  on conflict (organization_id, created_by, client_request_id) where client_request_id is not null
    do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.problem_statements
     where organization_id = v_org and created_by = v_uid and client_request_id = p_client_request_id;
  end if;
  return v_row;
end;
$$;

-- ACL for the five new RPCs: authenticated only (a fresh function defaults to PUBLIC EXECUTE).
do $$
declare v_sig text;
begin
  foreach v_sig in array array[
    'public.create_goal_idempotent(text,text,uuid,date,date,text,uuid)',
    'public.create_action_plan_idempotent(text,text,uuid,date,date,text,uuid,uuid,uuid,uuid)',
    'public.create_task_idempotent(uuid,text,uuid,uuid,date,date,text,text,text,text,boolean,boolean,text,text,uuid)',
    'public.create_initiative_idempotent(uuid,text,text,text,text,text,uuid,date,date,numeric,uuid)',
    'public.create_problem_statement_idempotent(uuid,text,text,uuid,date,date,text,text,uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. send_chat_message 6->7 params (+ p_client_request_id) with DO NOTHING dedup.
--    DROP the old 6-arg overload (avoids a lingering duplicate) then recreate.
-- ---------------------------------------------------------------------------
drop function if exists public.send_chat_message(uuid, text, uuid[], uuid, uuid, jsonb);

create or replace function public.send_chat_message(
  p_room uuid,
  p_body text,
  p_mentions uuid[] default '{}'::uuid[],
  p_context_action_plan uuid default null,
  p_reply_to uuid default null,
  p_attachments jsonb default '[]'::jsonb,
  p_client_request_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_room public.chat_rooms;
  v_msg_id uuid;
  v_uid uuid := auth.uid();
  v_mention uuid;
  v_context_type text := null;
  v_context_id uuid := null;
  v_context_label text := null;
  v_att jsonb;
  v_att_path text;
  v_att_parts text[];
  v_obj_meta jsonb;
  v_obj_owner uuid;
  v_enriched jsonb := '[]'::jsonb;
  v_mime text;
  v_size bigint;
begin
  if coalesce(trim(p_body), '') = '' then raise exception 'Pesan tidak boleh kosong.'; end if;
  select * into v_room from public.chat_rooms where id = p_room;
  if not found then raise exception 'Chat room tidak ditemukan.'; end if;
  if not public.is_chat_member(p_room) then
    raise exception 'Hanya anggota room yang dapat mengirim pesan.';
  end if;

  -- Idempotency short-circuit: a retry with the same key returns the original
  -- message without re-validating attachments (the storage object may already be
  -- consumed) or re-firing mentions/notifications.
  if p_client_request_id is not null then
    select id into v_msg_id from public.chat_messages
     where chat_room_id = p_room and author_id = v_uid and client_request_id = p_client_request_id;
    if found then return v_msg_id; end if;
  end if;

  if jsonb_array_length(p_attachments) > 3 then
    raise exception 'Maksimal 3 gambar per pesan.';
  end if;

  for v_att in select * from jsonb_array_elements(p_attachments)
  loop
    v_att_path := v_att->>'path';
    if v_att_path is null or v_att_path = '' then
      raise exception 'Path lampiran tidak valid.';
    end if;

    perform pg_advisory_xact_lock(hashtext(v_att_path));

    v_att_parts := storage.foldername(v_att_path);

    select o.owner_id::uuid, o.metadata into v_obj_owner, v_obj_meta
    from storage.objects o
    where o.bucket_id = 'chat-attachments' and o.name = v_att_path;

    if not found then
      raise exception 'File lampiran tidak ditemukan di storage.';
    end if;
    if v_obj_owner is distinct from v_uid then
      raise exception 'File lampiran bukan milik pengirim.';
    end if;
    if (v_att_parts)[2]::uuid is distinct from p_room then
      raise exception 'File lampiran tidak terikat pada room ini.';
    end if;

    v_mime := v_obj_meta->>'mimetype';
    v_size := (v_obj_meta->>'size')::bigint;
    if v_mime is null or v_mime not in ('image/jpeg', 'image/png', 'image/webp') then
      raise exception 'Jenis file tidak didukung. Hanya gambar (JPEG, PNG, WebP).';
    end if;
    if v_size is null or v_size > 5242880 then
      raise exception 'Ukuran file melebihi batas 5 MB.';
    end if;

    v_enriched := v_enriched || jsonb_build_array(jsonb_build_object(
      'path', v_att_path,
      'name', storage.filename(v_att_path),
      'mime', v_mime,
      'size', v_size,
      'kind', 'photo'
    ));
  end loop;

  if p_context_action_plan is not null then
    select 'task', a.id, a.name
      into v_context_type, v_context_id, v_context_label
    from public.tasks a
    where a.id = p_context_action_plan;
    if v_context_id is null then
      raise exception 'Tugas konteks tidak ditemukan.';
    end if;
    if not exists (
      select 1 from public.tasks a
      where a.id = p_context_action_plan
        and a.action_plan_id = v_room.action_plan_id
    ) then
      raise exception 'Tugas tidak berada dalam Action Plan room ini.';
    end if;
  end if;

  if p_reply_to is not null then
    if not exists (
      select 1 from public.chat_messages cm
      where cm.id = p_reply_to and cm.chat_room_id = p_room
    ) then
      raise exception 'Pesan yang di-reply tidak ditemukan di room ini.';
    end if;
  end if;

  insert into public.chat_messages
    (organization_id, chat_room_id, author_id, body,
     context_entity_type, context_entity_id, context_label, reply_to_message_id,
     attachments, client_request_id)
  values
    (v_room.organization_id, p_room, v_uid, trim(p_body),
     v_context_type, v_context_id, v_context_label, p_reply_to,
     v_enriched, p_client_request_id)
  on conflict (chat_room_id, author_id, client_request_id) where client_request_id is not null
    do nothing
  returning id into v_msg_id;

  -- Lost a concurrent race with the same key: return the winner, skip mentions
  -- (the winning call already emitted them).
  if v_msg_id is null then
    select id into v_msg_id from public.chat_messages
     where chat_room_id = p_room and author_id = v_uid and client_request_id = p_client_request_id;
    return v_msg_id;
  end if;

  if p_mentions is not null then
    for v_mention in
      select distinct unnest(p_mentions)
    loop
      if v_mention <> v_uid and exists (
        select 1 from public.chat_room_members m where m.chat_room_id = p_room and m.member_id = v_mention)
      then
        insert into public.mentions (chat_message_id, mentioned_user_id) values (v_msg_id, v_mention);
        perform public.emit_notification(v_room.organization_id, v_mention, v_uid, 'mention',
          'chat_message', v_msg_id, 'Anda disebut dalam diskusi', null);
      end if;
    end loop;
  end if;

  return v_msg_id;
end;
$function$;

-- Re-apply ACL for the recreated function (DROP reset EXECUTE to PUBLIC).
revoke all on function public.send_chat_message(uuid, text, uuid[], uuid, uuid, jsonb, uuid) from public, anon;
grant execute on function public.send_chat_message(uuid, text, uuid[], uuid, uuid, jsonb, uuid) to authenticated;
