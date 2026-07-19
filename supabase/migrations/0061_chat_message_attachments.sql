-- =============================================================================
-- 0061_chat_message_attachments.sql
-- =============================================================================
-- Lampiran diskusi (gambar) di Initiative Chat — PRD §30 komponen 11 (V2).
-- Spec: specs/inbox-chat-attachments.md (FINAL 2026-07-15, owner A–F locked).
-- TDD plan: specs/inbox-chat-attachments-tdd-plan.md §Fase 0.
--
-- Bucket TERPISAH dari evidence (§6.3 — reuse ditolak secara teknis).
-- Empat penjaga struktural (§6.8):
--   1. Bucket berbeda (chat-attachments ≠ evidence).
--   2. Tanpa FK ke evidence_files / task_submissions.
--   3. evidence_files.kind whitelist TIDAK ditambah.
--   4. score-formula tidak pernah membaca chat_messages.
--
-- Jebakan yang WAJIB diingat siapa pun yang menyentuh file ini:
--   §5.1 — JANGAN panggil can_access_action_plan(); salin klausa 2 saja.
--   §5.4 — DROP target = signature 5-param dari 0056 (BUKAN 3-param).
--   §5.5 — Setiap DROP+CREATE wajib re-grant + test has_function_privilege.
--   §5.6 — safeFilename() TIDAK punya bug; reuse apa adanya.
-- =============================================================================

-- ============================================================ 1. BUCKET

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
) on conflict (id) do nothing;

-- ============================================================ 2. HELPER OTORISASI
--
-- Pola 0051: SECURITY DEFINER + GRANT eksplisit ke authenticated.
-- Policy storage TIDAK boleh memanggil is_chat_member langsung — helper ini
-- memanggilnya sebagai owner (set search_path = '' menghindari hijack).
--
-- can_write_chat_attachment: gate tulis = is_chat_member saja.
-- can_read_chat_attachment: gate baca = (is_chat_member OR can_view_workspace)
--   AND predikat confidential. Predikat confidential = SALINAN KLAUSA 2
--   can_access_action_plan (0051:35-46). JANGAN panggil can_access_action_plan()
--   karena klausa 1-nya tidak mengenal Reviewer Task / PIC Task (§5.1).

create or replace function public.can_write_chat_attachment(p_room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_chat_member(p_room);
$$;

create or replace function public.can_read_chat_attachment(p_room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.chat_rooms r
    join public.action_plans ap on ap.id = r.action_plan_id
    where r.id = p_room
      and r.organization_id = public.current_user_org()
      -- Sumbu 1: paritas baca dengan chat_messages_select (0008:336-341).
      and (public.is_chat_member(p_room) or public.can_view_workspace())
      -- Sumbu 2: confidential — SALINAN KLAUSA 2 can_access_action_plan (0051:35-46).
      and (
        not exists (
          select 1 from public.confidential_access_rules cr
          where cr.entity_type = 'action_plan' and cr.entity_id = ap.id
        )
        or public.user_role_level() = 'ceo'
        or ap.pic_id = auth.uid()
        or exists (
          select 1 from public.confidential_access_rules cr
          where cr.entity_type = 'action_plan' and cr.entity_id = ap.id
            and cr.user_id = auth.uid()
        )
      )
  );
$$;

grant execute on function public.can_write_chat_attachment(uuid) to authenticated;
grant execute on function public.can_read_chat_attachment(uuid) to authenticated;
revoke execute on function public.can_write_chat_attachment(uuid) from public, anon;
revoke execute on function public.can_read_chat_attachment(uuid) from public, anon;

-- ============================================================ 3. STORAGE POLICIES
--
-- WAJIB: bucket_id filter, depth >= 3, org segment = current_user_org()::text.
-- JANGAN tiru fallback permisif 'array_length < 2 AND can_view_workspace()'
-- dari evidence_select_authorized (0046:2867).
-- Tidak ada policy UPDATE / DELETE — objek immutable; hapus hanya via RPC DEFINER.

create policy "chat_attachments_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and array_length(storage.foldername(name), 1) >= 3
    and (storage.foldername(name))[1] = public.current_user_org()::text
    and public.can_write_chat_attachment((storage.foldername(name))[2]::uuid)
  );

create policy "chat_attachments_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and array_length(storage.foldername(name), 1) >= 3
    and (storage.foldername(name))[1] = public.current_user_org()::text
    and public.can_read_chat_attachment((storage.foldername(name))[2]::uuid)
  );

-- ============================================================ 4. KOLOM: attachments jsonb

alter table public.chat_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- ============================================================ 5. CHECK: bentuk attachments
--
-- PostgreSQL tidak mengizinkan subquery di CHECK constraint, jadi validasi
-- elemen array dipindah ke helper immutable yang CHECK boleh panggil.

create or replace function public._valid_chat_attachments(p_att jsonb)
returns boolean language sql immutable as $$
  select jsonb_typeof(p_att) = 'array'
    and jsonb_array_length(p_att) <= 3
    and not exists (
      select 1 from jsonb_array_elements(p_att) e
      where jsonb_typeof(e) <> 'object'
         or e->>'path' is null
         or jsonb_typeof(e->'path') <> 'string'
    );
$$;

alter table public.chat_messages
  add constraint chat_messages_attachments_shape
    check (public._valid_chat_attachments(attachments));

-- ============================================================ 6. CHECK: kind invariant v2
--
-- DROP+CREATE (bukan kondisional) — kolom kind/system_event_type/actor_id
-- SUDAH ada di origin/staging (0057). Tambah aturan: system → attachments = 0.

alter table public.chat_messages drop constraint if exists chat_messages_kind_invariant;

alter table public.chat_messages
  add constraint chat_messages_kind_invariant check (
    (kind = 'system' and author_id is null
                     and system_event_type is not null
                     and actor_id is not null
                     and jsonb_array_length(attachments) = 0)
    or
    (kind = 'user'   and system_event_type is null
                     and actor_id is null)
  );

-- ============================================================ 7. RPC: send_chat_message v2 (6-param)
--
-- DROP target = signature LIVE 5-param dari 0056 (§5.4).
-- Signature 3-param (uuid,text,uuid[]) SUDAH di-drop oleh 0056:34.
-- Body MEMPERTAHANKAN seluruh logika 0056: context/reply validation,
-- mention loop, emit_notification. Menambah blok attachment validation.
-- §5.5: DROP menghapus ACL → re-grant wajib eksplisit di bawah.

drop function if exists public.send_chat_message(uuid, text, uuid[], uuid, uuid);

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
  -- Guard existing (byte-for-byte 0008).
  if coalesce(trim(p_body), '') = '' then raise exception 'Pesan tidak boleh kosong.'; end if;
  select * into v_room from public.chat_rooms where id = p_room;
  if not found then raise exception 'Chat room tidak ditemukan.'; end if;
  if not public.is_chat_member(p_room) then
    raise exception 'Hanya anggota room yang dapat mengirim pesan.';
  end if;

  -- Attachment count guard.
  if jsonb_array_length(p_attachments) > 3 then
    raise exception 'Maksimal 3 gambar per pesan.';
  end if;

  -- Per-attachment validation + enrichment (server-derived, anti-spoof).
  for v_att in select * from jsonb_array_elements(p_attachments)
  loop
    v_att_path := v_att->>'path';
    if v_att_path is null or v_att_path = '' then
      raise exception 'Path lampiran tidak valid.';
    end if;

    -- Advisory lock per-path (menutup TOCTOU vs cleanup — §6.6).
    perform pg_advisory_xact_lock(hashtext(v_att_path));

    v_att_parts := storage.foldername(v_att_path);

    -- Object must exist, be owned by caller, and be in the correct room.
    select o.owner, o.metadata into v_obj_owner, v_obj_meta
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

    -- Server-side MIME + size validation (lapis kedua — bucket config bisa berubah tanpa migrasi).
    v_mime := v_obj_meta->>'mimetype';
    v_size := (v_obj_meta->>'size')::bigint;
    if v_mime is null or v_mime not in ('image/jpeg', 'image/png', 'image/webp') then
      raise exception 'Jenis file tidak didukung. Hanya gambar (JPEG, PNG, WebP).';
    end if;
    if v_size is null or v_size > 5242880 then
      raise exception 'Ukuran file melebihi batas 5 MB.';
    end if;

    -- Enrich: derive name/mime/size/kind from storage.objects (anti-spoof — preseden 0056 context_label).
    v_enriched := v_enriched || jsonb_build_array(jsonb_build_object(
      'path', v_att_path,
      'name', storage.filename(v_att_path),
      'mime', v_mime,
      'size', v_size,
      'kind', 'photo'
    ));
  end loop;

  -- Validasi konteks Tugas (FR-RC-3, byte-for-byte 0056).
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

  -- Validasi reply_to (FR-RC-3, byte-for-byte 0056).
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

  -- Mention akses-gated: hanya anggota room (identik 0008/0056).
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

-- ============================================================ 8. RPC: cleanup_orphan_chat_upload
--
-- Pola 0019:265-282 (cleanup_orphan_upload) + ORG GUARD wajib (preseden 0039).
-- p_path dikontrol penuh oleh pemanggil — org guard bukan kehati-hatian
-- berlebihan, ia preseden yang sudah mengikat.
-- Advisory lock menutup TOCTOU vs send_chat_message (§6.7 urutan 1).

create or replace function public.cleanup_orphan_chat_upload(p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_parts text[];
  v_org_id uuid;
  v_room_id uuid;
  v_obj_owner uuid;
begin
  v_parts := storage.foldername(p_path);
  if array_length(v_parts, 1) < 3 then
    raise exception 'Path tidak valid.';
  end if;

  -- Parse UUID segments with exception handler (pola 0019).
  begin
    v_org_id := v_parts[1]::uuid;
    v_room_id := v_parts[2]::uuid;
  exception when others then
    raise exception 'Path tidak valid (UUID parse error).';
  end;

  -- ORG GUARD (pola 0039 — sebelum set_config).
  if v_org_id is distinct from public.current_user_org() then
    raise exception 'Tidak berwenang: organisasi tidak cocok.';
  end if;

  -- Advisory lock (menutup TOCTOU vs send_chat_message).
  perform pg_advisory_xact_lock(hashtext(p_path));

  -- Object must exist and be owned by caller.
  select o.owner into v_obj_owner
  from storage.objects o
  where o.bucket_id = 'chat-attachments' and o.name = p_path;
  if not found then
    raise exception 'File tidak ditemukan di storage.';
  end if;
  if v_obj_owner is distinct from auth.uid() then
    raise exception 'File bukan milik pengguna saat ini.';
  end if;

  -- Reject if path is already referenced in chat_messages.attachments.
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

  -- Bypass storage.protect_delete trigger (pola 0019:cleanup_orphan_upload).
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'chat-attachments' and name = p_path;
end;
$$;

revoke execute on function public.cleanup_orphan_chat_upload(text) from public, anon;
grant execute on function public.cleanup_orphan_chat_upload(text) to authenticated;

-- ============================================================ CATATAN AKHIR
-- RLS chat_messages (append-only 2-lapis) tidak berubah:
--   - REVOKE insert/update/delete dari 0008:1037 tetap berlaku.
--   - chat_messages_select policy dari 0008:336 tetap berlaku (kolom jsonb
--     baru mewarisi SELECT visibility otomatis).
--   - Kolom jsonb termasuk dalam publication supabase_realtime (0052) +
--     replica identity full → payload INSERT lengkap tanpa re-fetch.
