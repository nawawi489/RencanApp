// WSA-18 / spec §15 — aturan error UI: user hanya melihat copy ramah non-teknis; detail
// teknis (message backend, SQLSTATE, stack) dikirim ke console/telemetry untuk developer.
//
// `alertImpl`/`logImpl` injectable agar pure di unit test.
import { Alert } from 'react-native';

type AlertFn = (title: string, message: string) => void;
type LogFn = (...args: unknown[]) => void;

/**
 * Tampilkan Alert dengan pesan ramah (`fallbackMessage`) dan JANGAN pernah menampilkan
 * `e.message` mentah ke user. Error teknis dicatat via `logImpl` (default console.error).
 */
export function alertFriendlyError(
  title: string,
  error: unknown,
  fallbackMessage: string,
  opts?: { alertImpl?: AlertFn; logImpl?: LogFn },
): void {
  const log = opts?.logImpl ?? ((...a: unknown[]) => console.error(...a));
  log(`[${title}]`, error);
  const alert = opts?.alertImpl ?? (Alert.alert as AlertFn);
  alert(title, fallbackMessage);
}
