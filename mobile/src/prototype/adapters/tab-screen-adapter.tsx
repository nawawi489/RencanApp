import type { ComponentType } from 'react';

import { getPrototypeMode } from '@/prototype/utils/fidelity-mode';

export function TabScreenAdapter({
  live,
  prototype,
}: {
  live: ComponentType;
  prototype: ComponentType;
}) {
  const Screen = getPrototypeMode() ? prototype : live;
  return <Screen />;
}
