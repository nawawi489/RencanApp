import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Live boolean of the OS "Reduce Motion" accessibility preference.
 *
 * Reads `AccessibilityInfo.isReduceMotionEnabled()` for the initial value and
 * subscribes to `reduceMotionChanged` so consumers re-render when the user flips the
 * OS toggle while the app is open; the subscription is torn down on unmount. Consumers
 * should skip or soften decorative motion when this is `true` (DESIGN.md §9 — skeleton
 * pulse, hand-rolled `<Modal>` transitions). Native-stack screen transitions already
 * honor the OS setting and need no wiring.
 *
 * Test-safe: under the jest native preset `AccessibilityInfo` may be partially mocked
 * or absent. Every access is guarded and the state defaults to `false` (motion on), so a
 * missing mock never throws and never forces the static branch in unrelated component
 * tests. Both setState calls fire from async/listener callbacks (not the effect body),
 * satisfying the `react-hooks/set-state-in-effect` CI lint.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Initial read. `isReduceMotionEnabled()` resolves asynchronously, so setState lands
    // outside the effect's synchronous body.
    try {
      const pending = AccessibilityInfo.isReduceMotionEnabled?.();
      if (pending && typeof pending.then === 'function') {
        pending
          .then((enabled: boolean) => {
            if (mounted) setReduceMotion(!!enabled);
          })
          .catch(() => {
            /* keep default (motion on) */
          });
      }
    } catch {
      /* AccessibilityInfo absent under a partial test mock — keep default */
    }

    // Live updates when the user flips the OS toggle with the app open.
    let subscription: { remove?: () => void } | undefined;
    try {
      subscription = AccessibilityInfo.addEventListener?.(
        'reduceMotionChanged',
        (enabled: boolean) => setReduceMotion(!!enabled),
      );
    } catch {
      /* no listener support under mock — the static initial value is fine */
    }

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return reduceMotion;
}
