import { render, screen } from '@testing-library/react-native';

import PrototypeInboxScreen from '@/prototype/screens/inbox';

it('renders the prototype inbox filters and room list', async () => {
  await render(<PrototypeInboxScreen />);

  expect(screen.getAllByText('Inbox').length).toBeGreaterThan(0);
  expect(screen.getByText('Semua')).toBeTruthy();
  expect(screen.getByText('Belum dibaca')).toBeTruthy();
  expect(screen.getByText('Saya PIC')).toBeTruthy();
});
