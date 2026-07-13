// FR-RC-8 — "Buka Chat Initiative" resolve room → deep-link ke /inbox/{roomId}.
// Fallback ke /(tabs)/inbox saat room tidak ditemukan.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => {
  const m: Record<string, jest.Mock> = {
    maybeSingle: jest.fn(),
    eq: jest.fn(() => ({ maybeSingle: m.maybeSingle })),
    select: jest.fn(() => ({ eq: m.eq })),
    from: jest.fn(() => ({ select: m.select })),
  };
  return { supabase: { from: m.from }, _m: m };
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { _m: _sb } = require('@/lib/supabase');
const mockMaybeSingle = _sb.maybeSingle as jest.Mock;
const mockEq = _sb.eq as jest.Mock;
const mockFrom = _sb.from as jest.Mock;

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'init-1' }),
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (cb: () => void) => cb(),
  Stack: { Screen: () => null },
}));

const mockGetInitiative = jest.fn();
const mockListActionPlans = jest.fn();
const mockListTeams = jest.fn();
jest.mock('@/lib/cards', () => {
  const actual = jest.requireActual('@/lib/cards');
  return {
    ...actual,
    getInitiative: (...a: unknown[]) => mockGetInitiative(...a),
    listActionPlans: (...a: unknown[]) => mockListActionPlans(...a),
    activateInitiative: jest.fn().mockResolvedValue(undefined),
  };
});
jest.mock('@/lib/org-structure', () => ({
  listTeams: (...a: unknown[]) => mockListTeams(...a),
}));
jest.mock('@/hooks/use-mbr', () => ({
  useMbrCompliance: () => ({ compliance: 100, refetch: jest.fn() }),
}));
jest.mock('@/components/mbr-completion', () => ({
  MbrCompletionIndicator: () => null,
  guardMbrActivation: () => null,
}));
jest.mock('@/components/activity-log-panel', () => ({
  ActivityLogPanel: () => null,
}));

// eslint-disable-next-line import/first
import { LiveInitiativeDetailScreen } from '../[id]';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetInitiative.mockResolvedValue({
    id: 'init-1', name: 'Initiative Alpha', status: 'active',
    organization_id: 'org-1', pic_id: 'u1', workspace_id: 'ws-1',
    start_date: null, deadline: null, priority: null, description: null,
    pic: { id: 'u1', full_name: 'Alice', email: 'a@t' },
  });
  mockListActionPlans.mockResolvedValue([]);
  mockListTeams.mockResolvedValue([]);
});

describe('Buka Chat Initiative deep-link (FR-RC-8)', () => {
  it('happy path: resolve room → push /inbox/{roomId}', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'room-y' }, error: null });

    await render(createElement(LiveInitiativeDetailScreen), { wrapper: wrapper() });

    const btn = await screen.findByText('Buka Chat Initiative');
    fireEvent.press(btn);

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('chat_rooms');
      expect(mockEq).toHaveBeenCalledWith('initiative_id', 'init-1');
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/inbox/room-y');
    });
  });

  it('room not found → fallback /(tabs)/inbox', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await render(createElement(LiveInitiativeDetailScreen), { wrapper: wrapper() });

    const btn = await screen.findByText('Buka Chat Initiative');
    fireEvent.press(btn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/inbox');
    });
  });
});
