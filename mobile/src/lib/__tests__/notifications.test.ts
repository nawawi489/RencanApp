// Data layer Fase 3 — notifications.ts. Mock ../supabase (tanpa env/native). Menguji label/tone,
// pemetaan tab→tipe (no-orphan), unreadCount, struktur query (eq/in/order), argumen RPC, error.
const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockGetUser = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  },
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABEL,
  NOTIFICATION_TYPE_TONE,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationTypesForTab,
  unreadCount,
  type NotificationTab,
} from '../notifications';

/**
 * Builder query thenable (B5.1): SEMUA metode chainable mengembalikan builder; builder sendiri
 * thenable → `await` resolve di titik mana pun (eq/in/order/range). single/maybeSingle terminal.
 */
function makeQueryThenable(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'gte', 'lt', 'lte', 'neq', 'or', 'order', 'range', 'limit']) {
    builder[m] = jest.fn((...args: unknown[]) => {
      calls[m] = args;
      return builder;
    });
  }
  for (const m of ['single', 'maybeSingle']) {
    builder[m] = jest.fn((...args: unknown[]) => {
      calls[m] = args;
      return Promise.resolve(result);
    });
  }
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { builder, calls };
}

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('label & tone maps', () => {
  it('[1] tiap tipe punya label Indonesia', () => {
    expect(NOTIFICATION_TYPE_LABEL.review_request).toBe('Permintaan Review');
    expect(NOTIFICATION_TYPE_LABEL.instance_missed).toBe('Terlewat');
    expect(NOTIFICATION_TYPE_LABEL.governance_warning).toBe('Peringatan Governance');
    for (const t of NOTIFICATION_TYPES) expect(NOTIFICATION_TYPE_LABEL[t]).toBeTruthy();
  });

  it('[2] tone: rejected/instance_missed/governance danger, approved success, review_request warn', () => {
    expect(NOTIFICATION_TYPE_TONE.rejected).toBe('danger');
    expect(NOTIFICATION_TYPE_TONE.instance_missed).toBe('danger');
    expect(NOTIFICATION_TYPE_TONE.governance_warning).toBe('danger');
    expect(NOTIFICATION_TYPE_TONE.approved).toBe('success');
    expect(NOTIFICATION_TYPE_TONE.review_request).toBe('warn');
  });
});

describe('notificationTypesForTab', () => {
  it('[3] semua/undefined → null (tanpa filter)', () => {
    expect(notificationTypesForTab('semua')).toBeNull();
    expect(notificationTypesForTab(undefined)).toBeNull();
  });

  it('[4] tiap tab non-semua memetakan ke tipe spesifik', () => {
    expect(notificationTypesForTab('review')).toEqual(['review_request', 'approved', 'rejected']);
    expect(notificationTypesForTab('deadline')).toEqual([
      'deadline_reminder',
      'deadline_change_approved',
      'deadline_change_rejected',
      // B-1: pengingat periode berbasis tanggal → muncul di tab deadline juga.
      'period_closing_reminder',
    ]);
    expect(notificationTypesForTab('terlewat')).toEqual(['instance_missed']);
    expect(notificationTypesForTab('repeat')).toEqual(['repeat_due']);
    expect(notificationTypesForTab('governance')).toEqual(['governance_warning']);
    expect(notificationTypesForTab('komentar')).toEqual(['comment', 'mention']);
    expect(notificationTypesForTab('perlu_tindakan')).toEqual([
      'review_request',
      'rejected',
      'mention',
      'deadline_change_requested',
      'deadline_change_revision_requested',
      // B-1: butuh aksi admin (tekan Finalisasi), bukan sekadar informasi.
      'period_closing_reminder',
    ]);
  });

  it('[ISSUE-005-10a] tipe DCR ada di NOTIFICATION_TYPES + LABEL + TONE (dulu silent-render)', () => {
    for (const t of [
      'deadline_change_requested',
      'deadline_change_approved',
      'deadline_change_rejected',
      'deadline_change_revision_requested',
    ] as const) {
      expect(NOTIFICATION_TYPES).toContain(t);
      expect(NOTIFICATION_TYPE_LABEL[t]).toBeTruthy();
      expect(NOTIFICATION_TYPE_TONE[t]).toBeTruthy();
    }
  });

  it('[ISSUE-005-10b] deadline_change_requested→perlu_tindakan; DCR results→deadline', () => {
    expect(notificationTypesForTab('perlu_tindakan')).toContain('deadline_change_requested');
    expect(notificationTypesForTab('perlu_tindakan')).toContain('deadline_change_revision_requested');
    const dl = notificationTypesForTab('deadline') ?? [];
    for (const t of ['deadline_change_approved','deadline_change_rejected'] as const) {
      expect(dl).toContain(t);
    }
  });

  it('[5] no-orphan: tiap dari 9 tipe muncul di ≥1 tab non-semua', () => {
    const tabs: NotificationTab[] = [
      'perlu_tindakan',
      'review',
      'deadline',
      'komentar',
      'terlewat',
      'repeat',
      'governance',
    ];
    const covered = new Set(tabs.flatMap((t) => notificationTypesForTab(t) ?? []));
    for (const t of NOTIFICATION_TYPES) expect(covered.has(t)).toBe(true);
  });
});

describe('unreadCount', () => {
  it('[6] menghitung is_read false/null sebagai belum dibaca', () => {
    expect(
      unreadCount([{ is_read: false }, { is_read: true }, { is_read: null as unknown as boolean }]),
    ).toBe(2);
  });
});

describe('listNotifications', () => {
  it('[7] guard uid-null → kembalikan [] tanpa query', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect(await listNotifications()).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('[8] tab semua: filter recipient + order created_at desc, TANPA .in(type)', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ id: 'n1' }], error: null });
    mockFrom.mockReturnValue(builder);
    const rows = await listNotifications('semua');
    expect(mockFrom).toHaveBeenCalledWith('notifications');
    expect(calls.eq).toEqual(['recipient_id', 'u1']);
    expect(builder.in).not.toHaveBeenCalled();
    expect(calls.order).toEqual(['created_at', { ascending: false }]);
    expect(rows).toEqual([{ id: 'n1' }]);
  });

  it('[9] tab review: tambah .in(type, [review_request, approved, rejected])', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listNotifications('review');
    expect(calls.in).toEqual(['type', ['review_request', 'approved', 'rejected']]);
  });

  it('[ISSUE-005-8a] tab perlu_tindakan menambah .is(resolved_at, null) supaya notif basi disembunyikan', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listNotifications('perlu_tindakan');
    expect(calls.is).toEqual(['resolved_at', null]);
  });

  it('[ISSUE-005-8b] tab non-perlu-tindakan TIDAK memfilter resolved_at (riwayat tetap tampak)', async () => {
    const { builder } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listNotifications('review');
    expect(builder.is).not.toHaveBeenCalled();
  });

  it('[10] error dari query dipropagasi', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(listNotifications()).rejects.toEqual({ message: 'boom' });
  });
});

describe('mark-read RPC', () => {
  it('[11] markNotificationRead memanggil rpc mark_notification_read {p_id}', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await markNotificationRead('n1');
    expect(mockRpc).toHaveBeenCalledWith('mark_notification_read', { p_id: 'n1' });
  });

  it('[12] markAllNotificationsRead memanggil rpc & mengembalikan count', async () => {
    mockRpc.mockResolvedValue({ data: 3, error: null });
    expect(await markAllNotificationsRead()).toBe(3);
    expect(mockRpc).toHaveBeenCalledWith('mark_all_notifications_read');
  });

  it('[13] error RPC dipropagasi', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'no' } });
    await expect(markNotificationRead('n1')).rejects.toEqual({ message: 'no' });
  });
});
