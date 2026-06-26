// Data layer #35 — User & Permission (admin grant/revoke). Tulis-via-RPC, baca-via-RPC ber-gate.
// Otorisasi & invarian (anti-self/eskalasi/audit) ditegakkan server di set_user_permission /
// list_user_permissions_admin (migrasi 0017); fungsi di sini hanya pemanggil tipis.
import { supabase } from './supabase';

/** Satu baris hak akses untuk layar admin. is_default = melekat role (toggle terkunci di UI). */
export type AdminPermissionRow = {
  key: string;
  label: string;
  granted: boolean;
  is_default: boolean;
};

export type SetPermissionInput = {
  targetUserId: string;
  permissionKey: string;
  granted: boolean;
  reason: string;
};

/** Grant/revoke satu key untuk satu user. RPC THROW saat ditolak (gate/self/eskalasi/dll). */
export async function setUserPermission(input: SetPermissionInput): Promise<void> {
  const { error } = await supabase.rpc('set_user_permission', {
    p_target_user_id: input.targetUserId,
    p_permission_key: input.permissionKey,
    p_granted: input.granted,
    p_reason: input.reason,
  });
  if (error) throw error;
}

/** Daftar hak akses satu user (admin). RLS/gate di server → di luar wewenang = throw. */
export async function listUserPermissionsAdmin(targetUserId: string): Promise<AdminPermissionRow[]> {
  if (!targetUserId) return [];
  const { data, error } = await supabase.rpc('list_user_permissions_admin', {
    p_target_user_id: targetUserId,
  });
  if (error) throw error;
  return (data ?? []) as unknown as AdminPermissionRow[];
}
