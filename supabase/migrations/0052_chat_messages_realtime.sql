-- 0052 — Realtime untuk Inbox (Diskusi Rencana Aksi).
-- Masukkan public.chat_messages ke publication `supabase_realtime` agar klien menerima INSERT
-- pesan baru secara live (hook useChatRealtime). RLS chat_messages tetap berlaku pada aliran
-- realtime: hanya anggota room (is_chat_member) menerima event — non-anggota tidak.
--
-- Idempoten: hanya ADD bila publication ada DAN tabel belum terdaftar (aman di-apply ulang).

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'chat_messages'
     )
  then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- REPLICA IDENTITY FULL: pastikan payload realtime (dan filter chat_room_id) tersedia lengkap
-- untuk baris yang di-INSERT. Aman diulang.
alter table public.chat_messages replica identity full;
