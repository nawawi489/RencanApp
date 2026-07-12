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

/** Builder thenable (B5.1): metode chainable kembalikan builder; await resolve di titik mana pun. */
function makeQueryThenable(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'gte', 'lt', 'order', 'range', 'limit']) {
    builder[m] = jest.fn((...args: unknown[]) => {
      calls[m] = args;
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

describe('listChatMessages', () => {
  it('[3] room kosong → [] tanpa query', async () => {
    expect(await listChatMessages('')).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('[4] query eq(room) + order desc + range halaman 0 = [0,29]', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ id: 'm1' }], error: null });
    mockFrom.mockReturnValue(builder);
    const msgs = await listChatMessages('r1', 0);
    expect(mockFrom).toHaveBeenCalledWith('chat_messages');
    expect(calls.eq).toEqual(['chat_room_id', 'r1']);
    expect(calls.order).toEqual(['created_at', { ascending: false }]);
    expect(calls.range).toEqual([0, 29]);
    expect(msgs).toEqual([{ id: 'm1' }]);
  });

  it('[5] halaman 1 → range [30,59]', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listChatMessages('r1', 1);
    expect(calls.range).toEqual([30, 59]);
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
