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

export const supabase = createClient<Database>(supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
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
