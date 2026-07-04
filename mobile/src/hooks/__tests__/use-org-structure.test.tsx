// Hooks Fase 8 — use-org-structure. Mock @/lib/org-structure.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockListDepartments = jest.fn();
const mockCreateDepartment = jest.fn();
const mockCreateTeam = jest.fn();
const mockAssignTeamMember = jest.fn();

jest.mock('@/lib/org-structure', () => ({
  listDepartments: (...a: unknown[]) => mockListDepartments(...a),
  createDepartment: (...a: unknown[]) => mockCreateDepartment(...a),
  createTeam: (...a: unknown[]) => mockCreateTeam(...a),
  assignTeamMember: (...a: unknown[]) => mockAssignTeamMember(...a),
  listPositions: jest.fn(() => Promise.resolve([])),
  listTeams: jest.fn(() => Promise.resolve([])),
}));

// C7 — governance-admin lib di-import transitively oleh use-org-structure (createPosition + createRoleTemplate).
jest.mock('@/lib/governance-admin', () => ({
  __esModule: true,
  createPosition: jest.fn(),
  createRoleTemplate: jest.fn(),
}));

// eslint-disable-next-line import/first
import { useOrgActions, useOrgStructure } from '../use-org-structure';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => {
  mockListDepartments.mockReset().mockResolvedValue([{ id: 'd1', name: 'Ops' }]);
  mockCreateDepartment.mockReset().mockResolvedValue('new-id');
  mockCreateTeam.mockReset().mockResolvedValue('team-id');
  mockAssignTeamMember.mockReset().mockResolvedValue('tm-id');
});

describe('useOrgStructure', () => {
  it('[F8-H1] mengambil departments dari data layer', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useOrgStructure(), { wrapper });
    await waitFor(() => expect(result.current.departments).toHaveLength(1));
    expect(mockListDepartments).toHaveBeenCalledTimes(1);
  });

  it('[F8-H2] queryKey ["org_structure","departments"] terisolasi', async () => {
    const { qc, wrapper } = makeWrapper();
    await renderHook(() => useOrgStructure(), { wrapper });
    await waitFor(() => expect(mockListDepartments).toHaveBeenCalled());
    expect(qc.getQueryData(['org_structure', 'departments'])).toEqual([{ id: 'd1', name: 'Ops' }]);
  });

  it('[F8-H3] departments default [] saat pending', async () => {
    mockListDepartments.mockImplementation(() => new Promise(() => undefined));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useOrgStructure(), { wrapper });
    expect(result.current.departments).toEqual([]);
  });
});

describe('useOrgActions', () => {
  it('[F8-H6] createDepartment meneruskan input & invalidate departments key', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useOrgActions(), { wrapper });
    await act(async () => {
      await result.current.createDepartment({ name: 'Ops', description: 'd' });
    });
    expect(mockCreateDepartment).toHaveBeenCalledWith('Ops', 'd');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['org_structure', 'departments'] });
  });

  it('[F8-H7] createDepartment error propagasi', async () => {
    mockCreateDepartment.mockRejectedValue(new Error('denied'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useOrgActions(), { wrapper });
    await expect(result.current.createDepartment({ name: 'X' })).rejects.toThrow('denied');
  });

  it('[F8-H35] isPending true saat mutation berjalan', async () => {
    let resolveFn: (v: string) => void = () => undefined;
    mockCreateDepartment.mockImplementation(() => new Promise<string>((r) => { resolveFn = r; }));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useOrgActions(), { wrapper });
    let p: Promise<unknown> = Promise.resolve();
    await act(async () => {
      p = result.current.createDepartment({ name: 'X' });
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));
    await act(async () => {
      resolveFn('id');
      await p;
    });
  });
});
