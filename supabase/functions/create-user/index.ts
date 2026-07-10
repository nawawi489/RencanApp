// Edge Function: create-user — pembuatan akun oleh admin (PRD §39: invite-only, tanpa self-signup).
//
// Alur: verifikasi JWT pemanggil → cek has_permission('manage_users_permissions') (server penegak
// akhir; pola guard sama dengan set_user_permission 0041) → guard eskalasi role → admin.createUser
// dengan app_metadata.role_level (dihormati trigger handle_new_user 0015/F-5, yang membuat
// public.profiles otomatis) → audit ke activity_logs.
//
// Guard eskalasi: role 'ceo' tidak bisa dibuat dari endpoint ini; 'c_level' hanya oleh CEO.
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY di-inject otomatis oleh platform.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_LEVELS = ['staff', 'management', 'c_level'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;

function reply(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  // Log JSON terstruktur ke stdout (dikumpulkan Supabase Function logs). Tanpa PII: email
  // TIDAK pernah di-log — identifikasi via requestId + user id.
  const requestId = crypto.randomUUID();
  const log = (level: 'info' | 'warn' | 'error', event: string, extra: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ level, event, requestId, fn: 'create-user', ...extra }));

  if (req.method !== 'POST') return reply(405, { error: 'Method tidak didukung.', requestId });

  let body: { email?: string; password?: string; full_name?: string; role_level?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Body request tidak valid.', requestId });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  const fullName = (body.full_name ?? '').trim();
  const roleLevel = body.role_level ?? 'staff';

  if (!EMAIL_RE.test(email)) return reply(400, { error: 'Format email tidak valid.', requestId });
  if (password.length < PASSWORD_MIN)
    return reply(400, { error: `Password minimal ${PASSWORD_MIN} karakter.`, requestId });
  if (!fullName) return reply(400, { error: 'Nama lengkap wajib diisi.', requestId });
  if (!ALLOWED_LEVELS.includes(roleLevel))
    return reply(400, { error: 'Role tidak dikenal. Pilih Staff, Management, atau C-Level.', requestId });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    log('warn', 'auth_failed');
    return reply(401, { error: 'Sesi Anda telah berakhir. Silakan masuk kembali.', requestId });
  }
  const actorId = userData.user.id;

  // Gate permission — RPC berjalan sebagai pemanggil (pola revoke public+anon di 0005/0016:
  // authenticated tetap punya EXECUTE via default privileges Supabase).
  const { data: allowed, error: permError } = await userClient.rpc('has_permission', {
    p_key: 'manage_users_permissions',
  });
  if (permError || allowed !== true) {
    log('warn', 'permission_denied', { actorId });
    return reply(403, { error: 'Anda tidak memiliki izin untuk melakukan tindakan ini.', requestId });
  }

  if (roleLevel === 'c_level') {
    const { data: callerLevel } = await userClient.rpc('user_role_level');
    if (callerLevel !== 'ceo') {
      log('warn', 'escalation_blocked', { actorId, roleLevel });
      return reply(403, { error: 'Hanya CEO yang dapat membuat user dengan role C-Level.', requestId });
    }
  }

  const adminClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role_level: roleLevel },
    user_metadata: { full_name: fullName },
  });

  if (createError || !created?.user) {
    const code = (createError as { code?: string } | null)?.code;
    if (code === 'email_exists' || createError?.status === 422) {
      log('warn', 'email_exists', { actorId });
      return reply(409, { error: 'Email ini sudah terdaftar sebagai user.', requestId });
    }
    log('error', 'create_failed', { actorId, code, status: createError?.status });
    return reply(500, { error: 'Gagal membuat user. Coba lagi.', requestId });
  }

  // Audit best-effort (pola write_activity 0005): user SUDAH dibuat — kegagalan audit tidak
  // membatalkan hasil, hanya dicatat ke log.
  const { data: actorProfile } = await adminClient
    .from('profiles')
    .select('organization_id')
    .eq('id', actorId)
    .single();
  const { error: auditError } = await adminClient.from('activity_logs').insert({
    organization_id: actorProfile?.organization_id ?? null,
    actor_id: actorId,
    entity_type: 'user',
    entity_id: created.user.id,
    action: 'create',
    detail: { role_level: roleLevel },
  });
  if (auditError) log('error', 'audit_failed', { actorId, userId: created.user.id });

  log('info', 'user_created', { actorId, userId: created.user.id, roleLevel });
  return reply(200, { user_id: created.user.id, requestId });
});
