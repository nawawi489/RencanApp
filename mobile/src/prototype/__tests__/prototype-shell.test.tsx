import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { PrototypeThemeBoundary } from '@/prototype/ui/shell/prototype-theme-boundary';

describe('PrototypeThemeBoundary', () => {
  it('renders children without dark-mode dependency', async () => {
    await render(
      <PrototypeThemeBoundary>
        <Text>Prototype shell ready</Text>
      </PrototypeThemeBoundary>,
    );

    expect(screen.getByText('Prototype shell ready')).toBeTruthy();
  });
});
