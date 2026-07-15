-- EMS V2 — Reply-quote / Konteks Tugas (PRD §30 rule 2 + komponen 10 + §44 AC-21).
-- Kolom nullable di chat_messages + DROP+CREATE send_chat_message (dua param opsional baru).
-- Spec: specs/inbox-chat-task-reply-context.md (FINAL 2026-07-13).
--
-- Prinsip terkunci:
--   * Append-only 2-lapis utuh (grant tulis dicabut — hanya RPC SECURITY DEFINER menulis).
--   * Tidak ada policy SELECT yang dilonggarkan.
--   * context_label = snapshot nama Tugas yang dihitung SERVER (bukan input klien).
--   * Validasi anti-spoof: konteks AP wajib satu Initiative dengan room; reply wajib satu room.

-- ============================================================ KOLOM: context + reply_to

alter table public.chat_messages
  add column if not exists context_entity_type text,
  add column if not exists context_entity_id uuid,
  add column if not exists context_label text,
  add column if not exists reply_to_message_id uuid references public.chat_messages(id) on delete set null;

alter table public.chat_messages
  add constraint chat_messages_context_pair
    check (num_nonnulls(context_entity_type, context_entity_id) in (0, 2));

alter table public.chat_messages
  add constraint chat_messages_context_label_requires_pair
    check (context_label is null or (context_entity_type is not null and context_entity_id is not null));

alter table public.chat_messages
  add constraint chat_messages_context_entity_type_enum
    check (context_entity_type is null or context_entity_type in ('task'));

-- ============================================================ RPC: send_chat_message (DROP lama + CREATE baru)
-- DROP signature lama untuk menghindari overload ambigu di PostgREST.

drop function if exists public.send_chat_message(uuid, text, uuid[]);

create or replace function public.send_chat_message(
  p_room uuid,
  p_body text,
  p_mentions uuid[] default '{}',
  p_context_action_plan uuid default null,
  p_reply_to uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_room public.chat_rooms;
  v_msg_id uuid;
  v_uid uuid := auth.uid();
  v_mention uuid;
  v_context_type text := null;
  v_context_id uuid := null;
  v_context_label text := null;
begin
  -- Guard existing (byte-for-byte 0008).
  if coalesce(trim(p_body), '') = '' then raise exception 'Pesan tidak boleh kosong.'; end if;
  select * into v_room from public.chat_rooms where id = p_room;
  if not found then raise exception 'Chat room tidak ditemukan.'; end if;
  if not public.is_chat_member(p_room) then
    raise exception 'Hanya anggota room yang dapat mengirim pesan.';
  end if;

  -- Validasi konteks Tugas (FR-RC-3). Terminologi V1.8.3: executable card = tasks,
  -- parent (pemilik chat room) = action_plans; chat_rooms.action_plan_id.
  if p_context_action_plan is not null then
    select 'task', a.id, a.name
      into v_context_type, v_context_id, v_context_label
    from public.tasks a
    where a.id = p_context_action_plan;
    if v_context_id is null then
      raise exception 'Tugas konteks tidak ditemukan.';
    end if;
    -- Anti-spoof: Tugas harus milik Action Plan yang sama dengan room.
    if not exists (
      select 1 from public.tasks a
      where a.id = p_context_action_plan
        and a.action_plan_id = v_room.action_plan_id
    ) then
      raise exception 'Tugas tidak berada dalam Action Plan room ini.';
    end if;
  end if;

  -- Validasi reply_to (FR-RC-3).
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
     context_entity_type, context_entity_id, context_label, reply_to_message_id)
  values
    (v_room.organization_id, p_room, v_uid, trim(p_body),
     v_context_type, v_context_id, v_context_label, p_reply_to)
  returning id into v_msg_id;

  -- Mention akses-gated: hanya anggota room (identik 0008).
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
$$;

-- ============================================================ GRANTS / REVOKES (pola 0008)

revoke execute on function public.send_chat_message(uuid, text, uuid[], uuid, uuid) from public, anon;
grant execute on function public.send_chat_message(uuid, text, uuid[], uuid, uuid) to authenticated;
