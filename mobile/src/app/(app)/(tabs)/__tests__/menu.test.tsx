// Tab Menu (MENU_UI_LOCK_SPEC_V1.82) — pusat akses sekunder. Menu kini layar mandiri (bukan
// adapter ke /settings). Validasi perilaku publik: profile card, Akses Cepat (tepat 3 fitur),
// accordion collapsed-by-default, Bantuan → toast, Admin Lanjutan permission-gated, logout "Keluar".
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

describe('Menu V1.82 — profile card', () => {
  it('menampilkan profile card; tap → people-profile diri sendiri', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Buka profil saya'));
    expect(mockPush).toHaveBeenCalledWith('/people-profile/u1');
  });
});

describe('Menu V1.82 — Akses Cepat', () => {
  it('berisi tepat 3 fitur: People, Log Aktivitas, Archive', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('People')).toBeTruthy();
    expect(screen.getByLabelText('Log Aktivitas')).toBeTruthy();
    expect(screen.getByLabelText('Archive')).toBeTruthy();
    expect(screen.getByText('3 fitur')).toBeTruthy();
  });

  it('People card → push /people', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('People'));
    expect(mockPush).toHaveBeenCalledWith('/people');
  });

  it('tidak memuat Workspace, Home, People Ranking, atau Cari', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    await screen.findByLabelText('People');
    expect(screen.queryByText('Workspace')).toBeNull();
    expect(screen.queryByText('Home')).toBeNull();
    expect(screen.queryByText('People Ranking')).toBeNull();
    expect(screen.queryByText('Cari')).toBeNull();
    expect(screen.queryByLabelText('Cari')).toBeNull();
  });
});

describe('Menu V1.82 — accordion collapsed by default', () => {
  it('Template collapsed: item tersembunyi sampai header ditekan', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    await screen.findByLabelText('People');
    expect(screen.queryByText('Goal Template')).toBeNull();
    fireEvent.press(screen.getByLabelText('Template'));
    expect(await screen.findByText('Goal Template')).toBeTruthy();
  });

  it('Goal Template (ungated) → push /settings-goal-templates', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Template'));
    fireEvent.press(await screen.findByLabelText('Goal Template'));
    expect(mockPush).toHaveBeenCalledWith('/settings-goal-templates');
  });
});

describe('Menu V1.82 — Bantuan', () => {
  it('Pusat Bantuan → toast "Segera hadir", bukan navigasi', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Bantuan'));
    fireEvent.press(await screen.findByLabelText('Pusat Bantuan'));
    expect(Alert.alert).toHaveBeenCalledWith('Segera hadir', expect.any(String));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('Menu V1.82 — Pengaturan gating', () => {
  it('tanpa manage_score_formula → Score Formula tampil sbg teks tapi non-pressable', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Pengaturan'));
    expect(await screen.findByText('Score Formula')).toBeTruthy();
    expect(screen.queryByLabelText('Score Formula')).toBeNull();
  });

  it('dengan permission → Score Formula → push /settings-score-formula', async () => {
    mockCan.mockReturnValue(true);
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Pengaturan'));
    fireEvent.press(await screen.findByLabelText('Score Formula'));
    expect(mockPush).toHaveBeenCalledWith('/settings-score-formula');
  });
});

describe('Menu V1.82 — Admin Lanjutan (permission-based)', () => {
  it('disembunyikan saat user tak punya permission admin apapun', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    await screen.findByLabelText('People');
    expect(screen.queryByText('Admin Lanjutan')).toBeNull();
  });

  it('tampil saat user punya permission; Governance → push /settings-governance-violation', async () => {
    mockCan.mockImplementation((k: string) => k === 'view_governance_violation');
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Admin Lanjutan'));
    fireEvent.press(await screen.findByLabelText('Governance'));
    expect(mockPush).toHaveBeenCalledWith('/settings-governance-violation');
  });
});

describe('Menu V1.82 — header & logout', () => {
  it('gear TIDAK tampil untuk user tanpa create_department (hindari dead-end akses-ditolak)', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    await screen.findByLabelText('People');
    expect(screen.queryByLabelText('Pengaturan organisasi')).toBeNull();
  });

  it('gear tampil untuk admin → push /settings-org-structure', async () => {
    mockCan.mockImplementation((k: string) => k === 'create_department');
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

describe('Menu V1.82 — Tampilan (ThemeSwitch pindah dari settings.tsx)', () => {
  it('radiogroup Mode tampilan tampil; pilih "Gelap" → setMode("dark")', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Mode tampilan')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Gelap'));
    expect(mockSetMode).toHaveBeenCalledWith('dark');
  });
});
