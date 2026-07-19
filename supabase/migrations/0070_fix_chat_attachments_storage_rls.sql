-- =============================================================================
-- 0070_fix_chat_attachments_storage_rls.sql
-- =============================================================================
-- Two fixes for chat-attachments (0059):
--
-- 1. Storage RLS policies require >= 3 folder segments, but
--    buildChatAttachmentPath produces orgId/roomId/uuid-file.png (2 folders).
--    storage.foldername() strips the filename → [orgId, roomId] = length 2.
--    The >= 3 check was copy-pasted from evidence (3 dirs). Fix: >= 2.
--
-- 2. send_chat_message and cleanup_orphan_chat_upload read `o.owner` (uuid)
--    to verify upload ownership. Supabase Storage now populates `owner_id`
--    (text) instead of `owner`, leaving `owner` NULL on new uploads.
--    Fix: read owner_id and cast to uuid for the comparison.
-- =============================================================================

-- ========================== FIX 1: STORAGE POLICIES ==========================

drop policy if exists "chat_attachments_insert" on storage.objects;
drop policy if exists "chat_attachments_select" on storage.objects;

create policy "chat_attachments_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and array_length(storage.foldername(name), 1) >= 2
    and (storage.foldername(name))[1] = public.current_user_org()::text
    and public.can_write_chat_attachment((storage.foldername(name))[2]::uuid)
  );

create policy "chat_attachments_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and array_length(storage.foldername(name), 1) >= 2
    and (storage.foldername(name))[1] = public.current_user_org()::text
    and public.can_read_chat_attachment((storage.foldername(name))[2]::uuid)
  );

-- ========================== FIX 2: RPC OWNER CHECK ===========================

-- send_chat_message: replace o.owner with o.owner_id::uuid
drop function if exists public.send_chat_message(uuid, text, uuid[], uuid, uuid, jsonb);

create or replace function public.send_chat_message(
  p_room                uuid,
  p_body                text,
  p_mentions            uuid[]  default '{}',
  p_context_action_plan uuid    default null,
  p_reply_to            uuid    default null,
  p_attachments         jsonb   default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
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

    -- FIX: read owner_id (text) instead of deprecated owner (uuid).
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
     attachments)
  values
    (v_room.organization_id, p_room, v_uid, trim(p_body),
     v_context_type, v_context_id, v_context_label, p_reply_to,
     v_enriched)
  returning id into v_msg_id;

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

revoke execute on function public.send_chat_message(uuid, text, uuid[], uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.send_chat_message(uuid, text, uuid[], uuid, uuid, jsonb)
  to authenticated;

-- cleanup_orphan_chat_upload: replace o.owner with o.owner_id::uuid
drop function if exists public.cleanup_orphan_chat_upload(text);

create or replace function public.cleanup_orphan_chat_upload(p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_parts text[];
  v_org_id uuid;
  v_room_id uuid;
  v_obj_owner uuid;
begin
  v_parts := storage.foldername(p_path);
  if array_length(v_parts, 1) < 2 then
    raise exception 'Path tidak valid.';
  end if;

  begin
    v_org_id := v_parts[1]::uuid;
    v_room_id := v_parts[2]::uuid;
  exception when others then
    raise exception 'Path tidak valid (UUID parse error).';
  end;

  if v_org_id is distinct from public.current_user_org() then
    raise exception 'Tidak berwenang: organisasi tidak cocok.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_path));

  -- FIX: read owner_id (text) instead of deprecated owner (uuid).
  select o.owner_id::uuid into v_obj_owner
  from storage.objects o
  where o.bucket_id = 'chat-attachments' and o.name = p_path;
  if not found then
    raise exception 'File tidak ditemukan di storage.';
  end if;
  if v_obj_owner is distinct from auth.uid() then
    raise exception 'File bukan milik pengguna saat ini.';
  end if;

  if exists (
    select 1 from public.chat_messages cm
    where cm.chat_room_id = v_room_id
      and exists (
        select 1 from jsonb_array_elements(cm.attachments) att
        where att->>'path' = p_path
      )
  ) then
    raise exception 'File sudah terkirim dalam pesan — tidak dapat dihapus.';
  end if;

  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'chat-attachments' and name = p_path;
end;
$$;

revoke execute on function public.cleanup_orphan_chat_upload(text) from public, anon;
grant execute on function public.cleanup_orphan_chat_upload(text) to authenticated;
