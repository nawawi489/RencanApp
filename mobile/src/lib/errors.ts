// WSA-18 / spec §15 — aturan error UI: user hanya melihat copy ramah non-teknis; detail
// teknis (message backend, SQLSTATE, stack) dikirim ke console/telemetry untuk developer.
//
// `alertImpl`/`logImpl` injectable agar pure di unit test.
import { showAlert } from './alert';
import { createLogger } from './logger';

type AlertFn = (title: string, message: string) => void;
type LogFn = (...args: unknown[]) => void;

// SQLSTATE (Postgres) + kode PostgREST → copy ramah bahasa Indonesia. Satu-satunya
// sumber kebenaran mapping error data-layer. Auth punya translator terpisah
// (`translateAuthError` di layar login) — jangan tumpang tindih dengan tabel ini.
const CODE_MESSAGES: Record<string, string> = {
  // Postgres SQLSTATE
  '42501': 'Anda tidak memiliki izin untuk melakukan tindakan ini.',
  '23505': 'Data serupa sudah ada.',
  '23502': 'Ada isian wajib yang belum lengkap.',
  '23503': 'Data terkait tidak ditemukan atau masih digunakan.',
  '23514': 'Nilai yang dimasukkan tidak valid.',
  // PostgREST
  PGRST116: 'Data tidak ditemukan.',
  PGRST301: 'Sesi Anda telah berakhir. Silakan masuk kembali.',
};

// Penanda domain yang dilempar via `RAISE EXCEPTION` (SQLSTATE generik P0001) sehingga
// hanya bisa dikenali dari substring message. Cocokkan spesifik — JANGAN memakai kata
// umum ("duplicate"/"unique") yang bisa muncul di error teknis acak.
const DOMAIN_MESSAGES: { marker: RegExp; message: string }[] = [
  {
    marker: /draft_already_exists/i,
    message: 'Sudah ada draft untuk level ini. Buka draft existing untuk edit.',
  },
];

function readCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code != null) return String(code);
  }
  return undefined;
}

function readMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return undefined;
}

// Copy tunggal untuk kegagalan konektivitas. Error jaringan (fetch putus, socket
// hung + abort timeout, offline) tidak punya SQLSTATE/PostgREST code sehingga lolos
// dari CODE_MESSAGES — kita deteksi dari bentuknya lalu beri panduan actionable.
const NETWORK_ERROR_MESSAGE = 'Koneksi bermasalah. Periksa jaringan Anda lalu coba lagi.';

// `TypeError` = fetch gagal di level transport (RN/web); `AbortError` = timeout kita
// sendiri (lihat supabase.ts) atau request dibatalkan. Substring menutup kasus di
// mana error dibungkus ulang sehingga instance-nya hilang.
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  const message = readMessage(error);
  if (message && /Network request failed|Failed to fetch|Aborted|aborted/i.test(message)) return true;
  return false;
}

/**
 * Petakan error backend (Postgres/PostgREST/RAISE EXCEPTION) ke copy ramah non-teknis.
 * Mengembalikan `undefined` bila tidak ada mapping — pemanggil memakai fallback sendiri.
 * Pure & tolerant terhadap input non-error (null/undefined/string).
 */
export function friendlyErrorMessage(error: unknown): string | undefined {
  const code = readCode(error);
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];

  const message = readMessage(error);
  if (message) {
    const domain = DOMAIN_MESSAGES.find((d) => d.marker.test(message));
    if (domain) return domain.message;
  }

  // Setelah code & penanda domain: error jaringan tak punya code, deteksi terakhir
  // sebelum menyerah agar user dapat hint "periksa koneksi" bukan fallback generik.
  if (isNetworkError(error)) return NETWORK_ERROR_MESSAGE;

  return undefined;
}

/**
 * Untuk error INLINE (setError/setModalError/dll): catat error teknis ke logger lalu kembalikan
 * pesan ramah (mapper bila code dikenal, jika tidak `fallbackMessage`). Satu baris di call-site:
 * `setError(reportError('Konteks', e, 'Fallback ramah.'))`.
 */
export function reportError(context: string, error: unknown, fallbackMessage: string): string {
  createLogger(context).error(error);
  return friendlyErrorMessage(error) ?? fallbackMessage;
}

/**
 * Untuk flow RPC yang SENGAJA mengembalikan pesan domain terkurasi (kalimat Indonesia via
 * `RAISE EXCEPTION`, mis. "Periode ini sudah ditutup...", "Hanya CEO yang dapat..."). Berbeda
 * dari `reportError`: pesan server terkurasi ditampilkan APA ADANYA agar user dapat panduan,
 * TETAPI error dengan code teknis dikenal (SQLSTATE/PostgREST) tetap disembunyikan lewat mapper
 * — jadi kebocoran teknis (WSA-18) tetap tercegah. Selalu mencatat detail ke logger.
 */
export function surfaceServerError(context: string, error: unknown, fallbackMessage: string): string {
  createLogger(context).error(error);
  // Error dengan code teknis dikenal → pesan ramah (sembunyikan mentah).
  const mapped = friendlyErrorMessage(error);
  if (mapped) return mapped;
  // Selain itu: tampilkan pesan server terkurasi apa adanya; fallback bila kosong.
  if (error instanceof Error && error.message) return error.message;
  return fallbackMessage;
}

/**
 * Tampilkan Alert dengan pesan ramah dan JANGAN pernah menampilkan `e.message` mentah ke
 * user. Bila error punya code/penanda yang dikenal, pakai pesan mapper; jika tidak, pakai
 * `fallbackMessage`. Error teknis (objek asli) dicatat via `logImpl` (default console.error).
 */
export function alertFriendlyError(
  title: string,
  error: unknown,
  fallbackMessage: string,
  opts?: { alertImpl?: AlertFn; logImpl?: LogFn },
): void {
  const log = opts?.logImpl ?? ((...a: unknown[]) => createLogger(title).error(...a));
  log(`[${title}]`, error);
  // `showAlert` seam: native → Alert.alert modal; web → banner in-app (react-native-web
  // membuat Alert.alert no-op sehingga tanpa seam ini seluruh error surface diam di web).
  const alert = opts?.alertImpl ?? ((t: string, m: string) => showAlert(t, m));
  alert(title, friendlyErrorMessage(error) ?? fallbackMessage);
}
