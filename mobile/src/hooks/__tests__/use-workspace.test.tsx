// Hooks Fase 4 / Layer C — use-workspace. Membuktikan kontrak queryKey TERKUNCI, gating enabled
// (id kosong tidak fetch), invalidasi cache pada mutasi, dan propagasi error (mutateAsync melempar).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockListGoals = jest.fn();
const mockGetGoal = jest.fn();
const mockListGoalTemplates = jest.fn();
const mockCreateGoal = jest.fn();
const mockActivateGoal = jest.fn();
const mockApplyGoalTemplate = jest.fn();
const mockRestoreGoalTemplateItems = jest.fn();

const mockListKpiAreas = jest.fn();
const mockCreateKpiArea = jest.fn();
const mockActivateKpiArea = jest.fn();

const mockListStrategies = jest.fn();
const mockCreateStrategy = jest.fn();
const mockActivateStrategy = jest.fn();

const mockListInitiatives = jest.fn();
const mockGetPersonRef = jest.fn();

// Fase 6 — Development Workspace mocks
const mockListDevelopmentAreas = jest.fn();
const mockGetDevelopmentArea = jest.fn();
const mockCreateDevelopmentArea = jest.fn();
const mockActivateDevelopmentArea = jest.fn();
const mockListProblemStatements = jest.fn();
const mockGetProblemStatement = jest.fn();
const mockCreateProblemStatement = jest.fn();
const mockActivateProblemStatement = jest.fn();

jest.mock('@/lib/goals', () => ({
  listGoals: (...a: unknown[]) => mockListGoals(...a),
  getGoal: (...a: unknown[]) => mockGetGoal(...a),
  listGoalTemplates: (...a: unknown[]) => mockListGoalTemplates(...a),
  createGoal: (...a: unknown[]) => mockCreateGoal(...a),
  activateGoal: (...a: unknown[]) => mockActivateGoal(...a),
  applyGoalTemplate: (...a: unknown[]) => mockApplyGoalTemplate(...a),
  restoreGoalTemplateItems: (...a: unknown[]) => mockRestoreGoalTemplateItems(...a),
}));

jest.mock('@/lib/kpi-areas', () => ({
  listKpiAreas: (...a: unknown[]) => mockListKpiAreas(...a),
  createKpiArea: (...a: unknown[]) => mockCreateKpiArea(...a),
  activateKpiArea: (...a: unknown[]) => mockActivateKpiArea(...a),
}));

jest.mock('@/lib/strategies', () => ({
  listStrategies: (...a: unknown[]) => mockListStrategies(...a),
  createStrategy: (...a: unknown[]) => mockCreateStrategy(...a),
  activateStrategy: (...a: unknown[]) => mockActivateStrategy(...a),
}));

jest.mock('@/lib/cards', () => ({
  listInitiatives: (...a: unknown[]) => mockListInitiatives(...a),
  getPersonRef: (...a: unknown[]) => mockGetPersonRef(...a),
}));

jest.mock('@/lib/development-areas', () => ({
  listDevelopmentAreas: (...a: unknown[]) => mockListDevelopmentAreas(...a),
  getDevelopmentArea: (...a: unknown[]) => mockGetDevelopmentArea(...a),
  createDevelopmentArea: (...a: unknown[]) => mockCreateDevelopmentArea(...a),
  activateDevelopmentArea: (...a: unknown[]) => mockActivateDevelopmentArea(...a),
}));

jest.mock('@/lib/problem-statements', () => ({
  listProblemStatements: (...a: unknown[]) => mockListProblemStatements(...a),
  getProblemStatement: (...a: unknown[]) => mockGetProblemStatement(...a),
  createProblemStatement: (...a: unknown[]) => mockCreateProblemStatement(...a),
  activateProblemStatement: (...a: unknown[]) => mockActivateProblemStatement(...a),
}));

// eslint-disable-next-line import/first -- jest.mock must precede the imports it mocks
import {
  useDevelopmentArea,
  useDevelopmentAreaActions,
  useDevelopmentAreas,
  useFlatInitiatives,
  useGoal,
  useGoalActions,
  useGoals,
  useKpiAreaActions,
  useKpiAreas,
  usePerson,
  useProblemStatement,
  useProblemStatementActions,
  useProblemStatementInitiatives,
  useProblemStatements,
  useStrategies,
  useStrategyActions,
} from '../use-workspace';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListGoals.mockResolvedValue([{ id: 'g1', name: 'Goal 1' }]);
  mockGetGoal.mockResolvedValue({ id: 'g1', name: 'Goal 1' });
  mockListGoalTemplates.mockResolvedValue([]);
  mockCreateGoal.mockResolvedValue({ id: 'g-new' });
  mockActivateGoal.mockResolvedValue(undefined);
  mockApplyGoalTemplate.mockResolvedValue('g-from-template');
  mockRestoreGoalTemplateItems.mockResolvedValue(2);
  mockListKpiAreas.mockResolvedValue([{ id: 'k1' }]);
  mockCreateKpiArea.mockResolvedValue({ id: 'k-new' });
  mockActivateKpiArea.mockResolvedValue(undefined);
  mockListStrategies.mockResolvedValue([{ id: 's1' }]);
  mockCreateStrategy.mockResolvedValue({ id: 's-new' });
  mockActivateStrategy.mockResolvedValue(undefined);
  mockListInitiatives.mockResolvedValue([{ id: 'i1' }]);
  mockListDevelopmentAreas.mockResolvedValue([{ id: 'd1', name: 'Org Dev' }]);
  mockGetDevelopmentArea.mockResolvedValue({ id: 'd1', name: 'Org Dev' });
  mockCreateDevelopmentArea.mockResolvedValue({ id: 'd-new' });
  mockActivateDevelopmentArea.mockResolvedValue(undefined);
  mockListProblemStatements.mockResolvedValue([{ id: 'p1' }]);
  mockGetProblemStatement.mockResolvedValue({ id: 'p1' });
  mockCreateProblemStatement.mockResolvedValue({ id: 'p-new' });
  mockActivateProblemStatement.mockResolvedValue(undefined);
});

describe('useGoals / useGoal (enabled gate)', () => {
  it('[1] useGoal("") tidak memanggil getGoal; useGoals memanggil listGoals & expose goals', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(
      () => ({ g: useGoal(''), gs: useGoals() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.gs.goals.length).toBe(1));
    expect(mockListGoals).toHaveBeenCalled();
    expect(mockGetGoal).not.toHaveBeenCalled();
    expect(result.current.g.goal).toBeUndefined();
  });
});

describe('useKpiAreas / useStrategies (enabled gate)', () => {
  it('[2] id kosong tidak fetch; useKpiAreas("g1") memanggil listKpiAreas("g1")', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(
      () => ({ ke: useKpiAreas(''), se: useStrategies(''), k: useKpiAreas('g1') }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.k.kpiAreas.length).toBe(1));
    expect(mockListKpiAreas).toHaveBeenCalledTimes(1);
    expect(mockListKpiAreas).toHaveBeenCalledWith('g1');
    expect(mockListStrategies).not.toHaveBeenCalled();
  });
});

describe('useFlatInitiatives', () => {
  it('[3] memanggil listInitiatives({ strategyId: null, problemStatementId: null }) — exclude Development', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useFlatInitiatives(), { wrapper });
    await waitFor(() => expect(result.current.initiatives.length).toBe(1));
    expect(mockListInitiatives).toHaveBeenCalledWith({ strategyId: null, problemStatementId: null });
  });
});

describe('useGoalActions', () => {
  it('[4] create memanggil createGoal & invalidate ["goals"]', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useGoalActions(), { wrapper });
    await act(async () => {
      await result.current.create({
        name: 'X',
        pic_id: null,
        period_start: null,
        period_end: null,
      });
    });
    expect(mockCreateGoal).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith({ queryKey: ['goals'] });
  });

  it('[5] activate invalidate ["goal",id] & ["goals"]; propagate error bila activateGoal reject', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useGoalActions(), { wrapper });
    await act(async () => {
      await result.current.activate('g1');
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['goal', 'g1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['goals'] });

    mockActivateGoal.mockRejectedValueOnce(new Error('boom'));
    await act(async () => {
      await expect(result.current.activate('g1')).rejects.toThrow('boom');
    });
  });

  it('[6] applyTemplate return goal_id & invalidate ["goals"]', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useGoalActions(), { wrapper });
    let returned: string | undefined;
    await act(async () => {
      returned = await result.current.applyTemplate({
        goalTemplateId: 't1',
        picId: 'p1',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
      });
    });
    expect(returned).toBe('g-from-template');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['goals'] });
  });
});

describe('useKpiAreaActions', () => {
  it('[7] create invalidate ["goal",goalId] & ["kpi_areas",goalId]', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useKpiAreaActions('g1'), { wrapper });
    await act(async () => {
      await result.current.create({
        goal_id: 'g1',
        name: 'KPI',
        target: null,
        pic_id: null,
        period_start: null,
        period_end: null,
      });
    });
    expect(mockCreateKpiArea).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith({ queryKey: ['goal', 'g1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['kpi_areas', 'g1'] });
  });
});

describe('useStrategyActions', () => {
  it('[8] activate invalidate ["strategies",kpiAreaId]; propagate error', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useStrategyActions('k1'), { wrapper });
    await act(async () => {
      await result.current.activate('s1');
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['strategies', 'k1'] });

    mockActivateStrategy.mockRejectedValueOnce(new Error('depth'));
    await act(async () => {
      await expect(result.current.activate('s1')).rejects.toThrow('depth');
    });
  });
});

// ---------------------------------------------------------------- Fase 6: Development hooks

describe('useDevelopmentAreas / useDevelopmentArea (Fase 6)', () => {
  it('[F6-1] useDevelopmentArea("") tidak fetch; useDevelopmentAreas memanggil listDevelopmentAreas', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(
      () => ({ d: useDevelopmentArea(''), ds: useDevelopmentAreas() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.ds.developmentAreas.length).toBe(1));
    expect(mockListDevelopmentAreas).toHaveBeenCalled();
    expect(mockGetDevelopmentArea).not.toHaveBeenCalled();
    expect(result.current.d.developmentArea).toBeUndefined();
  });
});

describe('useProblemStatements / useProblemStatement (enabled gate)', () => {
  it('[F6-2] id kosong tidak fetch; useProblemStatements("d1") memanggil listProblemStatements("d1")', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(
      () => ({
        empty: useProblemStatements(''),
        listed: useProblemStatements('d1'),
        one: useProblemStatement(''),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.listed.problemStatements.length).toBe(1));
    expect(mockListProblemStatements).toHaveBeenCalledTimes(1);
    expect(mockListProblemStatements).toHaveBeenCalledWith('d1');
    expect(mockGetProblemStatement).not.toHaveBeenCalled();
  });
});

describe('useProblemStatementInitiatives', () => {
  it('[F6-3] memanggil listInitiatives({ problemStatementId })', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useProblemStatementInitiatives('p1'), { wrapper });
    await waitFor(() => expect(result.current.initiatives.length).toBe(1));
    expect(mockListInitiatives).toHaveBeenCalledWith({ problemStatementId: 'p1' });
  });
});

describe('useDevelopmentAreaActions', () => {
  it('[F6-4] create invalidate ["development_areas"]; activate invalidate keduanya', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useDevelopmentAreaActions(), { wrapper });
    await act(async () => {
      await result.current.create({
        name: 'X',
        pic_id: null,
        period_start: null,
        period_end: null,
      });
    });
    expect(mockCreateDevelopmentArea).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith({ queryKey: ['development_areas'] });

    await act(async () => {
      await result.current.activate('d1');
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['development_area', 'd1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['development_areas'] });
  });

  it('[F6-5] propagate error bila activateDevelopmentArea reject', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useDevelopmentAreaActions(), { wrapper });
    mockActivateDevelopmentArea.mockRejectedValueOnce(new Error('denied'));
    await act(async () => {
      await expect(result.current.activate('d1')).rejects.toThrow('denied');
    });
  });
});

describe('useProblemStatementActions', () => {
  it('[F6-6] create invalidate semua key relevan + MBR compliance DA (real-time indikator)', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useProblemStatementActions('d1'), { wrapper });
    await act(async () => {
      await result.current.create({
        development_area_id: 'd1',
        name: 'Bug X',
        pic_id: null,
        period_start: null,
        period_end: null,
      });
    });
    expect(mockCreateProblemStatement).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith({ queryKey: ['development_area', 'd1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['problem_statements', 'd1'] });
    expect(spy).toHaveBeenCalledWith({
      queryKey: ['mbr_compliance', 'development_area', 'd1'],
    });
  });

  it('[F6-7] activate invalidate ["problem_statement",id] & ["problem_statements",devAreaId]', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useProblemStatementActions('d1'), { wrapper });
    await act(async () => {
      await result.current.activate('p1');
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['problem_statement', 'p1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['problem_statements', 'd1'] });
  });
});

describe('usePerson (prefill PIC induk)', () => {
  it('[9] id kosong → tidak fetch, person null', async () => {
    mockGetPersonRef.mockResolvedValue({ id: 'p1', full_name: 'Budi', email: null });
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => usePerson(''), { wrapper });
    await act(async () => {});
    expect(mockGetPersonRef).not.toHaveBeenCalled();
    expect(result.current.person).toBeNull();
  });

  it('[10] id terisi → resolve PersonRef', async () => {
    mockGetPersonRef.mockResolvedValue({ id: 'p1', full_name: 'Budi', email: null });
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => usePerson('p1'), { wrapper });
    await waitFor(() => expect(result.current.person).toEqual({ id: 'p1', full_name: 'Budi', email: null }));
    expect(mockGetPersonRef).toHaveBeenCalledWith('p1');
  });
});
