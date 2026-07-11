// Instance lifecycle — Task Instance Detail + Review Flow (mockup 23/24).
// Pola: mock supabase + @/lib/repeat (getInstance/reviewInstanceSubmission) + @/lib/cards + expo-router.
// useInstanceActions dibiarkan asli (logika peran murni).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockGetInstance = jest.fn();
const mockReviewInstance = jest.fn();
jest.mock('@/lib/repeat', () => {
  const actual = jest.requireActual('@/lib/repeat');
  return {
    __esModule: true,
    ...actual,
    getInstance: (...a: unknown[]) => mockGetInstance(...a),
    reviewInstanceSubmission: (...a: unknown[]) => mockReviewInstance(...a),
  };
});

const mockGetTask = jest.fn();
jest.mock('@/lib/cards', () => {
  const actual = jest.requireActual('@/lib/cards');
  return { __esModule: true, ...actual, getTask: (...a: unknown[]) => mockGetTask(...a) };
});

jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'me' }, isLoading: false, can: jest.fn() }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ id: 'inst-1' }),
  useFocusEffect: () => {},
  Stack: { Screen: () => null },
}));

// eslint-disable-next-line import/first
import TaskInstanceDetailScreen from '../instance/[id]';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

const baseInstance = {
  id: 'inst-1',
  task_id: 'ap-1',
  instance_date: '2026-06-01',
  instance_time: '09:00:00',
  deadline_at: '2026-06-01T09:00:00',
  pic_id: 'u-pic',
  reviewer_id: 'me',
  status: 'submitted',
  current_submission_id: 'sub-1',
  pic: { id: 'u-pic', full_name: 'Pak PIC', email: 'pic@n.id' },
  reviewer: { id: 'me', full_name: 'Aku', email: 'me@n.id' },
  task_submissions: [
    {
      id: 'sub-1',
      version_number: 1,
      review_status: 'pending',
      submitted_at: '2026-06-01T08:30:00',
      submitter: { id: 'u-pic', full_name: 'Pak PIC', email: 'pic@n.id' },
      reviewer: null,
      note: 'selesai',
      evidence_files: [],
      task_result_values: [],
    },
  ],
};

beforeEach(() => {
  mockGetInstance.mockReset();
  mockReviewInstance.mockReset();
  mockGetTask.mockReset();
  mockPush.mockReset();
  mockGetTask.mockResolvedValue({ name: 'Laporan Harian' });
  mockReviewInstance.mockResolvedValue(undefined);
});

describe('TaskInstanceDetailScreen', () => {
  it('[1] loading → skeleton "Memuat…"', async () => {
    mockGetInstance.mockReturnValue(new Promise(() => {}));
    await render(<TaskInstanceDetailScreen />, { wrapper: wrapper() });
    expect(screen.getByLabelText('Memuat…')).toBeTruthy();
  });

  it('[2] reviewer + submitted → blok review + approve → reviewInstanceSubmission(approve)', async () => {
    mockGetInstance.mockResolvedValue(baseInstance);
    await render(<TaskInstanceDetailScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Review submission terbaru')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Setujui (Selesai)'));
    });
    await waitFor(() =>
      expect(mockReviewInstance).toHaveBeenCalledWith({
        submissionId: 'sub-1',
        decision: 'approve',
        reason: null,
      }),
    );
  });

  it('[3] PIC + assigned → tombol submit; review tidak tampil', async () => {
    mockGetInstance.mockResolvedValue({
      ...baseInstance,
      pic_id: 'me',
      reviewer_id: 'u-rev',
      reviewer: { id: 'u-rev', full_name: 'Reviewer', email: 'r@n.id' },
      status: 'assigned',
      current_submission_id: null,
      task_submissions: [],
    });
    await render(<TaskInstanceDetailScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Submit Bukti & Nilai Hasil')).toBeTruthy();
    expect(screen.queryByText('Review submission terbaru')).toBeNull();
  });

  it('[4] error → ErrorState (role alert)', async () => {
    mockGetInstance.mockRejectedValue(new Error('boom'));
    await render(<TaskInstanceDetailScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Gagal memuat instance')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
