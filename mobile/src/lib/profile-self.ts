// BL-19c — satu-satunya jalur tulis `profiles` untuk pemilik barisnya sendiri.
//
// Sejak migrasi 0093 tabel `profiles` TIDAK lagi punya GRANT tulis untuk `authenticated`
// dan policy `profiles_update_self` dihapus: RLS tidak punya granularitas kolom, jadi
// policy "update baris sendiri" apa pun selalu seluas SELURUH baris — termasuk
// `role_template_id` (= eskalasi ke CEO) dan `organization_id` (= pindah tenant).
// Batas kolom hidup di badan RPC, jadi `supabase.from('profiles').update(...)` di klien
// akan ditolak server, bukan diam-diam berhasil.
import { supabase } from './supabase';

/** Sama dengan batas yang ditegakkan `update_own_profile` (0093). Divalidasi di klien
 *  hanya untuk menghindari round-trip; server tetap penegak akhir. */
export const MAX_FULL_NAME_LENGTH = 120;

export async function updateOwnProfile(fullName: string): Promise<void> {
  const { error } = await supabase.rpc('update_own_profile', { p_full_name: fullName });
  if (error) throw error;
}
