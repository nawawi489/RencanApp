import {
  LogLevel,
  _resetForTest,
  addTransport,
  clearRequestId,
  consoleTransport,
  createLogger,
  formatLogEntry,
  generateRequestId,
  getLogLevel,
  getRequestId,
  getTransports,
  removeTransport,
  sanitize,
  setLogLevel,
  setRequestId,
  type LogTransport,
} from '../logger';

afterEach(() => _resetForTest());

// ---------------------------------------------------------------------------
// Transport management
// ---------------------------------------------------------------------------

describe('transport management', () => {
  it('console transport terdaftar secara default', () => {
    expect(getTransports()).toContain(consoleTransport);
  });

  it('addTransport menambah transport baru', () => {
    const t: LogTransport = { name: 'mock', write: jest.fn() };
    addTransport(t);
    expect(getTransports()).toContain(t);
  });

  it('addTransport menolak duplikat nama (idempoten)', () => {
    const t: LogTransport = { name: 'mock', write: jest.fn() };
    addTransport(t);
    addTransport(t);
    expect(getTransports().filter((x) => x.name === 'mock')).toHaveLength(1);
  });

  it('removeTransport menghapus transport berdasarkan nama', () => {
    const t: LogTransport = { name: 'mock', write: jest.fn() };
    addTransport(t);
    removeTransport('mock');
    expect(getTransports()).not.toContain(t);
  });

  it('removeTransport aman bila nama tidak ditemukan', () => {
    expect(() => removeTransport('nonexistent')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Log level filtering
// ---------------------------------------------------------------------------

describe('log level filtering', () => {
  it('default level DEBUG (semua lolos)', () => {
    expect(getLogLevel()).toBe(LogLevel.DEBUG);
  });

  it('setLogLevel menyaring pesan di bawah minimum', () => {
    const t: LogTransport = { name: 'mock', write: jest.fn() };
    addTransport(t);
    setLogLevel(LogLevel.WARN);
    const log = createLogger('test');
    log.debug('skip');
    log.info('skip');
    log.warn('pass');
    log.error('pass');
    expect(t.write).toHaveBeenCalledTimes(2);
    expect((t.write as jest.Mock).mock.calls[0][0].level).toBe('warn');
    expect((t.write as jest.Mock).mock.calls[1][0].level).toBe('error');
  });

  it('SILENT menyaring semua level', () => {
    const t: LogTransport = { name: 'mock', write: jest.fn() };
    addTransport(t);
    setLogLevel(LogLevel.SILENT);
    const log = createLogger('test');
    log.error('skip');
    expect(t.write).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createLogger (namespace factory)
// ---------------------------------------------------------------------------

describe('createLogger', () => {
  it('mengembalikan logger dengan error/warn/info/debug', () => {
    const log = createLogger('Auth');
    expect(typeof log.error).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.debug).toBe('function');
  });

  it('menyematkan namespace di setiap log entry', () => {
    const t: LogTransport = { name: 'mock', write: jest.fn() };
    addTransport(t);
    createLogger('Auth').error('boom');
    expect((t.write as jest.Mock).mock.calls[0][0].namespace).toBe('Auth');
  });

  it('mem-broadcast ke SEMUA transport terdaftar', () => {
    const t1: LogTransport = { name: 'a', write: jest.fn() };
    const t2: LogTransport = { name: 'b', write: jest.fn() };
    addTransport(t1);
    addTransport(t2);
    createLogger('X').error('boom');
    expect(t1.write).toHaveBeenCalledTimes(1);
    expect(t2.write).toHaveBeenCalledTimes(1);
  });

  it('transport menerima rawArgs untuk akses Error asli (kebutuhan Sentry)', () => {
    const t: LogTransport = { name: 'mock', write: jest.fn() };
    addTransport(t);
    const err = new Error('boom');
    createLogger('X').error(err);
    const rawArgs = (t.write as jest.Mock).mock.calls[0][1] as unknown[];
    expect(rawArgs).toContain(err);
  });
});

// ---------------------------------------------------------------------------
// Console transport — JSON output
// ---------------------------------------------------------------------------

describe('consoleTransport — structured JSON', () => {
  it('error → console.error(JSON)', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    removeTransport('console');
    addTransport(consoleTransport);
    createLogger('ctx').error(new Error('boom'));
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('error');
    expect(parsed.namespace).toBe('ctx');
    expect(parsed.message).toBe('boom');
    spy.mockRestore();
  });

  it('warn → console.warn(JSON)', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    createLogger('P').warn('storage gagal', new Error('ENOENT'));
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('warn');
    expect(parsed.message).toBe('ENOENT');
    spy.mockRestore();
  });

  it('info/debug → console.log(JSON)', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    createLogger('P').info('selesai');
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('info');
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// formatLogEntry
// ---------------------------------------------------------------------------

describe('formatLogEntry', () => {
  it('menghasilkan objek dengan level, timestamp, requestId, namespace', () => {
    const entry = formatLogEntry('error', 'Auth', []);
    expect(entry.level).toBe('error');
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof entry.requestId).toBe('string');
    expect(entry.namespace).toBe('Auth');
  });

  it('mengekstrak Error ke message + error field', () => {
    const err = new Error('boom');
    const entry = formatLogEntry('error', 'X', [err]);
    expect(entry.message).toBe('boom');
    expect((entry.error as Record<string, unknown>).stack).toBeDefined();
  });

  it('menyertakan properti tambahan Error (mis. code PostgrestError)', () => {
    const err = Object.assign(new Error('denied'), { code: '42501' });
    const entry = formatLogEntry('error', 'rpc', [err]);
    expect((entry.error as Record<string, unknown>).code).toBe('42501');
  });

  it('menempatkan argumen non-Error di data', () => {
    const entry = formatLogEntry('error', 'Q', ['hashXYZ', new Error('x')]);
    expect(entry.data).toEqual(['hashXYZ']);
  });

  it('menangani metadata objek di data', () => {
    const entry = formatLogEntry('error', 'GH', [new Error('x'), { isFatal: true }]);
    expect(entry.data).toEqual([{ isFatal: true }]);
  });
});

// ---------------------------------------------------------------------------
// Sanitize
// ---------------------------------------------------------------------------

describe('sanitize', () => {
  it('meredaksi nilai property dengan key sensitif', () => {
    const result = sanitize({ user: 'ali', password: 's3cret', access_token: 'x' }) as Record<string, unknown>;
    expect(result.user).toBe('ali');
    expect(result.password).toBe('[REDACTED]');
    expect(result.access_token).toBe('[REDACTED]');
  });

  it('meredaksi key sensitif secara case-insensitive', () => {
    const result = sanitize({ Authorization: 'Bearer xyz', API_KEY: 'k', apiKey: '1' }) as Record<string, unknown>;
    expect(result.Authorization).toBe('[REDACTED]');
    expect(result.API_KEY).toBe('[REDACTED]');
    expect(result.apiKey).toBe('[REDACTED]');
  });

  it('meredaksi JWT pattern di dalam string', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const result = sanitize(`Bearer ${jwt}`);
    expect(result).toBe('Bearer [REDACTED_JWT]');
  });

  it('meredaksi email di dalam string', () => {
    const result = sanitize('User ali@example.com gagal login');
    expect(result).toBe('User [REDACTED_EMAIL] gagal login');
  });

  it('sanitize nested objects secara rekursif', () => {
    const result = sanitize({ data: { session: { refresh_token: 'rt', user: { id: 'u1' } } } }) as Record<
      string,
      unknown
    >;
    const session = (result.data as Record<string, unknown>).session as Record<string, unknown>;
    expect(session.refresh_token).toBe('[REDACTED]');
    expect((session.user as Record<string, unknown>).id).toBe('u1');
  });

  it('sanitize array elements', () => {
    const result = sanitize([{ token: 'abc' }, 'hello']) as unknown[];
    expect((result[0] as Record<string, unknown>).token).toBe('[REDACTED]');
    expect(result[1]).toBe('hello');
  });

  it('melewatkan primitif non-sensitif', () => {
    expect(sanitize(42)).toBe(42);
    expect(sanitize(true)).toBe(true);
    expect(sanitize(null)).toBeNull();
    expect(sanitize(undefined)).toBeUndefined();
    expect(sanitize('hello')).toBe('hello');
  });

  it('meredaksi sensitive keys di Error extras (code tetap, token diredaksi)', () => {
    const err = Object.assign(new Error('denied'), { code: '42501', token: 'eyJxyz' });
    const entry = formatLogEntry('error', 'rpc', [err]);
    expect((entry.error as Record<string, unknown>).code).toBe('42501');
    expect((entry.error as Record<string, unknown>).token).toBe('[REDACTED]');
  });

  it('meredaksi JWT di dalam error message', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.rg';
    const err = new Error(`invalid token: ${jwt}`);
    const entry = formatLogEntry('error', 'auth', [err]);
    expect(entry.message).not.toContain('eyJ');
    expect(entry.message).toContain('[REDACTED_JWT]');
  });

  // Celah 1: substring match — key sensitif menyusup di nama gabungan
  it('meredaksi key sensitif via SUBSTRING match (x-api-key, client_secret, dll)', () => {
    const result = sanitize({
      'x-api-key': 'k_live',
      client_secret: 'cs_xyz',
      serviceKey: 'sv',
      user_password: 'p',
      apiKeyValue: 'v',
      bearerToken: 'bt',
      'x-supabase-auth': 'sa',
    }) as Record<string, unknown>;
    expect(result['x-api-key']).toBe('[REDACTED]');
    expect(result.client_secret).toBe('[REDACTED]');
    expect(result.serviceKey).toBe('[REDACTED]');
    expect(result.user_password).toBe('[REDACTED]');
    expect(result.apiKeyValue).toBe('[REDACTED]');
    expect(result.bearerToken).toBe('[REDACTED]');
    expect(result['x-supabase-auth']).toBe('[REDACTED]');
  });

  it('substring match tidak salah menyensor key tanpa unsur sensitif', () => {
    const result = sanitize({
      username: 'ali',
      description: 'anywhere',
      status: 'active',
      code: '42501',
    }) as Record<string, unknown>;
    expect(result.username).toBe('ali');
    expect(result.description).toBe('anywhere');
    expect(result.status).toBe('active');
    expect(result.code).toBe('42501');
  });

  // Celah 2: token Supabase non-JWT
  it('meredaksi Supabase service key (sbp_...) di dalam string', () => {
    const result = sanitize('service key sbp_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6 tersebar');
    expect(result).not.toContain('sbp_a1b2c3');
    expect(result).toContain('[REDACTED_TOKEN]');
  });

  it('meredaksi Supabase publishable key (sb_publishable_...) di dalam string', () => {
    const result = sanitize('key: sb_publishable_ABCDEFghijklMNOPqrstuv');
    expect(result).not.toContain('sb_publishable_ABC');
    expect(result).toContain('[REDACTED_TOKEN]');
  });

  it('meredaksi Bearer token opaque non-JWT setelah Bearer', () => {
    const result = sanitize('Authorization: Bearer opaqueTokenXyzAbc1234567890abcdef');
    expect(result).not.toContain('opaqueTokenXyzAbc');
    expect(result).toContain('[REDACTED_TOKEN]');
  });
});

// ---------------------------------------------------------------------------
// Circular reference guard
// ---------------------------------------------------------------------------

describe('sanitize — guard circular reference & depth', () => {
  it('tidak infinite-loop pada circular reference (self)', () => {
    const obj: Record<string, unknown> = { name: 'x' };
    obj.self = obj;
    expect(() => sanitize(obj)).not.toThrow();
    const result = sanitize(obj) as Record<string, unknown>;
    expect(result.name).toBe('x');
    expect(result.self).toBe('[CIRCULAR]');
  });

  it('tidak infinite-loop pada circular reference (mutual)', () => {
    const a: Record<string, unknown> = { label: 'a' };
    const b: Record<string, unknown> = { label: 'b' };
    a.child = b;
    b.parent = a;
    expect(() => sanitize(a)).not.toThrow();
    const result = sanitize(a) as Record<string, unknown>;
    expect(result.label).toBe('a');
    const child = result.child as Record<string, unknown>;
    expect(child.label).toBe('b');
    expect(child.parent).toBe('[CIRCULAR]');
  });

  it('tidak infinite-loop pada circular array', () => {
    const arr: unknown[] = [1, 2];
    arr.push(arr);
    expect(() => sanitize(arr)).not.toThrow();
    const result = sanitize(arr) as unknown[];
    expect(result[0]).toBe(1);
    expect(result[2]).toBe('[CIRCULAR]');
  });

  it('formatLogEntry + JSON.stringify tidak crash pada error dengan circular ref', () => {
    const err = new Error('boom');
    const req: Record<string, unknown> = { url: '/api' };
    const resp: Record<string, unknown> = { status: 500 };
    req.response = resp;
    resp.request = req;
    Object.assign(err, { request: req });
    const entry = formatLogEntry('error', 'HTTP', [err]);
    expect(() => JSON.stringify(entry)).not.toThrow();
  });

  it('memotong nesting yang sangat dalam (guard depth)', () => {
    let deep: Record<string, unknown> = { leaf: 'end' };
    for (let i = 0; i < 200; i++) deep = { child: deep };
    expect(() => sanitize(deep)).not.toThrow();
    expect(() => JSON.stringify(sanitize(deep))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Request ID
// ---------------------------------------------------------------------------

describe('requestId — tracing', () => {
  it('generateRequestId menghasilkan string unik non-kosong', () => {
    const id = generateRequestId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(generateRequestId()).not.toBe(id);
  });

  it('formatLogEntry menyertakan requestId otomatis', () => {
    const a = formatLogEntry('error', 'X', []);
    const b = formatLogEntry('error', 'X', []);
    expect(a.requestId).not.toBe(b.requestId);
  });

  it('setRequestId mengikat semua log ke requestId yang sama', () => {
    setRequestId('op-abc-123');
    const a = formatLogEntry('error', 'X', []);
    const b = formatLogEntry('warn', 'Y', []);
    expect(a.requestId).toBe('op-abc-123');
    expect(b.requestId).toBe('op-abc-123');
  });

  it('clearRequestId kembali ke auto-generate', () => {
    setRequestId('op-xyz');
    clearRequestId();
    const entry = formatLogEntry('error', 'X', []);
    expect(entry.requestId).not.toBe('op-xyz');
  });

  it('getRequestId mengembalikan requestId aktif atau undefined', () => {
    expect(getRequestId()).toBeUndefined();
    setRequestId('op-1');
    expect(getRequestId()).toBe('op-1');
    clearRequestId();
    expect(getRequestId()).toBeUndefined();
  });

  it('requestId muncul di output JSON transport', () => {
    const t: LogTransport = { name: 'mock', write: jest.fn() };
    addTransport(t);
    setRequestId('trace-abc');
    createLogger('X').error('boom');
    expect((t.write as jest.Mock).mock.calls[0][0].requestId).toBe('trace-abc');
  });
});
