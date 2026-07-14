-- 0053 — Seen-by (read-receipt) untuk Diskusi Rencana Aksi (PRD §30 komponen 7).
--
-- Dua perubahan pada public.chat_message_reads:
--
-- 1) Perluas policy SELECT: anggota room boleh melihat read-receipt pesan di room tsb (bukan
--    hanya pembaca sendiri). Baseline policy 0008 (reader_id = auth.uid()) terlalu ketat untuk
--    seen-by. Cakupan tetap terkurung: anggota room saja, via helper is_chat_member yang sudah
--    ada (SECURITY DEFINER, tanpa rekursi).
--
-- 2) Masukkan tabel ke publication `supabase_realtime` (mengikuti pola 0052 untuk chat_messages)
--    agar indikator "Dilihat oleh N" ter-update live saat anggota lain buka room. RLS tetap
--    berlaku pada aliran realtime.
--
-- Idempoten.

-- 1) Perluas SELECT policy.
drop policy if exists "chat_message_reads_select" on public.chat_message_reads;
create policy "chat_message_reads_select" on public.chat_message_reads
  for select to authenticated
  using (
    exists (
      select 1
      from public.chat_messages cm
      where cm.id = chat_message_reads.chat_message_id
        and public.is_chat_member(cm.chat_room_id)
    )
  );

-- 2) Realtime publication (idempoten).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'chat_message_reads'
     )
  then
    alter publication supabase_realtime add table public.chat_message_reads;
  end if;
end $$;

alter table public.chat_message_reads replica identity full;
