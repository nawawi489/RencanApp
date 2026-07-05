// Helper murni untuk menormalkan host Supabase per Platform.OS. Menyelesaikan CFG-01
// (web preview di localhost:8081 abort request ke 127.0.0.1:54321) tanpa meregresi
// simulator iOS (canonical 127.0.0.1) atau emulator Android (10.0.2.2 alias host).
//
// Kontrak:
// - Hanya alias local (localhost, 127.0.0.1) yang di-rewrite; host non-local
//   (staging, LAN IP, host.docker.internal) DIPERTAHANKAN apa adanya.
// - Platform di luar {web,ios,android} → no-op (safe default).
// - URL invalid → dikembalikan mentah (jangan throw; caller `env.ts` sudah menjaga
//   presence sebelumnya).
//
// Design note (per critic tdd-plan-ui-testfix-batch1): file dedicated + signature
// tanpa default agar helper tetap pure & testable tanpa isolateModules; supabase.ts
// yang memanggilnya + membawa env.

const LOCAL_ALIASES = new Set(['localhost', '127.0.0.1']);

type SupportedPlatform = 'web' | 'ios' | 'android';

function targetHostFor(platform: string): string | null {
  switch (platform as SupportedPlatform) {
    case 'web':
      return 'localhost';
    case 'ios':
      return '127.0.0.1';
    case 'android':
      return '10.0.2.2';
    default:
      return null;
  }
}

export function resolveSupabaseUrl(platform: string, raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }
  if (!LOCAL_ALIASES.has(parsed.hostname)) return raw;
  const targetHost = targetHostFor(platform);
  if (targetHost === null) return raw;
  parsed.hostname = targetHost;
  // URL.toString() menormalkan pathname kosong menjadi "/" — strip agar hasil
  // konsisten dengan konvensi URL Supabase (tanpa trailing slash) dan tetap
  // idempotent bila caller memberi input dengan/tanpa "/".
  return parsed.toString().replace(/\/$/, '');
}
