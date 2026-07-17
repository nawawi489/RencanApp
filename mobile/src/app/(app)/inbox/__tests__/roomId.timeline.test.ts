// Unit test pure `buildTimelineItems` (critic §MC5) — matriks input tanpa React/RNTL.
// Kontrak (spec FR-KP16 / owner §10): iterasi desc, divider disisipkan SETELAH grup harian
// agar inverted FlatList menampilkan chip di ATAS grup visual. `dayOf` null → skip chip
// untuk pesan tsb tanpa mempengaruhi transisi day berikutnya.

import { buildTimelineItems, type TimelineItem } from '@/lib/inbox-timeline';

type Msg = Parameters<typeof buildTimelineItems>[0][number];

function m(id: string, day: string, kind?: 'user' | 'system'): Msg {
  return { id, chat_room_id: 'r1', author_id: kind === 'system' ? null : 'u1', body: id, created_at: day, kind };
}

function makeDayOf(map: Record<string, string | null>) {
  return (iso: string) => (iso in map ? map[iso] : null);
}

function itemLabel(i: TimelineItem): string {
  if (i.type === 'divider') return `div:${i.label}`;
  if (i.type === 'system') return `sys:${i.msg.id}`;
  return i.msg.id;
}

describe('buildTimelineItems', () => {
  it('[T1] input kosong → [] (tak ada divider yatim)', () => {
    expect(buildTimelineItems([], () => 'X')).toEqual([]);
  });

  it('[T2] satu hari saja → semua pesan + 1 divider di akhir (visual TOP di inverted)', () => {
    const items = buildTimelineItems(
      [m('a', 'D1'), m('b', 'D1'), m('c', 'D1')],
      makeDayOf({ D1: '24 Jun' }),
    );
    // Pola: msg, msg, msg, divider(24 Jun)
    expect(items.map((i) => i.type)).toEqual(['message', 'message', 'message', 'divider']);
    const last = items[items.length - 1] as Extract<TimelineItem, { type: 'divider' }>;
    expect(last.label).toBe('24 Jun');
  });

  it('[T3] N hari beda — divider muncul untuk SETIAP day yang selesai + day paling lama di akhir', () => {
    // Iterasi desc: [24, 24, 23, 22]. Boundary 24→23 & 23→22 masing-masing emit chip
    // day yang baru selesai; day paling lama (22) emit chip END.
    const items = buildTimelineItems(
      [m('m24b', 'D24'), m('m24a', 'D24'), m('m23', 'D23'), m('m22', 'D22')],
      makeDayOf({ D24: '24 Jun', D23: '23 Jun', D22: '22 Jun' }),
    );
    // Expect: msg24b, msg24a, div(24), msg23, div(23), msg22, div(22)
    expect(items.map((i) => itemLabel(i))).toEqual([
      'm24b',
      'm24a',
      'div:24 Jun',
      'm23',
      'div:23 Jun',
      'm22',
      'div:22 Jun',
    ]);
  });

  it('[T4] batas tengah malam (dayOf return string beda) → divider posisi tepat di boundary', () => {
    // Pesan urut desc, boundary jam 00:00 direpresentasikan sebagai perubahan day.
    const items = buildTimelineItems(
      [
        m('a', '2026-06-25T00:30:00Z'), // 25 Jun 00:30
        m('b', '2026-06-24T23:45:00Z'), // 24 Jun 23:45
      ],
      makeDayOf({
        '2026-06-25T00:30:00Z': '25 Jun',
        '2026-06-24T23:45:00Z': '24 Jun',
      }),
    );
    // Pola: a (25 Jun), div(25 Jun) [boundary], b (24 Jun), div(24 Jun) [END]
    expect(items.map((i) => itemLabel(i))).toEqual([
      'a',
      'div:25 Jun',
      'b',
      'div:24 Jun',
    ]);
  });

  it('[T5] dayOf null (invalid date) → tidak menyulut chip, tidak mengubah prevDay', () => {
    // Pesan tengah punya timestamp invalid. Transisi day dari '24 Jun' → (null skip) →
    // '23 Jun' harus tetap emit chip(24 Jun) di boundary 24→23, chip END utk 23 Jun.
    const items = buildTimelineItems(
      [m('m24', 'D24'), m('mbad', 'BAD'), m('m23', 'D23')],
      makeDayOf({ D24: '24 Jun', D23: '23 Jun', BAD: null }),
    );
    // Pola: msg24, msg-bad, div(24 Jun), msg23, div(23 Jun)
    expect(items.map((i) => itemLabel(i))).toEqual([
      'm24',
      'mbad',
      'div:24 Jun',
      'm23',
      'div:23 Jun',
    ]);
  });

  it('[T6] semua dayOf null → semua pesan, TIDAK ada divider (chip yatim tak dirender)', () => {
    const items = buildTimelineItems(
      [m('a', 'BAD'), m('b', 'BAD')],
      makeDayOf({ BAD: null }),
    );
    expect(items.every((i) => i.type === 'message')).toBe(true);
    expect(items).toHaveLength(2);
  });

  it('[T7] system event → type "system" (bukan "message")', () => {
    const items = buildTimelineItems(
      [m('u1', 'D1'), m('s1', 'D1', 'system'), m('u2', 'D1')],
      makeDayOf({ D1: '24 Jun' }),
    );
    expect(items.map((i) => i.type)).toEqual(['message', 'system', 'message', 'divider']);
  });

  it('[T8] system events tetap partisipasi di day divider logic', () => {
    const items = buildTimelineItems(
      [m('u1', 'D1'), m('s1', 'D2', 'system')],
      makeDayOf({ D1: '24 Jun', D2: '23 Jun' }),
    );
    expect(items.map((i) => (i.type === 'divider' ? `div:${i.label}` : i.type))).toEqual([
      'message',
      'div:24 Jun',
      'system',
      'div:23 Jun',
    ]);
  });

  it('[T9] kind undefined (legacy) → type "message" (backward compat)', () => {
    const items = buildTimelineItems(
      [m('a', 'D1')],
      makeDayOf({ D1: '24 Jun' }),
    );
    expect(items[0].type).toBe('message');
  });

  it('[T10] key stabil — message/system.key = msg.id; divider unik per boundary vs end', () => {
    const items = buildTimelineItems(
      [m('a', 'D1'), m('b', 'D2')],
      makeDayOf({ D1: '24 Jun', D2: '23 Jun' }),
    );
    // 4 item: a, div(24 Jun boundary), b, div(23 Jun end).
    expect(items.map((i) => i.key)).toEqual([
      'a',
      'd-24 Jun-boundary',
      'b',
      'd-23 Jun-end',
    ]);
    // Set unik → tidak ada tabrakan key.
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  });
});
