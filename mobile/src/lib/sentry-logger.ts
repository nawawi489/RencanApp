import type { LogEntry, LogTransport } from './logger';

export type SentryClient = {
  captureException: (error: unknown) => void;
  captureMessage: (message: string, level?: string) => void;
};

export const noopSentryClient: SentryClient = {
  captureException: () => {},
  captureMessage: () => {},
};

// Bangun ulang Error DARI entry yang sudah tersanitasi. Objek Error mentah TIDAK BOLEH
// diserahkan ke Sentry — SDK akan menserialisasi message + stack + semua enumerable
// property, yang bisa membawa JWT/email/PII yang seharusnya sudah disensor oleh
// pipeline logger (lihat sanitize() di logger.ts). Kontrak ini merapatkan bocor tsb.
function toSanitizedError(entry: LogEntry): Error {
  const message = entry.message ?? 'Unknown error';
  const err = new Error(message);
  const sanitizedError = entry.error;
  if (sanitizedError && typeof sanitizedError === 'object') {
    const name = sanitizedError.name;
    if (typeof name === 'string') err.name = name;
    const stack = sanitizedError.stack;
    if (typeof stack === 'string') err.stack = stack;
    for (const [k, v] of Object.entries(sanitizedError)) {
      if (k === 'name' || k === 'stack' || k === 'message') continue;
      (err as unknown as Record<string, unknown>)[k] = v;
    }
  }
  return err;
}

function messageFromEntry(entry: LogEntry, fallback: string): string {
  if (entry.message) return entry.message;
  if (entry.data && entry.data.length > 0) {
    return entry.data
      .map((d) => (typeof d === 'string' ? d : JSON.stringify(d)))
      .join(' ');
  }
  return fallback;
}

export function createSentryTransport(client: SentryClient): LogTransport {
  return {
    name: 'sentry',
    write(entry) {
      if (entry.level === 'error') {
        if (entry.error) {
          client.captureException(toSanitizedError(entry));
        } else {
          client.captureMessage(messageFromEntry(entry, 'Unknown error'), 'error');
        }
      } else if (entry.level === 'warn') {
        client.captureMessage(messageFromEntry(entry, 'Warning'), 'warning');
      }
    },
  };
}
