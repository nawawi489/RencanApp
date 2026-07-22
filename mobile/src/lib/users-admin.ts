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

/**
 * Peringatan non-fatal dari Edge Function: akun BERHASIL dibuat, tetapi koreksi penempatan
 * org/role setelah trigger `handle_new_user` gagal (BL-14 §5). User mendarat di org warisan
 * trigger — gejalanya workspace kosong akibat RLS, bukan error — jadi ini harus terlihat di UI,
 * bukan hanya di log server. `message` sudah berupa copy Indonesia terkurasi dari server;
 * `code` untuk telemetry/diagnosa (`actor_org_missing` | `role_template_missing` |
 * `profile_role_pin_failed`).
 */
export type CreateOrgUserWarning = { code: string; message: string };

export type CreatedOrgUser = { user_id: string; warning: CreateOrgUserWarning | null };

const PLACEMENT_WARNING_FALLBACK =
  'User dibuat, tetapi penempatan organisasi gagal — periksa manual di User & Permission sebelum membagikan akses.';

/** Normalisasi field `warning` yang opsional/berbentuk bebas dari respons function. */
function readWarning(data: unknown): CreateOrgUserWarning | null {
  const raw = (data as { warning?: unknown } | null)?.warning;
  if (!raw || typeof raw !== 'object') return null;
  const code = (raw as { code?: unknown }).code;
  const message = (raw as { message?: unknown }).message;
  if (typeof code !== 'string' || !code) return null;
  return {
    code,
    message: typeof message === 'string' && message ? message : PLACEMENT_WARNING_FALLBACK,
  };
}

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
  return { user_id: (data as { user_id: string }).user_id, warning: readWarning(data) };
}
