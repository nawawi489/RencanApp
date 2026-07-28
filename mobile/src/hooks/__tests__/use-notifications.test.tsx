// Hooks Fase 3 — use-notifications. Mock data layer (@/lib/notifications) agar tak menyentuh Supabase.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockListNotifications = jest.fn();
const mockUnreadCount = jest.fn();
const mockMarkNotificationRead = jest.fn();
const mockMarkAllNotificationsRead = jest.fn();

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } } }),
}));

jest.mock('@/lib/notifications', () => ({
  ...jest.requireActual('@/lib/notifications'),
  listNotifications: (...a: unknown[]) => mockListNotifications(...a),
  unreadNotificationsCount: (...a: unknown[]) => mockUnreadCount(...a),
  markNotificationRead: (...a: unknown[]) => mockMarkNotificationRead(...a),
  markAllNotificationsRead: (...a: unknown[]) => mockMarkAllNotificationsRead(...a),
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import { useNotificationActions, useNotifications, useUnreadCount } from '../use-notifications';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

const ITEMS = [
  { id: 'n1', type: 'review_request', is_read: false, entity_type: 'task', entity_id: 'ap1' },
  { id: 'n2', type: 'comment', is_read: true, entity_type: 'task', entity_id: 'ap2' },
  { id: 'n3', type: 'mention', is_read: false, entity_type: 'task', entity_id: 'ap3' },
];

beforeEach(() => {
  mockListNotifications.mockReset();
  mockUnreadCount.mockReset();
  mockMarkNotificationRead.mockReset();
  mockMarkAllNotificationsRead.mockReset();
  mockListNotifications.mockResolvedValue(ITEMS);
  mockUnreadCount.mockResolvedValue(2);
  mockMarkNotificationRead.mockResolvedValue(undefined);
  mockMarkAllNotificationsRead.mockResolvedValue(2);
});

describe('useNotifications', () => {
  it('[1] mengambil notifikasi via data layer & mengekspos data saat sukses', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useNotifications('semua'), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(3));
    expect(mockListNotifications).toHaveBeenCalledWith('u1', 'semua');
    expect(result.current.isError).toBe(false);
  });

  it('[2] meneruskan tab ke listNotifications', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useNotifications('review'), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(3));
    expect(mockListNotifications).toHaveBeenCalledWith('u1', 'review');
  });

  it('[3] isError true saat fetch gagal', async () => {
    mockListNotifications.mockRejectedValue(new Error('boom'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useNotifications('semua'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('[4] refetch tersedia & memanggil ulang data layer', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useNotifications('semua'), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(3));
    mockListNotifications.mockClear();
    await result.current.refetch();
    expect(mockListNotifications).toHaveBeenCalled();
  });
});

describe('useUnreadCount', () => {
  it('[5] S3-6: memakai HEAD count endpoint terpisah (tidak lagi menarik list utuh)', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useUnreadCount(), { wrapper });
    await waitFor(() => expect(result.current.count).toBe(2));
    expect(mockUnreadCount).toHaveBeenCalled();
    expect(mockListNotifications).not.toHaveBeenCalled();
  });
});

describe('useNotificationActions', () => {
  it('[6] markRead memanggil RPC & invalidate query notifications', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useNotificationActions(), { wrapper });
    await result.current.markRead('n1');
    await waitFor(() => expect(mockMarkNotificationRead).toHaveBeenCalledWith('n1'));
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys.some((k) => k.includes('notifications'))).toBe(true);
  });

  it('[7] markAllRead memanggil RPC & invalidate query notifications', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useNotificationActions(), { wrapper });
    await result.current.markAllRead();
    await waitFor(() => expect(mockMarkAllNotificationsRead).toHaveBeenCalled());
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys.some((k) => k.includes('notifications'))).toBe(true);
  });
});
