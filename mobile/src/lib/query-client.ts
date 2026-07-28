// Choke point global React Query. Semua kegagalan query diteruskan ke logger (telemetry)
// sehingga tidak ada kegagalan senyap, tanpa menampilkan apa pun ke user (WSA-18).
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { createLogger } from './logger';
import { shouldRetry } from './query-retry';

const log = createLogger('ReactQuery');

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        log.error(query.queryHash, error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        log.error(mutation.options.mutationKey ?? '', error);
      },
    }),
    defaultOptions: {
      // staleTime 30 detik: layar seperti Home mount 8 useQuery dan sebelumnya
      // memicu refetch 7 query tiap kali di-focus. useFocusEffect di layar Home
      // sudah menyaring `stale: true`, jadi ambang stale global memangkas biaya
      // fokus tanpa memaksa perubahan di setiap query. Query yang memang butuh
      // fresh boleh opt-out dengan `staleTime: 0` per-call.
      queries: { retry: shouldRetry, staleTime: 30_000 },
      // Writes tidak boleh di-retry global: INSERT non-idempoten (createGoal/createTask/
      // sendChatMessage, dll. tanpa idempotency key) bisa duplikat saat ACK hilang tapi
      // commit sudah terjadi di server. Ini juga default React Query (retry: 0). Bila ada
      // mutation yang benar-benar idempoten, opt-in per-call via useMutation({ retry }).
      mutations: { retry: false },
    },
  });
}
