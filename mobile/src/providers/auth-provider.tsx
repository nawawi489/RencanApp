import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { parseRecoveryUrl } from '@/lib/parse-recovery-url';
import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  initializing: boolean;
  isRecovering: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [isRecovering, setIsRecovering] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    // getSession bisa reject (mis. storage/koneksi bermasalah). Tanpa .catch, `initializing`
    // menggantung true selamanya → user terjebak di splash. Fallback ke logged-out.
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
      .finally(() => setInitializing(false));

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      // Deep-link "Lupa password" mengarahkan user ke app; Supabase membuat recovery
      // session dan memancarkan PASSWORD_RECOVERY. Flag ini menahan AuthLayout dari
      // redirect prematur ke (app) sebelum user selesai set kata sandi baru.
      if (event === 'PASSWORD_RECOVERY') setIsRecovering(true);
      else if (event === 'SIGNED_OUT') setIsRecovering(false);
    });

    // RN client menyetel `detectSessionInUrl: false`, jadi kita harus membaca URL
    // deep-link manual — cold start (getInitialURL) + warm (event 'url').
    const handleUrl = async (url: string | null) => {
      const tokens = parseRecoveryUrl(url);
      if (!tokens) return;
      await supabase.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
    };
    Linking.getInitialURL()
      .then((url) => handleUrl(url))
      .catch(() => {
        /* offline / permission — biarkan, user bisa login normal */
      });
    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url);
    });

    return () => {
      sub.subscription.unsubscribe();
      linkingSub.remove();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        initializing,
        isRecovering,
        signOut: async () => {
          await supabase.auth.signOut();
          // Bersihkan cache React Query agar data org akun lama tidak tersisa di memori
          // (privacy + hindari stale flash saat akun lain login di device yang sama).
          queryClient.clear();
        },
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>.');
  return ctx;
}
