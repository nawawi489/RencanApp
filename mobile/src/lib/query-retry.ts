// Item 3 — kebijakan retry QUERY React Query (read-only). Error permanen (klien/otorisasi)
// percuma di-retry dan hanya menunda user melihat ErrorState; hanya error transient
// (server/jaringan) yang layak diulang, dengan batas percobaan. Mutation TIDAK memakai ini:
// retry write non-idempoten bisa menduplikasi INSERT saat ACK hilang (lihat query-client.ts).

const MAX_RETRIES = 2;

// Kode yang menandakan error PERMANEN (jangan retry): SQLSTATE otorisasi/validasi + PostgREST.
const PERMANENT_CODES = new Set(['42501', '23505', '23502', '23503', '23514', 'PGRST301', 'PGRST116']);

function readStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const s = (error as { status?: unknown }).status;
    if (typeof s === 'number') return s;
  }
  return undefined;
}

function readCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const c = (error as { code?: unknown }).code;
    if (c != null) return String(c);
  }
  return undefined;
}

/**
 * Return true bila QUERY boleh di-retry. Dipakai sebagai `defaultOptions.queries.retry`.
 * Berhenti untuk HTTP 4xx dan kode error permanen; sisanya di-retry sampai `MAX_RETRIES`.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;

  const status = readStatus(error);
  if (status != null && status >= 400 && status < 500) return false;

  const code = readCode(error);
  if (code && PERMANENT_CODES.has(code)) return false;

  return true;
}
