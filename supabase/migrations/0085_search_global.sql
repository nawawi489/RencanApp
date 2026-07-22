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
begin
  -- Wave 1: kerangka. Nol baris, tanpa cabang scope apa pun.
  -- Wave 2 menambahkan guard biaya (btrim -> length<2 early return -> substring 1..200 ->
  -- escape \ % _ -> clamp limit 1..30) bersama scope `goal` sebagai kontrol positif.
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
