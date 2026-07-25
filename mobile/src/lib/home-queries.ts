// Kunci query dashboard Home + helper invalidasinya. SENGAJA tanpa import apa pun
// yang menarik `./supabase` (lib/home.ts menariknya, yang melempar bila env Supabase
// belum diset) — supaya aman diimpor dari write-path/hook, termasuk di test yang tidak
// mem-mock supabase. Lihat home-screen.tsx untuk pemakaian staleTime + focus refresh.
import type { QueryClient } from '@tanstack/react-query';

/** Prefix bersama semua query dashboard Home (`home-my-plans`, `home-reviews`, …). */
export const HOME_QUERY_PREFIX = 'home-';

/**
 * Invalidasi seluruh dashboard Home setelah mutasi yang mengubah isinya
 * (submit / review / buat Tugas). Tanpa ini, satu-satunya jalur kesegaran Home
 * adalah focus-effect ber-staleTime — sehingga kembali ke Home dalam jendela
 * staleTime setelah aksi menampilkan data lama. Home tetap mounted sebagai tab,
 * jadi invalidateQueries memicu refetch aktif → data segar seketika saat user
 * kembali, terlepas dari jendela staleTime. Dipanggil dari onSuccess mutasi.
 */
export function invalidateHomeQueries(qc: QueryClient): void {
  void qc.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === 'string' && key.startsWith(HOME_QUERY_PREFIX);
    },
  });
}
