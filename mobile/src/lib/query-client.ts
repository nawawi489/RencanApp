// Choke point global React Query. Semua kegagalan query diteruskan ke logger (telemetry)
// sehingga tidak ada kegagalan senyap, tanpa menampilkan apa pun ke user (WSA-18).
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { getLogger } from './logger';
import { shouldRetry } from './query-retry';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        getLogger().error('[query]', query.queryHash, error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        getLogger().error('[mutation]', mutation.options.mutationKey ?? '', error);
      },
    }),
    defaultOptions: {
      queries: { retry: shouldRetry },
      mutations: { retry: shouldRetry },
    },
  });
}
