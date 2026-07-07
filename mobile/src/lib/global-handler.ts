// Item — global handler untuk uncaught JavaScript error di luar React tree. ErrorBoundary
// (components/error-boundary.tsx) hanya menangkap crash render; error asinkron yang tak
// di-catch dan promise rejection tanpa handler tetap perlu terekam ke telemetry agar tidak
// senyap di produksi. Dipasang sekali di app startup lewat `installGlobalErrorHandler()`.
//
// `errorUtils` sengaja injectable agar pure di unit test (React Native mengeksposnya sebagai
// global `ErrorUtils`; web/test env boleh absent tanpa error).
import { createLogger } from './logger';

const log = createLogger('GlobalHandler');

type Handler = (error: unknown, isFatal?: boolean) => void;

type ErrorUtilsLike = {
  getGlobalHandler?: () => Handler | undefined;
  setGlobalHandler: (handler: Handler) => void;
};

/**
 * Pasang handler global yang meneruskan uncaught error ke logger, lalu mem-forward ke handler
 * sebelumnya (biasanya default LogBox di dev). Return disposer untuk memulihkan state semula
 * (dipakai di test / hot reload).
 */
export function installGlobalErrorHandler(
  errorUtils: ErrorUtilsLike | undefined = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils,
): () => void {
  if (!errorUtils) return () => {};
  const prev = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error, isFatal) => {
    log.error(error, { isFatal: isFatal ?? false });
    prev?.(error, isFatal);
  });
  return () => {
    if (prev) errorUtils.setGlobalHandler(prev);
  };
}
