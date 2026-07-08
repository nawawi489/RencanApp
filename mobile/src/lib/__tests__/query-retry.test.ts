// Item 3 — retry policy React Query: error permanen (4xx / RLS / PostgREST policy) TIDAK boleh
// di-retry (buang waktu + tunda ErrorState); hanya error transient (5xx/network) yang di-retry,
// dengan batas percobaan.
import { shouldRetry } from '../query-retry';

function err(extra: Record<string, unknown>): Error {
  return Object.assign(new Error('x'), extra);
}

describe('shouldRetry', () => {
  it('TIDAK retry untuk HTTP 4xx (status)', () => {
    expect(shouldRetry(0, err({ status: 403 }))).toBe(false);
    expect(shouldRetry(0, err({ status: 401 }))).toBe(false);
    expect(shouldRetry(0, err({ status: 404 }))).toBe(false);
  });

  it('TIDAK retry untuk RLS 42501 (code)', () => {
    expect(shouldRetry(0, err({ code: '42501' }))).toBe(false);
  });

  it('TIDAK retry untuk PostgREST policy error (PGRST301)', () => {
    expect(shouldRetry(0, err({ code: 'PGRST301' }))).toBe(false);
  });

  it('retry untuk error transient (5xx) sampai batas', () => {
    expect(shouldRetry(0, err({ status: 500 }))).toBe(true);
    expect(shouldRetry(1, err({ status: 503 }))).toBe(true);
  });

  it('retry untuk error tanpa status/code (network) sampai batas', () => {
    expect(shouldRetry(0, err({}))).toBe(true);
  });

  it('berhenti setelah mencapai batas maksimum (2)', () => {
    expect(shouldRetry(2, err({ status: 500 }))).toBe(false);
    expect(shouldRetry(5, err({}))).toBe(false);
  });
});
