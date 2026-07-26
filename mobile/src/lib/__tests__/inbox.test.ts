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
  postReviewNote,
  searchChatMessages,
  sendChatMessage,
  toggleChatReaction,
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
    expect(msgs).toEqual([{ id: 'm1', reactions: [], reply_to: null, attachments: [] }]);
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
    expect(msgs).toEqual(batch.map((m) => ({ ...m, reactions: [], reply_to: null, attachments: [] })));
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
      p_context_action_plan: undefined,
      p_reply_to: undefined,
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
      p_context_action_plan: undefined,
      p_reply_to: undefined,
    });
  });

  it('[8] propagasi error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'no' } });
    await expect(sendChatMessage('r1', 'x')).rejects.toEqual({ message: 'no' });
  });

  it('[RC-1] opts.contextActionPlan diteruskan ke p_context_action_plan', async () => {
    mockRpc.mockResolvedValue({ data: 'm-ctx', error: null });
    await sendChatMessage('r1', 'soal tugas', [], { contextActionPlan: 'ap-1' });
    expect(mockRpc).toHaveBeenCalledWith('send_chat_message', {
      p_room: 'r1',
      p_body: 'soal tugas',
      p_mentions: [],
      p_context_action_plan: 'ap-1',
      p_reply_to: undefined,
    });
  });

  it('[RC-2] opts.replyTo diteruskan ke p_reply_to', async () => {
    mockRpc.mockResolvedValue({ data: 'm-rpl', error: null });
    await sendChatMessage('r1', 'setuju', [], { replyTo: 'm-prev' });
    expect(mockRpc).toHaveBeenCalledWith('send_chat_message', {
      p_room: 'r1',
      p_body: 'setuju',
      p_mentions: [],
      p_context_action_plan: undefined,
      p_reply_to: 'm-prev',
    });
  });

  it('[RC-3] opts konteks + reply bersama', async () => {
    mockRpc.mockResolvedValue({ data: 'm-both', error: null });
    await sendChatMessage('r1', 'balas + konteks', [], { contextActionPlan: 'ap-2', replyTo: 'm-old' });
    expect(mockRpc).toHaveBeenCalledWith('send_chat_message', {
      p_room: 'r1',
      p_body: 'balas + konteks',
      p_mentions: [],
      p_context_action_plan: 'ap-2',
      p_reply_to: 'm-old',
    });
  });

  // 0103: idempotency key diteruskan sebagai p_client_request_id (present bila diberi,
  // undefined bila absen → server tak dedup).
  it('[ID-CH] opts.clientRequestId diteruskan ke p_client_request_id', async () => {
    mockRpc.mockResolvedValue({ data: 'm-idem', error: null });
    await sendChatMessage('r1', 'halo', [], { clientRequestId: 'idem-1' });
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_client_request_id: 'idem-1' });
  });

  it('[ID-CH2] tanpa clientRequestId → p_client_request_id undefined', async () => {
    mockRpc.mockResolvedValue({ data: 'm', error: null });
    await sendChatMessage('r1', 'halo');
    expect(
      (mockRpc.mock.calls[0][1] as { p_client_request_id?: string }).p_client_request_id,
    ).toBeUndefined();
  });
});

describe('markChatMessagesRead', () => {
  it('[9] memanggil rpc & mengembalikan count', async () => {
    mockRpc.mockResolvedValue({ data: 4, error: null });
    expect(await markChatMessagesRead('r1')).toBe(4);
    expect(mockRpc).toHaveBeenCalledWith('mark_chat_messages_read', { p_room: 'r1' });
  });
});

// =========================================================== Reaction pill (PRD §30.6) — toggleChatReaction + embed ==========================================================
describe('toggleChatReaction', () => {
  it('[RX-1] memanggil rpc toggle_chat_reaction dgn arg mapping camel→snake', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    await toggleChatReaction('m-1', '👍');
    expect(mockRpc).toHaveBeenCalledWith('toggle_chat_reaction', { p_message: 'm-1', p_emoji: '👍' });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('[RX-2] mengembalikan boolean true apa-adanya (toggle-on)', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    const r = await toggleChatReaction('m-1', '✅');
    expect(r).toBe(true);
    expect(typeof r).toBe('boolean');
  });

  it('[RX-3] mengembalikan boolean false apa-adanya (toggle-off)', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    const r = await toggleChatReaction('m-1', '👍');
    expect(r).toBe(false);
  });

  it('[RX-4] propagasi error identity (rethrow object apa-adanya, bukan clone)', async () => {
    const err = { message: 'not a chat member', code: '42501' };
    mockRpc.mockResolvedValue({ data: null, error: err });
    await expect(toggleChatReaction('m-1', '👍')).rejects.toBe(err);
  });

  it('[RX-5] meneruskan messageId & emoji verbatim (tanpa trim/normalize)', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    await toggleChatReaction('  m-1  ', '  🙏  ');
    expect(mockRpc).toHaveBeenCalledWith('toggle_chat_reaction', { p_message: '  m-1  ', p_emoji: '  🙏  ' });
  });
});

describe('listChatMessages — embed reactions', () => {
  it('[RX-6] select-string memuat embed reactions:chat_message_reactions(emoji, reactor_id)', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listChatMessages('r1');
    expect(calls.select).toHaveLength(1);
    expect(calls.select[0][0]).toEqual(expect.stringContaining('reactions:chat_message_reactions(emoji, reactor_id)'));
  });

  it('[RX-7] TIDAK memindahkan chat_room_id ke .or() dan embed tidak bocor ke cursor', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    const cursor = { createdAt: '2026-07-10T09:00:00.000Z', id: 'm-last' };
    await listChatMessages('r1', cursor);
    expect(calls.eq).toEqual([['chat_room_id', 'r1']]);
    expect(calls.or).toEqual([
      ['created_at.lt.2026-07-10T09:00:00.000Z,and(created_at.eq.2026-07-10T09:00:00.000Z,id.lt.m-last)'],
    ]);
    expect(JSON.stringify(calls.or)).not.toEqual(expect.stringContaining('reactions'));
    expect(JSON.stringify(calls.or)).not.toEqual(expect.stringContaining('chat_room_id'));
  });

  it('[RX-8] pass-through: field reactions[] di-return apa-adanya (tanpa transform)', async () => {
    const rows = [
      { id: 'm1', chat_room_id: 'r1', author_id: 'u1', body: 'halo', created_at: '2026-07-10T09:00:00Z',
        reactions: [{ emoji: '👍', reactor_id: 'u1' }, { emoji: '👍', reactor_id: 'u2' }, { emoji: '🙏', reactor_id: 'u3' }] },
    ];
    const { builder } = makeQueryThenable({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);
    const msgs = await listChatMessages('r1');
    expect(msgs[0].reactions).toEqual([
      { emoji: '👍', reactor_id: 'u1' },
      { emoji: '👍', reactor_id: 'u2' },
      { emoji: '🙏', reactor_id: 'u3' },
    ]);
  });

  it('[RX-9] roomId kosong → [] tanpa query (short-circuit dipatuhi setelah embed)', async () => {
    expect(await listChatMessages('')).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('[RX-10] embed reactions bertahan pada halaman cursor>0', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listChatMessages('r1', { createdAt: '2026-07-10T09:00:00Z', id: 'm-x' });
    expect(calls.select[0][0]).toEqual(expect.stringContaining('reactions:chat_message_reactions(emoji, reactor_id)'));
    expect(calls.eq).toEqual([['chat_room_id', 'r1']]);
  });

  it('[RX-11] normalisasi reactions: null → [] (PostgREST embed kosong bisa null)', async () => {
    const rows = [
      { id: 'm1', chat_room_id: 'r1', author_id: 'u1', body: 'halo', created_at: '2026-07-10T09:00:00Z',
        reactions: null },
    ];
    const { builder } = makeQueryThenable({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);
    const msgs = await listChatMessages('r1');
    expect(msgs[0].reactions).toEqual([]);
  });
});

describe('listChatMessages — context & reply_to fields (0046)', () => {
  it('[RC-4] select-string memuat context + reply_to embed', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listChatMessages('r1');
    expect(calls.select).toHaveLength(1);
    const sel = calls.select[0][0] as string;
    expect(sel).toEqual(expect.stringContaining('context_entity_type'));
    expect(sel).toEqual(expect.stringContaining('context_entity_id'));
    expect(sel).toEqual(expect.stringContaining('context_label'));
    expect(sel).toEqual(expect.stringContaining('reply_to_message_id'));
    expect(sel).toEqual(expect.stringContaining('reply_to:reply_to_message_id('));
  });

  it('[RC-5] pesan dengan context fields di-pass-through apa-adanya', async () => {
    const rows = [{
      id: 'm1', chat_room_id: 'r1', author_id: 'u1', body: 'konteks test',
      created_at: '2026-07-13T09:00:00Z', reactions: null,
      context_entity_type: 'action_plan', context_entity_id: 'ap-1',
      context_label: 'Tugas Alpha', reply_to_message_id: null, reply_to: null,
    }];
    const { builder } = makeQueryThenable({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);
    const msgs = await listChatMessages('r1');
    expect(msgs[0].context_entity_type).toBe('action_plan');
    expect(msgs[0].context_entity_id).toBe('ap-1');
    expect(msgs[0].context_label).toBe('Tugas Alpha');
    expect(msgs[0].reply_to_message_id).toBeNull();
    expect(msgs[0].reply_to).toBeNull();
  });

  it('[RC-6] pesan tanpa context (null) → field tetap null (backward compat AC-8)', async () => {
    const rows = [{
      id: 'm2', chat_room_id: 'r1', author_id: 'u1', body: 'biasa',
      created_at: '2026-07-13T09:01:00Z', reactions: null,
      context_entity_type: null, context_entity_id: null,
      context_label: null, reply_to_message_id: null, reply_to: null,
    }];
    const { builder } = makeQueryThenable({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);
    const msgs = await listChatMessages('r1');
    expect(msgs[0].context_entity_type).toBeNull();
    expect(msgs[0].context_label).toBeNull();
    expect(msgs[0].reply_to).toBeNull();
  });

  it('[RC-7] reply_to embed di-pass-through (author nested)', async () => {
    const rows = [{
      id: 'm3', chat_room_id: 'r1', author_id: 'u1', body: 'balas',
      created_at: '2026-07-13T09:02:00Z', reactions: [],
      context_entity_type: null, context_entity_id: null,
      context_label: null, reply_to_message_id: 'm1',
      reply_to: { id: 'm1', body: 'pesan asal', author_id: 'u2', author: { full_name: 'Bob' } },
    }];
    const { builder } = makeQueryThenable({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);
    const msgs = await listChatMessages('r1');
    expect(msgs[0].reply_to).toEqual({
      id: 'm1', body: 'pesan asal', author_id: 'u2', author: { full_name: 'Bob' },
    });
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
      p_room_id: undefined,
      p_limit: 20,
      p_before: undefined,
      p_before_id: undefined,
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

// ============================================================
// Chat Attachments — Fase 3: Data Layer
// ============================================================

describe('sendChatMessage — attachments (0059)', () => {
  it('[ATT-16] p_attachments forwarded to RPC when provided', async () => {
    mockRpc.mockResolvedValue({ data: 'm-att', error: null });
    const atts = [{ path: 'o/r/uuid-x.jpg', name: 'x.jpg', mime: 'image/jpeg', size: 100, kind: 'photo' as const }];
    await sendChatMessage('r1', 'lihat ini', [], { attachments: atts });
    expect(mockRpc).toHaveBeenCalledWith('send_chat_message', expect.objectContaining({
      p_attachments: atts,
    }));
  });

  it('[ATT-20] send without attachments → p_attachments undefined', async () => {
    mockRpc.mockResolvedValue({ data: 'm-no', error: null });
    await sendChatMessage('r1', 'plain text');
    expect(mockRpc).toHaveBeenCalledWith('send_chat_message', expect.objectContaining({
      p_attachments: undefined,
    }));
  });

  it('[ATT-21a] send with attachments + context + replyTo → all forwarded', async () => {
    mockRpc.mockResolvedValue({ data: 'm-combo', error: null });
    const atts = [{ path: 'o/r/uuid-y.png', name: 'y.png', mime: 'image/png', size: 50, kind: 'photo' as const }];
    await sendChatMessage('r1', 'konteks + lampiran', ['u2'], {
      attachments: atts,
      contextActionPlan: 'ap-1',
      replyTo: 'm-prev',
    });
    expect(mockRpc).toHaveBeenCalledWith('send_chat_message', {
      p_room: 'r1',
      p_body: 'konteks + lampiran',
      p_mentions: ['u2'],
      p_attachments: atts,
      p_context_action_plan: 'ap-1',
      p_reply_to: 'm-prev',
    });
  });
});

describe('listChatMessages — attachments (0059)', () => {
  it('[ATT-18] select string contains attachments', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listChatMessages('r1');
    expect(calls.select[0][0]).toEqual(expect.stringContaining('attachments'));
  });

  it('[ATT-21c] pre-migration row (attachments null) → normalized to []', async () => {
    const rows = [{
      id: 'm1', chat_room_id: 'r1', author_id: 'u1', body: 'old msg', created_at: '2026-01-01T00:00:00Z',
      reactions: null, reply_to: null, attachments: null,
    }];
    const { builder } = makeQueryThenable({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);
    const msgs = await listChatMessages('r1');
    expect(msgs[0].attachments).toEqual([]);
  });

  it('[ATT-18b] row with attachments → pass-through', async () => {
    const atts = [{ path: 'o/r/uuid-z.jpg', name: 'z.jpg', mime: 'image/jpeg', size: 200, kind: 'photo' }];
    const rows = [{
      id: 'm2', chat_room_id: 'r1', author_id: 'u1', body: 'with image', created_at: '2026-07-15T00:00:00Z',
      reactions: [], reply_to: null, attachments: atts,
    }];
    const { builder } = makeQueryThenable({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);
    const msgs = await listChatMessages('r1');
    expect(msgs[0].attachments).toEqual(atts);
  });
});

// ---------------------------------------------------------------- BL-08 / PRD §24.3 "Catatan"
//
// Aksi review ke-3, NON-TERMINAL: postReviewNote resolve room Rencana Aksi lalu kirim
// pesan biasa ber-konteks Tugas. Yang dikunci di sini adalah properti non-terminal itu
// sendiri — tidak ada RPC review/status yang boleh ikut terpanggil.

/** `.select().eq().maybeSingle()` — builder chainable pendek untuk getRoomIdForActionPlan. */
function makeMaybeSingleThenable(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) builder[m] = jest.fn(() => builder);
  builder.maybeSingle = jest.fn(() => Promise.resolve(result));
  return builder;
}

describe('postReviewNote (BL-08, PRD §24.3 aksi "Catatan")', () => {
  it('[NOTE-1] resolve room dari action_plan_id lalu kirim pesan ber-konteks task_id', async () => {
    mockFrom.mockReturnValue(makeMaybeSingleThenable({ data: { id: 'room-9' }, error: null }));
    mockRpc.mockResolvedValue({ data: 'msg-1', error: null });

    const id = await postReviewNote({ taskId: 'task-1', actionPlanId: 'ap-1', body: 'Tolong lampirkan invoice.' });

    expect(mockFrom).toHaveBeenCalledWith('chat_rooms');
    expect(mockRpc).toHaveBeenCalledWith('send_chat_message', {
      p_room: 'room-9',
      p_body: 'Tolong lampirkan invoice.',
      p_mentions: [],
      p_attachments: undefined,
      p_context_action_plan: 'task-1',
      p_reply_to: undefined,
    });
    expect(id).toBe('msg-1');
  });

  it('[NOTE-2] NON-TERMINAL: tidak memanggil RPC review mana pun', async () => {
    mockFrom.mockReturnValue(makeMaybeSingleThenable({ data: { id: 'room-9' }, error: null }));
    mockRpc.mockResolvedValue({ data: 'msg-2', error: null });

    await postReviewNote({ taskId: 'task-1', actionPlanId: 'ap-1', body: 'catatan' });

    const rpcNames = mockRpc.mock.calls.map((c) => c[0]);
    expect(rpcNames).toEqual(['send_chat_message']);
    expect(rpcNames).not.toContain('review_task_submission');
    expect(rpcNames).not.toContain('review_task_instance_submission');
  });

  it('[NOTE-3] body di-trim sebelum dikirim', async () => {
    mockFrom.mockReturnValue(makeMaybeSingleThenable({ data: { id: 'room-9' }, error: null }));
    mockRpc.mockResolvedValue({ data: 'msg-3', error: null });

    await postReviewNote({ taskId: 't', actionPlanId: 'ap', body: '  spasi  ' });

    expect(mockRpc).toHaveBeenCalledWith('send_chat_message', expect.objectContaining({ p_body: 'spasi' }));
  });

  it('[NOTE-4] body kosong/whitespace → tolak sebelum menyentuh jaringan', async () => {
    await expect(postReviewNote({ taskId: 't', actionPlanId: 'ap', body: '   ' })).rejects.toThrow(
      'Catatan tidak boleh kosong.',
    );
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // Guard 0056: send_chat_message menolak konteks lintas-AP
  // (`a.action_plan_id = v_room.action_plan_id`). postReviewNote menerima taskId dan
  // actionPlanId terpisah, jadi kontrak "actionPlanId HARUS induk dari taskId" dikunci
  // di sini — room di-resolve dari actionPlanId, konteks dari taskId.
  it('[NOTE-4b] room di-resolve dari actionPlanId, konteks dari taskId (invariant 0056)', async () => {
    const builder = makeMaybeSingleThenable({ data: { id: 'room-ap-7' }, error: null });
    mockFrom.mockReturnValue(builder);
    mockRpc.mockResolvedValue({ data: 'msg-x', error: null });

    await postReviewNote({ taskId: 'task-42', actionPlanId: 'ap-7', body: 'catatan' });

    // Lookup room memakai actionPlanId — BUKAN taskId.
    expect(builder.eq).toHaveBeenCalledWith('action_plan_id', 'ap-7');
    // Konteks pesan memakai taskId — BUKAN actionPlanId.
    expect(mockRpc).toHaveBeenCalledWith(
      'send_chat_message',
      expect.objectContaining({ p_room: 'room-ap-7', p_context_action_plan: 'task-42' }),
    );
  });

  it.each([
    ['string kosong (induk belum termuat)', ''],
    ['null (Tugas jalur Development, induk = Problem Statement)', null],
    ['undefined (query induk belum resolve)', undefined],
  ])('[NOTE-4c] actionPlanId %s → pesan non-izin, tanpa menyentuh jaringan', async (_label, apId) => {
    await expect(
      postReviewNote({ taskId: 't', actionPlanId: apId as string | null | undefined, body: 'catatan' }),
    ).rejects.toThrow('Tugas ini belum terhubung ke Diskusi Rencana Aksi.');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('[NOTE-5] reviewer bukan anggota room (RLS → null) → pesan jelas, tanpa kirim', async () => {
    mockFrom.mockReturnValue(makeMaybeSingleThenable({ data: null, error: null }));

    await expect(postReviewNote({ taskId: 't', actionPlanId: 'ap', body: 'catatan' })).rejects.toThrow(
      'Diskusi Rencana Aksi tidak tersedia untuk Anda.',
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('[NOTE-6] propagasi error dari send_chat_message', async () => {
    mockFrom.mockReturnValue(makeMaybeSingleThenable({ data: { id: 'room-9' }, error: null }));
    mockRpc.mockResolvedValue({ data: null, error: { message: 'ditolak' } });

    await expect(postReviewNote({ taskId: 't', actionPlanId: 'ap', body: 'catatan' })).rejects.toEqual({
      message: 'ditolak',
    });
  });
});
