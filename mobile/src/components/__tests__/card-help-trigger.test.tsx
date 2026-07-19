// Wave 3.3 — CardHelpTrigger rewrite dgn useCardGuidance hook + no glossary flash (AC-7).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockGetGuidance = jest.fn();
jest.mock('@/lib/card-rules', () => ({
  __esModule: true,
  getGuidance: (...args: unknown[]) => mockGetGuidance(...args),
}));

const mockUseProfile = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => mockUseProfile(),
}));

// eslint-disable-next-line import/first
import { CardHelpTrigger } from '../card-help-trigger';
// eslint-disable-next-line import/first
import { glossaryFor } from '@/lib/glossary';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

beforeEach(() => {
  mockGetGuidance.mockReset();
  mockUseProfile.mockReset();
  mockUseProfile.mockReturnValue({ profile: { id: 'u1', organization_id: 'org-A' }, isLoading: false });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CardHelpTrigger', () => {
  it('render org-specific guidance saat tap (AC-5)', async () => {
    mockGetGuidance.mockResolvedValue({ title: 'Inisiatif X', body: 'Custom body' });
    await render(<CardHelpTrigger topic="initiative" />, { wrapper: wrapper() });
    const btn = await screen.findByRole('button');
    fireEvent.press(btn);
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Inisiatif X', 'Custom body'),
    );
  });

  it('AC-7 no glossary flash — first render TIDAK memuat glossary title', async () => {
    // Never resolve — simulate loading state
    mockGetGuidance.mockImplementation(() => new Promise(() => {}));
    const { queryByText } = await render(<CardHelpTrigger topic="goal" />, { wrapper: wrapper() });
    // Glossary body content HARUS TIDAK ada di first render (skeleton acceptable)
    expect(queryByText(glossaryFor('goal').title)).toBeNull();
    expect(queryByText(glossaryFor('goal').body)).toBeNull();
  });

  it('onError → fallback ke glossaryFor', async () => {
    mockGetGuidance.mockRejectedValue(new Error('offline'));
    await render(<CardHelpTrigger topic="goal" />, { wrapper: wrapper() });
    const btn = await screen.findByRole('button');
    fireEvent.press(btn);
    const fallback = glossaryFor('goal');
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(fallback.title, fallback.body),
    );
  });
});
