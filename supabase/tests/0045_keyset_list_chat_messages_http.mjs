// AC-17b integration test — buktikan PostgREST menerima ekspresi `.or()` cursor keyset
// dengan timestamp presisi mikrodetik + offset `+00:00`, end-to-end lewat Kong lokal.
//
// Ini menutup gap yang tidak bisa dibuktikan `0045_keyset_list_chat_messages_contract.sql`
// (psql tidak menyentuh grammar filter PostgREST). Test SQL menegakkan tuple semantics
// (AC-17a); test ini menegakkan filter-string parseable (AC-17b).
//
// Jalankan:
//   node supabase/tests/0045_keyset_list_chat_messages_http.mjs
//
// Prasyarat: stack Supabase lokal jalan (Kong di 54321) + env `mobile/.env` berisi
// EXPO_PUBLIC_SUPABASE_URL & EXPO_PUBLIC_SUPABASE_ANON_KEY. Bila `.env` tak ada, test
// SKIP (bukan FAIL) — konsisten dengan preseden `SKIP` di 0044/0045 SQL contract.
//
// Fokus: HTTP status + shape response. Tidak menegakkan RLS (diuji terpisah di SQL
// contract DB-4/DB-5) — kunci di sini adalah "server TIDAK 400 pada filter cursor
// dengan `+` offset & 6 digit mikrodetik".

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(HERE, '..', '..', 'mobile', '.env');

function loadDotenv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return env;
}

if (!existsSync(ENV_PATH)) {
  console.log('SKIP 0045-HTTP: mobile/.env not found');
  process.exit(0);
}
const env = loadDotenv(ENV_PATH);
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !ANON) {
  console.log('SKIP 0045-HTTP: EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY missing');
  process.exit(0);
}

// Impor supabase-js dari mobile/node_modules — memastikan versi & perilaku identik
// dengan yang dipakai listChatMessages di klien.
// Node ESM di Windows menolak absolute path — wajib pakai file:// URL.
const clientMod = await import(
  pathToFileURL(
    resolve(HERE, '..', '..', 'mobile', 'node_modules', '@supabase', 'supabase-js', 'dist', 'index.mjs'),
  ).href,
).catch(() => null);
if (!clientMod) {
  console.log('SKIP 0045-HTTP: @supabase/supabase-js not resolvable from mobile/node_modules');
  process.exit(0);
}
const { createClient } = clientMod;
const supabase = createClient(URL_, ANON, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

let anyFail = false;
function pass(name) {
  console.log(`PASS ${name}`);
}
function fail(name, msg) {
  console.log(`FAIL ${name}: ${msg}`);
  anyFail = true;
}

// ---- HTTP-1: filter cursor dengan '+00:00' offset & 6-digit mikrodetik TIDAK 400.
{
  const cursor = { createdAt: '2026-06-24T01:00:00.123456+00:00', id: '00000000-0000-0000-0000-000000000000' };
  const orExpr = `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
  const { error, status } = await supabase
    .from('chat_messages')
    .select('id, created_at')
    .eq('chat_room_id', '00000000-0000-0000-0000-000000000000') // room dummy — hasil 0 rows OK; kunci di sini status parse.
    .or(orExpr)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(30);

  // 200 (ok, 0 rows karena RLS anon) atau 401/403 (auth) diterima; 400 = filter parse fail.
  if (error && status === 400) {
    fail('0045-HTTP-1', `PostgREST 400 pada filter '.or()' dgn '+00:00' + mikrodetik: ${JSON.stringify(error)}`);
  } else if (status && status >= 500) {
    fail('0045-HTTP-1', `server error ${status}: ${JSON.stringify(error)}`);
  } else {
    pass(`0045-HTTP-1 (status=${status ?? 'ok'})`);
  }
}

// ---- HTTP-2: filter dengan cursor id UUID valid TIDAK 400 (bentuk kanonik).
{
  const cursor = { createdAt: '2026-06-24T01:00:00.500000+00:00', id: 'a1b2c3d4-e5f6-4a5b-8c9d-000000000001' };
  const orExpr = `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
  const { error, status } = await supabase
    .from('chat_messages')
    .select('id, created_at')
    .eq('chat_room_id', '00000000-0000-0000-0000-000000000000')
    .or(orExpr)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(30);

  if (error && status === 400) {
    fail('0045-HTTP-2', `PostgREST 400: ${JSON.stringify(error)}`);
  } else if (status && status >= 500) {
    fail('0045-HTTP-2', `server error ${status}: ${JSON.stringify(error)}`);
  } else {
    pass(`0045-HTTP-2 (status=${status ?? 'ok'})`);
  }
}

// ---- HTTP-3: page pertama (tanpa .or) juga TIDAK 400 — sanity kontrol.
{
  const { error, status } = await supabase
    .from('chat_messages')
    .select('id, created_at')
    .eq('chat_room_id', '00000000-0000-0000-0000-000000000000')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(30);
  if (error && status === 400) {
    fail('0045-HTTP-3', `sanity page-0 400: ${JSON.stringify(error)}`);
  } else if (status && status >= 500) {
    fail('0045-HTTP-3', `server error ${status}: ${JSON.stringify(error)}`);
  } else {
    pass(`0045-HTTP-3 (status=${status ?? 'ok'})`);
  }
}

// Sentinel line — di-parse oleh runner shell karena Node 24+realtime menyisakan handle yg
// crash uv-cleanup di Windows (exit code korup walau semua assertion sukses). Runner:
//   node ...mjs; grep -q '^HTTP-DONE PASS$' output → sukses.
console.log(anyFail ? 'HTTP-DONE FAIL' : 'HTTP-DONE PASS');
try {
  await supabase.removeAllChannels?.();
  await supabase.realtime?.disconnect?.();
} catch {}
// hard-exit di next tick agar exit code deterministik saat runtime cleanup tidak crash.
setImmediate(() => process.exit(anyFail ? 1 : 0));
