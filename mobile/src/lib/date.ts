// Util validasi periode card (dipakai layar form Goal/Strategy/Initiative/Action Plan).
// Tanggal disimpan & dibandingkan sebagai string YYYY-MM-DD (leksikografis = kronologis).

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const DATE_HINT = 'Format: YYYY-MM-DD (mis. 2026-07-01)';

/**
 * Validasi rentang periode. Mengembalikan pesan error (untuk Alert) atau null bila valid.
 * Tanggal kosong dianggap valid (opsional) kecuali `requireBoth`.
 */
export function periodError(start: string, end: string, requireBoth = false): string | null {
  if (requireBoth && (!DATE_RE.test(start) || !DATE_RE.test(end))) return DATE_HINT;
  if ((start && !DATE_RE.test(start)) || (end && !DATE_RE.test(end))) return DATE_HINT;
  if (start && end && DATE_RE.test(start) && DATE_RE.test(end) && end < start) {
    return 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
  }
  return null;
}
