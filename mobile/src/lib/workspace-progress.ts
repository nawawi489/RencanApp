// WSA-15 / AC 22 — data-contract progress orb tree.
// Pemanggil tipis ke RPC server rollup `workspace_card_progress` (SECURITY INVOKER — RLS induk+anak
// ditegakkan; capaian = fungsi anak LANGSUNG non-archived yang TERLIHAT pemanggil).
import { supabase } from './supabase';

type CardProgressRow = { card_id: string; progress: number; is_measured: boolean };

export type CardProgress = { progress: number; isMeasured: boolean };

/**
 * Ambil progress rollup 0–100 + flag isMeasured per card id.
 * Id yang tak lolos RLS SELECT / tak dikembalikan server TIDAK ada di Map → UI render '—'
 * (bukan angka menyesatkan). ids kosong → tidak roundtrip (hindari query kosong).
 */
export async function fetchCardProgress(ids: string[]): Promise<Map<string, CardProgress>> {
  const map = new Map<string, CardProgress>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase.rpc('workspace_card_progress', { p_card_ids: ids });
  if (error) throw error;
  for (const row of (data ?? []) as CardProgressRow[]) {
    map.set(row.card_id, {
      progress: Math.max(0, Math.min(100, Math.round(row.progress))),
      isMeasured: row.is_measured === true,
    });
  }
  return map;
}
