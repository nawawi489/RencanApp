import type { NetInfoState } from '@react-native-community/netinfo';

import { installOnlineManager, isOnlineFromNetInfo } from '../online-manager';

// Fake NetInfo: simpan listener sehingga test bisa memancarkan perubahan state.
function fakeNetInfo() {
  let listener: ((state: NetInfoState) => void) | undefined;
  const unsubscribe = jest.fn();
  return {
    addEventListener: jest.fn((l: (state: NetInfoState) => void) => {
      listener = l;
      return unsubscribe;
    }),
    emit: (state: Partial<NetInfoState>) => listener?.(state as NetInfoState),
    unsubscribe,
  };
}

// Fake onlineManager yang meniru semantik eager React Query: `setEventListener` langsung
// memanggil setup dan menyimpan cleanup. `online` merefleksikan status terakhir.
function fakeManager() {
  let online = true;
  let cleanup: (() => void) | undefined;
  return {
    setEventListener: jest.fn((setup: (setOnline: (o: boolean) => void) => (() => void) | undefined) => {
      cleanup?.();
      cleanup = setup((o: boolean) => {
        online = o;
      });
    }),
    isOnline: () => online,
    cleanup: () => cleanup?.(),
  };
}

function netState(over: Partial<NetInfoState>): NetInfoState {
  return { isConnected: true, isInternetReachable: true, ...over } as NetInfoState;
}

describe('isOnlineFromNetInfo', () => {
  it('online saat terhubung & reachable', () => {
    expect(isOnlineFromNetInfo(netState({ isConnected: true, isInternetReachable: true }))).toBe(true);
  });

  it('offline saat tidak terhubung', () => {
    expect(isOnlineFromNetInfo(netState({ isConnected: false, isInternetReachable: false }))).toBe(false);
  });

  it('offline saat terhubung TAPI reachability = false', () => {
    expect(isOnlineFromNetInfo(netState({ isConnected: true, isInternetReachable: false }))).toBe(false);
  });

  it('optimistis online saat reachability masih null (belum ditentukan)', () => {
    expect(isOnlineFromNetInfo(netState({ isConnected: true, isInternetReachable: null }))).toBe(true);
  });
});

describe('installOnlineManager', () => {
  it('memasang event listener onlineManager dan mensubscribe NetInfo', () => {
    const manager = fakeManager();
    const net = fakeNetInfo();

    installOnlineManager(manager, net);

    expect(manager.setEventListener).toHaveBeenCalledTimes(1);
    // setEventListener eager: setup langsung dijalankan → subscribe NetInfo sekali.
    expect(net.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('meneruskan perubahan status NetInfo ke onlineManager', () => {
    const manager = fakeManager();
    const net = fakeNetInfo();
    installOnlineManager(manager, net);

    net.emit(netState({ isConnected: false, isInternetReachable: false }));
    expect(manager.isOnline()).toBe(false);

    net.emit(netState({ isConnected: true, isInternetReachable: true }));
    expect(manager.isOnline()).toBe(true);
  });

  it('membersihkan subscription NetInfo saat onlineManager di-cleanup', () => {
    const manager = fakeManager();
    const net = fakeNetInfo();

    installOnlineManager(manager, net);
    manager.cleanup();

    expect(net.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
