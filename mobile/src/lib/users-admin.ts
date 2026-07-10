// Lib admin — pembuatan user (PRD §39: akun dibuat admin, tanpa self-signup).
// Memanggil Edge Function `create-user` (service-role di server; client hanya kirim intent).
// Server penegak akhir: gate manage_users_permissions + guard eskalasi role ada di function.
import { supabase } from './supabase';

export type CreateOrgUserInput = {
  email: string;
  password: string;
  fullName: string;
  roleLevel: 'staff' | 'management' | 'c_level';
};

export type CreatedOrgUser = { user_id: string };

/**
 * Baca pesan domain terkurasi dari body response FunctionsHttpError (duck-typing
 * `error.context.json()` — tanpa instanceof agar mudah di-mock di unit test).
 */
async function readFunctionErrorMessage(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (!ctx || typeof ctx.json !== 'function') return null;
  try {
    const body = (await ctx.json()) as { error?: unknown } | null;
    return typeof body?.error === 'string' && body.error ? body.error : null;
  } catch {
    return null;
  }
}

export async function createOrgUser(input: CreateOrgUserInput): Promise<CreatedOrgUser> {
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: {
      email: input.email.trim().toLowerCase(),
      password: input.password,
      full_name: input.fullName.trim(),
      role_level: input.roleLevel,
    },
  });
  if (error) {
    // Pesan server terkurasi (Indonesia) di-surface apa adanya via surfaceServerError di layar.
    const serverMessage = await readFunctionErrorMessage(error);
    throw new Error(serverMessage ?? 'Gagal membuat user. Periksa koneksi lalu coba lagi.');
  }
  return data as CreatedOrgUser;
}
