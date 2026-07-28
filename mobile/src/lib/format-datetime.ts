// Format timestamp organization-wide. Sebelumnya dua jalur berbeda: submission-card
// pakai `Intl.DateTimeFormat` dgn `timeZone: org_timezone`, sedangkan activity-log-panel
// pakai `Date.toLocaleString('id-ID')` tanpa `timeZone` — jatuh ke tz perangkat. Efeknya
// event yang sama (mis. submission ter-review) tampil dgn jam berbeda di dua panel pada
// layar yang sama; audit S8-6 memilih tz organisasi sebagai kanonik (event pekerjaan
// diikat ke jam operasional org, bukan jam pribadi anggota tim yang bisa lintas negara).
//
// Semua tampilan timestamp UI baru harus memakai helper di file ini.

const FALLBACK = '—';

/** "YYYY-MM-DD HH:mm" pada `timeZone` (default: tz perangkat bila tak diberi).
 * Bila string tidak bisa di-parse sbg Date, kembalikan bentuk sliced input
 * (kompat dgn regresi ISSUE-003: pemanggil boleh mendapat kembali apa yg dia kirim,
 * membantu diagnostik daripada '—' kosong). */
export function formatDateTime(iso: string | null | undefined, timeZone?: string | null): string {
  if (!iso) return FALLBACK;
  const isoFallback = String(iso).replace('T', ' ').slice(0, 16);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return isoFallback;
  try {
    // sv-SE menghasilkan "YYYY-MM-DD HH:mm" stabil lintas platform (ICU + Hermes).
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: timeZone ?? undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .format(d)
      .replace(',', '');
  } catch {
    return isoFallback;
  }
}

/** Variasi "medium/short" Bahasa Indonesia utk panel yang butuh label lebih verbose. */
export function formatDateTimeIdMedium(
  iso: string | null | undefined,
  timeZone?: string | null,
): string {
  if (!iso) return FALLBACK;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return FALLBACK;
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: timeZone ?? undefined,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return String(iso).replace('T', ' ').slice(0, 16);
  }
}
