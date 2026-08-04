// P1 animate — Skeleton honors Reduce Motion. With RM on it must render a static
// mid-opacity block (0.7) instead of the infinite pulse; with RM off it keeps the
// animated opacity value (never the static 0.7).
import { render } from '@testing-library/react-native';

import { Skeleton } from '../ui';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

jest.mock('@/hooks/use-reduce-motion', () => ({
  useReduceMotion: jest.fn(),
}));

const mockUseReduceMotion = useReduceMotion as jest.Mock;

/** Pull the opacity from a rendered node's style (object or flattened array). */
function opacityOf(node: unknown): unknown {
  const style = (node as { props?: { style?: unknown } })?.props?.style;
  const layers = Array.isArray(style) ? style : [style];
  for (const layer of layers) {
    if (layer && typeof layer === 'object' && 'opacity' in (layer as object)) {
      return (layer as { opacity?: unknown }).opacity;
    }
  }
  return undefined;
}

describe('Skeleton — Reduce Motion', () => {
  afterEach(() => mockUseReduceMotion.mockReset());

  it('[SK-RM-1] reduce motion ON → static block at opacity 0.7 (pulse skipped)', async () => {
    mockUseReduceMotion.mockReturnValue(true);
    const tree = (await render(<Skeleton />)).toJSON();
    expect(opacityOf(tree)).toBe(0.7);
  });

  it('[SK-RM-2] reduce motion OFF → animated opacity, never the static 0.7', async () => {
    mockUseReduceMotion.mockReturnValue(false);
    const tree = (await render(<Skeleton />)).toJSON();
    expect(opacityOf(tree)).not.toBe(0.7);
  });
});
