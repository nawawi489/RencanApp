import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from './database.types';
import { env } from './env';
import { createLogger, generateRequestId, withRequestId } from './logger';
import { secureStorage } from './secure-storage';
import { resolveSupabaseUrl } from './supabase-url';

// CFG-01: web preview di localhost:8081 tidak boleh nge-abort request ke
// 127.0.0.1:54321 (cross-origin); helper me-rewrite alias local per Platform.OS
// tanpa meregresi native (ios sim ke 127.0.0.1, android emu ke 10.0.2.2).
const supabaseUrl = resolveSupabaseUrl(Platform.OS, env.supabaseUrl);

// Poor-network UX: tanpa timeout aplikasi, socket yang hung menahan spinner sampai
// timeout platform (~60s) × retry. Kita batasi tiap request ke REQUEST_TIMEOUT_MS lalu
// abort — rejection-nya (AbortError) dipetakan ke copy "periksa koneksi" oleh
// friendlyErrorMessage (errors.ts) alih-alih spinner tak berujung.
const REQUEST_TIMEOUT_MS = 20_000;

const netLog = createLogger('Network');

// Hanya pathname yang di-log — query string Supabase bisa memuat filter ber-PII
// (mis. `?email=eq.a@b.com`). Sanitize logger menyensor email, tapi membuang query
// lebih awal lebih murah + tak bergantung pada pola regex.
function safePath(input: RequestInfo | URL): string {
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return new URL(url).pathname;
  } catch {
    return '[unparseable-url]';
  }
}

// Fetch seam = titik masuk (entry point) korelasi request end-to-end.
//
// Tiap request keluar mendapat requestId segar. Di NATIVE id dikirim sebagai header
// `X-Request-Id`, jadi log server (PostgREST/GoTrue/Storage) bisa dijoin dengan log
// klien. Di WEB header SENGAJA tidak ditambahkan: header kustom cross-origin memicu
// preflight CORS yang gateway Supabase belum tentu izinkan — menambahnya berisiko
// mematikan SELURUH request di web (build staging jalan di web). Korelasi sisi-klien
// tetap ada via log kegagalan di bawah, apa pun platformnya.
//
// requestId TIDAK dipropagasi ke layer di atas via variabel global: `currentRequestId`
// adalah satu global modul dan Hermes tak punya AsyncLocalStorage, jadi menahannya
// lintas `await` bakal saling menimpa antar request konkuren (Home saja mount 8 query
// paralel). Karena itu kegagalan GENUINE (timeout kita / error transport) di-log tepat
// di sini di dalam `withRequestId(requestId, …)` — blok sinkron, bebas race — sehingga
// `entry.requestId` == id yang dikirim ke server. Abort yang DIMINTA caller (refresh
// token dibatalkan, React Query membatalkan query saat unmount) = pembatalan normal,
// bukan kegagalan → tidak di-log.
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const requestId = generateRequestId();
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  const callerSignal = init?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const headers = new Headers(init?.headers ?? undefined);
  if (Platform.OS !== 'web') headers.set('X-Request-Id', requestId);

  return fetch(input, { ...init, headers, signal: controller.signal })
    .catch((error: unknown) => {
      const callerAborted = !timedOut && Boolean(callerSignal?.aborted);
      if (!callerAborted) {
        withRequestId(requestId, () => {
          netLog.warn({ event: 'supabase_request_failed', timedOut, path: safePath(input) });
        });
      }
      throw error;
    })
    .finally(() => clearTimeout(timeoutId));
}

export const supabase = createClient<Database>(supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: fetchWithTimeout,
  },
});

// Refresh token otomatis hanya saat app aktif (rekomendasi Supabase untuk React Native).
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
