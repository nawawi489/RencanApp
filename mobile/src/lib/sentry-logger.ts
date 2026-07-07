// Item 4 — adapter Sentry untuk seam logger (lib/logger.ts).
//
// STATUS: STUB. Belum menautkan @sentry/react-native (butuh dependency + DSN + konfigurasi native
// build). Adapter ini sengaja dependency-free dan menerima `SentryClient` via injeksi, sehingga:
//   1. bisa diuji tanpa SDK nyata, dan
//   2. saat rilis cukup satu baris di app startup — tak ada perubahan lain di seluruh app:
//
//        import * as Sentry from '@sentry/react-native';
//        Sentry.init({ dsn: '…' });
//        setLogger(createSentryLogger(Sentry));   // Sentry memenuhi bentuk SentryClient
//
// Semua jalur error (alertFriendlyError, reportError, ErrorBoundary, QueryCache/MutationCache
// onError) sudah meneruskan ke getLogger(), jadi begitu di-set, telemetry langsung mengalir.
import type { Logger } from './logger';

/**
 * Subset API Sentry yang dipakai adapter. `@sentry/react-native` memenuhi bentuk ini (nama &
 * signature sama), sehingga objek `Sentry` bisa dioper langsung tanpa cast/wrapper.
 */
export type SentryClient = {
  captureException: (error: unknown) => void;
  captureMessage: (message: string, level?: string) => void;
};

/** Placeholder no-op sebelum SDK dipasang — aman dioper ke createSentryLogger untuk uji/dry-run. */
export const noopSentryClient: SentryClient = {
  captureException: () => {},
  captureMessage: () => {},
};

/**
 * Bungkus client Sentry menjadi `Logger`. `error` mengirim exception bila ada objek `Error` di
 * argumen (stack utuh untuk telemetry), selain itu mengirim pesan. Tetap menulis ke console agar
 * developer tetap melihat di dev build. `warn` → breadcrumb level warning; `log` hanya console.
 */
export function createSentryLogger(client: SentryClient): Logger {
  return {
    error: (...args) => {
      const err = args.find((a) => a instanceof Error);
      if (err) client.captureException(err);
      else client.captureMessage(args.map(String).join(' '), 'error');
      console.error(...args);
    },
    warn: (...args) => {
      client.captureMessage(args.map(String).join(' '), 'warning');
      console.warn(...args);
    },
    log: (...args) => {
      console.log(...args);
    },
  };
}
