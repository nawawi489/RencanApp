// Blok A TDD — Data layer push notifications. Pure functions test langsung; RPC test via mock.
const mockRpc = jest.fn();
jest.mock('../supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

// eslint-disable-next-line import/first
import {
  getPushCopy,
  isPushWorthy,
  PUSH_WORTHY_TYPES,
  registerPushToken,
  unregisterPushToken,
} from '../push-notifications';

// eslint-disable-next-line import/first
import { NOTIFICATION_TYPES } from '../notifications';

beforeEach(() => {
  mockRpc.mockReset();
});

describe('PUSH_WORTHY_TYPES', () => {
  it('[PN-DATA-1] berisi tepat 6 tipe Fase 1', () => {
    expect(PUSH_WORTHY_TYPES).toHaveLength(6);
    expect(PUSH_WORTHY_TYPES).toContain('review_request');
    expect(PUSH_WORTHY_TYPES).toContain('approved');
    expect(PUSH_WORTHY_TYPES).toContain('rejected');
    expect(PUSH_WORTHY_TYPES).toContain('deadline_reminder');
    expect(PUSH_WORTHY_TYPES).toContain('repeat_due');
    expect(PUSH_WORTHY_TYPES).toContain('instance_missed');
  });

  it('[PN-DATA-2] setiap elemen valid terhadap NOTIFICATION_TYPES', () => {
    for (const t of PUSH_WORTHY_TYPES) {
      expect(NOTIFICATION_TYPES).toContain(t);
    }
  });
});

describe('isPushWorthy', () => {
  it('[PN-DATA-3] returns true untuk 6 tipe whitelisted', () => {
    for (const t of PUSH_WORTHY_TYPES) {
      expect(isPushWorthy(t)).toBe(true);
    }
  });

  it('[PN-DATA-4] returns false untuk tipe non-whitelisted', () => {
    expect(isPushWorthy('comment')).toBe(false);
    expect(isPushWorthy('mention')).toBe(false);
    expect(isPushWorthy('governance_warning')).toBe(false);
    expect(isPushWorthy('deadline_change_requested')).toBe(false);
    expect(isPushWorthy('deadline_change_approved')).toBe(false);
    expect(isPushWorthy('')).toBe(false);
    expect(isPushWorthy('unknown_type')).toBe(false);
  });
});

describe('getPushCopy', () => {
  it('[PN-DATA-5] mengembalikan title/body per spec §7 untuk setiap push-worthy type', () => {
    const cases: { type: string; titleContains: string }[] = [
      { type: 'review_request', titleContains: 'Review' },
      { type: 'approved', titleContains: 'Disetujui' },
      { type: 'rejected', titleContains: 'Revisi' },
      { type: 'deadline_reminder', titleContains: 'Deadline' },
      { type: 'repeat_due', titleContains: 'Rutin' },
      { type: 'instance_missed', titleContains: 'Terlewat' },
    ];
    for (const { type, titleContains } of cases) {
      const copy = getPushCopy(type);
      expect(copy).toHaveProperty('title');
      expect(copy).toHaveProperty('body');
      expect(copy.title).toContain(titleContains);
      expect(copy.body.length).toBeGreaterThan(0);
    }
  });

  it('[PN-DATA-6] mengembalikan copy generik fail-closed untuk tipe unknown/non-push-worthy', () => {
    const copy = getPushCopy('unknown_type');
    expect(copy.title).toBe('Pembaruan baru');
    expect(copy.body).toBe('Ada pembaruan yang perlu ditinjau.');

    const copy2 = getPushCopy('comment');
    expect(copy2.title).toBe('Pembaruan baru');
  });
});

describe('registerPushToken', () => {
  it('[PN-DATA-7] memanggil RPC register_push_token dengan p_expo_token, p_platform, p_device_id', async () => {
    mockRpc.mockReturnValue({ data: null, error: null });
    await registerPushToken('ExponentPushToken[xxx]', 'ios', 'device-abc');
    expect(mockRpc).toHaveBeenCalledWith('register_push_token', {
      p_expo_token: 'ExponentPushToken[xxx]',
      p_platform: 'ios',
      p_device_id: 'device-abc',
    });
  });

  it('[PN-DATA-8] meneruskan null untuk p_device_id saat deviceId dihilangkan', async () => {
    mockRpc.mockReturnValue({ data: null, error: null });
    await registerPushToken('ExponentPushToken[yyy]', 'android');
    expect(mockRpc).toHaveBeenCalledWith('register_push_token', {
      p_expo_token: 'ExponentPushToken[yyy]',
      p_platform: 'android',
      p_device_id: null,
    });
  });

  it('[PN-DATA-9] propagasi error Supabase', async () => {
    mockRpc.mockReturnValue({ data: null, error: { message: 'db error' } });
    await expect(registerPushToken('ExponentPushToken[zzz]', 'ios')).rejects.toThrow('db error');
  });
});

describe('unregisterPushToken', () => {
  it('[PN-DATA-10] memanggil RPC unregister_push_token dengan p_expo_token', async () => {
    mockRpc.mockReturnValue({ data: null, error: null });
    await unregisterPushToken('ExponentPushToken[xxx]');
    expect(mockRpc).toHaveBeenCalledWith('unregister_push_token', {
      p_expo_token: 'ExponentPushToken[xxx]',
    });
  });

  it('[PN-DATA-11] propagasi error Supabase', async () => {
    mockRpc.mockReturnValue({ data: null, error: { message: 'unregister fail' } });
    await expect(unregisterPushToken('ExponentPushToken[xxx]')).rejects.toThrow('unregister fail');
  });
});
