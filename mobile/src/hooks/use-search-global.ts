// BL-10 — hook Search global. Cetakan `use-search-messages.ts` dengan TIGA penyimpangan
// yang disengaja:
//
//   1. `staleTime: 0` (bukan 15 s). Hasil Search tunduk permission, dan permission bisa
//      dicabut kapan saja. Menyajikan hasil basi setelah akses dicabut adalah kebocoran
//      yang tak terlihat sebagai bug.
//   2. TANPA blok realtime. Search read-only dan tidak berlangganan apa pun; `staleTime: 0`
//      sudah membuat setiap mount menyegarkan. Channel realtime di sini hanya menambah
//      permukaan tanpa menutup lubang.
//   3. `debounceMs` dapat disuntik. Default 250 ms tetap berlaku di produksi, tetapi test
//      memakai 0 supaya tidak menunggu wall-clock — 17 kasus × timer nyata adalah sumber
//      flake yang sudah punya riwayat di repo ini.
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/providers/auth-provider';
import { searchGlobal, type SearchHit, type SearchScope } from '@/lib/search';

/** Debounce default produksi. Diekspor supaya nilainya dapat diuji tanpa fake timers. */
export const SEARCH_DEBOUNCE_MS = 250;
export const SEARCH_PREVIEW_LIMIT = 5;

type RpcErrorLike = { code?: string; message?: string } | null | undefined;

function isRpcMissingError(e: unknown): boolean {
  return (e as RpcErrorLike)?.code === 'PGRST202';
}

export type UseSearchGlobalOptions = {
  debounceMs?: number;
  limit?: number;
  includeArchived?: boolean;
};

export function useSearchGlobal(rawQuery: string, opts: UseSearchGlobalOptions = {}) {
  const { debounceMs = SEARCH_DEBOUNCE_MS, limit = SEARCH_PREVIEW_LIMIT, includeArchived = false } = opts;

  // Query MENTAH diteruskan ke lapis data (L7). `trimmed` hanya dipakai untuk gerbang
  // `enabled` dan queryKey — memangkasnya sebelum dikirim akan mengubah arti pencarian.
  // actorId hanya untuk penghitung per-aktor FR-34; lapis data sengaja tidak
  // mengambilnya sendiri (auth.getUser() = round-trip per pencarian).
  const { session } = useAuth();
  const actorId = session?.user?.id ?? null;

  const trimmed = rawQuery.trim();
  const [debounced, setDebounced] = useState(rawQuery);

  // `setTimeout` dipakai SERAGAM, termasuk saat debounceMs = 0.
  //
  // Cabang `if (debounceMs <= 0) setDebounced(...)` yang memanggil setState secara
  // SINKRON di dalam efek melanggar `react-hooks/set-state-in-effect` — aturan React
  // Compiler yang berstatus ERROR di CI dan TIDAK tertangkap jest maupun tsc. Ia lolos
  // seluruh gate lokal lalu memerahkan pipeline.
  //
  // `setTimeout(fn, 0)` menjadwalkan ke task berikutnya, jadi setState-nya tidak lagi
  // sinkron terhadap efek. Perilakunya tetap: test yang memakai debounceMs 0 hanya perlu
  // `waitFor`, yang memang sudah mereka lakukan.
  useEffect(() => {
    if (rawQuery === debounced) return;
    const timer = setTimeout(() => setDebounced(rawQuery), debounceMs);
    return () => clearTimeout(timer);
  }, [rawQuery, debounced, debounceMs]);

  const enabled = debounced.trim().length >= 2;

  const query = useQuery<SearchHit[], RpcErrorLike>({
    queryKey: ['search_global', debounced, limit, includeArchived],
    queryFn: () => searchGlobal({ query: debounced, limit, includeArchived, actorId }),
    enabled,
    staleTime: 0,
  });

  return {
    hits: query.data ?? [],
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    isRpcMissing: isRpcMissingError(query.error),
    enabled,
    trimmed,
  };
}

/**
 * Paging SATU scope (aksi "Lihat semua"). Keyset, bukan offset.
 *
 * `scopes` selalu tepat satu elemen karena cursor keyset hanya bermakna dalam satu urutan —
 * server menolak bentuk request lain (FR-19). Klien tidak menirukan validasi itu; ia hanya
 * memang tidak pernah membangun request yang melanggarnya.
 */
export function useSearchScopePage(
  rawQuery: string,
  scope: SearchScope,
  opts: { limit?: number; includeArchived?: boolean } = {},
) {
  const { limit = SEARCH_PREVIEW_LIMIT, includeArchived = false } = opts;
  // Jalur paging ikut dihitung per-aktor; kalau tidak, kontrol kompensasi FR-34 bolong
  // persis di jalur yang paling banyak menarik baris.
  const { session } = useAuth();
  const actorId = session?.user?.id ?? null;

  const query = useInfiniteQuery<SearchHit[], RpcErrorLike>({
    queryKey: ['search_global_scope', scope, rawQuery, limit, includeArchived],
    initialPageParam: null as { ts: string; id: string } | null,
    queryFn: ({ pageParam }) => {
      const cursor = pageParam as { ts: string; id: string } | null;
      return searchGlobal({
        query: rawQuery,
        scopes: [scope],          // TEPAT SATU — syarat cursor FR-19
        limit,
        includeArchived,
        cursorTs: cursor?.ts ?? null,
        cursorId: cursor?.id ?? null,
        actorId,
      });
    },
    // Halaman tidak penuh = tidak ada lagi. Cursor diambil dari baris TERAKHIR halaman,
    // bukan dari indeks — tidak ada offset maupun nomor halaman di mana pun.
    getNextPageParam: (lastPage) => {
      if (lastPage.length < limit) return undefined;
      const tail = lastPage[lastPage.length - 1];
      return { ts: tail.sortTs, id: tail.sortId };
    },
    enabled: rawQuery.trim().length >= 2,
    staleTime: 0,
  });

  const hits = useMemo(
    () => (query.data?.pages ?? []).flat(),
    [query.data],
  );

  return {
    hits,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    isError: query.isError,
    isRpcMissing: isRpcMissingError(query.error),
  };
}
