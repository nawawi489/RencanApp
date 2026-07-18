-- 0075 — Fix: search_chat_messages kehilangan limit clamp + length guard.
--
-- Port dari main (migrasi 0068, PR #103) — main dan staging keduanya mewarisi
-- 0060_chat_confidential_rls_fts.sql identik (byte-for-byte) dari histori bersama
-- sebelum kedua branch divergen, jadi staging punya bug persis yang sama.
--
-- Bug: 0060 (chat_confidential_rls_fts) melakukan `create or replace function` penuh untuk
-- menambah klausa (b) confidential, tapi body fungsi yang dipakai adalah versi lama tanpa
-- pengaman dari 0054 — hasilnya:
--   * `limit p_limit` mentah (tanpa clamp) → p_limit=100 mengembalikan 100 baris, bukan cap 30.
--     Ketahuan via contract test 0044-DB-8 (supabase/tests/0054_search_chat_messages_contract.sql).
--   * Guard `length(q) < 2` (FR-6, early return server-side) hilang — hanya cek null/kosong.
--   * Truncation p_query ke 200 char ("sabuk pengaman biaya") hilang.
--
-- Perbaikan: restore ketiga guard di atas dari 0054. Logika confidential-gate, join, dan kolom
-- lain dari 0060 TIDAK diubah — hanya menambahkan clamp/guard yang lebih ketat (additive-only,
-- tidak melonggarkan apa pun).

create or replace function public.search_chat_messages(
  p_query      text,
  p_room_id    uuid        default null,
  p_limit      int         default 20,
  p_before     timestamptz default null,
  p_before_id  uuid        default null
)
returns table (
  message_id       uuid,
  chat_room_id     uuid,
  room_name        text,
  initiative_id    uuid,
  author_id        uuid,
  author_name      text,
  snippet          text,
  created_at       timestamptz,
  body_similarity  real
)
language plpgsql stable security definer set search_path = '' as $$
declare
  q text;
  pat text;
  lim int := least(greatest(coalesce(p_limit, 20), 1), 30);
begin
  q := btrim(coalesce(p_query, ''));
  if length(q) < 2 then
    return;
  end if;
  q := substring(q from 1 for 200);
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select
    cm.id          as message_id,
    cm.chat_room_id,
    r.name         as room_name,
    ap.initiative_id,
    cm.author_id,
    p.full_name    as author_name,
    cm.body        as snippet,
    cm.created_at,
    0::real        as body_similarity
  from public.chat_messages cm
  join public.chat_rooms r   on r.id = cm.chat_room_id
  join public.action_plans ap on ap.id = r.action_plan_id
  left join public.profiles p on p.id = cm.author_id
  where cm.organization_id = public.current_user_org()
    and (p_room_id is null or cm.chat_room_id = p_room_id)
    and (
      public.is_chat_member(cm.chat_room_id)
      or (
        public.can_view_workspace()
        and (ap.initiative_id is null or public.can_access_initiative(ap.initiative_id))
      )
    )
    and (
      cm.kind = 'system'
      or public.can_access_confidential_chat(ap.id)
    )
    and cm.body ilike pat escape '\'
    and (
      p_before is null
      or (p_before_id is null and cm.created_at < p_before)
      or (p_before_id is not null and (cm.created_at, cm.id) < (p_before, p_before_id))
    )
  order by cm.created_at desc, cm.id desc
  limit lim;
end;
$$;

revoke execute on function public.search_chat_messages(text, uuid, int, timestamptz, uuid) from public, anon;
grant execute on function public.search_chat_messages(text, uuid, int, timestamptz, uuid) to authenticated;
