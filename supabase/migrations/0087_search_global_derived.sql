-- BL-10c (PR-3) — tambah scope `task_instance`, `comment`, `evidence` ke `search_global`.
--
-- `create or replace`, BUKAN `drop`+`create` — `drop ... cascade` mereset ACL fungsi ke
-- PUBLIC EXECUTE dan membatalkan revoke 0085. Badan fungsi karena itu ditulis ulang utuh.
--
-- Peringatan FR-7 dari 0085 TETAP BERLAKU: `security definer` + `search_path = ''` berarti
-- RLS tabel TIDAK berlaku di dalamnya. Ketiga cabang di bawah menuliskan gate-nya sendiri.
--
-- Keputusan owner yang tertanam di sini (BL10-OQ-03, disahkan 2026-07-23): bukti berstatus
-- `draft` hanya tercari oleh PENGUNGGAHNYA. Lihat komentar cabang `evidence`.

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

  -- Cabang `task_instance` (BL-10c). Instance TIDAK punya kolom teks sendiri
  -- (terverifikasi: 0007_fase2_repeat.sql hanya tanggal/status/FK + missed_reason), jadi
  -- "match" didefinisikan ulang: nama Task INDUK, atau `missed_reason` instance itu.
  -- Gate mewarisi `can_access_task` — padanan policy `instances_select` (0046:2831).
  if p_scopes is null or 'task_instance' = any(p_scopes) then
    return query
    select
      'task_instance'::text as scope,
      ti.id                 as id,
      ti.task_id            as parent_id,          -- deep-link ke instance lewat task induk
      t.name                as title,              -- nama Task induk, bukan tanggal
      (ti.instance_date::text || ' · ' || ti.status) as subtitle,
      case when ti.missed_reason ilike pat escape '\' then left(ti.missed_reason, 240) end as snippet,
      ti.status             as status,
      ti.created_at         as sort_ts,
      ti.id                 as sort_id
    from public.task_instances ti
    join public.tasks t on t.id = ti.task_id
    where (t.name ilike pat escape '\' or ti.missed_reason ilike pat escape '\')
      and public.can_access_task(ti.task_id)
      and (p_cursor_ts is null or (ti.created_at, ti.id) < (p_cursor_ts, p_cursor_id))
    order by ti.created_at desc, ti.id desc
    limit lim;
  end if;

  -- Cabang `comment` (BL-10c). Dispatch literal STATIS (§6.4), bukan
  -- `map_legacy_entity_type`: helper itu memetakan action_plan→task tanpa bisa membedakan
  -- baris pra-0045 dari baris baru yang sah memakai literal sama. Untuk GATE hal itu tidak
  -- masalah justru karena `action_plan` dan `task` sama-sama digate `can_access_task`.
  --
  -- Literal di luar daftar ini (termasuk NULL) DITOLAK — fail-closed. Menambah literal baru
  -- ke `comments_entity_type_check` tanpa menambahnya di sini membuat komentarnya tidak
  -- tercari; itu kegagalan yang aman, bukan kebocoran.
  if p_scopes is null or 'comment' = any(p_scopes) then
    return query
    select
      'comment'::text as scope,
      c.id            as id,
      c.entity_id     as parent_id,
      coalesce(t.name, i.name, 'Komentar') as title,
      c.entity_type   as subtitle,
      left(c.body, 240) as snippet,
      null::text      as status,
      c.created_at    as sort_ts,
      c.id            as sort_id
    from public.comments c
    left join public.tasks t
      on c.entity_type in ('action_plan', 'task') and t.id = c.entity_id
    left join public.initiatives i
      on c.entity_type = 'initiative' and i.id = c.entity_id
    left join public.task_instances ti2
      on c.entity_type in ('action_plan_instance', 'task_instance') and ti2.id = c.entity_id
    where c.body ilike pat escape '\'
      and c.organization_id = public.current_user_org()
      and case c.entity_type
            when 'action_plan'          then public.can_access_task(c.entity_id)
            when 'task'                 then public.can_access_task(c.entity_id)
            when 'initiative'           then public.can_access_initiative(c.entity_id)
            when 'action_plan_instance' then public.can_access_task(ti2.task_id)
            when 'task_instance'        then public.can_access_task(ti2.task_id)
            else false                                    -- fail-closed
          end
      and (p_cursor_ts is null or (c.created_at, c.id) < (p_cursor_ts, p_cursor_id))
    order by c.created_at desc, c.id desc
    limit lim;
  end if;

  -- Cabang `evidence` (BL-10c). FR-12 / BL10-OQ-03, default DISAHKAN owner 2026-07-23:
  -- bukti tercari bila submission `status <> 'draft'` ATAU `submitted_by = auth.uid()`.
  --
  -- Ini PENYEMPITAN sengaja terhadap policy `evidence_select` (yang tidak memfilter status
  -- sama sekali) demi semangat evidence locking, sambil tetap membuat PIC menemukan draft
  -- yang baru ia unggah sendiri. Arahnya aman: RPC tetap ⊆ RLS.
  --
  -- `storage_path` dan `url` DILARANG keluar (§6.3) — keduanya tidak diproyeksikan DAN
  -- tidak dijadikan field match. Keduanya menunjuk lokasi berkas yang aksesnya diatur
  -- terpisah; membocorkannya lewat Search memindahkan permukaan otorisasi tanpa diminta.
  if p_scopes is null or 'evidence' = any(p_scopes) then
    return query
    select
      'evidence'::text as scope,
      ef.id            as id,
      s.task_id        as parent_id,
      coalesce(ef.file_name, 'Catatan bukti') as title,
      t2.name          as subtitle,
      left(ef.text_content, 240) as snippet,
      null::text       as status,
      ef.created_at    as sort_ts,
      ef.id            as sort_id
    from public.evidence_files ef
    join public.task_submissions s on s.id = ef.submission_id
    join public.tasks t2 on t2.id = s.task_id
    where (ef.file_name ilike pat escape '\' or ef.text_content ilike pat escape '\')
      and public.can_access_task(s.task_id)
      and (s.status <> 'draft' or s.submitted_by = auth.uid())
      and (p_cursor_ts is null or (ef.created_at, ef.id) < (p_cursor_ts, p_cursor_id))
    order by ef.created_at desc, ef.id desc
    limit lim;
  end if;

  return;
end;
$$;
revoke execute on function public.search_global(text, text[], boolean, int, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.search_global(text, text[], boolean, int, timestamptz, uuid)
  to authenticated;

-- Index trigram untuk field yang di-match ketiga cabang baru.
create index if not exists idx_comments_body_trgm
  on public.comments using gin (body extensions.gin_trgm_ops);
create index if not exists idx_evidence_files_file_name_trgm
  on public.evidence_files using gin (file_name extensions.gin_trgm_ops);
create index if not exists idx_evidence_files_text_content_trgm
  on public.evidence_files using gin (text_content extensions.gin_trgm_ops);
create index if not exists idx_task_instances_missed_reason_trgm
  on public.task_instances using gin (missed_reason extensions.gin_trgm_ops);
