-- 0044 — Search Pesan Inbox (Chat FTS V1).
--
-- Menutup PRD §29 komponen 2 (Search Initiative atau pesan) + AC-27 V1.8.2 (Search & Archive
-- mengikuti permission) untuk jalur pesan. Un-DEFER `specs/inbox-chat-ui.md` L26/L32.
--
-- Isi migrasi:
--   1. extension pg_trgm ke skema `extensions` (konvensi Supabase; qualifier dipakai di RPC)
--   2. index GIN gin_trgm_ops pada chat_messages.body — mendukung ILIKE partial murah
--   3. index composite (organization_id, chat_room_id, created_at desc) — push-down org sebelum
--      operator matching + cursor `(created_at, id)`
--   4. RPC public.search_chat_messages — SECURITY DEFINER STABLE search_path=''
--   5. REVOKE public, anon; GRANT authenticated (RPC yg dipanggil dari client login only)
--
-- Governance (spec §3.3):
--   * Gate: is_chat_member(room) OR (can_view_workspace AND can_access_initiative(initiative)).
--     PENTING — RPC ini SECURITY DEFINER, jadi MEM-BYPASS RLS `chat_messages_select` dan
--     menegakkan gate-nya sendiri. Gate ini WAJIB tetap sinkron (≤ seketat) policy RLS
--     `chat_messages_select` (0008): `is_chat_member(room) OR can_view_workspace()`. Bila
--     kelak RLS chat diperketat (mis. menambah filter confidential), gate ini TIDAK otomatis
--     ikut — perbarui manual di sini juga, kalau tidak search jadi lebih permisif dari baca
--     langsung. Saat ini `can_access_initiative` (0014) TIDAK memfilter confidential_access_rules
--     (body-nya short-circuit di `can_view_workspace()`), jadi gate efektif = RLS. Klaim AC-6
--     (confidential disembunyikan dari view_all_workspace) BELUM ditegakkan di layer chat mana
--     pun — lihat catatan RESOLVED di specs/search-pesan-inbox.md §8 (owner 2026-07-12: chat
--     tidak model confidential per-room). chat_rooms → action_plans →
--     initiative_id; bila action_plans.initiative_id NULL, fallback ke can_view_workspace() saja.
--   * Push-down organization_id = current_user_org() SEBELUM operator ILIKE — planner memakai
--     idx_chat_messages_org_room_created; profiles.is_active=false → current_user_org=NULL → 0
--     baris tanpa exception.
--   * LIKE-escape %, _, \\ — user mengetik '100%' hanya cocok literal '100%', bukan match segalanya.
--   * length<2 → early return (server = sumber kebenaran, FR-6). Client hook juga guard debounce.
--   * p_query dipotong 200 char sebelum diproses (sabuk pengaman biaya).
--   * p_limit clamp 1..30, default 20 — mencegah bulk exfil.
--   * Keyset cursor (p_before, p_before_id) dengan handling NULL eksplisit (bukan coalesce ke
--     cm.id yang bikin tuple selalu equal).
--   * Snippet ±80/240 char server-side — TIDAK expose body utuh.
--   * STABLE — RPC tidak menulis. Verified via 0044-DB-9 contract test.
--
-- Idempoten: `create extension if not exists`, `create index if not exists`, `create or replace
-- function`. Aman re-apply.

create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_chat_messages_body_trgm
  on public.chat_messages using gin (body extensions.gin_trgm_ops);

create index if not exists idx_chat_messages_org_room_created
  on public.chat_messages (organization_id, chat_room_id, created_at desc);

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
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text;
  pat text;
  lim int := least(greatest(coalesce(p_limit, 20), 1), 30);
  match_start int;
begin
  q := btrim(coalesce(p_query, ''));
  if length(q) < 2 then
    return;
  end if;
  q := substring(q from 1 for 200);
  -- Escape LIKE wildcards SEBELUM menyusun pattern. Urutan: \ dulu (agar tak dobel-escape),
  -- lalu % dan _.
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select
    cm.id                             as message_id,
    cm.chat_room_id                   as chat_room_id,
    r.name                            as room_name,
    ap.initiative_id                  as initiative_id,
    cm.author_id                      as author_id,
    p.full_name                       as author_name,
    -- Snippet ±80 char di sekitar match, cap 240 char. position() case-sensitive → gunakan
    -- lower() di kedua sisi supaya offset sesuai ILIKE.
    substring(
      cm.body
      from greatest(position(lower(q) in lower(cm.body)) - 80, 1)
      for 240
    )                                 as snippet,
    cm.created_at                     as created_at,
    extensions.similarity(cm.body, q) as body_similarity
  from public.chat_messages cm
  join public.chat_rooms r on r.id = cm.chat_room_id
  left join public.action_plans ap on ap.id = r.action_plan_id
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

revoke execute on function
  public.search_chat_messages(text, uuid, int, timestamptz, uuid)
  from public, anon;

grant execute on function
  public.search_chat_messages(text, uuid, int, timestamptz, uuid)
  to authenticated;
