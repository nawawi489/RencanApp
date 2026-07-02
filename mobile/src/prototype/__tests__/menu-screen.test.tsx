import { render, screen } from '@testing-library/react-native';

import PrototypeMenuScreen from '@/prototype/screens/menu';

it('renders the prototype menu sections', async () => {
  await render(<PrototypeMenuScreen />);

  expect(screen.getAllByText('Menu').length).toBeGreaterThan(0);
  expect(screen.getByText('People Ranking & profil')).toBeTruthy();
  expect(screen.getByText('Admin Lanjutan')).toBeTruthy();
  expect(screen.getByText('Keluar')).toBeTruthy();
});
