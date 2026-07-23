-- BL-10b (PR-2) — tambah scope `people` ke `public.search_global`.
--
-- `create or replace`, BUKAN `drop`+`create`. `drop function ... cascade` akan mereset ACL
-- fungsi ke PUBLIC EXECUTE, membatalkan revoke yang dipasang 0085. Seluruh badan fungsi
-- karena itu ditulis ulang utuh di sini — itu memang harga dari `create or replace`.
--
-- Peringatan keamanan FR-7 dari 0085 TETAP BERLAKU: fungsi ini `security definer` +
-- `search_path = ''`, sehingga RLS tabel TIDAK berlaku di dalamnya. Cabang `people`
-- menuliskan gate-nya sendiri di WHERE, dan gate itu harus <= seketat
-- `profiles_select_same_org`.

create or replace function public.search_global(
  p_query            text,
  p_scopes           text[]      default null,
  p_include_archived boolean     default false,
  p_limit            int         default 5,
  p_cursor_ts        timestamptz default null,
  p_cursor_id        uuid        default null
)
returns table (
  scope     text,
  id        uuid,
  parent_id uuid,
  title     text,
  subtitle  text,
  snippet   text,
  status    text,
  sort_ts   timestamptz,
  sort_id   uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q   text;
  pat text;
  lim int := least(greatest(coalesce(p_limit, 5), 1), 30);
begin
  -- Guard biaya — disalin VERBATIM dari 0075_fix_search_chat_messages_limit_clamp.sql:42-48.
  -- Regresi 0060 kehilangan justru blok ini karena `create or replace` penuh; jangan
  -- menyusunnya ulang dari ingatan.
  -- Validasi BENTUK-REQUEST (FR-19). Ini SATU-SATUNYA exception yang diizinkan di fungsi
  -- ini, dan ia sah justru karena tidak bergantung pada identitas maupun data aktor:
  -- pemanggil mana pun dengan request berbentuk sama mendapat galat yang sama, sehingga
  -- ia tidak dapat dipakai sebagai oracle. Pesannya statis — jangan menyisipkan nilai
  -- apa pun dari baris atau dari aktor ke dalamnya.
  --
  -- Cursor keyset hanya bermakna dalam SATU urutan. Dengan lebih dari satu scope,
  -- tiap scope punya urutannya sendiri sehingga satu pasang (ts, id) tidak dapat
  -- menunjuk posisi yang konsisten — diam-diam ia akan melewatkan atau menggandakan baris.
  if (p_cursor_ts is not null or p_cursor_id is not null)
     and (p_scopes is null or array_length(p_scopes, 1) is distinct from 1) then
    raise exception 'cursor hanya sah bila p_scopes berisi tepat satu scope'
      using errcode = '22023';    -- invalid_parameter_value
  end if;

  q := btrim(coalesce(p_query, ''));
  if length(q) < 2 then
    return;                       -- EARLY RETURN, bukan exception (FR-13: exception = oracle)
  end if;
  q := substring(q from 1 for 200);
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  -- Cabang `goal`. Catatan yang berlaku untuk SETIAP cabang yang ditambahkan sesudah ini:
  --   * `order by … limit lim` ada DI DALAM subquery cabang, bukan satu limit di akhir UNION
  --     (spec §6.2) — limit per grup, bukan limit global.
  --   * Gate `public.can_access_goal(g.id)` WAJIB. RLS tidak berlaku di sini (lihat header).
  --   * `ilike … escape '\'` — bukan `lower() like`. `search_cards` (0046:2120) memakai pola
  --     tanpa escaping; perbedaan itu DISENGAJA (NG-6) dan dikunci DB-73.
  if p_scopes is null or 'goal' = any(p_scopes) then
    return query
    select
      'goal'::text            as scope,
      g.id                    as id,
      null::uuid              as parent_id,
      g.name                  as title,
      null::text              as subtitle,
      null::text              as snippet,
      g.status                as status,
      g.created_at            as sort_ts,
      g.id                    as sort_id
    from public.goals g
    where g.name ilike pat escape '\'
      and public.can_access_goal(g.id)
      and (p_include_archived or g.status <> 'archived')
      and (p_cursor_ts is null or (g.created_at, g.id) < (p_cursor_ts, p_cursor_id))
    order by g.created_at desc, g.id desc
    limit lim;
  end if;

  if p_scopes is null or 'strategy' = any(p_scopes) then
    return query
    select
      'strategy'::text as scope, t.id, null::uuid as parent_id, t.name as title,
      null::text as subtitle, null::text as snippet, t.status,
      t.created_at as sort_ts, t.id as sort_id
    from public.strategies t
    where t.name ilike pat escape '\'
      and public.can_access_strategy(t.id)
      and (p_include_archived or t.status <> 'archived')
      and (p_cursor_ts is null or (t.created_at, t.id) < (p_cursor_ts, p_cursor_id))
    order by t.created_at desc, t.id desc
    limit lim;
  end if;

  if p_scopes is null or 'initiative' = any(p_scopes) then
    return query
    select
      'initiative'::text as scope, t.id, null::uuid as parent_id, t.name as title,
      null::text as subtitle, null::text as snippet, t.status,
      t.created_at as sort_ts, t.id as sort_id
    from public.initiatives t
    where t.name ilike pat escape '\'
      and public.can_access_initiative(t.id)
      and (p_include_archived or t.status <> 'archived')
      and (p_cursor_ts is null or (t.created_at, t.id) < (p_cursor_ts, p_cursor_id))
    order by t.created_at desc, t.id desc
    limit lim;
  end if;

  if p_scopes is null or 'action_plan' = any(p_scopes) then
    return query
    select
      'action_plan'::text as scope, t.id, null::uuid as parent_id, t.name as title,
      null::text as subtitle, null::text as snippet, t.status,
      t.created_at as sort_ts, t.id as sort_id
    from public.action_plans t
    where t.name ilike pat escape '\'
      and public.can_access_action_plan(t.id)
      and (p_include_archived or t.status <> 'archived')
      and (p_cursor_ts is null or (t.created_at, t.id) < (p_cursor_ts, p_cursor_id))
    order by t.created_at desc, t.id desc
    limit lim;
  end if;

  if p_scopes is null or 'task' = any(p_scopes) then
    return query
    select
      'task'::text as scope, t.id, null::uuid as parent_id, t.name as title,
      null::text as subtitle, null::text as snippet, t.status,
      t.created_at as sort_ts, t.id as sort_id
    from public.tasks t
    where t.name ilike pat escape '\'
      and public.can_access_task(t.id)
      and (p_include_archived or t.status <> 'archived')
      and (p_cursor_ts is null or (t.created_at, t.id) < (p_cursor_ts, p_cursor_id))
    order by t.created_at desc, t.id desc
    limit lim;
  end if;

  if p_scopes is null or 'development_area' = any(p_scopes) then
    return query
    select
      'development_area'::text as scope, t.id, null::uuid as parent_id, t.name as title,
      null::text as subtitle, null::text as snippet, t.status,
      t.created_at as sort_ts, t.id as sort_id
    from public.development_areas t
    where t.name ilike pat escape '\'
      and public.can_access_development_area(t.id)
      and (p_include_archived or t.status <> 'archived')
      and (p_cursor_ts is null or (t.created_at, t.id) < (p_cursor_ts, p_cursor_id))
    order by t.created_at desc, t.id desc
    limit lim;
  end if;

  if p_scopes is null or 'problem_statement' = any(p_scopes) then
    return query
    select
      'problem_statement'::text as scope, t.id, null::uuid as parent_id, t.name as title,
      null::text as subtitle, null::text as snippet, t.status,
      t.created_at as sort_ts, t.id as sort_id
    from public.problem_statements t
    where t.name ilike pat escape '\'
      and public.can_access_problem_statement(t.id)
      and (p_include_archived or t.status <> 'archived')
      and (p_cursor_ts is null or (t.created_at, t.id) < (p_cursor_ts, p_cursor_id))
    order by t.created_at desc, t.id desc
    limit lim;
  end if;

  -- Cabang `chat` — DELEGASI PENUH ke public.search_chat_messages (FR-2).
  --
  -- DILARANG menyalin body-nya ke sini. Preseden yang mengikat: 0060 melakukan
  -- `create or replace` penuh atas fungsi itu dan diam-diam kehilangan limit clamp,
  -- guard length<2, serta truncation — baru dipulihkan 0075. Satu sumber kebenaran
  -- untuk otorisasi chat (termasuk confidential-aware) ada di fungsi itu, bukan di sini.
  --
  -- Guard biaya di atas TIDAK diteruskan mentah: `q` yang sudah di-btrim + truncate 200
  -- dikirim apa adanya, dan fungsi tujuan menerapkan lagi guard-nya sendiri (idempoten).
  -- Truncation 240 di bawah adalah milik search_global — fungsi tujuan mengembalikan body
  -- utuh (0075:57), jadi jangan mengandalkannya memangkas.
  if p_scopes is null or 'chat' = any(p_scopes) then
    return query
    select
      'chat'::text            as scope,
      m.message_id            as id,
      m.chat_room_id          as parent_id,   -- target deep-link: ruangannya
      m.room_name             as title,
      m.author_name           as subtitle,
      left(m.snippet, 240)    as snippet,
      null::text              as status,
      m.created_at            as sort_ts,
      m.message_id            as sort_id
    from public.search_chat_messages(q, null, lim, p_cursor_ts, p_cursor_id) m;
  end if;

  -- Cabang `people` (BL-10b). Gate TERSEDERHANA dari 14 scope: satu-org ATAU diri sendiri,
  -- tanpa permission gate. Padanan policy `profiles_select_same_org` (0001:149-151).
  --
  -- Dua larangan §6.3 yang mengikat cabang ini:
  --   * `email` TIDAK diproyeksikan DAN TIDAK dijadikan field match. Ia PII yang tidak
  --     diminta §38; menjadikannya tercari mengubah permukaan disclosure tanpa diminta.
  --   * Hasil People DE-SCORED — nama + jabatan saja. Dilarang menaruh skor, Trust,
  --     status governance, atau angka teknis apa pun di sini (PRD §32).
  if p_scopes is null or 'people' = any(p_scopes) then
    return query
    select
      'people'::text     as scope,
      p.id               as id,
      null::uuid         as parent_id,
      p.full_name        as title,
      p.position_title   as subtitle,
      null::text         as snippet,
      null::text         as status,
      p.created_at       as sort_ts,
      p.id               as sort_id
    from public.profiles p
    where (p.full_name ilike pat escape '\' or p.position_title ilike pat escape '\')
      and (p.organization_id = public.current_user_org() or p.id = auth.uid())
      and (p_cursor_ts is null or (p.created_at, p.id) < (p_cursor_ts, p_cursor_id))
    order by p.created_at desc, p.id desc
    limit lim;
  end if;

  return;
end;
$$;

-- ACL diulang: `create or replace` mempertahankan grant yang ada, tetapi menuliskannya
-- kembali membuat migrasi ini benar meski dijalankan di database yang fungsinya belum ada.
revoke execute on function public.search_global(text, text[], boolean, int, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.search_global(text, text[], boolean, int, timestamptz, uuid)
  to authenticated;

-- Index trigram untuk kedua field yang di-match cabang `people`. `profiles` jauh lebih
-- kecil daripada tabel card, tetapi ILIKE '%...%' tetap seq-scan tanpa ini.
create index if not exists idx_profiles_full_name_trgm
  on public.profiles using gin (full_name extensions.gin_trgm_ops);
create index if not exists idx_profiles_position_title_trgm
  on public.profiles using gin (position_title extensions.gin_trgm_ops);
