// Blok B + C TDD — usePushRegistration + usePushHandler.
// Platform.OS: Object.defineProperty (C1 adjudication — BUKAN jest.mock seluruh modul).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

// Platform.OS default ios; per-test override via Object.defineProperty.
Object.defineProperty(Platform, 'OS', { get: () => platformOS, configurable: true });
let platformOS: string = 'ios';

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();
const mockSetNotificationHandler = jest.fn();
const mockSetNotificationChannelAsync = jest.fn();
const mockAddNotificationReceivedListener = jest.fn();
const mockAddNotificationResponseReceivedListener = jest.fn();
const mockGetLastNotificationResponseAsync = jest.fn();

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...a: unknown[]) => mockGetPermissionsAsync(...a),
  requestPermissionsAsync: (...a: unknown[]) => mockRequestPermissionsAsync(...a),
  getExpoPushTokenAsync: (...a: unknown[]) => mockGetExpoPushTokenAsync(...a),
  setNotificationHandler: (...a: unknown[]) => mockSetNotificationHandler(...a),
  setNotificationChannelAsync: (...a: unknown[]) => mockSetNotificationChannelAsync(...a),
  addNotificationReceivedListener: (...a: unknown[]) => mockAddNotificationReceivedListener(...a),
  addNotificationResponseReceivedListener: (...a: unknown[]) => mockAddNotificationResponseReceivedListener(...a),
  getLastNotificationResponseAsync: (...a: unknown[]) => mockGetLastNotificationResponseAsync(...a),
  AndroidImportance: { MAX: 5 },
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: jest.fn((cb: () => unknown) => cb()),
}));

const mockRegisterPushToken = jest.fn();
const mockUnregisterPushToken = jest.fn();
const mockSetCurrentPushToken = jest.fn();
jest.mock('@/lib/push-notifications', () => ({
  registerPushToken: (...a: unknown[]) => mockRegisterPushToken(...a),
  unregisterPushToken: (...a: unknown[]) => mockUnregisterPushToken(...a),
  setCurrentPushToken: (...a: unknown[]) => mockSetCurrentPushToken(...a),
}));

const mockReportError = jest.fn();
jest.mock('@/lib/errors', () => ({
  reportError: (...a: unknown[]) => mockReportError(...a),
}));

// eslint-disable-next-line import/first
import { usePushHandler, usePushRegistration } from '../use-push-notifications';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => {
  platformOS = 'ios';
  mockGetPermissionsAsync.mockReset();
  mockRequestPermissionsAsync.mockReset();
  mockGetExpoPushTokenAsync.mockReset();
  mockSetNotificationHandler.mockReset();
  mockSetNotificationChannelAsync.mockReset();
  mockAddNotificationReceivedListener.mockReset();
  mockAddNotificationResponseReceivedListener.mockReset();
  mockGetLastNotificationResponseAsync.mockReset();
  mockRegisterPushToken.mockReset();
  mockUnregisterPushToken.mockReset();
  mockSetCurrentPushToken.mockReset();
  mockReportError.mockReset();
  mockPush.mockReset();

  // Defaults
  mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
  mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });
  mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
  mockRegisterPushToken.mockResolvedValue(undefined);
  mockUnregisterPushToken.mockResolvedValue(undefined);
  mockSetNotificationChannelAsync.mockResolvedValue(null);
  mockGetLastNotificationResponseAsync.mockResolvedValue(null);
  mockAddNotificationReceivedListener.mockReturnValue({ remove: jest.fn() });
  mockAddNotificationResponseReceivedListener.mockReturnValue({ remove: jest.fn() });
});

// ======================================================= Blok B: usePushRegistration =======================================================

describe('usePushRegistration', () => {
  it('[PN-REG-1] register() saat izin granted: token diperoleh + registerPushToken dipanggil', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => usePushRegistration(), { wrapper });

    await act(async () => {
      await result.current.register();
    });

    expect(mockGetExpoPushTokenAsync).toHaveBeenCalled();
    expect(mockRegisterPushToken).toHaveBeenCalledWith(
      'ExponentPushToken[abc]',
      'ios',
      undefined,
    );
  });

  it('[PN-REG-2] register() saat izin denied: token TIDAK diperoleh, tanpa error', async () => {
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => usePushRegistration(), { wrapper });

    await act(async () => {
      await result.current.register();
    });

    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });

  it('[PN-REG-3] registerPushToken gagal: error di-log (reportError) bukan di-throw', async () => {
    mockRegisterPushToken.mockRejectedValue(new Error('rpc fail'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => usePushRegistration(), { wrapper });

    await act(async () => {
      await result.current.register(); // tidak throw
    });

    expect(mockReportError).toHaveBeenCalled();
  });

  it('[PN-REG-4] unregister() memanggil unregisterPushToken dengan token', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => usePushRegistration(), { wrapper });

    // Register dulu agar token tersimpan
    await act(async () => { await result.current.register(); });
    await act(async () => { await result.current.unregister(); });

    expect(mockUnregisterPushToken).toHaveBeenCalledWith('ExponentPushToken[abc]');
  });

  it('[PN-REG-5] unregister() gagal: error di-log bukan di-throw (best-effort)', async () => {
    mockUnregisterPushToken.mockRejectedValue(new Error('unregister fail'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => usePushRegistration(), { wrapper });

    await act(async () => { await result.current.register(); });
    await act(async () => { await result.current.unregister(); });

    expect(mockReportError).toHaveBeenCalled();
  });

  it('[PN-REG-6] permissionStatus diekspos dari getPermissionsAsync saat mount', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => usePushRegistration(), { wrapper });

    await waitFor(() => expect(result.current.permissionStatus).toBe('granted'));
  });

  it('[PN-REG-7] register() dengan deviceId opsional diteruskan ke registerPushToken', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => usePushRegistration(), { wrapper });

    await act(async () => {
      await result.current.register('device-xyz');
    });

    expect(mockRegisterPushToken).toHaveBeenCalledWith(
      'ExponentPushToken[abc]',
      'ios',
      'device-xyz',
    );
  });

  it('[PN-REG-8] register() passes projectId ke getExpoPushTokenAsync', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => usePushRegistration(), { wrapper });

    await act(async () => { await result.current.register(); });

    expect(mockGetExpoPushTokenAsync).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: expect.any(String) }),
    );
  });

  it('[PN-REG-9] permissionStatus updates ke "granted" setelah register() berhasil', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => usePushRegistration(), { wrapper });

    await waitFor(() => expect(result.current.permissionStatus).toBe('undetermined'));
    await act(async () => { await result.current.register(); });

    expect(result.current.permissionStatus).toBe('granted');
  });

  it('[PN-REG-10] Android → setNotificationChannelAsync("default", {...}) dipanggil saat mount', async () => {
    platformOS = 'android';
    const { wrapper } = makeWrapper();
    await renderHook(() => usePushRegistration(), { wrapper });

    await waitFor(() =>
      expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith(
        'default',
        expect.objectContaining({ importance: 5 }),
      ),
    );
  });
});

// ======================================================= Blok C: usePushHandler =======================================================

describe('usePushHandler', () => {
  const session = { user: { id: 'u1' } } as never;

  it('[PN-HDL-1] mount memanggil setNotificationHandler dengan shouldShowAlert=false', async () => {
    const { wrapper } = makeWrapper();
    await renderHook(() => usePushHandler(session), { wrapper });

    await waitFor(() =>
      expect(mockSetNotificationHandler).toHaveBeenCalledWith(
        expect.objectContaining({ handleNotification: expect.any(Function) }),
      ),
    );
    const handler = mockSetNotificationHandler.mock.calls[0][0];
    const result = await handler.handleNotification({});
    expect(result.shouldShowAlert).toBe(false);
  });

  it('[PN-HDL-2] foreground receipt → invalidate ["notifications"]', async () => {
    let capturedCb: (() => void) | null = null;
    mockAddNotificationReceivedListener.mockImplementation((cb: () => void) => {
      capturedCb = cb;
      return { remove: jest.fn() };
    });
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');

    await renderHook(() => usePushHandler(session), { wrapper });
    await waitFor(() => expect(capturedCb).not.toBeNull());

    await act(async () => { capturedCb!(); });
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['notifications'] }),
      ),
    );
  });

  it('[PN-HDL-3] tap entity_type=action_plan → router.push("/action-plan/{id}")', async () => {
    let capturedCb: ((r: unknown) => void) | null = null;
    mockAddNotificationResponseReceivedListener.mockImplementation((cb: (r: unknown) => void) => {
      capturedCb = cb;
      return { remove: jest.fn() };
    });
    const { wrapper } = makeWrapper();
    await renderHook(() => usePushHandler(session), { wrapper });
    await waitFor(() => expect(capturedCb).not.toBeNull());

    await act(async () => {
      capturedCb!({
        notification: {
          request: { content: { data: { entity_type: 'action_plan', entity_id: 'ap-1' } } },
        },
      });
    });

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('action-plan/ap-1')),
    );
  });

  it('[PN-HDL-4] tap entity_type=action_plan_instance → router.push("/action-plan/instance/{id}")', async () => {
    let capturedCb: ((r: unknown) => void) | null = null;
    mockAddNotificationResponseReceivedListener.mockImplementation((cb: (r: unknown) => void) => {
      capturedCb = cb;
      return { remove: jest.fn() };
    });
    const { wrapper } = makeWrapper();
    await renderHook(() => usePushHandler(session), { wrapper });
    await waitFor(() => expect(capturedCb).not.toBeNull());

    await act(async () => {
      capturedCb!({
        notification: {
          request: { content: { data: { entity_type: 'action_plan_instance', entity_id: 'inst-1' } } },
        },
      });
    });

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('action-plan/instance/inst-1')),
    );
  });

  it('[PN-HDL-5] tap → invalidate ["notifications"]', async () => {
    let capturedCb: ((r: unknown) => void) | null = null;
    mockAddNotificationResponseReceivedListener.mockImplementation((cb: (r: unknown) => void) => {
      capturedCb = cb;
      return { remove: jest.fn() };
    });
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');

    await renderHook(() => usePushHandler(session), { wrapper });
    await waitFor(() => expect(capturedCb).not.toBeNull());

    await act(async () => {
      capturedCb!({
        notification: {
          request: { content: { data: { entity_type: 'action_plan', entity_id: 'ap-2' } } },
        },
      });
    });

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['notifications'] }),
      ),
    );
  });

  it('[PN-HDL-6] entity_type null/unknown → tidak crash, tidak navigate', async () => {
    let capturedCb: ((r: unknown) => void) | null = null;
    mockAddNotificationResponseReceivedListener.mockImplementation((cb: (r: unknown) => void) => {
      capturedCb = cb;
      return { remove: jest.fn() };
    });
    const { wrapper } = makeWrapper();
    await renderHook(() => usePushHandler(session), { wrapper });
    await waitFor(() => expect(capturedCb).not.toBeNull());

    await act(async () => {
      capturedCb!({
        notification: { request: { content: { data: { entity_type: null, entity_id: 'x' } } } },
      });
    });
    await act(async () => {
      capturedCb!({
        notification: { request: { content: { data: { entity_type: 'unknown_entity', entity_id: 'x' } } } },
      });
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('[PN-HDL-7] session null → tap TIDAK navigate', async () => {
    let capturedCb: ((r: unknown) => void) | null = null;
    mockAddNotificationResponseReceivedListener.mockImplementation((cb: (r: unknown) => void) => {
      capturedCb = cb;
      return { remove: jest.fn() };
    });
    const { wrapper } = makeWrapper();
    await renderHook(() => usePushHandler(null), { wrapper });
    await waitFor(() => expect(capturedCb).not.toBeNull());

    await act(async () => {
      capturedCb!({
        notification: {
          request: { content: { data: { entity_type: 'action_plan', entity_id: 'ap-3' } } },
        },
      });
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('[PN-HDL-8] unmount melepas semua listener', async () => {
    const removeReceived = jest.fn();
    const removeResponse = jest.fn();
    mockAddNotificationReceivedListener.mockReturnValue({ remove: removeReceived });
    mockAddNotificationResponseReceivedListener.mockReturnValue({ remove: removeResponse });

    const { wrapper } = makeWrapper();
    const { unmount } = await renderHook(() => usePushHandler(session), { wrapper });

    await waitFor(() => expect(mockAddNotificationReceivedListener).toHaveBeenCalled());
    await act(async () => { unmount(); });

    expect(removeReceived).toHaveBeenCalled();
    expect(removeResponse).toHaveBeenCalled();
  });

  it('[PN-HDL-9] cold start getLastNotificationResponseAsync → navigate saat mount (session valid)', async () => {
    mockGetLastNotificationResponseAsync.mockResolvedValue({
      notification: {
        request: { content: { data: { entity_type: 'action_plan', entity_id: 'ap-cold' } } },
      },
    });
    const { wrapper } = makeWrapper();
    await renderHook(() => usePushHandler(session), { wrapper });

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('action-plan/ap-cold')),
    );
  });

  it('[PN-HDL-10] cold start + session null → response di-queue, navigate saat session tersedia', async () => {
    mockGetLastNotificationResponseAsync.mockResolvedValue({
      notification: {
        request: { content: { data: { entity_type: 'action_plan', entity_id: 'ap-queued' } } },
      },
    });

    let currentSession: typeof session | null = null;
    const { wrapper } = makeWrapper();
    const { rerender } = await renderHook(
      ({ s }: { s: typeof session | null }) => usePushHandler(s),
      { wrapper, initialProps: { s: null } },
    );

    // session null saat mount — belum navigate
    await waitFor(() => expect(true).toBe(true));
    expect(mockPush).not.toHaveBeenCalled();

    // session tersedia — navigate dipicu
    currentSession = session;
    rerender({ s: currentSession });

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('action-plan/ap-queued')),
    );
  });
});
