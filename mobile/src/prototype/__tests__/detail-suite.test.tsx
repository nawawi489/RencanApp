import { render, screen } from '@testing-library/react-native';

import PrototypeActionPlanDetailScreen from '@/prototype/screens/action-plan-detail';
import PrototypeKpiAreaDetailScreen from '@/prototype/screens/kpi-area-detail';

describe('prototype detail surfaces', () => {
  it('renders the action plan guidance and gate sections', async () => {
    await render(<PrototypeActionPlanDetailScreen />);
    expect(screen.getByText('Panduan Selesai')).toBeTruthy();
    expect(screen.getByText('Gate & kendala')).toBeTruthy();
  });

  it('renders the KPI area gap surface', async () => {
    await render(<PrototypeKpiAreaDetailScreen />);
    expect(screen.getByText('Cakupan & Gap')).toBeTruthy();
  });
});
