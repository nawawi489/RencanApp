// Hooks Fase 3 — Notifications. Membungkus data layer (lib/notifications) dengan React Query.
// Read: list per-tab + unread count global. Write: mark read (satu / semua) via RPC, lalu invalidate.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadCount,
  type NotificationTab,
} from '@/lib/notifications';

/** Daftar notifikasi per tab (default tab "semua"/tanpa filter saat tak diberi). */
export function useNotifications(tab?: NotificationTab) {
  const q = useQuery({
    queryKey: ['notifications', tab],
    queryFn: () => listNotifications(tab),
  });

  return {
    notifications: q.data ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/**
 * Jumlah notifikasi belum dibaca lintas tab (untuk badge header / tab Perlu Tindakan).
 * Surface isLoading/isError supaya pemanggil bisa menyembunyikan badge saat error
 * — dulu fail-silent sebagai "0" yang menutupi notifikasi nyata.
 */
export function useUnreadCount() {
  const q = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => listNotifications(),
  });

  return {
    count: unreadCount(q.data ?? []),
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

/** Aksi tulis: tandai satu / semua dibaca; sukses → invalidate semua query notifications. */
export function useNotificationActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });

  const markReadM = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: invalidate,
  });

  const markAllM = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: invalidate,
  });

  return {
    markRead: (id: string) => markReadM.mutateAsync(id),
    markAllRead: () => markAllM.mutateAsync(),
  };
}
