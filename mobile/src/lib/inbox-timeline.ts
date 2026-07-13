// Pure timeline builder untuk layar chat room (spec FR-KP16 / owner §10).
// Modul leaf tanpa React/expo-router agar `_timeline.test.ts` bisa import langsung
// tanpa menyeret dependency runtime layar. Konsumen: `[roomId].tsx` render + test.
import type { ChatMessage } from '@/lib/inbox';

export type TimelineItem =
  | { type: 'divider'; key: string; label: string }
  | { type: 'message'; key: string; msg: ChatMessage };

/** Bangun timeline dari pesan desc (newest-first). Divider disisipkan SETELAH grup harian
 * saat iterasi desc, sehingga di inverted FlatList chip muncul di ATAS grup harinya
 * (data[N] = tampilan TOP under inverted). `dayOf` wajib mengembalikan label hari stabil
 * (mis. 'd MMM' id-ID) atau `null` bila timestamp invalid → item tetap dirender, chip skip.
 *
 * Kontrak (owner §10 / spec FR-KP16):
 * - Input `[]` → `[]` (tak ada divider yatim).
 * - Semua pesan hari yang sama → 1 divider di akhir (visual TOP).
 * - Batas antar-hari → divider untuk day yang baru SELESAI (yang lebih baru dalam desc).
 * - `dayOf` = null → tanpa chip untuk pesan itu (skip); tak mempengaruhi transisi day.
 */
export function buildTimelineItems(
  messages: ChatMessage[],
  dayOf: (iso: string) => string | null,
): TimelineItem[] {
  const out: TimelineItem[] = [];
  let prevDay: string | null = null;
  for (const m of messages) {
    const label = dayOf(m.created_at);
    if (prevDay !== null && label !== null && label !== prevDay) {
      out.push({ type: 'divider', key: `d-${prevDay}-boundary`, label: prevDay });
    }
    out.push({ type: 'message', key: m.id, msg: m });
    if (label !== null) prevDay = label;
  }
  if (prevDay !== null) {
    out.push({ type: 'divider', key: `d-${prevDay}-end`, label: prevDay });
  }
  return out;
}
