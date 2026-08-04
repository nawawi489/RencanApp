import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { env } from '@/lib/env';
import { reportError } from '@/lib/errors';
import { parseRecoveryUrl } from '@/lib/parse-recovery-url';
import { getCurrentPushToken, setCurrentPushToken, unregisterPushToken } from '@/lib/push-notifications';
import { setSentryUser } from '@/lib/sentry-init';
import { supabase } from '@/lib/supabase';
import { isRecoveryTokenForProject } from '@/lib/verify-recovery-token';

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

  // Live ref to the session so the deep-link handler can inspect it without
  // re-running the effect on every session change. Session state travels
  // via onAuthStateChange, which fires SIGNED_IN after setSession — that's
  // the exact event we need to NOT redirect the user during, so we must
  // decide *before* calling setSession whether we're entering recovery.
  const sessionRef = useRef<Session | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // S5-6 — kaitkan Sentry event ke user aktif memakai Supabase auth `user.id`
  // (UUID acak, non-PII). Email/nama TIDAK boleh dikirim. Reset ke null pada
  // sign-out agar event pasca-logout tidak masih ter-tag ke user lama.
  useEffect(() => {
    setSentryUser(session?.user?.id ? { id: session.user.id } : null);
  }, [session?.user?.id]);

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
      // Historically we relied on the PASSWORD_RECOVERY event to raise
      // isRecovering. That event never fires here because the RN client sets
      // `detectSessionInUrl: false` — Supabase's recovery emission only
      // happens on the URL detection path. We now set the flag inline from
      // the deep-link handler (see handleRecoveryUrl below); this branch
      // stays as belt-and-suspenders for the web path.
      if (event === 'PASSWORD_RECOVERY') setIsRecovering(true);
      else if (event === 'SIGNED_OUT') setIsRecovering(false);
    });

    // RN client menyetel `detectSessionInUrl: false`, jadi kita harus membaca URL
    // deep-link manual — cold start (getInitialURL) + warm (event 'url').
    const handleUrl = async (url: string | null) => {
      const tokens = parseRecoveryUrl(url);
      if (!tokens) return;

      // S2-6: reject a recovery token whose `iss` does not point at our
      // Supabase project. Without this an attacker with any Supabase project
      // could deep-link the app into `setSession()` for a spoofed identity.
      if (!isRecoveryTokenForProject(tokens.accessToken, env.supabaseUrl)) {
        reportError('recovery link', new Error('token iss mismatch'), 'Link reset password tidak valid.');
        return;
      }

      // S2-6: reject a replayed recovery link that arrives while the user is
      // already signed in as somebody else. Silently `setSession()`-ing here
      // would hand the current device to whoever generated the link — the
      // classic session-fixation shape of this bug. Force sign-out and stop;
      // the user can re-tap the link from a clean state, and if they never
      // requested one it becomes a no-op instead of a compromise.
      if (sessionRef.current) {
        try {
          await supabase.auth.signOut();
          queryClient.clear();
        } catch (err) {
          reportError('sign out before recovery', err, 'Gagal keluar sebelum reset password.');
        }
        reportError(
          'recovery link on active session',
          new Error('active session'),
          'Anda sudah masuk. Silakan tap link reset kembali dari tampilan masuk.',
        );
        return;
      }

      // Raise the recovery flag BEFORE calling setSession so the SIGNED_IN
      // event that follows does not race AuthLayout into an app redirect.
      setIsRecovering(true);
      const { error } = await supabase.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
      if (error) {
        setIsRecovering(false);
        reportError('setSession recovery', error, 'Link reset password kedaluwarsa atau tidak valid.');
      }
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

  const signOut = useCallback(async () => {
    const pushToken = getCurrentPushToken();
    if (pushToken) {
      await unregisterPushToken(pushToken).catch((err) =>
        reportError('Push unregister on signOut', err, 'Gagal menonaktifkan notifikasi push.'),
      );
      setCurrentPushToken(null);
    }
    await supabase.auth.signOut();
    // Bersihkan cache React Query agar data org akun lama tidak tersisa di memori
    // (privacy + hindari stale flash saat akun lain login di device yang sama).
    queryClient.clear();
  }, [queryClient]);

  // Identitas value stabil → consumer app-wide (mis. AuthLayout) tak re-render
  // tiap render provider, hanya saat session/flag benar-benar berubah.
  const value = useMemo<AuthContextValue>(
    () => ({ session, initializing, isRecovering, signOut }),
    [session, initializing, isRecovering, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>.');
  return ctx;
}
