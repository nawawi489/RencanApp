// Fase 8 data layer — Governance & Admin lifecycle (DCR, Cancellation, Evaluation, Archive, Search, Settings).
const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    from: (...a: unknown[]) => mockFrom(...a),
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

// eslint-disable-next-line import/first
import { makeQueryThenable, makeSingleBuilder, someCall } from '@/test-support/fase8-builders';
// eslint-disable-next-line import/first
import {
  DCR_STATUS_LABEL,
  EVALUATION_TARGET_LABEL,
  archiveCard,
  createDeadlineChangeRequest,
  getEvaluation,
  listDeadlineChangeRequests,
  recordEvaluation,
  resubmitDeadlineChangeRequest,
  reviewDeadlineChange,
  searchCards,
  upsertSettings,
} from '../governance-admin';

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe('governance-admin label maps', () => {
  it('[1] DCR_STATUS_LABEL mencakup 3 status Indonesia', () => {
    expect(DCR_STATUS_LABEL.pending).toBe('Menunggu Review');
    expect(DCR_STATUS_LABEL.approved).toBe('Disetujui');
    expect(DCR_STATUS_LABEL.rejected).toBe('Ditolak');
  });

  it('[DCR-DL-1] DCR_STATUS_LABEL.revision_requested = Perlu Revisi', () => {
    expect(DCR_STATUS_LABEL.revision_requested).toBe('Perlu Revisi');
  });

  it('[3] EVALUATION_TARGET_LABEL mencakup ya/sebagian/tidak', () => {
    expect(EVALUATION_TARGET_LABEL.ya).toBe('Tercapai');
    expect(EVALUATION_TARGET_LABEL.sebagian).toBe('Tercapai Sebagian');
    expect(EVALUATION_TARGET_LABEL.tidak).toBe('Tidak Tercapai');
  });
});

describe('deadline change request', () => {
  it('[15] createDeadlineChangeRequest meneruskan 6 params', async () => {
    mockRpc.mockResolvedValue({ data: 'dcr1', error: null });
    await createDeadlineChangeRequest({
      entityId: 'ap1',
      oldDeadline: '2026-07-01',
      newDeadline: '2026-07-10',
      reason: 'butuh waktu',
      impact: 'mundur',
      evidenceNote: 'bukti',
    });
    expect(mockRpc).toHaveBeenCalledWith('create_deadline_change_request', {
      p_entity_id: 'ap1',
      p_old_deadline: '2026-07-01',
      p_new_deadline: '2026-07-10',
      p_reason: 'butuh waktu',
      p_impact: 'mundur',
      p_evidence_note: 'bukti',
    });
  });

  it('[16] listDeadlineChangeRequests filter entity_id + order created_at desc', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listDeadlineChangeRequests('ap1');
    expect(mockFrom).toHaveBeenCalledWith('deadline_change_requests');
    expect(someCall(calls, 'eq', (a) => a[0] === 'entity_id' && a[1] === 'ap1')).toBe(true);
    expect(someCall(calls, 'order', (a) => a[0] === 'created_at')).toBe(true);
  });

  it('[17] reviewDeadlineChange meneruskan p_request_id/p_decision/p_reason', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await reviewDeadlineChange('dcr1', 'approved', 'ok');
    expect(mockRpc).toHaveBeenCalledWith('review_deadline_change', {
      p_request_id: 'dcr1',
      p_decision: 'approved',
      p_reason: 'ok',
    });
  });

  it('[18] reviewDeadlineChange propagasi error anti-self', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'tidak dapat menyetujui sendiri' } });
    await expect(reviewDeadlineChange('dcr1', 'approved')).rejects.toEqual({
      message: 'tidak dapat menyetujui sendiri',
    });
  });

  it('[DCR-DL-2] reviewDeadlineChange terima decision revision_requested + reason wajib', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await reviewDeadlineChange('dcr1', 'revision_requested', 'butuh detail bukti');
    expect(mockRpc).toHaveBeenCalledWith('review_deadline_change', {
      p_request_id: 'dcr1',
      p_decision: 'revision_requested',
      p_reason: 'butuh detail bukti',
    });
  });

  it('[DCR-DL-3] reviewDeadlineChange default reason "" saat tidak diberikan', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await reviewDeadlineChange('dcr1', 'approved');
    expect(mockRpc).toHaveBeenCalledWith('review_deadline_change', {
      p_request_id: 'dcr1',
      p_decision: 'approved',
      p_reason: '',
    });
  });

  it('[DCR-DL-4] resubmitDeadlineChangeRequest meneruskan p_request_id/p_new_deadline/p_reason', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await resubmitDeadlineChangeRequest({
      requestId: 'dcr1',
      newDeadline: '2026-07-20',
      reason: 'revisi: bukti dilampirkan',
    });
    expect(mockRpc).toHaveBeenCalledWith('resubmit_deadline_change_request', {
      p_request_id: 'dcr1',
      p_new_deadline: '2026-07-20',
      p_reason: 'revisi: bukti dilampirkan',
    });
  });

  it('[DCR-DL-5] resubmitDeadlineChangeRequest propagasi error status guard', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Permintaan ini tidak dalam status perlu revisi.' },
    });
    await expect(
      resubmitDeadlineChangeRequest({ requestId: 'dcr1', newDeadline: '2026-07-20', reason: 'r' }),
    ).rejects.toEqual({ message: 'Permintaan ini tidak dalam status perlu revisi.' });
  });
});

describe('evaluation', () => {
  it('[22] recordEvaluation meneruskan 9 params return uuid', async () => {
    mockRpc.mockResolvedValue({ data: 'e1', error: null });
    const id = await recordEvaluation({
      initiativeId: 'i1',
      targetAchieved: 'sebagian',
      results: 'hasil',
      successFactors: ['a'],
      failureFactors: ['b'],
      lessonsLearned: 'pelajaran',
      shouldBecomeSop: true,
      rolloutNeeded: false,
      rolloutNotes: 'n',
    });
    expect(mockRpc).toHaveBeenCalledWith('record_evaluation', {
      p_initiative_id: 'i1',
      p_target_achieved: 'sebagian',
      p_results: 'hasil',
      p_success_factors: ['a'],
      p_failure_factors: ['b'],
      p_lessons_learned: 'pelajaran',
      p_should_become_sop: true,
      p_rollout_needed: false,
      p_rollout_notes: 'n',
    });
    expect(id).toBe('e1');
  });

  it('[23] recordEvaluation propagasi error anti-self', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'PIC tidak dapat mengevaluasi' } });
    await expect(recordEvaluation({ initiativeId: 'i1' })).rejects.toEqual({
      message: 'PIC tidak dapat mengevaluasi',
    });
  });

  it('[23b] getEvaluation query evaluations eq initiative_id maybeSingle', async () => {
    const { builder, calls } = makeSingleBuilder({ data: { id: 'e1' }, error: null });
    mockFrom.mockReturnValue(builder);
    const ev = await getEvaluation('i1');
    expect(mockFrom).toHaveBeenCalledWith('evaluations');
    expect(someCall(calls, 'eq', (a) => a[0] === 'initiative_id' && a[1] === 'i1')).toBe(true);
    expect(builder.maybeSingle).toHaveBeenCalled();
    expect(ev).toEqual({ id: 'e1' });
  });
});

describe('archive + search + settings', () => {
  it('[24] archiveCard memanggil rpc archive_card', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await archiveCard('task', 'ap1');
    expect(mockRpc).toHaveBeenCalledWith('archive_card', { p_entity_type: 'task', p_entity_id: 'ap1' });
  });

  it('[31] searchCards memanggil rpc search_cards return array', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'g1', entity_type: 'goal', name: 'G', status: 'active' }], error: null });
    const rows = await searchCards('G', ['goal'], false);
    expect(mockRpc).toHaveBeenCalledWith('search_cards', {
      p_query: 'G',
      p_entity_types: ['goal'],
      p_include_archived: false,
    });
    expect(rows[0].entity_type).toBe('goal');
  });

  it('[32] upsertSettings memanggil rpc upsert_settings', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await upsertSettings('notification_rule_deadline', { enabled: true });
    expect(mockRpc).toHaveBeenCalledWith('upsert_settings', {
      p_key: 'notification_rule_deadline',
      p_value: { enabled: true },
    });
  });

  it('[33] upsertSettings propagasi error key di luar whitelist', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Kunci pengaturan tidak valid.' } });
    await expect(upsertSettings('bad_key', {})).rejects.toEqual({ message: 'Kunci pengaturan tidak valid.' });
  });
});
