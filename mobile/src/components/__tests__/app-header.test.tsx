// AppHeader — verifikasi perilaku back button otomatis yang menggantikan back inline
// PaneTopHeader lama. Berlaku untuk semua tab yang men-stack (saat ini hanya Workspace,
// tapi mekanismenya generik via canGoBack() / useSegments()).
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Fragment, createElement, type PropsWithChildren } from 'react';

import { AppHeader } from '@/components/app-header';

// Mock brand logo agar tidak render SVG berat di test.
jest.mock('@/components/brand-logo', () => ({
  BrandLogo: () => null,
}));

jest.mock('@/components/ui', () => ({
  Avatar: () => null,
}));

jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'u1', full_name: 'Citra Wibawa' }, isLoading: false }),
}));

jest.mock('@/providers/theme-provider', () => ({
  __esModule: true,
  useThemePreference: () => ({ effective: 'light' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);
let mockSegments: string[] = ['(app)', '(tabs)', 'home'];

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
    navigate: jest.fn(),
  }),
  useSegments: () => mockSegments,
}));

const wrapper = ({ children }: PropsWithChildren) => createElement(Fragment, null, children);

describe('AppHeader — back button (pola seragam tab-stack)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockBack.mockClear();
    mockCanGoBack.mockReset();
    mockSegments = ['(app)', '(tabs)', 'home'];
  });

  it('root tab (no history, no subroute) → TIDAK tampilkan tombol Kembali', async () => {
    mockCanGoBack.mockReturnValue(false);
    mockSegments = ['(app)', '(tabs)', 'home'];
    await render(<AppHeader />, { wrapper });
    expect(screen.queryByLabelText('Kembali ke Workspace')).toBeNull();
  });

  it('canGoBack() true pada sub-route → tampilkan tombol Kembali, tap → router.back()', async () => {
    mockCanGoBack.mockReturnValue(true);
    mockSegments = ['(app)', '(tabs)', 'inbox', '123'];
    await render(<AppHeader />, { wrapper });
    const back = screen.getByLabelText('Kembali ke Workspace');
    fireEvent.press(back);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('root tab dengan canGoBack() true → TETAP TIDAK tampilkan tombol Kembali', async () => {
    mockCanGoBack.mockReturnValue(true);
    mockSegments = ['(app)', '(tabs)', 'workspace'];
    await render(<AppHeader />, { wrapper });
    expect(screen.queryByLabelText('Kembali ke Workspace')).toBeNull();
  });

  it('subroute Workspace Performance (canGoBack false) → back fallback ke replace("/workspace")', async () => {
    mockCanGoBack.mockReturnValue(false);
    mockSegments = ['(app)', '(tabs)', 'workspace', 'performance'];
    await render(<AppHeader />, { wrapper });
    const back = screen.getByLabelText('Kembali ke Workspace');
    fireEvent.press(back);
    // canGoBack false → fallback ke replace('/workspace'), bukan router.back().
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/workspace');
  });

  it('subroute Workspace Development (canGoBack false) → back fallback ke replace("/workspace")', async () => {
    mockCanGoBack.mockReturnValue(false);
    mockSegments = ['(app)', '(tabs)', 'workspace', 'development'];
    await render(<AppHeader />, { wrapper });
    fireEvent.press(screen.getByLabelText('Kembali ke Workspace'));
    expect(mockReplace).toHaveBeenCalledWith('/workspace');
  });

  it('Hub /workspace (no performance/development segment) → TIDAK tampilkan back', async () => {
    mockCanGoBack.mockReturnValue(false);
    mockSegments = ['(app)', '(tabs)', 'workspace'];
    await render(<AppHeader />, { wrapper });
    expect(screen.queryByLabelText('Kembali ke Workspace')).toBeNull();
  });

  it('Cari pill selalu tampil (independen dari back state)', async () => {
    await render(<AppHeader />, { wrapper });
    expect(screen.getByLabelText('Cari')).toBeTruthy();
  });
});
