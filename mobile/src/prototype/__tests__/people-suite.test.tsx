import { render, screen } from '@testing-library/react-native';

import PrototypePeopleScreen from '@/prototype/screens/people';
import PrototypePeopleProfileScreen from '@/prototype/screens/people-profile';

describe('prototype people surfaces', () => {
  it('renders the people roster tabs and CTA', async () => {
    await render(<PrototypePeopleScreen />);
    expect(screen.getAllByText('People').length).toBeGreaterThan(0);
    expect(screen.getByText('Ranking')).toBeTruthy();
    expect(screen.getByText('Bulan')).toBeTruthy();
    expect(screen.getByText('Quarter')).toBeTruthy();
  });

  it('renders the profile header treatment', async () => {
    await render(<PrototypePeopleProfileScreen />);
    expect(screen.getByText('Rina Jaya')).toBeTruthy();
    expect(screen.getByText('Chat')).toBeTruthy();
  });
});
