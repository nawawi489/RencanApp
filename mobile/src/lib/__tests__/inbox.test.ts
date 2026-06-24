// Data layer Fase 3 — inbox.ts. Mock ../supabase. Menguji listChatRooms (RPC), listChatMessages
// (eq+order+range paginasi, guard room kosong), sendChatMessage (mention diteruskan apa adanya —
// server yang gating), markChatMessagesRead, propagasi error.
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
