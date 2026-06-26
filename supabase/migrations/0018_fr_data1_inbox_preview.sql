-- 0018 FR-DATA.1 — Perluas get_chat_rooms() dengan preview pesan terakhir.
-- Menambah 2 kolom: last_message_body, last_message_author_name (keduanya nullable).
-- Sumber: spec specs/inbox-chat-ui.md (UI-S-IN1 preview '{author}: {body}').
--
-- Invarian:
--   - Tetap SECURITY DEFINER set search_path='' + gate is_chat_member (akses non-member 0 baris).
--   - LEFT JOIN profiles → author terhapus / author_id NULL tidak meng-drop room (name=NULL, body tetap).
--   - Lateral order by (created_at desc, id desc) → tiebreaker deterministik saat created_at sama.
--   - Outer order by last_message_at desc nulls last dipertahankan.
--   - DROP+CREATE wajib karena return type berubah (TABLE +2 kolom).

drop function if exists public.get_chat_rooms();

create or replace function public.get_chat_rooms()
returns table (
  id uuid,
  initiative_id uuid,
  name text,
  unread_count int,
  last_message_at timestamptz,
  last_message_body text,
  last_message_author_name text
) language sql stable security definer set search_path = '' as $$
  select r.id, r.initiative_id, r.name,
    (select count(*) from public.chat_messages cm
       where cm.chat_room_id = r.id
         and cm.author_id is distinct from auth.uid()
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

-- DROP+CREATE menghilangkan grant; re-apply sesuai pola 0008 (revoke public/anon → grant authenticated tetap default).
revoke execute on function public.get_chat_rooms() from public, anon;
