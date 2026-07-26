// Poor-network UX (follow-up): jembatani NetInfo → React Query `onlineManager`.
// Tanpa ini, React Query default menganggap RN selalu online (mengandalkan `navigator.onLine`
// yang tak ada di native), sehingga retry query tetap jalan saat device jelas offline dan
// UI tak punya sinyal "offline". Setelah di-wire, React Query menjeda retry ketika offline
// dan otomatis melanjutkan begitu koneksi pulih; komponen bisa membaca `useIsRestoring`/
// `onlineManager.isOnline()` untuk menampilkan state offline.
//
// Deps injectable agar unit test murni (tanpa modul native). Default menunjuk singleton asli.
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

// Subset NetInfo yang dipakai — hanya subscribe. Memudahkan mock di test.
type NetInfoLike = {
  addEventListener: (listener: (state: NetInfoState) => void) => () => void;
};

// Subset onlineManager React Query yang dipakai — cukup `setEventListener`. Struktural agar
// singleton asli otomatis cocok tanpa mengimpor kelas `OnlineManager` (tak diekspor sbg nilai).
type OnlineManagerLike = {
  setEventListener: (setup: (setOnline: (online: boolean) => void) => (() => void) | undefined) => void;
};

/**
 * Tentukan status online dari state NetInfo. Online = terhubung DAN reachability bukan `false`.
 * `isInternetReachable` bisa `null` saat masih ditentukan — perlakukan sebagai online
 * (optimistis) agar tidak salah menjeda request selama probe reachability berjalan.
 */
export function isOnlineFromNetInfo(state: NetInfoState): boolean {
  return Boolean(state.isConnected) && state.isInternetReachable !== false;
}

/**
 * Pasang jembatan NetInfo → onlineManager. Dipanggil sekali di module scope entry app
 * (`_layout.tsx`). `setEventListener` mengganti listener sebelumnya sehingga idempoten bila
 * terpanggil ulang (mis. Fast Refresh); React Query membersihkan subscription NetInfo saat
 * listener terakhir onlineManager berhenti.
 */
export function installOnlineManager(
  manager: OnlineManagerLike = onlineManager,
  netInfo: NetInfoLike = NetInfo,
): void {
  manager.setEventListener((setOnline) =>
    netInfo.addEventListener((state) => {
      setOnline(isOnlineFromNetInfo(state));
    }),
  );
}
