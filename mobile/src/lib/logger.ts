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

/**
 * Jalankan `fn` dengan requestId terikat, lalu KEMBALIKAN state sebelumnya di `finally`
 * (nested-safe). Pola aman yang disarankan dibanding `setRequestId` telanjang: tanpa ini,
 * lupa `clearRequestId()` di jalur error membuat requestId bocor ke semua log berikutnya
 * (lintas namespace). `fn` boleh sync; untuk async, await hasilnya di dalam callback.
 */
export function withRequestId<T>(id: string, fn: () => T): T {
  const prev = currentRequestId;
  currentRequestId = id;
  try {
    return fn();
  } finally {
    currentRequestId = prev;
  }
}

// ---------------------------------------------------------------------------
// Sanitize — sensor data sensitif
// ---------------------------------------------------------------------------

// Substring match — fragmen sensitif bisa menyusup di nama key gabungan (mis.
// `x-api-key`, `client_secret`, `user_password`, `serviceKey`, `bearerToken`).
// Exact-match sebelumnya melewatkan varian ini. `code` sengaja tidak masuk agar
// SQLSTATE PostgrestError tetap ke telemetry.
const SENSITIVE_FRAGMENTS = [
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'authorization',
  'credential',
  'cookie',
  'jwt',
  'bearer',
  'servicekey',
  'supabase',
  'storagepath',
];

// PII karyawan (aplikasi EMS) — dicocokkan pada key SETELAH normalisasi. Whole-key
// EQUALITY (bukan substring) karena fragmen pendek seperti `nik`/`hp` beresiko
// false-positive di kata biasa (`piknik`, `alamatnya`). Nama TIDAK disensor —
// konteks debug penting; sensitivitas jauh di bawah data auth.
const PII_KEYS = new Set([
  'nik',
  'ktp',
  'nomorktp',
  'noktp',
  'phone',
  'hp',
  'nomorhp',
  'nohp',
  'nomortelepon',
  'telepon',
  'notelp',
  'dob',
  'tanggallahir',
  'birthdate',
  'alamat',
  'address',
]);

function isSensitiveKey(key: string): boolean {
  // Normalisasi: lowercase + hapus separator (_, -) agar `x-api-key`, `api_key`,
  // `apiKey` semua menghasilkan `apikey` dan cocok pada fragmen yang sama.
  const norm = key.toLowerCase().replace(/[_-]/g, '');
  if (PII_KEYS.has(norm)) return true;
  return SENSITIVE_FRAGMENTS.some((frag) => norm.includes(frag));
}

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Token opaque: Supabase (sbp_, sb_publishable_, sb_secret_) + Bearer <opaque>.
// Sengaja spesifik agar tidak salah menyensor UUID/hash biasa dalam log.
const SUPABASE_TOKEN_PATTERN = /\b(?:sbp_|sb_publishable_|sb_secret_|sb-)[A-Za-z0-9_-]{16,}/g;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9_.\-~+/=]{16,}/gi;

const MAX_DEPTH = 32;

export function sanitize(value: unknown): unknown {
  return sanitizeWithGuard(value, new WeakSet(), 0);
}

function sanitizeWithGuard(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    // Urutan penting: JWT → Bearer opaque → Supabase → email. Bearer <JWT> ditangani
    // JWT_PATTERN dulu (biar sisanya "Bearer [REDACTED_JWT]" tidak ikut ditelan Bearer opaque).
    return value
      .replace(JWT_PATTERN, '[REDACTED_JWT]')
      .replace(BEARER_TOKEN_PATTERN, 'Bearer [REDACTED_TOKEN]')
      .replace(SUPABASE_TOKEN_PATTERN, '[REDACTED_TOKEN]')
      .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]');
  }

  if (typeof value !== 'object') return value;

  if (seen.has(value as object)) return '[CIRCULAR]';
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  seen.add(value as object);

  // `seen` melacak ANCESTOR di jalur rekursi saat ini (bukan semua node yang pernah
  // dikunjungi). Add sebelum turun ke anak, delete setelah selesai (backtracking) →
  // hanya siklus SEJATI yang jadi '[CIRCULAR]'. Shared-ref non-siklik (mis. objek yang
  // sama muncul di dua field berbeda) tetap diserialisasi penuh, tidak salah ditandai.
  if (Array.isArray(value)) {
    const arr = value.map((v) => sanitizeWithGuard(v, seen, depth + 1));
    seen.delete(value as object);
    return arr;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? '[REDACTED]' : sanitizeWithGuard(v, seen, depth + 1);
  }
  seen.delete(value as object);
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
