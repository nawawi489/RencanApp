// Titik integrasi Sentry ke seam logger. SDK diinjeksi (bukan di-require langsung)
// agar unit test dapat mem-mock tanpa native module + startup lokal (tanpa DSN) tetap
// aman meski package terpasang.
import { setLogger } from './logger';
import { createSentryLogger, type SentryClient } from './sentry-logger';

export type InjectableSentry = SentryClient & {
  init: (options: Record<string, unknown>) => void;
};

export type InitSentryDeps = {
  sentry: InjectableSentry;
  env?: Record<string, string | undefined>;
};

// Sampling produksi konservatif — biaya + noise. Dev boleh 100% agar tim melihat semua
// error. Angka bisa disetel via env di masa depan bila perlu (di luar cakupan awal).
const PROD_TRACES_SAMPLE_RATE = 0.2;
const PROD_PROFILES_SAMPLE_RATE = 0.1;

function resolveEnvironment(env: Record<string, string | undefined>): string {
  if (env.EXPO_PUBLIC_APP_ENV) return env.EXPO_PUBLIC_APP_ENV;
  // __DEV__ hanya ada di runtime RN/Metro; di jest env-nya tidak ada. Fallback aman.
  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
  return isDev ? 'development' : 'production';
}

function samplingFor(environment: string) {
  const isDev = environment === 'development';
  return {
    tracesSampleRate: isDev ? 1.0 : PROD_TRACES_SAMPLE_RATE,
    profilesSampleRate: isDev ? 1.0 : PROD_PROFILES_SAMPLE_RATE,
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
    ...samplingFor(environment),
  });

  setLogger(createSentryLogger(deps.sentry));
  return deps.sentry;
}
