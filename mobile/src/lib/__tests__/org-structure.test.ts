// Fase 8 data layer — Org Structure. Mock ../supabase agar tak butuh env/native saat import.
const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    from: (...a: unknown[]) => mockFrom(...a),
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

// eslint-disable-next-line import/first
import { makeQueryThenable, someCall } from '@/test-support/fase8-builders';
// eslint-disable-next-line import/first
import {
  assignTeamMember,
  createDepartment,
  createTeam,
  listDepartments,
  listPositions,
  listTeamMembers,
  listTeams,
} from '../org-structure';

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe('org-structure reads', () => {
  it('[5] listDepartments query tabel departments, select *, tanpa filter eq', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ id: 'd1' }], error: null });
    mockFrom.mockReturnValue(builder);
    const rows = await listDepartments();
    expect(mockFrom).toHaveBeenCalledWith('departments');
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(calls.eq).toBeUndefined();
    expect(rows).toEqual([{ id: 'd1' }]);
  });

  it('[6] listDepartments propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(listDepartments()).rejects.toEqual({ message: 'boom' });
  });

  it('[8] listPositions memanggil positions.select', async () => {
    const { builder } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listPositions();
    expect(mockFrom).toHaveBeenCalledWith('positions');
  });

  it('[8b] listPositions propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'x' } });
    mockFrom.mockReturnValue(builder);
    await expect(listPositions()).rejects.toEqual({ message: 'x' });
  });

  it('[9] listTeams filter is_active=true bila activeOnly', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listTeams({ activeOnly: true });
    expect(mockFrom).toHaveBeenCalledWith('teams');
    expect(someCall(calls, 'eq', (a) => a[0] === 'is_active' && a[1] === true)).toBe(true);
  });

  it('[9b] listTeams tanpa opts tidak filter is_active', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listTeams();
    expect(someCall(calls, 'eq', (a) => a[0] === 'is_active')).toBe(false);
  });

  it('[10] listTeamMembers query team_members dengan eq team_id', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listTeamMembers('team1');
    expect(mockFrom).toHaveBeenCalledWith('team_members');
    expect(someCall(calls, 'eq', (a) => a[0] === 'team_id' && a[1] === 'team1')).toBe(true);
  });

  it('[10b] listTeamMembers propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'e' } });
    mockFrom.mockReturnValue(builder);
    await expect(listTeamMembers('t')).rejects.toEqual({ message: 'e' });
  });
});

describe('org-structure writes (RPC)', () => {
  it('[11] createDepartment memanggil rpc create_department params benar', async () => {
    mockRpc.mockResolvedValue({ data: 'new-id', error: null });
    const id = await createDepartment('Ops', 'desc');
    expect(mockRpc).toHaveBeenCalledWith('create_department', { p_name: 'Ops', p_description: 'desc' });
    expect(id).toBe('new-id');
  });

  it('[12] createDepartment propagasi error RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(createDepartment('Ops')).rejects.toEqual({ message: 'permission denied' });
  });

  it('[13] createTeam memanggil rpc create_team 4 params', async () => {
    mockRpc.mockResolvedValue({ data: 'team-id', error: null });
    await createTeam({ name: 'Tim A', departmentId: 'd1', description: 'd', leadId: 'u9' });
    expect(mockRpc).toHaveBeenCalledWith('create_team', {
      p_name: 'Tim A',
      p_department_id: 'd1',
      p_description: 'd',
      p_lead_id: 'u9',
    });
  });

  it('[14] assignTeamMember memanggil rpc assign_team_member', async () => {
    mockRpc.mockResolvedValue({ data: 'tm-id', error: null });
    await assignTeamMember({ teamId: 't1', profileId: 'p1', roleInTeam: 'Anggota' });
    expect(mockRpc).toHaveBeenCalledWith('assign_team_member', {
      p_team_id: 't1',
      p_profile_id: 'p1',
      p_role_in_team: 'Anggota',
    });
  });
});
