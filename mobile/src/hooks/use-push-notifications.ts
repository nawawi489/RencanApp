// Push notifications — Blok B (registration) + Blok C (foreground/tap handler).
// Registration: izin OS → expo token → RPC register_push_token (best-effort, tidak throw ke caller).
// Handler: setNotificationHandler(shouldShowAlert=false) + foreground invalidasi + tap navigate.
// Cold-start: getLastNotificationResponseAsync pada mount; di-queue bila session belum tersedia.
// Refs pattern: session & router diakses via ref agar listener effect tetap stabil (1 teardown).
import type { Session } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useQueryClient } from '@tanstack/react-query';

import { reportError } from '@/lib/errors';
import { NOTIFICATIONS_FALLBACK_ROUTE, resolveNotificationRoute } from '@/lib/push-route-resolver';
import { registerPushToken, setCurrentPushToken, unregisterPushToken } from '@/lib/push-notifications';

// EAS projectId — dibutuhkan oleh getExpoPushTokenAsync di SDK 56.
const EXPO_PROJECT_ID = '198a4371-d0ca-4598-9628-619a24d97d43';

// ─── Android notification channel ────────────────────────────────────────────

// Android 8+ (API 26+): notifikasi TIDAK bisa tampil tanpa channel. Buat channel 'default'
// sedini mungkin — dipanggil di module scope root `_layout` — agar push yang tiba sebelum
// user pernah membuka tab Notifikasi tetap tampil. No-op di platform non-Android.
// Best-effort: reject native bridge di-swallow (channel setup bukan blocker startup).
export function ensureAndroidNotificationChannel(): void {
  if (Platform.OS !== 'android') return;
  Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
  }).catch(() => {});
}

// ─── Blok B: usePushRegistration ─────────────────────────────────────────────

export function usePushRegistration() {
  const [permissionStatus, setPermissionStatus] = useState<string>('undetermined');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    Notifications.getPermissionsAsync()
      .then((p) => setPermissionStatus(p.status as string))
      .catch(() => {});
    // Channel Android 'default' dibuat di root `_layout` (ensureAndroidNotificationChannel)
    // agar tersedia sejak launch, bukan hanya saat tab Notifikasi mount.
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
  // Response tap yang belum bisa diproses (session belum ada / navigator belum siap).
  const queuedRef = useRef<NotifResponse>(null);
  // Identifier tap yang sudah dinavigasi — cegah double-nav saat cold-start:
  // getLastNotificationResponseAsync + listener bisa sama-sama fire untuk tap yang sama.
  const handledIdsRef = useRef<Set<string>>(new Set());

  // useRootNavigationState() = undefined sampai root navigator mount (tipenya optimis
  // non-null). Cast agar guard nav-ready jujur; navigate ditahan sampai navigator siap.
  const rootNavState = useRootNavigationState() as
    | ReturnType<typeof useRootNavigationState>
    | undefined;

  // Refs: session, router, dan nav-ready selalu current tanpa menjadi listener-effect dependency.
  // Mutation during render adalah pola intentional (stable closure) — lint rule di-suppress.
  const sessionRef = useRef(session);
  const routerRef = useRef(router);
  const navReadyRef = useRef(false);
  // eslint-disable-next-line react-hooks/refs
  sessionRef.current = session;
  // eslint-disable-next-line react-hooks/refs
  routerRef.current = router;
  // eslint-disable-next-line react-hooks/refs
  navReadyRef.current = rootNavState != null;

  // Navigate final: dedup by identifier → resolve rute (fallback ke tab Notifikasi bila
  // null) → push + invalidate. Dipanggil hanya saat session ADA & navigator siap.
  function navigate(res: NonNullable<NotifResponse>) {
    const id = res.notification.request.identifier;
    // Dedup hanya saat id valid; response sintetis tanpa id tidak pernah di-dedup.
    if (id) {
      if (handledIdsRef.current.has(id)) return;
      handledIdsRef.current.add(id);
    }
    const data = (res.notification.request.content.data ?? {}) as Record<string, unknown>;
    const route =
      resolveNotificationRoute(data.entity_type as string, data.entity_id as string) ??
      NOTIFICATIONS_FALLBACK_ROUTE;
    routerRef.current.push(route as never);
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  // Dispatch: navigate jika session ADA & navigator siap, jika tidak queue untuk di-replay
  // oleh effect di bawah saat kondisi terpenuhi (cold-start / tap logged-out di background).
  function dispatch(res: NotifResponse) {
    if (!res) return;
    if (!sessionRef.current || !navReadyRef.current) {
      queuedRef.current = res;
      return;
    }
    navigate(res);
  }

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

  // Cold-start: ambil tap peluncuran; dispatch akan navigate langsung atau queue.
  useEffect(() => {
    // .catch swallow — native bridge kadang reject saat cold-start di simulator/permission edge.
    // Kegagalan cold-start bukan blocker; foreground listener di effect terpisah tetap aktif.
    Notifications.getLastNotificationResponseAsync()
      .then((res) => {
        dispatch(res);
      })
      .catch(() => {});
    // dispatch stabil terhadap refs; hanya perlu re-run bila queryClient berganti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);

  // Replay queue saat session tersedia ATAU navigator jadi siap (mis. tap logged-out
  // di background yang di-queue listener, atau cold-start sebelum navigator mount).
  useEffect(() => {
    const queued = queuedRef.current;
    if (!queued || !sessionRef.current || !navReadyRef.current) return;
    queuedRef.current = null;
    navigate(queued);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, rootNavState, queryClient]);

  // Foreground + tap listeners digabung dalam satu effect agar satu teardown.
  // session/router diakses via ref agar deps tetap stabil → listener tidak di-recreate tiap render.
  useEffect(() => {
    const recvSub = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    // Tap saat logged-out TIDAK di-drop — dispatch akan queue & replay setelah login.
    const respSub = Notifications.addNotificationResponseReceivedListener((res) => {
      dispatch(res);
    });
    return () => {
      recvSub.remove();
      respSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);
}
