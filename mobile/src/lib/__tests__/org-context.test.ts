// S9-3 — getOrgContext adalah titik tunggal atribusi organisasi untuk seluruh
// jalur create card (goals/strategies/action-plans/dev-areas/problem-statements).
// Sebelumnya tanpa tes langsung → skenario auth kosong / profil tanpa org
// hanya ter-cover implicit lewat tes downstream yang punya banyak dependency.

const mockGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// eslint-disable-next-line import/first -- jest.mock harus mendahului import target.
import { getOrgContext } from '../org-context';

function stubProfileMaybeSingle(result: { data: unknown; error: unknown }) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  mockFrom.mockReturnValue({ select });
  return { select, eq, maybeSingle };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getOrgContext', () => {
  it('mengembalikan uid + orgId untuk user terautentikasi dgn profil ber-org', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    const stub = stubProfileMaybeSingle({ data: { organization_id: 'org-1' }, error: null });

    const ctx = await getOrgContext();

    expect(ctx).toEqual({ uid: 'u-1', orgId: 'org-1' });
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(stub.select).toHaveBeenCalledWith('organization_id');
    expect(stub.eq).toHaveBeenCalledWith('id', 'u-1');
  });

  it('throw "Not authenticated" saat auth.getUser tak mengembalikan user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(getOrgContext()).rejects.toThrow('Not authenticated');
    // Tidak boleh menyentuh profiles bila auth kosong.
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('throw "Not authenticated" saat data auth kosong (defensive)', async () => {
    mockGetUser.mockResolvedValue({ data: {} });

    await expect(getOrgContext()).rejects.toThrow('Not authenticated');
  });

  it('throw "Organization not found" saat profil tak ada (maybeSingle → null)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-2' } } });
    stubProfileMaybeSingle({ data: null, error: null });

    await expect(getOrgContext()).rejects.toThrow('Organization not found');
  });

  it('throw "Organization not found" saat profil ada tapi organization_id null', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-3' } } });
    stubProfileMaybeSingle({ data: { organization_id: null }, error: null });

    await expect(getOrgContext()).rejects.toThrow('Organization not found');
  });
});
