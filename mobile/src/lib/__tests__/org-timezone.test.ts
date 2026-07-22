// PRD §23 field 5 — zona waktu Repeat Setting. Murni TAMPILAN: tidak ada kolom timezone di
// task_repeat_rules dan engine repeat memakai org_today() yang org-wide.
// Mock ../supabase & ../org-context agar tak butuh env/native saat import (pola repeat.test.ts).
const mockFrom = jest.fn();
const mockGetOrgContext = jest.fn();

jest.mock('../supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

jest.mock('../org-context', () => ({
  getOrgContext: (...args: unknown[]) => mockGetOrgContext(...args),
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import { DEFAULT_ORG_TIMEZONE, getOrgTimezone, orgTimezoneLabel } from '../org-timezone';

/** Rantai PostgREST `from().select().eq().maybeSingle()`. */
function stubSelect(result: { data: unknown; error: unknown }) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  mockFrom.mockReturnValue({ select });
  return { select, eq };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetOrgContext.mockResolvedValue({ uid: 'u-1', orgId: 'org-1' });
});

describe('orgTimezoneLabel', () => {
  it('[1] menambahkan singkatan lokal untuk zona Indonesia', () => {
    expect(orgTimezoneLabel('Asia/Jakarta')).toBe('Asia/Jakarta (WIB)');
    expect(orgTimezoneLabel('Asia/Pontianak')).toBe('Asia/Pontianak (WIB)');
    expect(orgTimezoneLabel('Asia/Makassar')).toBe('Asia/Makassar (WITA)');
    expect(orgTimezoneLabel('Asia/Jayapura')).toBe('Asia/Jayapura (WIT)');
  });

  it('[2] zona di luar peta tampil apa adanya (tanpa singkatan karangan)', () => {
    expect(orgTimezoneLabel('Europe/Amsterdam')).toBe('Europe/Amsterdam');
    expect(orgTimezoneLabel('UTC')).toBe('UTC');
  });

  it('[3] null/kosong jatuh ke default org, bukan "—"', () => {
    expect(orgTimezoneLabel(null)).toBe('Asia/Jakarta (WIB)');
    expect(orgTimezoneLabel(undefined)).toBe('Asia/Jakarta (WIB)');
    expect(orgTimezoneLabel('   ')).toBe('Asia/Jakarta (WIB)');
  });

  it('[4] default sejalan dengan default kolom organizations.timezone (migration 0007)', () => {
    expect(DEFAULT_ORG_TIMEZONE).toBe('Asia/Jakarta');
  });
});

describe('getOrgTimezone', () => {
  it('[5] membaca organizations.timezone milik org user', async () => {
    const { select, eq } = stubSelect({ data: { timezone: 'Asia/Makassar' }, error: null });
    await expect(getOrgTimezone()).resolves.toBe('Asia/Makassar');
    expect(mockFrom).toHaveBeenCalledWith('organizations');
    expect(select).toHaveBeenCalledWith('timezone');
    expect(eq).toHaveBeenCalledWith('id', 'org-1');
  });

  it('[6] baris tersaring RLS / timezone null → default, bukan lempar', async () => {
    stubSelect({ data: null, error: null });
    await expect(getOrgTimezone()).resolves.toBe('Asia/Jakarta');
  });

  it('[7] error PostgREST dipropagasi (UI yang memutuskan fallback)', async () => {
    stubSelect({ data: null, error: { message: 'boom' } });
    await expect(getOrgTimezone()).rejects.toBeTruthy();
  });
});
