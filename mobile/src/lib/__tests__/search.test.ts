// BL-10 PR-1 — lapis data Search (W6a). Test ditulis SEBELUM lib/search.ts ada.
//
// `mapSearchHit` sengaja diimpor sebagai fungsi top-level: kalau ia jadi closure di dalam
// fungsi async (pola yang terlanjur ada di inbox.ts), impor ini gagal dan L9/L10/L11 merah.
// Itu tekanan desain yang disengaja, bukan kebetulan.
import {
  SEARCH_SCOPE_LABEL,
  SEARCH_SCOPE_ORDER,
  cardScopeOf,
  mapSearchHit,
  searchGlobal,
} from '../search';

const mockLogInfo = jest.fn();
const mockLogWarn = jest.fn();
jest.mock('@/lib/logger', () => ({
  ...jest.requireActual('@/lib/logger'),
  createLogger: () => ({
    info: (...a: unknown[]) => mockLogInfo(...a),
    warn: (...a: unknown[]) => mockLogWarn(...a),
    error: jest.fn(), debug: jest.fn(),
  }),
}));
const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...a: unknown[]) => mockRpc(...a) },
}));

beforeEach(() => {
  mockRpc.mockReset().mockResolvedValue({ data: [], error: null });
  mockLogInfo.mockReset();
  mockLogWarn.mockReset();
});

const ROW = {
  scope: 'goal',
  id: 'g1',
  parent_id: null,
  title: 'Goal Satu',
  subtitle: null,
  snippet: null,
  status: 'active',
  sort_ts: '2026-07-22T00:00:00Z',
  sort_id: 'g1',
};

describe('taksonomi scope', () => {
  it('[BL10-L1] 14 scope, berurutan sesuai §6.1', () => {
    expect(SEARCH_SCOPE_ORDER).toEqual([
      'goal', 'strategy', 'initiative', 'action_plan', 'task', 'task_instance',
      'development_area', 'problem_statement', 'people', 'comment', 'chat',
      'evidence', 'activity_log', 'governance_violation',
    ]);
  });

  it('[BL10-L2] label kanonik + Object.keys sepadan dengan urutan', () => {
    expect(SEARCH_SCOPE_LABEL).toEqual({
      goal: 'Goal',
      strategy: 'Strategi',
      initiative: 'Inisiatif',
      action_plan: 'Rencana Aksi',
      task: 'Tugas',
      task_instance: 'Instansi Tugas',
      development_area: 'Area Pengembangan',
      problem_statement: 'Problem Statement',
      people: 'Orang',
      comment: 'Komentar',
      chat: 'Pesan',
      evidence: 'Bukti',
      activity_log: 'Log Aktivitas',
      governance_violation: 'Pelanggaran Tata Kelola',
    });
    // peta dan urutan tidak boleh menyimpang diam-diam
    expect(Object.keys(SEARCH_SCOPE_LABEL).sort()).toEqual([...SEARCH_SCOPE_ORDER].sort());
  });

  it('[BL10-L3] cardScopeOf memetakan 7 scope card', () => {
    expect(cardScopeOf('goal')).toBe('goal');
    expect(cardScopeOf('strategy')).toBe('strategy');
    expect(cardScopeOf('initiative')).toBe('initiative');
    expect(cardScopeOf('action_plan')).toBe('action_plan');
    expect(cardScopeOf('task')).toBe('task');
    expect(cardScopeOf('development_area')).toBe('development_area');
    expect(cardScopeOf('problem_statement')).toBe('problem_statement');
  });

  it('[BL10-L4] cardScopeOf mengembalikan null untuk 7 scope non-card', () => {
    for (const s of ['task_instance', 'people', 'comment', 'chat', 'evidence',
                     'activity_log', 'governance_violation'] as const) {
      expect(cardScopeOf(s)).toBeNull();
    }
  });
});

describe('mapper', () => {
  it('[BL10-L9] snake_case → camelCase', () => {
    const hit = mapSearchHit(ROW);
    expect(hit).toEqual({
      scope: 'goal', id: 'g1', parentId: null, title: 'Goal Satu',
      subtitle: null, snippet: null, status: 'active',
      sortTs: '2026-07-22T00:00:00Z', sortId: 'g1',
    });
  });

  it('[BL10-L10] tepat 9 kunci; field asing DITOLAK (anti-oracle di hulu)', () => {
    const hit = mapSearchHit({
      ...ROW,
      total_count: 999,          // kanal bocor: jumlah hasil sebenarnya
      storage_path: 'rahasia',   // kanal bocor: path penyimpanan bukti
      body: 'isi mentah',
    } as never);
    expect(Object.keys(hit).sort()).toEqual([
      'id', 'parentId', 'scope', 'snippet', 'sortId', 'sortTs', 'status', 'subtitle', 'title',
    ]);
    expect(hit as Record<string, unknown>).not.toHaveProperty('total_count');
    expect(hit as Record<string, unknown>).not.toHaveProperty('storage_path');
  });

  it('[BL10-L11] snippet TIDAK dipotong ulang di klien (server sudah 240)', () => {
    const long = 'x'.repeat(240);
    expect(mapSearchHit({ ...ROW, snippet: long }).snippet).toHaveLength(240);
  });
});

describe('searchGlobal — pemanggil tipis', () => {
  it('[BL10-L5] nama RPC + enam parameter', async () => {
    await searchGlobal({ query: 'abc' });
    // Argumen opsional dikirim `undefined`, bukan `null`: database.types.ts memodelkan
    // argumen ber-DEFAULT sebagai `p_x?: T`. Perilakunya identik — `undefined` gugur saat
    // serialisasi JSON sehingga DEFAULT di tanda tangan SQL yang berlaku.
    expect(mockRpc).toHaveBeenCalledWith('search_global', {
      p_query: 'abc',
      p_scopes: undefined,
      p_include_archived: false,
      p_limit: 5,
      p_cursor_ts: undefined,
      p_cursor_id: undefined,
    });
  });

  it('[BL10-L6] cursor diteruskan apa adanya, TANPA validasi klien', async () => {
    // Validasi bentuk-request adalah milik server (FR-19). Klien tidak boleh
    // menirunya — dua sumber kebenaran akan menyimpang.
    await searchGlobal({ query: 'abc', scopes: ['goal', 'task'], cursorTs: 't', cursorId: 'i' });
    expect(mockRpc.mock.calls[0][1]).toMatchObject({
      p_scopes: ['goal', 'task'], p_cursor_ts: 't', p_cursor_id: 'i',
    });
  });

  it('[BL10-L7] metakarakter dan spasi tepi diteruskan UTUH', async () => {
    await searchGlobal({ query: '  a%b_c\\d  ' });
    expect(mockRpc.mock.calls[0][1].p_query).toBe('  a%b_c\\d  ');
  });

  it('[BL10-L8] tidak short-circuit untuk query < 2 char', async () => {
    // Guard length<2 hidup di server. Klien yang ikut menjaga akan membuat
    // perilaku bercabang saat server berubah.
    await searchGlobal({ query: 'a' });
    expect(mockRpc).toHaveBeenCalled();
  });

  it('[BL10-L12] data null → []; error dilempar utuh', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await searchGlobal({ query: 'abc' })).toEqual([]);

    const err = { code: 'PGRST202', message: 'not found' };
    mockRpc.mockResolvedValueOnce({ data: null, error: err });
    await expect(searchGlobal({ query: 'abc' })).rejects.toMatchObject({ code: 'PGRST202' });
  });

  it('[BL10-L13] payload identik untuk dua sebab kekosongan', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    const a = await searchGlobal({ query: 'tidak-cocok' });
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    const b = await searchGlobal({ query: 'tersaring-otorisasi' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('[BL10-L14] tidak pernah memanggil search_cards (NG-6)', async () => {
    await searchGlobal({ query: 'abc', scopes: ['goal'] });
    expect(mockRpc.mock.calls.map((c) => c[0])).not.toContain('search_cards');
  });
});

describe('FR-34 — observability search (metrik agregat, nol isi)', () => {
  it('[BL10-L15] mencatat metrik agregat: panjang query sbg ANGKA, scope, durasi, jumlah hasil', async () => {
    mockRpc.mockResolvedValueOnce({ data: [ROW], error: null });
    await searchGlobal({ query: 'rahasia perusahaan', scopes: ['goal'] });

    expect(mockLogInfo).toHaveBeenCalled();
    const payload = mockLogInfo.mock.calls[0][0] as Record<string, unknown>;

    expect(payload.event).toBe('search_global');
    expect(payload.queryLength).toBe('rahasia perusahaan'.length);   // ANGKA, bukan teksnya
    expect(payload.scopesRequested).toEqual(['goal']);               // taksonomi, bukan data
    expect(payload.resultCount).toBe(1);
    expect(payload.scopesWithResults).toBe(1);
    expect(typeof payload.durationMs).toBe('number');
  });

  it('[BL10-L16] [MUST NOT] isi query TIDAK pernah masuk log', async () => {
    // Ini setengah FR-34 yang paling mudah dilanggar tanpa sadar: seseorang menambahkan
    // `query` ke payload "untuk memudahkan debug", dan seluruh kata kunci pengguna —
    // termasuk nama orang dan istilah rahasia — mengalir ke sink terpusat.
    const rahasia = 'akuisisi-PT-Rahasia-2026';
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    await searchGlobal({ query: rahasia });

    const serialized = JSON.stringify(mockLogInfo.mock.calls);
    expect(serialized).not.toContain(rahasia);
    expect(serialized).not.toContain('akuisisi');
  });

  it('[BL10-L17] [MUST NOT] nama entity dari hasil TIDAK pernah masuk log', async () => {
    // Judul hasil adalah data yang tunduk permission. Melognya memindahkan permukaan
    // disclosure ke sink telemetry, yang aturan aksesnya berbeda.
    mockRpc.mockResolvedValueOnce({
      data: [{ ...ROW, title: 'Proyek Rahasia Alpha', subtitle: 'Budi Santoso' }],
      error: null,
    });
    await searchGlobal({ query: 'proyek' });

    const serialized = JSON.stringify(mockLogInfo.mock.calls);
    expect(serialized).not.toContain('Proyek Rahasia Alpha');
    expect(serialized).not.toContain('Budi Santoso');
  });

  it('[BL10-L18] kegagalan RPC dicatat TANPA membocorkan query, dan error tetap dilempar', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'nope' } });
    await expect(searchGlobal({ query: 'kata-kunci-sensitif' })).rejects.toMatchObject({
      code: 'PGRST202',
    });

    expect(mockLogWarn).toHaveBeenCalled();
    const serialized = JSON.stringify(mockLogWarn.mock.calls);
    expect(serialized).toContain('PGRST202');            // kode error berguna & aman
    expect(serialized).not.toContain('kata-kunci-sensitif');
  });
});
