-- 0098 — get_chat_rooms(): membership prefilter (perf)
--
-- Audit 2026-07-24 (get_chat_rooms, MED-HIGH): fungsi lama men-scan SELURUH tabel
-- chat_rooms (1:1 dengan action_plans se-organisasi) lalu menguji `is_chat_member(r.id)`
-- PER BARIS → ribuan probe keanggotaan hanya untuk mengembalikan segelintir room milik user.
--
-- Perbaikan: drive dari chat_room_members milik user (pakai idx_chat_members_member) lalu
-- JOIN ke chat_rooms. SETARA PERSIS karena is_chat_member hanyalah:
--     is_chat_member(p_room) == exists (select 1 from chat_room_members
--                                       where chat_room_id = p_room and member_id = auth.uid())
-- Diverifikasi di staging: himpunan room lama == baru (only_old=0, only_new=0).
--
-- Tetap `create or replace` dengan SIGNATURE SAMA (0-arg):
--   • ACL TIDAK ter-reset (reset hanya terjadi pada DROP FUNCTION, bukan create-or-replace),
--   • client `supabase.rpc('get_chat_rooms')` tidak berubah, database.types.ts tetap `Args: never`,
--   • tak ada perubahan test data-layer.
-- Grant tetap di-assert ulang secara defensif (idempoten) — mendokumentasikan posture RPC.
--
-- auth.uid() dibungkus `(select auth.uid())` agar dievaluasi sekali sebagai InitPlan
-- (konsisten dengan 0097), bukan per baris dalam subquery unread.
--
-- DITANGGUHKAN (follow-up gabungan server+client): paginasi keyset + watermark unread
-- (last_read_at) untuk mengganti per-room count(*). Prefilter ini sudah membatasi scan ke
-- room milik user, jadi count unread bukan lagi hot-path yang mendesak; paginasi baru berguna
-- setelah inbox list (masih useQuery non-paginated) dipindah ke useInfiniteQuery.

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
         and cm.author_id is distinct from (select auth.uid())
         and (cm.actor_id is null or cm.actor_id is distinct from (select auth.uid()))
         and not exists (select 1 from public.chat_message_reads cr
                         where cr.chat_message_id = cm.id and cr.reader_id = (select auth.uid())))::int as unread_count,
    latest.created_at as last_message_at,
    -- OWNER-C: mask body saat AP confidential dan user bukan CEO/PIC/grantee (LOGIKA TAK BERUBAH).
    case when public.can_access_confidential_chat(r.action_plan_id)
      then latest.body else null end as last_message_body,
    latest.author_name as last_message_author_name
  -- Membership prefilter: mulai dari room milik user (idx_chat_members_member), bukan scan semua room.
  from public.chat_room_members m
  join public.chat_rooms r on r.id = m.chat_room_id
  left join lateral (
    select cm.created_at, cm.body, p.full_name as author_name
    from public.chat_messages cm
    left join public.profiles p on p.id = cm.author_id
    where cm.chat_room_id = r.id
    order by cm.created_at desc, cm.id desc
    limit 1
  ) latest on true
  where m.member_id = (select auth.uid())
  order by latest.created_at desc nulls last;
$$;

-- Posture RPC (defensif; create-or-replace mempertahankan ACL, tetap di-assert eksplisit).
revoke execute on function public.get_chat_rooms() from public, anon;
grant execute on function public.get_chat_rooms() to authenticated;
