// Layar People — membuktikan 4 state ter-wire ke komponen fondasi:
// loading→SkeletonList, data→ScoreLegend+Avatar, empty→EmptyState, error→ErrorState.
// Pola: mock supabase (stub) + mock data layer; QueryClient retry:false.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockListOrgProfiles = jest.fn();
jest.mock('@/lib/cards', () => ({
  __esModule: true,
  listOrgProfiles: () => mockListOrgProfiles(),
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import PeopleScreen from '../people';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
}

afterEach(() => mockListOrgProfiles.mockReset());

describe('PeopleScreen', () => {
  it('loading → skeleton aksesibel "Memuat…"', async () => {
    mockListOrgProfiles.mockReturnValue(new Promise(() => {})); // pending
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(screen.getByLabelText('Memuat…')).toBeTruthy();
  });

  it('data → ScoreLegend + nama anggota + Avatar', async () => {
    mockListOrgProfiles.mockResolvedValue([
      { id: 'u1', full_name: 'Rina Jaya', email: 'rina@nyantuy.id' },
      { id: 'u2', full_name: 'Arman Malik', email: 'arman@nyantuy.id' },
    ]);
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Skala Score')).toBeTruthy();
    expect(await screen.findByText('Rina Jaya')).toBeTruthy();
    expect(screen.getByLabelText('Arman Malik')).toBeTruthy(); // Avatar a11y label
    expect(screen.getByText('2 user')).toBeTruthy();
  });

  it('kosong → EmptyState', async () => {
    mockListOrgProfiles.mockResolvedValue([]);
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Belum ada anggota')).toBeTruthy();
  });

  it('error → ErrorState (role alert) + retry', async () => {
    mockListOrgProfiles.mockRejectedValue(new Error('boom'));
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Gagal memuat People')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Coba lagi')).toBeTruthy();
  });
});
