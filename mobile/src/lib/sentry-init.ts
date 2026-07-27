// Titik integrasi Sentry ke seam logger. SDK diinjeksi (bukan di-require langsung)
// agar unit test dapat mem-mock tanpa native module + startup lokal (tanpa DSN) tetap
// aman meski package terpasang.
import { addTransport, createLogger, sanitize } from './logger';
import { createSentryTransport, type SentryClient } from './sentry-logger';

export type SentryUser = { id: string } | null;

export type InjectableSentry = SentryClient & {
  init: (options: Record<string, unknown>) => void;
  setUser?: (user: SentryUser) => void;
};

export type InitSentryDeps = {
  sentry: InjectableSentry;
  env?: Record<string, string | undefined>;
};

// Sampling produksi konservatif — biaya + noise. Dev boleh 100% agar tim melihat semua
// error. Dapat di-override per-channel via EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE /
// EXPO_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE tanpa rebuild kode.
// Konservatif di awal — kuota performance events Sentry free-tier kecil (~10k/mo).
// Naikkan hanya bila baseline error/perf tuning sudah stabil dan owner butuh detail.
// Override per-env via EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE / _PROFILES_SAMPLE_RATE.
const PROD_TRACES_SAMPLE_RATE = 0.1;
const PROD_PROFILES_SAMPLE_RATE = 0;

function resolveEnvironment(env: Record<string, string | undefined>): string {
  if (env.EXPO_PUBLIC_APP_ENV) return env.EXPO_PUBLIC_APP_ENV;
  // __DEV__ hanya ada di runtime RN/Metro; di jest env-nya tidak ada. Fallback aman.
  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
  return isDev ? 'development' : 'production';
}

// Parse env sampling rate ke [0,1]. Invalid (NaN, negatif, >1, kosong) → undefined agar
// pemanggil pakai default; salah ketik di env tidak boleh mematahkan startup.
function parseSampleRate(raw: string | undefined): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return undefined;
  return n;
}

// Release + dist tag Sentry event ke build tertentu. Sourcemap yang di-upload
// oleh workflow deploy dicocokkan pada `release`; tanpa nilai ini stacktrace
// produksi berhenti pada file bundle terminifikasi tanpa mapping. `dist`
// membedakan build ulang atas release yang sama (mis. re-run workflow → SHA
// sama, run_id beda).
function normalizeTag(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  return trimmed;
}

// Module-level ref ke SDK Sentry aktif setelah init. Dipakai `setSentryUser` di
// bawah agar auth-provider tak perlu import langsung `@sentry/react-native`
// (menjaga seam-injection yg dipakai `initSentry`). Null bila DSN kosong /
// init gagal → semua panggilan `setSentryUser` menjadi no-op.
let activeSentry: InjectableSentry | null = null;

/**
 * Kaitkan Sentry event dengan user aktif. Terima Supabase `auth.user.id` (UUID
 * random tanpa PII); email/nama TIDAK boleh dikirim. Panggil dgn `null` saat
 * sign-out agar event pasca-logout tidak masih ter-tag ke user lama.
 *
 * No-op bila Sentry belum di-init (DSN kosong / init gagal / test env).
 */
export function setSentryUser(user: SentryUser): void {
  if (!activeSentry?.setUser) return;
  activeSentry.setUser(user);
}

/** @internal untuk unit test — reset module state antar case. */
export function _resetSentryForTest(): void {
  activeSentry = null;
}

function samplingFor(environment: string, env: Record<string, string | undefined>) {
  const isDev = environment === 'development';
  const tracesOverride = parseSampleRate(env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE);
  const profilesOverride = parseSampleRate(env.EXPO_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE);
  return {
    tracesSampleRate: tracesOverride ?? (isDev ? 1.0 : PROD_TRACES_SAMPLE_RATE),
    profilesSampleRate: profilesOverride ?? (isDev ? 1.0 : PROD_PROFILES_SAMPLE_RATE),
  };
}

// beforeSend adalah lapisan defense-in-depth: transport sudah membangun ulang Error
// dari entry tersanitasi, tapi Sentry SDK juga mengumpulkan breadcrumbs, contexts,
// dan navigasi otomatis yang bisa membawa PII/secret dari sumber lain. Jalankan
// `sanitize` sekali lagi atas seluruh payload event tepat sebelum transmisi.
export function scrubSentryEvent(
  event: Record<string, unknown>,
): Record<string, unknown> {
  return sanitize(event) as Record<string, unknown>;
}

export function initSentry(deps: InitSentryDeps): InjectableSentry | null {
  const env = deps.env ?? process.env;
  const dsn = env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;

  const environment = resolveEnvironment(env);
  // Bungkus init dgn try/catch: dipanggil di module scope root layout, sebelum
  // ErrorBoundary sempat render. Kalau DSN malformed (mis. salah copy dari dashboard),
  // Sentry.init throw → app tak boot (white screen). Fail-safe: catat lewat console
  // transport yang sudah aktif, transport Sentry tidak didaftar, app tetap jalan.
  const release = normalizeTag(env.EXPO_PUBLIC_SENTRY_RELEASE);
  const dist = normalizeTag(env.EXPO_PUBLIC_SENTRY_DIST);

  try {
    deps.sentry.init({
      dsn,
      environment,
      enableAutoSessionTracking: true,
      attachStacktrace: true,
      // Cegah SDK mengirim IP + cookie by default (drift-safe).
      sendDefaultPii: false,
      beforeSend: scrubSentryEvent,
      // Hanya set bila terisi — SDK default (bila undefined) memakai release
      // yang di-embed plugin @sentry/react-native saat native build. Melempar
      // undefined bisa menimpanya dengan literal 'undefined'.
      ...(release ? { release } : {}),
      ...(dist ? { dist } : {}),
      ...samplingFor(environment, env),
    });
  } catch (e) {
    createLogger('Sentry').error(e);
    return null;
  }

  addTransport(createSentryTransport(deps.sentry));
  activeSentry = deps.sentry;
  return deps.sentry;
}
