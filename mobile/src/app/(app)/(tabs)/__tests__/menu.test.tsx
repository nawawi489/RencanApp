// Tab Menu (PRD V1.83 §31) — pusat akses sekunder. Validasi perilaku publik: profile card,
// Akses Cepat (People/Archive/Pusat Bantuan), Template conditional, Admin Lanjutan permission-gated
// (Score Formula/MBR/Log Aktivitas pindah sini), logout "Keluar".
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { Alert } from 'react-native-css/components';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ single: jest.fn(() => Promise.resolve({ data: null, error: null })) })),
      })),
    })),
  },
}));

const mockCan = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'u1' }, isLoading: false, can: mockCan }),
}));

jest.mock('@/hooks/use-people-score', () => ({
  __esModule: true,
  useMyScore: () => ({ score: null }),
}));

const mockSetMode = jest.fn();
jest.mock('@/providers/theme-provider', () => ({
  __esModule: true,
  useThemePreference: () => ({ mode: 'system', setMode: mockSetMode, effective: 'light' }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockSignOut = jest.fn();
jest.mock('@/providers/auth-provider', () => ({
  __esModule: true,
  useAuth: () => ({ session: { user: { id: 'u1', email: 'u@n.id' } }, signOut: mockSignOut }),
}));

// eslint-disable-next-line import/first
import MenuScreen from '../menu';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  W.displayName = 'TW';
  return W;
}

beforeEach(() => {
  mockCan.mockReset().mockReturnValue(false); // default: user tanpa permission admin apapun.
  mockPush.mockReset();
  mockSignOut.mockReset();
  mockSetMode.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('Menu §31 — profile card', () => {
  it('menampilkan profile card; tap → people-profile diri sendiri', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Buka profil saya'));
    expect(mockPush).toHaveBeenCalledWith('/people-profile/u1');
  });
});

describe('Menu §31 — Akses Cepat', () => {
  // S4-7: "Pusat Bantuan" dihapus dari tile — tile mati (toast "Segera hadir").
  it('berisi tepat 2 fitur: Anggota, Arsip', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Anggota')).toBeTruthy();
    expect(screen.getByLabelText('Arsip')).toBeTruthy();
    expect(screen.queryByLabelText('Pusat Bantuan')).toBeNull();
    expect(screen.getByText('2 fitur')).toBeTruthy();
  });

  it('Anggota card → push /people', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Anggota'));
    expect(mockPush).toHaveBeenCalledWith('/people');
  });

  it('Log Aktivitas TIDAK ada di Akses Cepat (pindah ke Admin Lanjutan)', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    await screen.findByLabelText('Anggota');
    expect(screen.queryByLabelText('Log Aktivitas')).toBeNull();
  });
});

describe('Menu §31 — Template conditional accordion', () => {
  it('Template accordion TIDAK tampil tanpa manage_kpi_area_templates', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    await screen.findByLabelText('Anggota');
    expect(screen.queryByLabelText('Template')).toBeNull();
  });

  it('Template accordion tampil + collapsed saat user punya manage_kpi_area_templates', async () => {
    mockCan.mockImplementation((k: string) => k === 'manage_kpi_area_templates');
    await render(<MenuScreen />, { wrapper: wrapper() });
    await screen.findByLabelText('Anggota');
    expect(screen.queryByText('Goal Template')).toBeNull();
    fireEvent.press(screen.getByLabelText('Template'));
    expect(await screen.findByText('Goal Template')).toBeTruthy();
  });

  it('Goal Template → push /settings-goal-templates', async () => {
    mockCan.mockImplementation((k: string) => k === 'manage_kpi_area_templates');
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Template'));
    fireEvent.press(await screen.findByLabelText('Goal Template'));
    expect(mockPush).toHaveBeenCalledWith('/settings-goal-templates');
  });
});

describe('Menu §31 — Bantuan', () => {
  // S4-7: accordion Bantuan seluruhnya dihapus — satu-satunya item ("Dukungan") juga
  // toast "Segera hadir". Kembalikan tes ini bila accordion di-restore.
  it('accordion Bantuan tidak ditawarkan (dead surface dihapus S4-7)', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    await screen.findByLabelText('Anggota');
    expect(screen.queryByLabelText('Bantuan')).toBeNull();
    expect(screen.queryByLabelText('Dukungan')).toBeNull();
  });
});

describe('Menu §31 — Pengaturan', () => {
  it('Rumus Skor TIDAK ada di Pengaturan (pindah ke Admin Lanjutan)', async () => {
    mockCan.mockReturnValue(true);
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Pengaturan'));
    const items = await screen.findAllByText(/./);
    const pengaturanLabels = items.map((el) => el.props?.children).filter(Boolean);
    expect(pengaturanLabels).not.toContain('Rumus Skor');
    expect(pengaturanLabels).not.toContain('Aturan Pecah Target');
  });

  it('Pengaturan Pengulangan (ungated) → push /settings-repeat-rules', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Pengaturan'));
    fireEvent.press(await screen.findByLabelText('Pengaturan Pengulangan'));
    expect(mockPush).toHaveBeenCalledWith('/settings-repeat-rules');
  });
});

describe('Menu §31 — Admin Lanjutan (permission-based)', () => {
  it('disembunyikan saat user tak punya permission admin apapun', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    await screen.findByLabelText('Anggota');
    expect(screen.queryByText('Admin Lanjutan')).toBeNull();
  });

  it('tampil saat user punya permission; Governance → push /settings-governance-violation', async () => {
    mockCan.mockImplementation((k: string) => k === 'view_governance_violation');
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Admin Lanjutan'));
    fireEvent.press(await screen.findByLabelText('Tata Kelola'));
    expect(mockPush).toHaveBeenCalledWith('/settings-governance-violation');
  });

  it('Rumus Skor di Admin Lanjutan → push /settings-score-formula', async () => {
    mockCan.mockImplementation((k: string) => k === 'manage_score_formula');
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Admin Lanjutan'));
    fireEvent.press(await screen.findByLabelText('Rumus Skor'));
    expect(mockPush).toHaveBeenCalledWith('/settings-score-formula');
  });

  it('Aturan Pecah Target di Admin Lanjutan → push /settings-mbr', async () => {
    mockCan.mockImplementation((k: string) => k === 'manage_minimum_breakdown_rule');
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Admin Lanjutan'));
    fireEvent.press(await screen.findByLabelText('Aturan Pecah Target'));
    expect(mockPush).toHaveBeenCalledWith('/settings-mbr');
  });

  it('Log Aktivitas di Admin Lanjutan → push /settings-activity-log', async () => {
    mockCan.mockImplementation((k: string) => k === 'view_activity_log');
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Admin Lanjutan'));
    fireEvent.press(await screen.findByLabelText('Log Aktivitas'));
    expect(mockPush).toHaveBeenCalledWith('/settings-activity-log');
  });
});

describe('Menu §31 — header & logout', () => {
  it('gear TIDAK tampil untuk user tanpa create_department (hindari dead-end akses-ditolak)', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    await screen.findByLabelText('Anggota');
    expect(screen.queryByLabelText('Pengaturan organisasi')).toBeNull();
  });

  it('gear tampil untuk admin → push /settings-org-structure', async () => {
    mockCan.mockImplementation((k: string) => k === 'create_department');
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Pengaturan organisasi'));
    expect(mockPush).toHaveBeenCalledWith('/settings-org-structure');
  });

  // ISSUE-001: create_department kini admin-only, tapi Manager dengan manage_teams tetap butuh
  // entry ke tab Tim. Gear muncul bila user bisa masuk minimal satu tab Organisasi.
  it('gear tampil untuk Manager dengan manage_teams saja (tanpa create_department)', async () => {
    mockCan.mockImplementation((k: string) => k === 'manage_teams');
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Pengaturan organisasi'));
    expect(mockPush).toHaveBeenCalledWith('/settings-org-structure');
  });

  it('tombol logout berlabel "Keluar" memanggil signOut', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Keluar'));
    expect(mockSignOut).toHaveBeenCalled();
  });
});

describe('Menu §31 — Tampilan (ThemeSwitch)', () => {
  it('radiogroup Mode tampilan tampil; pilih "Gelap" → setMode("dark")', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Mode tampilan')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Gelap'));
    expect(mockSetMode).toHaveBeenCalledWith('dark');
  });
});
