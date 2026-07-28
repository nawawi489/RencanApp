// S7-5 (Sprint 7): fallback `canGoBack()` untuk `router.back()`.
//
// Sebelum sprint 7, tujuh jalur sukses mutasi memanggil `router.back()` polos. Saat layar
// masuk lewat deep-link atau push notification (bukan navigasi in-app), stack navigasi
// kosong dan `back()` tidak melakukan apa-apa — pengguna terdampar di form basi setelah
// tulisan berhasil, tanpa umpan balik. Hook ini menyediakan fallback ke `router.replace()`
// ke tujuan aman (default: root Home tab), menyisir kasus deep-link dengan satu pola
// tunggal alih-alih menulisnya inline di setiap call site.
//
// Pola sudah ada inline di `app-header.tsx` dan `(app)/_layout.tsx`; hook ini men-DRY-kan.

import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';

/** Tujuan fallback default saat stack navigasi kosong (deep-link entry). */
const DEFAULT_FALLBACK: Href = '/';

/**
 * Mengembalikan fungsi `safeBack()` yang:
 * - memanggil `router.back()` bila ada layar sebelumnya di stack, atau
 * - `router.replace(fallback)` bila tidak — mencegah tap "kembali" jadi no-op.
 *
 * @param fallback rute yang aman dituju bila stack kosong (default: root Home tab).
 *
 * Contoh:
 *   const safeBack = useSafeBack();
 *   const editM = useEditGoal({ onSuccess: safeBack });
 */
export function useSafeBack(fallback: Href = DEFAULT_FALLBACK): () => void {
  const router = useRouter();
  return useCallback(() => {
    // Defensive: test-only mock expo-router (pre-Sprint 7) hanya menyediakan `.back`.
    // Runtime expo-router selalu punya `canGoBack` + `replace`, jadi jalur short-circuit
    // ke `back()` hanya menyelamatkan konfigurasi test lama dari perubahan minimal.
    const hasCheck = typeof router.canGoBack === 'function';
    const hasReplace = typeof router.replace === 'function';
    if (!hasCheck || router.canGoBack()) {
      router.back();
      return;
    }
    if (hasReplace) {
      router.replace(fallback);
    } else {
      // Mock test tanpa replace: fallback terakhir ke back() supaya tidak crash.
      router.back();
    }
  }, [router, fallback]);
}
