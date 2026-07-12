// Regression: ISSUE-004 — getTask memakai .single() sehingga id di luar akses
// (RLS menyaring jadi 0 baris) membalas 406 dan layar AP menampilkan skeleton selamanya.
// Harus: .maybeSingle() → resolve null tanpa throw agar layar bisa render empty state.
// Found by /qa on 2026-07-07
// Report: .gstack/qa-reports/qa-report-localhost-8081-2026-07-07.md
const mockFrom = jest.fn();
const mockGetUser = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: (...a: unknown[]) => mockFrom(...a),
  },
}));

// eslint-disable-next-line import/first -- jest.mock must be declared before the import it mocks
import { getTask } from '../cards';

/** Builder chainable dengan single/maybeSingle terpisah agar bisa assert mana yang dipanggil. */
function makeDetailBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) {
    builder[m] = jest.fn(() => builder);
  }
  builder.single = jest.fn(() => Promise.resolve(result));
  builder.maybeSingle = jest.fn(() => Promise.resolve(result));
  return builder;
}

beforeEach(() => {
  mockFrom.mockReset();
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('ISSUE-004 — getTask di luar akses', () => {
  it('memakai maybeSingle (bukan single) dan mengembalikan null tanpa throw', async () => {
    const builder = makeDetailBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    const result = await getTask('id-di-luar-akses');

    expect(result).toBeNull();
    expect(builder.maybeSingle).toHaveBeenCalled();
    expect(builder.single).not.toHaveBeenCalled();
  });

  it('tetap melempar bila server balas error sungguhan', async () => {
    const builder = makeDetailBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(getTask('x')).rejects.toEqual({ message: 'boom' });
  });
});
