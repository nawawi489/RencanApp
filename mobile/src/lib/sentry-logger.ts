import type { LogTransport } from './logger';

export type SentryClient = {
  captureException: (error: unknown) => void;
  captureMessage: (message: string, level?: string) => void;
};

export const noopSentryClient: SentryClient = {
  captureException: () => {},
  captureMessage: () => {},
};

export function createSentryTransport(client: SentryClient): LogTransport {
  return {
    name: 'sentry',
    write(entry, rawArgs) {
      if (entry.level === 'error') {
        const err = rawArgs.find((a) => a instanceof Error);
        if (err) client.captureException(err);
        else client.captureMessage(entry.message ?? 'Unknown error', 'error');
      } else if (entry.level === 'warn') {
        client.captureMessage(entry.message ?? String(rawArgs), 'warning');
      }
    },
  };
}
