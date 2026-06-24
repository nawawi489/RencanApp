// Layar Notifications (Fase 3) — TabBar 8 tab + 4 state per tab + aksi mark read / mark all.
// Mock hooks (@/hooks/use-notifications) + expo-router; data layer label/tone tetap nyata.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockUseNotifications = jest.fn();
const mockUseUnreadCount = jest.fn();
const mockMarkRead = jest.fn();
const mockMarkAllRead = jest.fn();

jest.mock('@/hooks/use-notifications', () => ({
  useNotifications: (...a: unknown[]) => mockUseNotifications(...a),
  useUnreadCount: () => mockUseUnreadCount(),
  useNotificationActions: () => ({ markRead: mockMarkRead, markAllRead: mockMarkAllRead }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: () => {},
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import NotificationsScreen from '../notifications';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

const ROW = {
  id: 'n1',
  type: 'review_request',
  entity_type: 'action_plan',
  entity_id: 'ap1',
  title: 'Review diminta',
  body: 'Bukti menunggu keputusan Anda',
  is_read: false,
};

function primeList(over: Partial<ReturnType<typeof baseList>> = {}) {
  mockUseNotifications.mockReturnValue(baseList(over));
}
function baseList(over: Partial<{ notifications: unknown[]; isLoading: boolean; isError: boolean }> = {}) {
  return {
    notifications: [ROW],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...over,
  };
}

beforeEach(() => {
  mockUseNotifications.mockReset();
  mockUseUnreadCount.mockReset();
  mockMarkRead.mockReset();
  mockMarkAllRead.mockReset();
  mockMarkRead.mockResolvedValue(undefined);
  mockMarkAllRead.mockResolvedValue(1);
  mockUseUnreadCount.mockReturnValue({ count: 0 });
  primeList();
});

describe('NotificationsScreen', () => {
  it('merender 8 tab', async () => {
    await render(<NotificationsScreen />, { wrapper: wrapper() });
    for (const label of ['Semua', 'Perlu Tindakan', 'Review', 'Deadline', 'Komentar', 'Terlewat', 'Repeat', 'Governance']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('default tab "semua" → useNotifications dipanggil dgn "semua"', async () => {
    await render(<NotificationsScreen />, { wrapper: wrapper() });
    expect(mockUseNotifications).toHaveBeenCalledWith('semua');
  });

  it('ganti tab → useNotifications dipanggil dgn key tab itu', async () => {
    await render(<NotificationsScreen />, { wrapper: wrapper() });
    fireEvent.press(screen.getByText('Review'));
    await waitFor(() => expect(mockUseNotifications).toHaveBeenCalledWith('review'));
  });

  it('data → row title + body + Badge label tipe', async () => {
    await render(<NotificationsScreen />, { wrapper: wrapper() });
    expect(screen.getByText('Review diminta')).toBeTruthy();
    expect(screen.getByText('Bukti menunggu keputusan Anda')).toBeTruthy();
    expect(screen.getByText('Permintaan Review')).toBeTruthy(); // NOTIFICATION_TYPE_LABEL
  });

  it('loading → SkeletonList aksesibel', async () => {
    primeList({ isLoading: true, notifications: [] });
    await render(<NotificationsScreen />, { wrapper: wrapper() });
    expect(screen.getByLabelText('Memuat…')).toBeTruthy();
  });

  it('error → ErrorState role alert + retry memanggil refetch', async () => {
    const refetch = jest.fn();
    mockUseNotifications.mockReturnValue(baseList({ isError: true, notifications: [], refetch } as never));
    await render(<NotificationsScreen />, { wrapper: wrapper() });
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.press(screen.getByText('Coba lagi'));
    expect(refetch).toHaveBeenCalled();
  });

  it('kosong → EmptyState', async () => {
    primeList({ notifications: [] });
    await render(<NotificationsScreen />, { wrapper: wrapper() });
    expect(screen.getByText('Belum ada notifikasi')).toBeTruthy();
  });

  it('tombol "Tandai semua dibaca" memanggil markAllRead', async () => {
    mockUseUnreadCount.mockReturnValue({ count: 3 });
    await render(<NotificationsScreen />, { wrapper: wrapper() });
    fireEvent.press(screen.getByText('Tandai semua dibaca'));
    expect(mockMarkAllRead).toHaveBeenCalled();
  });

  it('tap row → markRead(id) + push ke action plan', async () => {
    await render(<NotificationsScreen />, { wrapper: wrapper() });
    fireEvent.press(screen.getByText('Review diminta'));
    expect(mockMarkRead).toHaveBeenCalledWith('n1');
    expect(mockPush).toHaveBeenCalledWith('/action-plan/ap1');
  });
});
