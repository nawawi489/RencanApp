// Write idempotency (0103). One client_request_id (uuid v4) per logical submit,
// reused across manual retries and regenerated after success — so a lost-ACK retry
// returns the original row instead of inserting a duplicate. See
// wiki/concepts/write-idempotency-keys.md.

/**
 * Fresh idempotency key. `crypto.randomUUID()` is available on the pinned Hermes/RN
 * runtime (already used in the production attachment-upload path, src/lib/storage.ts),
 * so no `expo-crypto`/`uuid` dependency is needed. Wrapped here so tests can
 * `jest.spyOn(global.crypto, 'randomUUID')` and callers share one source.
 */
export function newClientRequestId(): string {
  return crypto.randomUUID();
}
