// Lib Tambah User — payload normalisasi + surfacing pesan domain dari Edge Function.
const mockInvoke = jest.fn();
jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: { functions: { invoke: (...a: unknown[]) => mockInvoke(...a) } },
}));

// eslint-disable-next-line import/first
import { createOrgUser } from '../users-admin';

beforeEach(() => {
  mockInvoke.mockReset();
});

describe('createOrgUser', () => {
  it('[U-LIB-01] kirim payload ternormalisasi (email lowercase+trim, nama trim)', async () => {
    mockInvoke.mockResolvedValue({ data: { user_id: 'u-new' }, error: null });
    const result = await createOrgUser({
      email: '  Rina@Perusahaan.CO.ID ',
      password: 'rahasia123',
      fullName: '  Rina Jaya ',
      roleLevel: 'staff',
    });
    expect(mockInvoke).toHaveBeenCalledWith('create-user', {
      body: {
        email: 'rina@perusahaan.co.id',
        password: 'rahasia123',
        full_name: 'Rina Jaya',
        role_level: 'staff',
      },
    });
    expect(result).toEqual({ user_id: 'u-new' });
  });

  it('[U-LIB-02] error dengan body {error} → throw pesan domain server', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        context: { json: async () => ({ error: 'Email ini sudah terdaftar sebagai user.' }) },
      },
    });
    await expect(
      createOrgUser({ email: 'a@b.co', password: 'rahasia123', fullName: 'A', roleLevel: 'staff' }),
    ).rejects.toThrow('Email ini sudah terdaftar sebagai user.');
  });

  it('[U-LIB-03] error tanpa body terbaca → throw fallback ramah', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        context: {
          json: async () => {
            throw new Error('not json');
          },
        },
      },
    });
    await expect(
      createOrgUser({ email: 'a@b.co', password: 'rahasia123', fullName: 'A', roleLevel: 'staff' }),
    ).rejects.toThrow('Gagal membuat user. Periksa koneksi lalu coba lagi.');
  });

  it('[U-LIB-04] error jaringan (tanpa context) → throw fallback ramah', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('Failed to fetch') });
    await expect(
      createOrgUser({ email: 'a@b.co', password: 'rahasia123', fullName: 'A', roleLevel: 'staff' }),
    ).rejects.toThrow('Gagal membuat user. Periksa koneksi lalu coba lagi.');
  });
});
