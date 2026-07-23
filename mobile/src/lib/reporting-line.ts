// Data layer BL-19d — Reporting line (PRD §34.3 item 5). Tulis-via-RPC: 0093 mencabut
// seluruh grant tulis `profiles` dari `authenticated`, dan `manager_id` tidak boleh
// membatalkan keputusan itu.
//
// Cakupan V1 DESKRIPTIF, bukan otorisasi: menyetel atasan tidak memberi akses apa pun
// atas data bawahan. Lihat komentar migrasi 0094.
import { supabase } from './supabase';

export type ManagerRef = { id: string; full_name: string | null; email: string | null } | null;

export type ProfileWithManager = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
  manager_id: string | null;
  manager: ManagerRef;
};

/**
 * Anggota org + atasannya masing-masing. `manager` di-embed lewat FK `manager_id` yang
 * menunjuk `profiles` sendiri — self-join, jadi aliasnya WAJIB disebut eksplisit
 * (`manager:profiles!profiles_manager_id_fkey`). Tanpa nama constraint, PostgREST tidak
 * bisa memilih di antara beberapa FK ke tabel yang sama dan menolak query-nya.
 */
export async function listProfilesWithManager(): Promise<ProfileWithManager[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_active, manager_id, manager:profiles!profiles_manager_id_fkey(id, full_name, email)')
    .eq('is_active', true)
    .order('full_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ProfileWithManager[];
}

/** `managerId: null` melepas atasan — selalu diizinkan server, supaya struktur salah bisa dibetulkan. */
export async function setReportingLine(input: {
  userId: string;
  managerId: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('set_reporting_line', {
    p_user_id: input.userId,
    // Generator tipe menuliskan arg `uuid` sebagai `string` non-nullable padahal RPC-nya
    // menerima NULL sebagai "lepas atasan". Pola cast yang sama dipakai `createTeam`.
    p_manager_id: (input.managerId ?? null) as unknown as string,
  });
  if (error) throw error;
}
