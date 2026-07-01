import { render, screen } from '@testing-library/react-native';

import PrototypeNotificationsScreen from '@/prototype/screens/notifications';

it('renders prototype notification groups and actions', async () => {
  await render(<PrototypeNotificationsScreen />);

  expect(screen.getByText('Baru')).toBeTruthy();
  expect(screen.getByText('Sebelumnya')).toBeTruthy();
  expect(screen.getAllByText('Review').length).toBeGreaterThan(0);
  expect(screen.getByText('Lihat Bukti')).toBeTruthy();
});
