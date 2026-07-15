// Util validasi periode card (dipakai layar form Goal/Strategi/Inisiatif/Rencana Aksi).
// Tanggal disimpan & dibandingkan sebagai string YYYY-MM-DD (leksikografis = kronologis).

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const DATE_HINT = 'Format: YYYY-MM-DD (mis. 2026-07-01)';
export const TIME_RE = /^\d{2}:\d{2}$/;
export const TIME_HINT = 'HH:MM (mis. 23:00)';

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

// ---- helpers untuk quick chips (Deadline) & DateMultiField ----
// Semua fungsi kembali string YYYY-MM-DD zona waktu lokal (bukan UTC) supaya konsisten
// dgn DateField.onChange yang memakai toLocaleDateString('en-CA').

function toISOLocal(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

export function todayISO(): string {
  return toISOLocal(new Date());
}

export function addDaysISO(base: string, n: number): string {
  const parsed = parseISODateOrToday(base);
  const d = new Date(parsed);
  d.setDate(d.getDate() + n);
  return toISOLocal(d);
}

export function endOfMonthISO(base?: string): string {
  const parsed = base ? parseISODateOrToday(base) : new Date();
  const d = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0);
  return toISOLocal(d);
}

function parseISODateOrToday(s: string): Date {
  if (!DATE_RE.test(s)) return new Date();
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
