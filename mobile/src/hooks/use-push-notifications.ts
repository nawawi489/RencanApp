// Push notifications — Blok B (registration) + Blok C (foreground/tap handler).
// Registration: izin OS → expo token → RPC register_push_token (best-effort, tidak throw ke caller).
// Handler: setNotificationHandler(shouldShowAlert=false) + foreground invalidasi + tap navigate.
// Cold-start: getLastNotificationResponseAsync pada mount; di-queue bila session belum tersedia.
// Refs pattern: session & router diakses via ref agar listener effect tetap stabil (1 teardown).
import type { Session } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useQueryClient } from '@tanstack/react-query';

import { reportError } from '@/lib/errors';
import { resolveNotificationRoute } from '@/lib/push-route-resolver';
import { registerPushToken, setCurrentPushToken, unregisterPushToken } from '@/lib/push-notifications';

// EAS projectId — dibutuhkan oleh getExpoPushTokenAsync di SDK 56.
const EXPO_PROJECT_ID = '198a4371-d0ca-4598-9628-619a24d97d43';

// ─── Blok B: usePushRegistration ─────────────────────────────────────────────

export function usePushRegistration() {
  const [permissionStatus, setPermissionStatus] = useState<string>('undetermined');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    Notifications.getPermissionsAsync()
      .then((p) => setPermissionStatus(p.status as string))
      .catch(() => {});

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      }).catch(() => {});
    }
  }, []);

  async function register(deviceId?: string): Promise<void> {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      setPermissionStatus(status as string);
      if (status !== 'granted') return;

      const { data: expoToken } = await Notifications.getExpoPushTokenAsync({
        projectId: EXPO_PROJECT_ID,
      });
      setToken(expoToken);
      setCurrentPushToken(expoToken);

      await registerPushToken(expoToken, Platform.OS, deviceId);
    } catch (err) {
      reportError('Push register', err, 'Gagal mendaftarkan notifikasi.');
    }
  }

  async function unregister(): Promise<void> {
    const t = token;
    if (!t) return;
    try {
      await unregisterPushToken(t);
      setToken(null);
      setCurrentPushToken(null);
    } catch (err) {
      reportError('Push unregister', err, 'Gagal menonaktifkan notifikasi.');
    }
  }

  return { register, unregister, permissionStatus, token };
}

// ─── Blok C: usePushHandler ──────────────────────────────────────────────────

type NotifResponse = Awaited<ReturnType<typeof Notifications.getLastNotificationResponseAsync>>;

export function usePushHandler(session: Session | null) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const queuedRef = useRef<NotifResponse>(null);

  // Refs: session dan router selalu current tanpa menjadi listener-effect dependency.
  // Mutation during render adalah pola intentional (stable closure) — lint rule di-suppress.
  const sessionRef = useRef(session);
  const routerRef = useRef(router);
  // eslint-disable-next-line react-hooks/refs
  sessionRef.current = session;
  // eslint-disable-next-line react-hooks/refs
  routerRef.current = router;

  // Paksa shouldShowAlert=false — notifikasi foreground TIDAK ditampilkan sebagai alert OS.
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      }),
    });
  }, []);

  // Cold-start: proses langsung jika session tersedia, queue bila belum.
  // Jika session null saat mount, response disimpan di queuedRef — effect berikutnya
  // (dep: [session, queryClient]) akan memproses queue saat session tersedia.
  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then((res) => {
      if (!res) return;
      if (sessionRef.current) {
        const data = (res.notification.request.content.data ?? {}) as Record<string, unknown>;
        const route = resolveNotificationRoute(data.entity_type as string, data.entity_id as string);
        if (route) routerRef.current.push(route as never);
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      } else {
        queuedRef.current = res;
      }
    });
  }, [queryClient]);

  // Proses queue saat session tersedia (trigger hanya saat session berubah).
  useEffect(() => {
    const queued = queuedRef.current;
    if (!sessionRef.current || !queued) return;
    queuedRef.current = null;
    const data = (queued.notification.request.content.data ?? {}) as Record<string, unknown>;
    const route = resolveNotificationRoute(data.entity_type as string, data.entity_id as string);
    if (route) routerRef.current.push(route as never);
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [session, queryClient]);

  // Foreground + tap listeners digabung dalam satu effect agar satu teardown.
  // session/router diakses via ref agar deps tetap stabil → listener tidak di-recreate tiap render.
  useEffect(() => {
    const recvSub = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    const respSub = Notifications.addNotificationResponseReceivedListener((res) => {
      if (!sessionRef.current) return;
      const data = (res.notification.request.content.data ?? {}) as Record<string, unknown>;
      const route = resolveNotificationRoute(data.entity_type as string, data.entity_id as string);
      if (route) routerRef.current.push(route as never);
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    return () => {
      recvSub.remove();
      respSub.remove();
    };
  }, [queryClient]);
}
