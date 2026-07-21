// Regression: perluasan ISSUE-004 ke SELURUH getter detail card.
//
// ISSUE-004 hanya menambal getTask (cards.ts). Getter entitas lain masih memakai
// .single(), sehingga id di luar akses — yang oleh RLS disaring jadi 0 baris —
// membalas PostgREST 406, React Query terus retry, dan layar detail terkunci di
// skeleton. Gejalanya identik dengan ISSUE-004, hanya beda entitas.
//
// Kontrak yang dijaga di sini: setiap getter detail memakai .maybeSingle(), resolve
// `null` tanpa throw untuk baris yang tersaring, dan TETAP melempar untuk error
// server sungguhan (agar ErrorState + retry tetap punya alasan untuk muncul).
const mockFrom = jest.fn();
const mockGetUser = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: (...a: unknown[]) => mockFrom(...a),
  },
}));

/* eslint-disable import/first -- jest.mock must be declared before the imports it mocks */
import { getActionPlan } from '../cards';
import { getDevelopmentArea } from '../development-areas';
import { getGoal } from '../goals';
import { getInitiative } from '../initiatives';
import { getProblemStatement } from '../problem-statements';
import { getInstance } from '../repeat';
import { getStrategy } from '../strategies';
/* eslint-enable import/first */

/** Builder chainable dengan single/maybeSingle terpisah agar bisa assert mana yang dipanggil. */
function makeDetailBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) {
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

const GETTERS: [string, (id: string) => Promise<unknown>][] = [
  ['getGoal', getGoal],
  ['getStrategy', getStrategy],
  ['getInitiative', getInitiative],
  ['getActionPlan', getActionPlan],
  ['getDevelopmentArea', getDevelopmentArea],
  ['getProblemStatement', getProblemStatement],
  ['getInstance', getInstance],
];

describe.each(GETTERS)('%s — card di luar akses', (_name, getter) => {
  it('memakai maybeSingle (bukan single) dan mengembalikan null tanpa throw', async () => {
    const builder = makeDetailBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    const result = await getter('id-di-luar-akses');

    expect(result).toBeNull();
    expect(builder.maybeSingle).toHaveBeenCalled();
    expect(builder.single).not.toHaveBeenCalled();
  });

  it('tetap melempar bila server balas error sungguhan', async () => {
    const builder = makeDetailBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(getter('x')).rejects.toEqual({ message: 'boom' });
  });
});
