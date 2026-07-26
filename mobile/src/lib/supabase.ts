import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from './database.types';
import { env } from './env';
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

// Bungkus fetch dengan AbortController. Tetap hormati signal caller (mis. Supabase
// membatalkan refresh token) dengan meneruskan abort-nya, dan selalu bersihkan timer.
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const callerSignal = init?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
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
