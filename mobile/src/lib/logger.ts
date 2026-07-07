// Item 4 — abstraksi logger sebagai satu-satunya choke point telemetry. Default menulis ke
// console; saat rilis, `setLogger` menukar impl ke kanal Sentry (di-wire di app startup,
// di luar cakupan unit test). Semua jalur error teknis (mis. `alertFriendlyError`) meneruskan
// ke `getLogger()` agar cukup satu titik integrasi.

export type Logger = {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
};

export const consoleLogger: Logger = {
  error: (...args) => console.error(...args),
  warn: (...args) => console.warn(...args),
  log: (...args) => console.log(...args),
};

let active: Logger = consoleLogger;

/** Tukar logger aktif (mis. arahkan ke Sentry di app startup). */
export function setLogger(impl: Logger): void {
  active = impl;
}

/** Logger aktif saat ini. */
export function getLogger(): Logger {
  return active;
}
