// Centralized logging system. Satu-satunya choke point telemetry seluruh app.
//
// Arsitektur:
//   createLogger('Auth')         → NamespacedLogger (error/warn/info/debug)
//        ↓ dispatch
//   LogLevel filter              → drop jika < minLevel
//        ↓ formatLogEntry
//   sanitize + requestId         → LogEntry (structured JSON)
//        ↓ broadcast
//   Transport[] (console, sentry, …)
//
// Call site cukup: `const log = createLogger('NamaModul'); log.error(err);`

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

export type LogEntry = {
  level: string;
  timestamp: string;
  requestId: string;
  namespace: string;
  message?: string;
  error?: Record<string, unknown>;
  data?: unknown[];
};

export interface LogTransport {
  name: string;
  write(entry: LogEntry, rawArgs: unknown[]): void;
}

export type NamespacedLogger = {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
};

// ---------------------------------------------------------------------------
// Request ID — tracing
// ---------------------------------------------------------------------------

let currentRequestId: string | undefined;

export function generateRequestId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

export function setRequestId(id: string): void {
  currentRequestId = id;
}

export function getRequestId(): string | undefined {
  return currentRequestId;
}

export function clearRequestId(): void {
  currentRequestId = undefined;
}

// ---------------------------------------------------------------------------
// Sanitize — sensor data sensitif
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS =
  /^(password|passwd|secret|token|access_token|refresh_token|authorization|apikey|api_key|credential|cookie|session_token|jwt)$/i;
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return value.replace(JWT_PATTERN, '[REDACTED_JWT]').replace(EMAIL_PATTERN, '[REDACTED_EMAIL]');
  }

  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) return value.map(sanitize);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : sanitize(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Transport management
// ---------------------------------------------------------------------------

const transports: LogTransport[] = [];
let minLevel: LogLevel = LogLevel.DEBUG;

export function addTransport(transport: LogTransport): void {
  if (!transports.some((t) => t.name === transport.name)) {
    transports.push(transport);
  }
}

export function removeTransport(name: string): void {
  const idx = transports.findIndex((t) => t.name === name);
  if (idx !== -1) transports.splice(idx, 1);
}

export function getTransports(): readonly LogTransport[] {
  return transports;
}

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

export function getLogLevel(): LogLevel {
  return minLevel;
}

// ---------------------------------------------------------------------------
// Console transport (default)
// ---------------------------------------------------------------------------

export const consoleTransport: LogTransport = {
  name: 'console',
  write(entry: LogEntry) {
    const json = JSON.stringify(entry);
    switch (entry.level) {
      case 'error':
        console.error(json);
        break;
      case 'warn':
        console.warn(json);
        break;
      default:
        console.log(json);
    }
  },
};

addTransport(consoleTransport);

// ---------------------------------------------------------------------------
// Format
// ---------------------------------------------------------------------------

export function formatLogEntry(level: string, namespace: string, args: unknown[]): LogEntry {
  const entry: LogEntry = {
    level,
    timestamp: new Date().toISOString(),
    requestId: currentRequestId ?? generateRequestId(),
    namespace,
  };
  const rest: unknown[] = [];

  for (const arg of args) {
    if (arg instanceof Error) {
      entry.message = arg.message;
      const extras: Record<string, unknown> = { name: arg.name };
      if (arg.stack) extras.stack = arg.stack;
      for (const key of Object.keys(arg)) {
        if (key !== 'stack') extras[key] = (arg as unknown as Record<string, unknown>)[key];
      }
      entry.error = extras;
    } else {
      rest.push(arg);
    }
  }

  if (rest.length > 0) entry.data = rest;

  return sanitize(entry) as LogEntry;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const LEVEL_MAP: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
};

function dispatch(level: string, namespace: string, args: unknown[]): void {
  const numLevel = LEVEL_MAP[level] ?? LogLevel.INFO;
  if (numLevel < minLevel) return;
  const entry = formatLogEntry(level, namespace, args);
  for (const t of transports) t.write(entry, args);
}

// ---------------------------------------------------------------------------
// Logger factory
// ---------------------------------------------------------------------------

export function createLogger(namespace: string): NamespacedLogger {
  return {
    error: (...args) => dispatch('error', namespace, args),
    warn: (...args) => dispatch('warn', namespace, args),
    info: (...args) => dispatch('info', namespace, args),
    debug: (...args) => dispatch('debug', namespace, args),
  };
}

// ---------------------------------------------------------------------------
// Reset (test-only) — kembalikan state ke default
// ---------------------------------------------------------------------------

export function _resetForTest(): void {
  transports.length = 0;
  addTransport(consoleTransport);
  minLevel = LogLevel.DEBUG;
  currentRequestId = undefined;
}
