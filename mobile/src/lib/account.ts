// Lib akun — kepatuhan UU PDP + Play Data safety.
//
// Tiga jalur yang wajib tersedia untuk aplikasi yang mengolah data pekerja:
//   1) Permintaan penghapusan akun (dari dalam aplikasi ATAU URL publik).
//   2) Anonimisasi identitas (baris skor/audit yg tak boleh dihapus tetap ada
//      tapi terputus dari identitas).
//   3) Ekspor data user (portabilitas).
//
// Semua bertumpu pada RPC di 0115_account_anonymization.sql.
import { supabase } from './supabase';

export type AccountDeletionRequest = {
  id: string;
  requested_at: string;
  status: 'pending' | 'anonymized' | 'cancelled';
  resolved_at: string | null;
};

/**
 * Ajukan permintaan penghapusan akun untuk user login. Idempoten — panggilan
 * kedua tanpa pending baru mengembalikan id yang sama. Admin org yang punya
 * `manage_users_permissions` akan memproses via `anonymizeAccount()`.
 */
export async function requestAccountDeletion(reason?: string): Promise<string> {
  const { data, error } = await supabase.rpc('request_account_deletion', {
    p_reason: reason,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Anonimisasi akun user lain (admin path). Server (RPC `anonymize_account`)
 * menegakkan gate `manage_users_permissions` + anti-self-anonymize +
 * cross-org guard. Klien hanya kirim intent.
 */
export async function anonymizeAccount(
  targetUserId: string,
  reason?: string,
): Promise<void> {
  const { error } = await supabase.rpc('anonymize_account', {
    p_target_user_id: targetUserId,
    p_reason: reason,
  });
  if (error) throw error;
}

/**
 * Ekspor data user login sebagai JSON — profil + org + ringkasan aktivitas +
 * daftar card yang dimiliki. Cukup memenuhi syarat "jalur ekspor data" untuk
 * V1; portabilitas format lengkap dapat menyusul bila regulator/user meminta.
 */
export async function exportMyData(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) throw error;
  return data as Record<string, unknown>;
}
