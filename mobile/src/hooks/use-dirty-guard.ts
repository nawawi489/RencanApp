// S7-2 (Sprint 7): guard perubahan-belum-tersimpan untuk form modal.
//
// Sebelum sprint 7, delapan form terbesar berjalan sebagai modal — satu swipe-down
// membuang isi form 18 field tanpa peringatan (termasuk berkas yang sudah dipilih di
// layar submit bukti). Hook ini membungkus `usePreventRemove` dari expo-router
// (re-export react-navigation) + `showAlert` cross-platform, sehingga penerapannya
// jadi satu baris di setiap layar form:
//
//   useDirtyGuard(name.trim() !== '' || files.length > 0);
//
// Konfirmasi berlaku untuk:
// - Swipe-down (iOS modal presentation) — `preventNativeDismiss` di react-native-screens
// - Tombol back (Android hardware & JS header) — via `beforeRemove` listener
// - Aksi navigasi lain yang mencabut screen dari stack (Link, router.replace, dsb.)
//
// Setelah submit sukses, pemanggil harus mereset state form (mis. `setName('')`) atau
// menandai `submittedRef.current = true` yang di-XOR di isDirty — supaya safeBack tidak
// dijegat oleh guard sendiri.

import { useCallback, useRef } from 'react';
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';

import { showAlert } from '@/lib/alert';

const DEFAULT_TITLE = 'Buang perubahan?';
const DEFAULT_MESSAGE =
  'Perubahan yang belum disimpan akan hilang. Yakin ingin keluar?';
const DEFAULT_DISCARD_LABEL = 'Buang';
const DEFAULT_KEEP_LABEL = 'Tetap di sini';

export type DirtyGuardOptions = {
  /** Judul dialog konfirmasi. Default: "Buang perubahan?". */
  title?: string;
  /** Pesan detail. Default: "Perubahan yang belum disimpan akan hilang. Yakin ingin keluar?". */
  message?: string;
  /** Label tombol destruktif (buang). Default: "Buang". */
  discardLabel?: string;
  /** Label tombol batal (tetap di form). Default: "Tetap di sini". */
  keepLabel?: string;
};

/**
 * Mencegah screen ditutup selagi `isDirty` true tanpa konfirmasi eksplisit.
 *
 * `isDirty` harus dihitung dari state form — biasanya "ada field terisi yang berbeda
 * dari nilai awal". Sinyal apa yang dianggap dirty adalah keputusan pemanggil; hook
 * ini tidak mengintrospeksi form.
 *
 * Setelah user memilih "Buang", `navigation.dispatch(data.action)` dijalankan untuk
 * meneruskan aksi navigasi asli (swipe/back/close). `bypassRef` memastikan callback
 * berikutnya tidak menampilkan dialog dua kali untuk aksi yang sama — karena
 * `preventRemove` argumen ke `usePreventRemove` masih `true` saat re-dispatch, listener
 * fire lagi; kita mendeteksinya via ref dan me-forward dispatch tanpa dialog.
 */
export function useDirtyGuard(isDirty: boolean, options?: DirtyGuardOptions): void {
  const title = options?.title ?? DEFAULT_TITLE;
  const message = options?.message ?? DEFAULT_MESSAGE;
  const discardLabel = options?.discardLabel ?? DEFAULT_DISCARD_LABEL;
  const keepLabel = options?.keepLabel ?? DEFAULT_KEEP_LABEL;

  const navigation = useNavigation();
  // Ketika user menekan "Buang", kita dispatch ulang action asli. Aksi tersebut memicu
  // beforeRemove baru — callback fire lagi. Ref menandai bahwa kita sedang meneruskan
  // aksi yang sudah dikonfirmasi user, supaya listener kedua langsung dispatch tanpa
  // membuka dialog baru.
  const bypassRef = useRef(false);

  const onAttemptRemove = useCallback(
    ({ data }: { data: { action: Parameters<typeof navigation.dispatch>[0] } }) => {
      if (bypassRef.current) {
        // Aksi kedua dari re-dispatch pasca-konfirmasi. Turunkan flag dan teruskan.
        bypassRef.current = false;
        navigation.dispatch(data.action);
        return;
      }
      showAlert(title, message, [
        { text: keepLabel, style: 'cancel' },
        {
          text: discardLabel,
          style: 'destructive',
          onPress: () => {
            bypassRef.current = true;
            navigation.dispatch(data.action);
          },
        },
      ]);
    },
    [navigation, title, message, discardLabel, keepLabel],
  );

  usePreventRemove(isDirty, onAttemptRemove);
}
