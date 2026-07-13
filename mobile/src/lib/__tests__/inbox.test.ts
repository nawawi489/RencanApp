// Data layer Fase 3 — inbox.ts. Mock ../supabase. Menguji listChatRooms (RPC), listChatMessages
// (eq+order+range paginasi, guard room kosong), sendChatMessage (mention diteruskan apa adanya —
// server yang gating), markChatMessagesRead, propagasi error.
// + Chat FTS V1 (Search Pesan Inbox): searchChatMessages — thin caller ke rpc
// 'search_chat_messages'. Menguji nama RPC, mapping camel→snake, mapping row snake→camel,
// tidak short-circuit query pendek (server = sumber kebenaran), pemetaan cursor before, empty,
// propagasi error. Governance/pagination/escape wildcard/snippet cap diuji di
// supabase/tests/0044_search_chat_messages_contract.sql — bukan di sini.
const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import {
  listChatMessages,
  listChatRooms,
  markChatMessagesRead,
  searchChatMessages,
  sendChatMessage,
} from '../inbox';

/** Builder thenable (B5.1): metode chainable kembalikan builder; await resolve di titik mana pun.
 *
 * `calls[m]` = ARRAY of arg-arrays (satu entri per panggilan) — memungkinkan assert method
 * yang di-chain lebih dari sekali (mis. `.order` 2× untuk keyset pagination). Test lama
 * yang mengasumsikan satu panggilan mengakses `calls[m][0]`. `.or` ditambah ke daftar untuk
 * mendukung dekomposisi keyset cursor. */
function makeQueryThenable(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[][]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'gte', 'lt', 'or', 'order', 'range', 'limit']) {
    builder[m] = jest.fn((...args: unknown[]) => {
      calls[m] = [...(calls[m] ?? []), args];
      return builder;
    });
  }
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { builder, calls };
}

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
});

describe('listChatRooms', () => {
  it('[1] memanggil rpc get_chat_rooms & mengembalikan data', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'r1', unread_count: 2 }], error: null });
    const rooms = await listChatRooms();
    expect(mockRpc).toHaveBeenCalledWith('get_chat_rooms');
    expect(rooms).toEqual([{ id: 'r1', unread_count: 2 }]);
  });

  it('[2] propagasi error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    await expect(listChatRooms()).rejects.toEqual({ message: 'x' });
  });
});

describe('listChatMessages (keyset)', () => {
  // Cursor keyset: pesan strictly-older dari (createdAt, id). Ordering `created_at DESC, id DESC`;
  // .eq('chat_room_id') WAJIB top-level AND, .or() cursor hanya di atasnya (FR-KP10 anti-kebocoran
  // room untuk pembaca `can_view_workspace`). Encoding cursor timestamp = round-trip apa-adanya
  // dari kolom `created_at` (presisi mikrodetik + offset '+') — FR-KP-ENC.
  it('[3] room kosong → [] tanpa query', async () => {
    expect(await listChatMessages('')).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('[4-rev] page 0 (cursor undefined) → eq top-level + .order x2 + .limit(30), TANPA .or (AC-1)', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ id: 'm1' }], error: null });
    mockFrom.mockReturnValue(builder);
    const msgs = await listChatMessages('r1');
    expect(mockFrom).toHaveBeenCalledWith('chat_messages');
    // .eq('chat_room_id', 'r1') dipanggil tepat sekali di root query (bukan dalam .or).
    expect(calls.eq).toEqual([['chat_room_id', 'r1']]);
    // .order dipanggil DUA kali: created_at desc lalu id desc (tie-break stabil).
    expect(calls.order).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    // .limit(CHAT_PAGE_SIZE) menggantikan .range().
    expect(calls.limit).toEqual([[30]]);
    // Tidak boleh ada .range di jalur keyset.
    expect(calls.range).toBeUndefined();
    // Page pertama = tidak ada predikat cursor.
    expect(calls.or).toBeUndefined();
    expect(msgs).toEqual([{ id: 'm1' }]);
  });

  it('[5-rev] page N (cursor terisi) → tambah .or() strict `<` (AC-2/AC-16)', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    const cursor = { createdAt: '2026-07-10T09:00:00.000Z', id: 'm-last' };
    await listChatMessages('r1', cursor);
    // .eq tetap top-level (belum lipat ke .or) — anti-kebocoran room.
    expect(calls.eq).toEqual([['chat_room_id', 'r1']]);
    // .or exactly once dengan bentuk dekomposisi tuple (created_at,id) < (T,X):
    //   created_at.lt.<T>  OR  and(created_at.eq.<T>, id.lt.<X>)
    expect(calls.or).toEqual([
      [
        'created_at.lt.2026-07-10T09:00:00.000Z,and(created_at.eq.2026-07-10T09:00:00.000Z,id.lt.m-last)',
      ],
    ]);
    // Ordering + limit tetap identik page 0.
    expect(calls.order).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(calls.limit).toEqual([[30]]);
  });

  it('[5b] round-trip encoding timestamp presisi mikrodetik + offset "+00:00" apa adanya (FR-KP-ENC, unit-level dari AC-17)', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    // Nilai `created_at` mentah dari DB: mikrodetik + offset positif.
    const cursor = { createdAt: '2026-06-24T01:00:00.123456+00:00', id: 'm-42' };
    await listChatMessages('r1', cursor);
    // String cursor diteruskan apa adanya ke ekspresi .or (tanpa normalisasi ke Z, tanpa mem-drop
    // digit mikrodetik). Parseability end-to-end diuji AC-17b (HTTP).
    expect(calls.or).toEqual([
      [
        'created_at.lt.2026-06-24T01:00:00.123456+00:00,and(created_at.eq.2026-06-24T01:00:00.123456+00:00,id.lt.m-42)',
      ],
    ]);
  });

  it('[5d] roomId kosong tetap short-circuit walau cursor terisi (AC-9)', async () => {
    const cursor = { createdAt: '2026-07-10T09:00:00.000Z', id: 'm' };
    expect(await listChatMessages('', cursor)).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('[5e] batch penuh diteruskan apa-adanya (30 item, tanpa wrap/transform)', async () => {
    const batch = Array.from({ length: 30 }, (_, i) => ({
      id: `m${i}`,
      chat_room_id: 'r1',
      author_id: 'u1',
      body: `b${i}`,
      created_at: `2026-07-10T09:00:${String(i).padStart(2, '0')}.000Z`,
    }));
    const { builder } = makeQueryThenable({ data: batch, error: null });
    mockFrom.mockReturnValue(builder);
    const msgs = await listChatMessages('r1');
    expect(msgs).toEqual(batch);
  });

  it('[5f] propagasi error identity (rethrow object apa adanya)', async () => {
    const err = { message: 'boom', code: '42501' };
    const { builder } = makeQueryThenable({ data: null, error: err });
    mockFrom.mockReturnValue(builder);
    // Identity assert: object yang di-throw HARUS refererensi yang sama (bukan clone).
    await expect(listChatMessages('r1')).rejects.toBe(err);
  });
});

describe('sendChatMessage', () => {
  it('[6] meneruskan mentions APA ADANYA ke RPC (server yang gating, bukan klien) + return id', async () => {
    mockRpc.mockResolvedValue({ data: 'm-new', error: null });
    const id = await sendChatMessage('r1', 'halo', ['u2', 'u-nonmember']);
    expect(mockRpc).toHaveBeenCalledWith('send_chat_message', {
      p_room: 'r1',
      p_body: 'halo',
      p_mentions: ['u2', 'u-nonmember'],
    });
    expect(id).toBe('m-new');
  });

  it('[7] mentions default []', async () => {
    mockRpc.mockResolvedValue({ data: 'm', error: null });
    await sendChatMessage('r1', 'hai');
    expect(mockRpc).toHaveBeenCalledWith('send_chat_message', {
      p_room: 'r1',
      p_body: 'hai',
      p_mentions: [],
    });
  });

  it('[8] propagasi error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'no' } });
    await expect(sendChatMessage('r1', 'x')).rejects.toEqual({ message: 'no' });
  });
});

describe('markChatMessagesRead', () => {
  it('[9] memanggil rpc & mengembalikan count', async () => {
    mockRpc.mockResolvedValue({ data: 4, error: null });
    expect(await markChatMessagesRead('r1')).toBe(4);
    expect(mockRpc).toHaveBeenCalledWith('mark_chat_messages_read', { p_room: 'r1' });
  });
});

describe('searchChatMessages (Chat FTS V1)', () => {
  const sampleRow = {
    message_id: 'm-1',
    chat_room_id: 'r-1',
    room_name: 'Ekspansi Bandung',
    initiative_id: 'i-1',
    author_id: 'u-1',
    author_name: 'Andi',
    snippet: 'target CPL turun 20%',
    created_at: '2026-07-10T09:00:00.000Z',
    body_similarity: 0.42,
  };

  it('[10] memanggil rpc search_chat_messages dengan p_query dan p_limit default 20 (roomId/before undefined dikirim null)', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await searchChatMessages({ query: 'cpl' });
    expect(mockRpc).toHaveBeenCalledWith('search_chat_messages', {
      p_query: 'cpl',
      p_room_id: null,
      p_limit: 20,
      p_before: null,
      p_before_id: null,
    });
  });

  it('[11] mapping camel→snake: roomId + limit custom + before cursor', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await searchChatMessages({
      query: 'sales',
      roomId: 'r-9',
      limit: 15,
      before: { createdAt: '2026-07-01T00:00:00.000Z', id: 'm-old' },
    });
    expect(mockRpc).toHaveBeenCalledWith('search_chat_messages', {
      p_query: 'sales',
      p_room_id: 'r-9',
      p_limit: 15,
      p_before: '2026-07-01T00:00:00.000Z',
      p_before_id: 'm-old',
    });
  });

  it('[12] mapping row RPC snake_case → ChatMessageHit camelCase', async () => {
    mockRpc.mockResolvedValue({ data: [sampleRow], error: null });
    const hits = await searchChatMessages({ query: 'cpl' });
    expect(hits).toEqual([
      {
        messageId: 'm-1',
        chatRoomId: 'r-1',
        roomName: 'Ekspansi Bandung',
        initiativeId: 'i-1',
        authorId: 'u-1',
        authorName: 'Andi',
        snippet: 'target CPL turun 20%',
        createdAt: '2026-07-10T09:00:00.000Z',
        bodySimilarity: 0.42,
      },
    ]);
  });

  it('[13] TIDAK short-circuit query pendek — server yang gating (FR-6 guard DI SERVER)', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await searchChatMessages({ query: 'a' });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      'search_chat_messages',
      expect.objectContaining({ p_query: 'a' })
    );
  });

  it('[14] author_id/author_name NULL diteruskan sebagai null (bukan undefined) — "Pengguna dihapus" ranah UI', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...sampleRow, author_id: null, author_name: null }],
      error: null,
    });
    const [hit] = await searchChatMessages({ query: 'cpl' });
    expect(hit.authorId).toBeNull();
    expect(hit.authorName).toBeNull();
  });

  it('[15] data null/empty → []', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await searchChatMessages({ query: 'cpl' })).toEqual([]);
  });

  it('[16] propagasi error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom', code: 'PGRST202' } });
    await expect(searchChatMessages({ query: 'cpl' })).rejects.toEqual({
      message: 'boom',
      code: 'PGRST202',
    });
  });
});
