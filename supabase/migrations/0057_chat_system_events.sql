-- 0047: System events in chat timeline (PRD §30 komponen 8).
--
-- Baris sistem ("Fajar menyetujui — status jadi Selesai") muncul otomatis di timeline
-- chat room Initiative saat transisi status Action Plan atau perubahan deadline.
--
-- Spec  : specs/inbox-chat-system-events.md
-- Depends: 0046 (context_entity_* columns reused), 0040 (latest review/deadline RPCs).
--
-- Pendekatan: TRIGGER pada kolom status, BUKAN amend body RPC.
-- Setiap perubahan status pada action_plans, action_plan_instances, atau
-- deadline_change_requests menyisipkan chat_messages row via helper internal.
-- Atomisitas: trigger berjalan dalam transaksi yang sama dengan RPC pemicu.

-- ============================================================ 1. KOLOM + CONSTRAINT

alter table public.chat_messages
  add column if not exists kind text not null default 'user',
  add column if not exists system_event_type text,
  add column if not exists actor_id uuid references public.profiles(id) on delete set null;

alter table public.chat_messages
  add constraint chat_messages_kind_enum
    check (kind in ('user', 'system'));

alter table public.chat_messages
  add constraint chat_messages_system_event_type_enum
    check (system_event_type is null or system_event_type in (
      'status_submitted', 'status_done', 'status_revision', 'status_resubmitted',
      'deadline_change_requested', 'deadline_change_approved', 'deadline_change_rejected',
      'deadline_change_revision_requested', 'deadline_change_resubmitted'));

-- Invarian:
--   system row: author_id NULL, system_event_type NOT NULL, actor_id NOT NULL
--   user   row: system_event_type NULL, actor_id NULL
alter table public.chat_messages
  add constraint chat_messages_kind_invariant
    check (
      (kind = 'system' and author_id is null
                       and system_event_type is not null
                       and actor_id is not null)
      or
      (kind = 'user'   and system_event_type is null
                       and actor_id is null)
    );

-- ============================================================ 2. HELPER: emit_chat_system_event (internal only)
--
-- Resolusi (terminologi V1.8.3): task → action_plan → chat_room.
-- Room 0 baris → RETURN diam-diam (US-8: Action Plan belum aktif / Tugas yatim).
-- Body = snapshot nama aktor + template id-ID (immutable setelah insert).
-- Grant dicabut dari semua role klien — hanya dipanggil dari trigger SECURITY DEFINER.

create or replace function public.emit_chat_system_event(
  p_task uuid,
  p_actor uuid,
  p_event_type text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_action_plan uuid;
  v_room_id uuid;
  v_org uuid;
  v_actor_name text;
  v_body text;
begin
  if p_actor is null then return; end if;

  select action_plan_id into v_action_plan
  from public.tasks where id = p_task;
  if v_action_plan is null then return; end if;

  select id, organization_id into v_room_id, v_org
  from public.chat_rooms where action_plan_id = v_action_plan;
  if v_room_id is null then return; end if;

  select full_name into v_actor_name
  from public.profiles where id = p_actor;
  v_actor_name := coalesce(v_actor_name, 'Pengguna');

  v_body := case p_event_type
    when 'status_submitted'                    then v_actor_name || ' mengirim untuk direview'
    when 'status_done'                         then v_actor_name || ' menyetujui — status jadi Selesai'
    when 'status_revision'                     then v_actor_name || ' meminta revisi'
    when 'status_resubmitted'                  then v_actor_name || ' mengirim ulang setelah revisi'
    when 'deadline_change_requested'           then v_actor_name || ' meminta perubahan deadline'
    when 'deadline_change_approved'            then v_actor_name || ' menyetujui perubahan deadline'
    when 'deadline_change_rejected'            then v_actor_name || ' menolak perubahan deadline'
    when 'deadline_change_revision_requested'  then v_actor_name || ' meminta revisi perubahan deadline'
    when 'deadline_change_resubmitted'         then v_actor_name || ' mengirim ulang permintaan deadline'
    else 'Event sistem'
  end;

  insert into public.chat_messages
    (organization_id, chat_room_id, author_id, body,
     kind, system_event_type, actor_id,
     context_entity_type, context_entity_id)
  values
    (v_org, v_room_id, null, v_body,
     'system', p_event_type, p_actor,
     'task', p_task);
end;
$$;

revoke execute on function public.emit_chat_system_event(uuid, uuid, text)
  from public, anon, authenticated;

-- ============================================================ 3. TRIGGER: tasks status change (executable card)
--
-- Mapping:
--   submitted (dari revision) → status_resubmitted
--   submitted (lainnya)       → status_submitted
--   done (dari submitted)     → status_done
--   revision (dari submitted) → status_revision

create or replace function public.tg_action_plan_system_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_type text;
begin
  if auth.uid() is null then return NEW; end if;

  v_type := case
    when NEW.status = 'submitted' and OLD.status = 'revision'
      then 'status_resubmitted'
    when NEW.status = 'submitted'
      then 'status_submitted'
    when NEW.status = 'done' and OLD.status = 'submitted'
      then 'status_done'
    when NEW.status = 'revision' and OLD.status = 'submitted'
      then 'status_revision'
    else null
  end;

  if v_type is not null then
    perform public.emit_chat_system_event(NEW.id, auth.uid(), v_type);
  end if;

  return NEW;
end;
$$;

drop trigger if exists tg_action_plan_system_event on public.tasks;
create trigger tg_action_plan_system_event
  after update of status on public.tasks
  for each row
  when (OLD.status is distinct from NEW.status)
  execute function public.tg_action_plan_system_event();

-- ============================================================ 4. TRIGGER: task_instances status change

create or replace function public.tg_instance_system_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_type text;
begin
  if auth.uid() is null then return NEW; end if;

  v_type := case
    when NEW.status = 'submitted' and OLD.status = 'revision'
      then 'status_resubmitted'
    when NEW.status = 'submitted'
      then 'status_submitted'
    when NEW.status = 'done' and OLD.status = 'submitted'
      then 'status_done'
    when NEW.status = 'revision' and OLD.status = 'submitted'
      then 'status_revision'
    else null
  end;

  if v_type is not null then
    perform public.emit_chat_system_event(NEW.task_id, auth.uid(), v_type);
  end if;

  return NEW;
end;
$$;

drop trigger if exists tg_instance_system_event on public.task_instances;
create trigger tg_instance_system_event
  after update of status on public.task_instances
  for each row
  when (OLD.status is distinct from NEW.status)
  execute function public.tg_instance_system_event();

-- ============================================================ 5. TRIGGER: deadline_change_requests
--
-- INSERT           → deadline_change_requested
-- pending→approved → deadline_change_approved
-- pending→rejected → deadline_change_rejected
-- pending→revision_requested → deadline_change_revision_requested
-- revision_requested→pending → deadline_change_resubmitted

create or replace function public.tg_deadline_request_system_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_type text;
begin
  if auth.uid() is null then return NEW; end if;
  if NEW.entity_type <> 'task' then return NEW; end if;

  if TG_OP = 'INSERT' then
    v_type := 'deadline_change_requested';
  elsif TG_OP = 'UPDATE' then
    v_type := case
      when NEW.status = 'approved'           and OLD.status = 'pending'
        then 'deadline_change_approved'
      when NEW.status = 'rejected'           and OLD.status = 'pending'
        then 'deadline_change_rejected'
      when NEW.status = 'revision_requested' and OLD.status = 'pending'
        then 'deadline_change_revision_requested'
      when NEW.status = 'pending'            and OLD.status = 'revision_requested'
        then 'deadline_change_resubmitted'
      else null
    end;
  end if;

  if v_type is not null then
    perform public.emit_chat_system_event(NEW.entity_id, auth.uid(), v_type);
  end if;

  return NEW;
end;
$$;

drop trigger if exists tg_deadline_request_insert_system_event on public.deadline_change_requests;
create trigger tg_deadline_request_insert_system_event
  after insert on public.deadline_change_requests
  for each row
  execute function public.tg_deadline_request_system_event();

drop trigger if exists tg_deadline_request_update_system_event on public.deadline_change_requests;
create trigger tg_deadline_request_update_system_event
  after update of status on public.deadline_change_requests
  for each row
  when (OLD.status is distinct from NEW.status)
  execute function public.tg_deadline_request_system_event();

-- ============================================================ 6. FIX: get_chat_rooms unread (exclude actor)
--
-- Existing (0018): `cm.author_id is distinct from auth.uid()`
-- System events have author_id=NULL → NULL IS DISTINCT FROM uid = TRUE →
-- counts for EVERYONE including the actor. Tambah guard actor_id agar
-- pelaku transisi tidak di-nudge oleh aksinya sendiri (US-5).

create or replace function public.get_chat_rooms()
returns table (
  id uuid,
  action_plan_id uuid,
  name text,
  unread_count int,
  last_message_at timestamptz,
  last_message_body text,
  last_message_author_name text
) language sql stable security definer set search_path = '' as $$
  select r.id, r.action_plan_id, r.name,
    (select count(*) from public.chat_messages cm
       where cm.chat_room_id = r.id
         and cm.author_id is distinct from auth.uid()
         and (cm.actor_id is null or cm.actor_id is distinct from auth.uid())
         and not exists (select 1 from public.chat_message_reads cr
                         where cr.chat_message_id = cm.id and cr.reader_id = auth.uid()))::int as unread_count,
    latest.created_at as last_message_at,
    latest.body       as last_message_body,
    latest.author_name as last_message_author_name
  from public.chat_rooms r
  left join lateral (
    select cm.created_at, cm.body, p.full_name as author_name
    from public.chat_messages cm
    left join public.profiles p on p.id = cm.author_id
    where cm.chat_room_id = r.id
    order by cm.created_at desc, cm.id desc
    limit 1
  ) latest on true
  where public.is_chat_member(r.id)
  order by latest.created_at desc nulls last;
$$;

revoke execute on function public.get_chat_rooms() from public, anon;

-- ============================================================ GRANTS / REVOKES summary
-- emit_chat_system_event: revoked from ALL (line above) — internal only.
-- get_chat_rooms: CREATE OR REPLACE preserves existing authenticated grant.
-- Triggers: no separate grant needed (fire automatically on DML).
