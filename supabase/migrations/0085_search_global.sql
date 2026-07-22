-- BL-10 PR-1 — `public.search_global`: RPC Search multi-scope (PRD §38).
--
-- WAVE 1: KERANGKA SAJA. Fungsi ini sengaja mengembalikan NOL BARIS. Cabang per-scope,
-- guard biaya, cursor keyset, dan delegasi chat menyusul di Wave 2-5. Jangan memakainya
-- dari klien sebelum Wave 6.
--
-- ============================================================================
-- PERINGATAN KEAMANAN (FR-7) — BACA SEBELUM MENAMBAH CABANG SCOPE APA PUN
-- ============================================================================
-- Fungsi ini `security definer` + `set search_path = ''`. Konsekuensinya:
--
--   RLS TABEL TIDAK BERLAKU DI DALAM BADAN FUNGSI INI.
--
-- Tidak ada jaring pengaman kedua. Setiap cabang scope WAJIB menuliskan sendiri gate
-- otorisasinya di `WHERE`, dan gate itu harus dibuktikan <= seketat policy RLS tabel
-- sumbernya (uji reduksi-RLS di supabase/tests/0085_search_global_contract.sql).
--
-- Komentar "RLS-scoped via RPC" yang beredar di mobile/src/app/(app)/search.tsx menyesatkan
-- dan dikoreksi bersama PR ini.
--
-- Aturan turunan yang tidak boleh dilanggar:
--   * Gate hidup di `WHERE`, TIDAK PERNAH sebagai `raise exception` (FR-13). Exception
--     berdasarkan identitas/data aktor adalah oracle: ia membedakan "tidak berhak" dari
--     "tidak ada hasil".
--   * `stable` (bukan `volatile`) adalah penegak mekanis G6: Search tidak menulis apa pun,
--     termasuk activity_logs. Jangan longgarkan demi kemudahan.
--   * `search_cards` TIDAK DISENTUH (NG-6), termasuk bug pola LIKE tanpa escaping di
--     0046:2120. Perbedaan perilaku itu dikunci sengaja oleh DB-73.
-- ============================================================================

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

  return;
end;
$$;

-- ACL (FR-35). `revoke ... from authenticated` SAJA tidak membatalkan grant PUBLIC yang
-- otomatis melekat pada fungsi baru — PUBLIC harus dicabut eksplisit (preseden 0066:22-31).
revoke execute on function public.search_global(text, text[], boolean, int, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.search_global(text, text[], boolean, int, timestamptz, uuid)
  to authenticated;

comment on function public.search_global(text, text[], boolean, int, timestamptz, uuid) is
  'BL-10 Search multi-scope (PRD 38). SECURITY DEFINER: RLS tabel tidak berlaku di dalamnya; '
  'setiap cabang scope wajib menuliskan gate otorisasinya sendiri di WHERE. Wave 1 = kerangka nol baris.';
