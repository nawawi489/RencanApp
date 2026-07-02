import { getPrototypeMode, PROTOTYPE_QUERY_PARAM } from '@/prototype/utils/fidelity-mode';

describe('getPrototypeMode', () => {
  it('returns true when EXPO_PUBLIC_UI_MODE=prototype', () => {
    const previous = process.env.EXPO_PUBLIC_UI_MODE;
    process.env.EXPO_PUBLIC_UI_MODE = 'prototype';

    expect(getPrototypeMode()).toBe(true);

    process.env.EXPO_PUBLIC_UI_MODE = previous;
  });

  it('exposes the expected query param key', () => {
    expect(PROTOTYPE_QUERY_PARAM).toBe('prototype');
  });
});
