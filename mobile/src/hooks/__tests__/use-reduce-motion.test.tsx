// P1 animate — the OS Reduce Motion bridge. Verifies the initial async read, live
// updates from the `reduceMotionChanged` listener, unmount cleanup, and that a
// partial/absent AccessibilityInfo mock never throws (defaults to false = motion on).
//
// Each test flushes the initial `isReduceMotionEnabled()` promise with
// `await act(async () => {})` before asserting — otherwise that late resolution can
// clobber a listener update mid-test, or leak into the next test's render.
import { AccessibilityInfo } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

import { useReduceMotion } from '../use-reduce-motion';

const flush = () => act(async () => {});

describe('useReduceMotion', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('[RM-1] reads the initial value async (true) once AccessibilityInfo resolves', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as never);

    const { result } = await renderHook(() => useReduceMotion());
    await flush();
    expect(result.current).toBe(true);
  });

  it('[RM-2] stays false when the OS reports motion enabled', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as never);

    const { result } = await renderHook(() => useReduceMotion());
    await flush();
    expect(result.current).toBe(false);
  });

  it('[RM-3] live-updates when the reduceMotionChanged listener fires', async () => {
    let handler: ((v: boolean) => void) | undefined;
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event, cb) => {
      if ((event as string) === 'reduceMotionChanged') {
        handler = cb as unknown as (v: boolean) => void;
      }
      return { remove: jest.fn() } as never;
    });

    const { result } = await renderHook(() => useReduceMotion());
    await flush(); // settle the initial read so it can't overwrite the listener below
    expect(result.current).toBe(false);

    await act(async () => handler?.(true));
    expect(result.current).toBe(true);

    await act(async () => handler?.(false));
    expect(result.current).toBe(false);
  });

  it('[RM-4] removes the subscription on unmount', async () => {
    const remove = jest.fn();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove } as never);

    const { unmount } = await renderHook(() => useReduceMotion());
    await flush();
    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('[RM-5] does not throw when AccessibilityInfo methods are absent (partial mock)', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(undefined as never);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue(undefined as never);

    const { result, unmount } = await renderHook(() => useReduceMotion());
    await flush();
    expect(result.current).toBe(false);
    // Cleanup must tolerate a missing subscription.
    await expect(unmount()).resolves.toBeUndefined();
  });
});
