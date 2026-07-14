// chat-day.ts — pure helpers untuk grouping & pelabelan divider chat.
// Semua fungsi memakai DEVICE timezone (menegaskan ulang keputusan FR-IN2.3;
// spec inbox-chat-prototype-gap OQ-3). nowIso di-inject supaya test tetap
// deterministik tanpa fake timers.

/**
 * dayKey — stable per-day identifier di device tz, format 'YYYY-MM-DD'.
 * Dipakai untuk mengelompokkan pesan per hari agar divider muncul TEPAT sekali
 * per blok hari dan tidak bertabrakan antar-tahun (label 'd MMM' saja tidak
 * cukup — '23 Jun 2025' vs '23 Jun 2026' menghasilkan label sama).
 * Kembali null bila iso tidak dapat diparse.
 */
export function dayKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * dividerLabel — teks chip divider: 'Hari ini' / 'Kemarin' / 'd MMM' (id-ID).
 * Kembali null bila iso invalid.
 */
export function dividerLabel(iso: string, nowIso: string): string | null {
  const k = dayKey(iso);
  if (!k) return null;
  const nowKey = dayKey(nowIso);
  if (nowKey && k === nowKey) return 'Hari ini';
  const yesterday = yesterdayKey(nowIso);
  if (yesterday && k === yesterday) return 'Kemarin';
  const d = new Date(iso);
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short' });
}

function yesterdayKey(nowIso: string): string | null {
  const n = new Date(nowIso);
  if (Number.isNaN(n.getTime())) return null;
  const y = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1);
  return dayKey(y.toISOString());
}
