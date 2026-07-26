// Write idempotency (0103) — lifecycle of the mint-once key that makes a manual
// retry return the original row instead of a duplicate.
import { act, renderHook } from '@testing-library/react-native';

import { useIdempotencyKey } from '../use-idempotency-key';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('useIdempotencyKey', () => {
  it('[IDK-K1] key() mints a uuid and returns the SAME value on repeat calls (retry reuse)', async () => {
    const { result } = await renderHook(() => useIdempotencyKey());
    const k1 = result.current.key();
    const k2 = result.current.key();
    expect(k1).toMatch(UUID_RE);
    expect(k2).toBe(k1);
  });

  it('[IDK-K2] reset() forces a fresh key on the next submit', async () => {
    const { result } = await renderHook(() => useIdempotencyKey());
    const k1 = result.current.key();
    await act(async () => result.current.reset());
    const k2 = result.current.key();
    expect(k2).toMatch(UUID_RE);
    expect(k2).not.toBe(k1);
  });
});
