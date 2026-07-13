// FR-RC-1 — "Buka Chat" di layar Tugas resolve room + deep-link ke /inbox/{roomId}?contextAp={ap.id}.
// Fallback ke /(tabs)/inbox saat initiative_id null atau room 0 baris.
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
const mockSelect = _sb.select as jest.Mock;
const mockFrom = _sb.from as jest.Mock;

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'ap-1' }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useFocusEffect: (cb: () => void) => cb(),
  Stack: { Screen: () => null },
}));

const mockGetActionPlan = jest.fn();
jest.mock('@/lib/cards', () => {
  const actual = jest.requireActual('@/lib/cards');
  return { ...actual, getActionPlan: (...a: unknown[]) => mockGetActionPlan(...a), listSubmissions: jest.fn().mockResolvedValue([]) };
});

jest.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { id: 'u1', full_name: 'Alice', role: 'staff' } }),
}));

jest.mock('@/hooks/use-repeat-instances', () => ({
  useRepeatInstances: () => ({ compliancePercent: 0 }),
  useInstanceActions: () => ({ startM: { mutateAsync: jest.fn() }, activateM: { mutateAsync: jest.fn() } }),
}));

// eslint-disable-next-line import/first
import { LiveActionPlanDetailScreen } from '../[id]';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Buka Chat deep-link (FR-RC-1)', () => {
  const apBase = {
    id: 'ap-1', name: 'Tugas Alpha', status: 'assigned', initiative_id: 'init-1',
    organization_id: 'org-1', pic_id: 'u1', reviewer_id: 'u2', repeat_setting: 'one_time',
    created_by: 'u1', evidence_required: false, result_value_required: false,
    pic: { id: 'u1', full_name: 'Alice', email: 'a@t.l' },
    reviewer: { id: 'u2', full_name: 'Bob', email: 'b@t.l' },
    start_date: null, deadline: null, priority: null, expected_output: null,
    definition_of_done: null, evidence_description: null, deadline_time: null,
    current_submission_id: null, confidential: false,
  };

  it('happy path: resolve room → push /inbox/{roomId}?contextAp={ap.id}', async () => {
    mockGetActionPlan.mockResolvedValue(apBase);
    mockMaybeSingle.mockResolvedValue({ data: { id: 'room-x' }, error: null });

    await render(createElement(LiveActionPlanDetailScreen), { wrapper: wrapper() });

    const btn = await screen.findByText('Buka Chat');
    fireEvent.press(btn);

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('chat_rooms');
      expect(mockSelect).toHaveBeenCalledWith('id');
      expect(mockEq).toHaveBeenCalledWith('initiative_id', 'init-1');
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/inbox/room-x?contextAp=ap-1');
    });
  });

  it('initiative_id null → fallback /(tabs)/inbox', async () => {
    mockGetActionPlan.mockResolvedValue({ ...apBase, initiative_id: null });

    await render(createElement(LiveActionPlanDetailScreen), { wrapper: wrapper() });

    const btn = await screen.findByText('Buka Chat');
    fireEvent.press(btn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/inbox');
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('room 0 baris (null data) → fallback /(tabs)/inbox', async () => {
    mockGetActionPlan.mockResolvedValue(apBase);
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await render(createElement(LiveActionPlanDetailScreen), { wrapper: wrapper() });

    const btn = await screen.findByText('Buka Chat');
    fireEvent.press(btn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/inbox');
    });
  });
});
