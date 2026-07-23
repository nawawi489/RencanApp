// Edge Function: create-user — pembuatan akun oleh admin (PRD §39: invite-only, tanpa self-signup).
//
// Alur: verifikasi JWT pemanggil → cek has_permission('manage_users_permissions') (server penegak
// akhir; pola guard sama dengan set_user_permission 0041) → guard eskalasi role → admin.createUser
// dengan app_metadata.role_level → PIN role_template_id di public.profiles secara eksplisit
// (trigger handle_new_user 0015/F-5 berjalan AFTER INSERT sebelum GoTrue meng-UPDATE app_metadata,
// sehingga role_level tidak kelihatan; manual test ADM-16 2026-07-10 menangkap regresi ini) →
// audit ke activity_logs.
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

  let body: {
    email?: string;
    password?: string;
    full_name?: string;
    role_level?: string;
    role_template_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Body request tidak valid.', requestId });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  const fullName = (body.full_name ?? '').trim();
  const roleLevel = body.role_level ?? 'staff';
  const roleTemplateId = (body.role_template_id ?? '').trim() || null;

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

  const adminClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // BL-19d — Role Template kustom bisa dipilih. Sebelum ini endpoint selalu memungut
  // baris seeded tertua per level, sehingga template kustom bisa DIBUAT tapi tidak
  // pernah bisa DI-ASSIGN.
  //
  // Invarian keamanan: level efektif diturunkan dari BARIS TEMPLATE DI DB, tidak pernah
  // dari `role_level` kiriman klien. Kalau level ikut dipercaya dari body, penyerang cukup
  // mengirim template C-Level bersama `role_level: 'staff'` untuk melewati guard eskalasi —
  // template kustom justru berubah jadi vektor eskalasi, kebalikan dari tujuan fitur ini.
  let effectiveLevel = roleLevel;
  let resolvedTemplateId: string | null = null;

  if (roleTemplateId) {
    const { data: actorOrgRow } = await adminClient
      .from('profiles')
      .select('organization_id')
      .eq('id', actorId)
      .single();
    const actorOrgId = actorOrgRow?.organization_id ?? null;
    if (!actorOrgId) {
      log('error', 'actor_org_missing_preflight', { actorId });
      return reply(400, {
        error: 'Organisasi Anda tidak ditemukan — tidak bisa memvalidasi Role Template.',
        requestId,
      });
    }

    // Template diambil DENGAN filter organisasi: tanpa itu, id template milik org lain
    // akan diterima dan user baru mendarat memakai role milik tenant lain.
    const { data: tpl } = await adminClient
      .from('role_templates')
      .select('id, level')
      .eq('id', roleTemplateId)
      .eq('organization_id', actorOrgId)
      .maybeSingle();
    if (!tpl?.id) {
      log('warn', 'role_template_invalid', { actorId });
      return reply(400, { error: 'Role Template tidak ditemukan di organisasi Anda.', requestId });
    }

    effectiveLevel = tpl.level as string;
    resolvedTemplateId = tpl.id as string;
  }

  // Guard eskalasi berjalan atas level EFEKTIF, bukan level kiriman. Urutannya penting:
  // template diresolusi lebih dulu supaya template ber-level 'ceo'/'c_level' terkena
  // gerbang yang sama dengan permintaan level polos.
  if (!ALLOWED_LEVELS.includes(effectiveLevel)) {
    log('warn', 'escalation_blocked_level', { actorId, effectiveLevel });
    return reply(403, {
      error: 'Role Template dengan level CEO tidak bisa dipakai dari layar ini.',
      requestId,
    });
  }
  if (effectiveLevel === 'c_level') {
    const { data: callerLevel } = await userClient.rpc('user_role_level');
    if (callerLevel !== 'ceo') {
      log('warn', 'escalation_blocked', { actorId, roleLevel: effectiveLevel });
      return reply(403, { error: 'Hanya CEO yang dapat membuat user dengan role C-Level.', requestId });
    }
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role_level: effectiveLevel },
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

  // Pin role_template_id + organization_id di profil user baru. Trigger handle_new_user
  // (AFTER INSERT auth.users) jalan sebelum GoTrue meng-UPDATE app_metadata, jadi role_level
  // belum tampak dan trigger jatuh ke default 'staff' + org TERTUA (migrasi 0001, BL-14).
  // Kita perbaiki di sini pakai org milik actor + level yang diminta.
  //
  // BL-14 §5: bila koreksi ini gagal, user MENDARAT DI ORG WARISAN TRIGGER — gejalanya
  // workspace kosong akibat RLS, bukan error. Karena itu kegagalannya WAJIB terlihat oleh
  // pemanggil lewat `warning` di body respons, bukan hanya di log server (log tidak sampai
  // ke UI — itu persis cacat yang ditutup di sini).
  //
  // Bentuknya sukses+warning, BUKAN error: row auth.users sudah terlanjur ada di titik ini,
  // jadi menjawab 5xx akan menghasilkan user hantu yang tidak terlihat oleh admin dan retry-nya
  // pasti mentok 409 email_exists. Akun tetap valid dan bisa login — yang gagal hanya
  // penempatannya, dan itu bisa dibetulkan manual lewat User & Permission.
  const PLACEMENT_WARNING_MESSAGE =
    'User dibuat, tetapi penempatan organisasi gagal — periksa manual di User & Permission sebelum membagikan akses.';
  let placementFailure: string | null = null;

  const { data: actorProfile, error: actorProfileError } = await adminClient
    .from('profiles')
    .select('organization_id')
    .eq('id', actorId)
    .single();
  const orgId = actorProfile?.organization_id ?? null;
  if (!orgId) {
    log('error', 'actor_org_missing', {
      actorId,
      userId: created.user.id,
      code: (actorProfileError as { code?: string } | null)?.code,
    });
    placementFailure = 'actor_org_missing';
  } else {
    // Template pilihan dipakai apa adanya — sudah divalidasi milik org actor dan sudah
    // melewati guard eskalasi di atas. Tanpa pilihan, perilaku lama dipertahankan:
    // baris seeded TERTUA per level (`order created_at asc`), supaya pemanggil yang
    // tidak mengirim `role_template_id` mendapat hasil yang persis sama seperti dulu.
    const { data: roleRow } = resolvedTemplateId
      ? { data: { id: resolvedTemplateId } }
      : await adminClient
          .from('role_templates')
          .select('id')
          .eq('organization_id', orgId)
          .eq('level', effectiveLevel)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
    if (roleRow?.id) {
      const { error: profileError } = await adminClient
        .from('profiles')
        .update({ role_template_id: roleRow.id, organization_id: orgId })
        .eq('id', created.user.id);
      if (profileError) {
        log('error', 'profile_role_pin_failed', {
          actorId,
          userId: created.user.id,
          code: (profileError as { code?: string }).code,
        });
        placementFailure = 'profile_role_pin_failed';
      }
    } else {
      // Sengaja TIDAK menulis organization_id sendirian di sini: role_template_id warisan
      // trigger menunjuk template milik org lain, dan memindahkan org tanpa role-nya
      // menghasilkan profil silang-org yang lebih sulit didiagnosis daripada dibiarkan utuh.
      log('warn', 'role_template_missing', { actorId, orgId, roleLevel: effectiveLevel });
      placementFailure = 'role_template_missing';
    }
  }

  // Audit best-effort (pola write_activity 0005): user SUDAH dibuat — kegagalan audit tidak
  // membatalkan hasil, hanya dicatat ke log.
  const { error: auditError } = await adminClient.from('activity_logs').insert({
    organization_id: orgId,
    actor_id: actorId,
    entity_type: 'user',
    entity_id: created.user.id,
    action: 'create',
    detail: { role_level: effectiveLevel },
  });
  if (auditError) log('error', 'audit_failed', { actorId, userId: created.user.id });

  log('info', 'user_created', {
    actorId,
    userId: created.user.id,
    roleLevel: effectiveLevel,
    placement: placementFailure ?? 'ok',
  });
  return reply(200, {
    user_id: created.user.id,
    requestId,
    warning: placementFailure ? { code: placementFailure, message: PLACEMENT_WARNING_MESSAGE } : null,
  });
});
