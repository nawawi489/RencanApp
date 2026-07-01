import { render, screen } from '@testing-library/react-native';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

jest.mock('@/prototype/utils/fidelity-mode', () => ({
  getPrototypeMode: () => true,
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
}));

import ActionPlanNewRoute from '@/app/(app)/action-plan/new';
import ActionPlanSubmitRoute from '@/app/(app)/action-plan/submit';
import EvaluationRoute from '@/app/(app)/evaluation';
import SearchRoute from '@/app/(app)/search';
import PrototypeActionPlanSubmitScreen from '@/prototype/screens/action-plan-submit';
import PrototypeKpiAreaFormScreen from '@/prototype/screens/kpi-area-form';

describe('prototype form suite', () => {
  it('renders the KPI template and target breakdown affordances', async () => {
    await render(<PrototypeKpiAreaFormScreen />);
    expect(screen.getByText('Pakai Template')).toBeTruthy();
    expect(screen.getByText('Target Quarter')).toBeTruthy();
  });

  it('renders evidence and result-value submission affordances', async () => {
    await render(<PrototypeActionPlanSubmitScreen />);
    expect(screen.getByText('Upload bukti')).toBeTruthy();
    expect(screen.getByText('Nilai Hasil')).toBeTruthy();
  });

  it('routes Action Plan new to the prototype form in prototype mode', async () => {
    await render(<ActionPlanNewRoute />);
    expect(screen.getByText('Action Plan Baru')).toBeTruthy();
  });

  it('routes Action Plan submit to the prototype submit screen in prototype mode', async () => {
    await render(<ActionPlanSubmitRoute />);
    expect(screen.getByText('Submit Bukti')).toBeTruthy();
  });

  it('routes Evaluation to the prototype evaluation flow in prototype mode', async () => {
    await render(<EvaluationRoute />);
    expect(screen.getByText('Evaluasi')).toBeTruthy();
  });

  it('routes Search to the prototype search surface in prototype mode', async () => {
    await render(<SearchRoute />);
    expect(screen.getByText('Cari')).toBeTruthy();
  });
});
