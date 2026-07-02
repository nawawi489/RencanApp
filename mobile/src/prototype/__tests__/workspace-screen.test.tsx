import { render, screen } from '@testing-library/react-native';

import PrototypeWorkspaceScreen from '@/prototype/screens/workspace';

it('renders both workspace hub cards', async () => {
  await render(<PrototypeWorkspaceScreen />);

  expect(screen.getByText('Target Kinerja')).toBeTruthy();
  expect(screen.getByText('Pembangunan Sistem')).toBeTruthy();
  expect(screen.getAllByText('Masuk').length).toBe(2);
});
