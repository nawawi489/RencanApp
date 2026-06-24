// Home — lindungi logika restyle: greeting, hitung prioritas (overdue/review), task rows, state.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockMine = jest.fn();
const mockReview = jest.fn();
jest.mock('@/lib/cards', () => ({
  ...jest.requireActual('@/lib/cards'),
  listMyActionPlans: () => mockMine(),
  listPendingReviews: () => mockReview(),
}));

jest.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { full_name: 'Rina Jaya', id: 'u1' }, isLoading: false, can: () => false }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: () => {},
}));

// eslint-disable-next-line import/first
import HomeScreen from '../index';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

afterEach(() => {
  mockMine.mockReset();
  mockReview.mockReset();
});

describe('HomeScreen', () => {
  it('loading → skeleton', async () => {
    mockMine.mockReturnValue(new Promise(() => {}));
    mockReview.mockReturnValue(new Promise(() => {}));
    await render(<HomeScreen />, { wrapper: wrapper() });
    expect(screen.getAllByLabelText('Memuat…').length).toBeGreaterThan(0);
  });

  it('data → greeting + prioritas overdue + task row', async () => {
    mockMine.mockResolvedValue([
      { id: 'ap1', name: 'Upload 5 konten', status: 'in_progress', deadline: '2020-01-01', pic: { full_name: 'Rina' } },
    ]);
    mockReview.mockResolvedValue([]);
    await render(<HomeScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Upload 5 konten')).toBeTruthy();
    expect(screen.getByText(/Selamat (pagi|siang|sore|malam), Rina\./)).toBeTruthy(); // greeting
    expect(screen.getByText('1 Action Plan perlu tindakan.')).toBeTruthy(); // overdue priority
  });

  it('kosong → empty states', async () => {
    mockMine.mockResolvedValue([]);
    mockReview.mockResolvedValue([]);
    await render(<HomeScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Tidak ada tugas aktif')).toBeTruthy();
    expect(screen.getByText('Tidak ada yang telat.')).toBeTruthy();
  });
});
