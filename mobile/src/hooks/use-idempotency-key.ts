import { useCallback, useRef } from 'react';

import { newClientRequestId } from '@/lib/idempotency';

/**
 * Mint-once idempotency key for one logical submit (write idempotency, 0103).
 *
 * `key()` returns a stable `client_request_id` and mints it lazily on first call;
 * every subsequent call returns the SAME value until `reset()` clears it. Wire it so:
 *   - the mutation's `mutationFn` passes `key()` into `create*({ ...input, client_request_id })`
 *     — a manual retry after an error re-runs `mutationFn`, gets the same key, and the
 *     server returns the original row (no duplicate);
 *   - `onSuccess` calls `reset()` so the next logical submit gets a fresh key.
 *
 * Do NOT reset on error (the retry must reuse the key).
 */
export function useIdempotencyKey(): { key: () => string; reset: () => void } {
  const ref = useRef<string | null>(null);
  const key = useCallback(() => {
    if (ref.current == null) ref.current = newClientRequestId();
    return ref.current;
  }, []);
  const reset = useCallback(() => {
    ref.current = null;
  }, []);
  return { key, reset };
}
