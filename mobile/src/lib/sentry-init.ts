// Titik integrasi Sentry ke seam logger. SDK diinjeksi (bukan di-require langsung)
// agar unit test dapat mem-mock tanpa native module + startup lokal (tanpa DSN) tetap
// aman meski package terpasang.
import { addTransport } from './logger';
import { createSentryTransport, type SentryClient } from './sentry-logger';

export type InjectableSentry = SentryClient & {
  init: (options: Record<string, unknown>) => void;
};

export type InitSentryDeps = {
  sentry: InjectableSentry;
  env?: Record<string, string | undefined>;
};

// Sampling produksi konservatif — biaya + noise. Dev boleh 100% agar tim melihat semua
// error. Dapat di-override per-channel via EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE /
// EXPO_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE tanpa rebuild kode.
const PROD_TRACES_SAMPLE_RATE = 0.2;
const PROD_PROFILES_SAMPLE_RATE = 0.1;

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

function samplingFor(environment: string, env: Record<string, string | undefined>) {
  const isDev = environment === 'development';
  const tracesOverride = parseSampleRate(env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE);
  const profilesOverride = parseSampleRate(env.EXPO_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE);
  return {
    tracesSampleRate: tracesOverride ?? (isDev ? 1.0 : PROD_TRACES_SAMPLE_RATE),
    profilesSampleRate: profilesOverride ?? (isDev ? 1.0 : PROD_PROFILES_SAMPLE_RATE),
  };
}

export function initSentry(deps: InitSentryDeps): InjectableSentry | null {
  const env = deps.env ?? process.env;
  const dsn = env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;

  const environment = resolveEnvironment(env);
  deps.sentry.init({
    dsn,
    environment,
    enableAutoSessionTracking: true,
    attachStacktrace: true,
    ...samplingFor(environment, env),
  });

  addTransport(createSentryTransport(deps.sentry));
  return deps.sentry;
}
