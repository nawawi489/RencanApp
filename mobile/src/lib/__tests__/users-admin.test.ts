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
    expect(result).toEqual({ user_id: 'u-new', warning: null });
  });

  it('[U-LIB-05] respons sukses dengan warning penempatan → diteruskan ke pemanggil', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        user_id: 'u-new',
        warning: { code: 'role_template_missing', message: 'User dibuat, tetapi penempatan organisasi gagal.' },
      },
      error: null,
    });
    const result = await createOrgUser({
      email: 'a@b.co',
      password: 'rahasia123',
      fullName: 'A',
      roleLevel: 'staff',
    });
    expect(result).toEqual({
      user_id: 'u-new',
      warning: { code: 'role_template_missing', message: 'User dibuat, tetapi penempatan organisasi gagal.' },
    });
  });

  it('[U-LIB-06] warning tanpa message → pakai fallback ramah, code dipertahankan', async () => {
    mockInvoke.mockResolvedValue({
      data: { user_id: 'u-new', warning: { code: 'actor_org_missing' } },
      error: null,
    });
    const result = await createOrgUser({
      email: 'a@b.co',
      password: 'rahasia123',
      fullName: 'A',
      roleLevel: 'staff',
    });
    expect(result.warning?.code).toBe('actor_org_missing');
    expect(result.warning?.message).toContain('penempatan organisasi gagal');
  });

  it('[U-LIB-07] warning berbentuk tidak dikenal → diabaikan (bukan warning palsu)', async () => {
    mockInvoke.mockResolvedValue({ data: { user_id: 'u-new', warning: 'oops' }, error: null });
    const result = await createOrgUser({
      email: 'a@b.co',
      password: 'rahasia123',
      fullName: 'A',
      roleLevel: 'staff',
    });
    expect(result.warning).toBeNull();
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
