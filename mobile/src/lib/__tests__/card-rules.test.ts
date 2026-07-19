// Wave 3.1 — card-rules helper (getCompletionRule + getGuidance).
// Pola: mock supabase inline dgn builder factory.
jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));

import { supabase } from '../supabase';
import { getCompletionRule, getGuidance, upsertCompletionRule, upsertCardGuidance } from '../card-rules';
import { glossaryFor } from '../glossary';

type Row = { organization_id: string | null; required_fields?: unknown; title?: string; body?: string };

function mockSelect(rows: Row[], error: unknown = null) {
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data: rows, error }),
  };
  (supabase.from as jest.Mock).mockReturnValue(chain);
  return chain;
}

function mockRpc(error: unknown = null) {
  (supabase as any).rpc = jest.fn().mockResolvedValue({ data: null, error });
}

beforeEach(() => {
  (supabase.from as jest.Mock).mockReset();
});

describe('getCompletionRule', () => {
  it('org row menang atas NULL row', async () => {
    mockSelect([
      { organization_id: 'org-A', required_fields: ['reason'] },
      { organization_id: null, required_fields: ['expected_outcome'] },
    ]);
    const rule = await getCompletionRule('org-A', 'initiative');
    expect(rule.requiredFields).toEqual(['reason']);
  });

  it('NULL row menang bila org row kosong', async () => {
    mockSelect([{ organization_id: null, required_fields: ['expected_outcome'] }]);
    const rule = await getCompletionRule('org-A', 'strategy');
    expect(rule.requiredFields).toEqual(['expected_outcome']);
  });

  it('empty [] bila kedua kosong', async () => {
    mockSelect([]);
    const rule = await getCompletionRule('org-A', 'goal');
    expect(rule.requiredFields).toEqual([]);
  });

  it('throws saat query error (bukan silent swallow)', async () => {
    mockSelect([], { message: 'boom' });
    await expect(getCompletionRule('org-A', 'goal')).rejects.toBeTruthy();
  });
});

describe('getGuidance', () => {
  it('org row menang', async () => {
    mockSelect([
      { organization_id: 'org-A', title: 'Custom', body: 'Custom body' },
      { organization_id: null, title: 'Default', body: 'Default body' },
    ]);
    const g = await getGuidance('org-A', 'initiative');
    expect(g.title).toBe('Custom');
    expect(g.body).toBe('Custom body');
  });

  it('NULL row menang bila org kosong', async () => {
    mockSelect([{ organization_id: null, title: 'Sys goal', body: 'Sys body' }]);
    const g = await getGuidance('org-A', 'goal');
    expect(g.title).toBe('Sys goal');
    expect(g.body).toBe('Sys body');
  });

  it('fallback glossaryFor bila 0 row', async () => {
    mockSelect([]);
    const g = await getGuidance('org-A', 'goal');
    expect(g).toEqual(glossaryFor('goal'));
  });

  it('fallback glossaryFor bila query error (tidak throw)', async () => {
    mockSelect([], { message: 'offline' });
    const g = await getGuidance('org-A', 'initiative');
    expect(g).toEqual(glossaryFor('initiative'));
  });
});

describe('upsertCompletionRule', () => {
  it('memanggil RPC upsert_card_completion_rule dgn payload', async () => {
    mockRpc();
    await upsertCompletionRule('initiative', ['reason', 'main_risk'], 'Q3');
    expect((supabase as any).rpc).toHaveBeenCalledWith('upsert_card_completion_rule', {
      p_card_type: 'initiative',
      p_required_fields: ['reason', 'main_risk'],
      p_reason: 'Q3',
    });
  });

  it('throws bila RPC error', async () => {
    mockRpc({ message: 'no permission' });
    await expect(upsertCompletionRule('initiative', ['reason'])).rejects.toBeTruthy();
  });
});

describe('upsertCardGuidance', () => {
  it('memanggil RPC upsert_card_guidance dgn payload', async () => {
    mockRpc();
    await upsertCardGuidance('initiative', 'Judul', 'Isi', 'Alasan');
    expect((supabase as any).rpc).toHaveBeenCalledWith('upsert_card_guidance', {
      p_card_type: 'initiative',
      p_title: 'Judul',
      p_body: 'Isi',
      p_reason: 'Alasan',
    });
  });
});
