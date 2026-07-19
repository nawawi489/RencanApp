---
type: source
tags: [tdd, score, ranking, fase-7, ws-5, bridge]
updated: 2026-07-19
sources: 10
status: ready-to-execute
milestone: V1.8.3-hotfix
basis: origin/staging @ d562f51 (migrasi 0077)
spec: specs/score-ranking-finalization-bridge.md
---

> **Prasyarat eksekusi** (spec bagian §11.2):
>
> - ADR `wiki/concepts/score-period-immutability.md` di-commit di fase yang sama (B-3 MERGE-BLOCKER).
> - Penomoran migrasi SUDAH diselesaikan: slot `0078` diserahkan ke settings-consumers, spec ini memakai `0079`.
> - Semua 7 keputusan owner terkunci; jangan tanya ulang (lihat memory `score-ranking-finalization-owner-decisions`).

# TDD Plan — Jembatan Score/Ranking Finalization

## 0. Peta layar & seam

| Layer | File yang disentuh | Fase RED | Fase GREEN |
|---|---|---|---|
| Migrasi DB | `supabase/migrations/0079_score_finalize_advisory_lock.sql` (baru) | Fase 0 | Fase 0 |
| DB contract test | `supabase/tests/0079_score_finalize_advisory_lock_contract.sql` (baru) | Fase 0 | — |
| Data-layer | `mobile/src/lib/people-score.ts` (+ `previewFinalization` baru; fungsi lain tetap) | Fase 1 | Fase 1 |
| Data-layer test | `mobile/src/lib/__tests__/people-score.test.ts` (extend) | Fase 1 | — |
| Hook | `mobile/src/hooks/use-people-score.ts` (+ `useCalculatePeriodScores`, `usePreviewFinalization`) | Fase 2 | Fase 2 |
| Hook test | `mobile/src/hooks/__tests__/use-people-score.test.tsx` (extend) | Fase 2 | — |
| Modal | `mobile/src/components/close-period-modal.tsx` → rename `finalize-period-modal.tsx` (behavior berbeda) | Fase 3 | Fase 3 |
| Modal test | `mobile/src/components/__tests__/finalize-period-modal.test.tsx` (greenfield) | Fase 3 | — |
| Screen | `mobile/src/app/(app)/settings-score-formula.tsx` (label + import) | Fase 4 | Fase 4 |
| Screen test | `mobile/src/app/(app)/__tests__/settings-score-formula-screen.test.tsx` (update 14 label + T-UI-2..4) | Fase 4 | — |
| ADR wiki | `wiki/concepts/score-period-immutability.md` (baru) | Fase 5 | Fase 5 |
| Smoke | screenshot bukti | — | Fase 5 |

**Ordering ketat**: Fase 0 → 1 → 2 → 3 → 4 → 5. Fase 0 harus lulus DB contract sebelum apply advisory lock ke staging. Fase 4 tidak boleh mendarat sebelum Fase 3 modal siap (tombol memicu modal baru).

---

## Fase 0 — Migrasi 0079 advisory lock + DB contract

### RED

**File baru**: `supabase/tests/0079_score_finalize_advisory_lock_contract.sql`

Struktur mengikuti pola `supabase/tests/close_period_snapshot_contract.sql`:

```sql
-- Header konvensi: begin; do $$ ... $$; rollback;
-- Runner: docker exec -i supabase_db_supabase psql -U postgres -d postgres -f <file>
-- Guard cross-org, RLS, dan advisory lock harus PASS. RAISE EXCEPTION 'FAIL: ...' bila regresi.

begin;

do $$
declare
  v_org uuid;
  v_period uuid;
  v_ceo uuid;
  v_calc_result int;
  v_close_result int;
begin
  -- Fixture: create org + CEO user + active period + 3 staff users with role_template
  -- ... (lengkap: role_templates, profiles, user_permissions manage_score_formula)
  -- ... (sama pola dengan close_period_snapshot_contract.sql line 20-40)

  -- T-DB-1: calculate_period_scores menolak periodId org lain
  perform set_config('request.jwt.claim.sub', v_ceo::text, true);
  begin
    perform public.calculate_period_scores(<other_org_period_id>);
    raise exception 'FAIL T-DB-1: calculate should reject cross-org periodId';
  exception when others then
    if sqlerrm !~ 'tidak ditemukan' then
      raise exception 'FAIL T-DB-1: wrong error message: %', sqlerrm;
    end if;
    raise notice 'PASS T-DB-1';
  end;

  -- T-DB-2: close_period_snapshot menolak periodId org lain (same pattern)
  -- ...

  -- T-DB-3: authenticated EXECUTE + anon REVOKE
  if not has_function_privilege('authenticated', 'public.calculate_period_scores(uuid)', 'EXECUTE') then
    raise exception 'FAIL T-DB-3a: authenticated must have EXECUTE on calculate_period_scores';
  end if;
  if has_function_privilege('anon', 'public.calculate_period_scores(uuid)', 'EXECUTE') then
    raise exception 'FAIL T-DB-3b: anon must NOT have EXECUTE on calculate_period_scores';
  end if;
  -- ulangi utk close_period_snapshot
  raise notice 'PASS T-DB-3';

  -- T-DB-4: advisory lock present in calculate
  -- Panggil calculate dalam sub-transaction; assert pg_advisory_xact_lock terlihat di pg_locks
  -- (verifikasi dg query pg_locks WHERE locktype='advisory' AND objid=hashtext('score_finalize:'||v_period::text) & granted=true)
  raise notice 'PASS T-DB-4';

  -- T-DB-5: advisory lock present in close (sama pattern)
  raise notice 'PASS T-DB-5';

  -- T-DB-6: end-to-end calc → close menghasilkan ranking_snapshots non-empty
  v_calc_result := public.calculate_period_scores(v_period);
  if v_calc_result <> 3 then raise exception 'FAIL T-DB-6a: calc returned %', v_calc_result; end if;

  v_close_result := public.close_period_snapshot(v_period);
  if v_close_result <> 3 then raise exception 'FAIL T-DB-6b: close returned %', v_close_result; end if;

  if (select count(*) from ranking_snapshots where period_snapshot_id = v_period) <> 3 then
    raise exception 'FAIL T-DB-6c: ranking_snapshots must be non-empty (bug fix confirmation)';
  end if;
  raise notice 'PASS T-DB-6';

  -- T-DB-7 (baru, dari critic F-8) — AC-FIN-15 / INV-5: override baris SEBELUM close
  -- tercermin di ranking_snapshots.score via coalesce(manual_adjusted_score, auto_calculated_score).
  -- Fixture tambahan: apply override manual_adjusted_score=95 pada 1 user sebelum close.
  -- Assert ranking baris user tsb pakai 95 (bukan auto_calculated_score).
  raise notice 'PASS T-DB-7 (AC-FIN-15 override coalesce)';
end $$;

rollback;
```

**Test T-DB-4/5 (advisory lock verification)**: karena test SQL single-transaction tidak dapat memodelkan dua sesi paralel di dalam `begin;...rollback;`, gunakan pendekatan **static check**:

```sql
-- Cek badan fungsi berisi pg_advisory_xact_lock — regex multi-line safe ([\s\S]*? bukan .*)
if not exists (
  select 1 from pg_proc where proname = 'calculate_period_scores'
    and pg_get_functiondef(oid) ~* 'pg_advisory_xact_lock[\s\S]*?hashtext[\s\S]*?''score_finalize:''[\s\S]*?p_period_id'
) then
  raise exception 'FAIL T-DB-4: pg_advisory_xact_lock missing from calculate_period_scores body';
end if;
```

Concurrency behavior (dua session sungguhan) **AC-FIN-18** diverifikasi manual di Fase 5 smoke — dokumentasikan di ADR. Static check ini adalah defense-in-depth: memastikan implementer tidak menghapus `pg_advisory_xact_lock` di refactor future.

### GREEN

**File baru**: `supabase/migrations/0079_score_finalize_advisory_lock.sql`

```sql
-- Migrasi 0079 — advisory lock untuk score finalization pipeline.
-- Ref: specs/score-ranking-finalization-bridge.md FR-MIG-1
-- Penomoran: slot 0078 milik settings-consumers; migrasi ini 0079. Keduanya independen.

-- CREATE OR REPLACE FUNCTION calculate_period_scores(p_period_id uuid) RETURNS int
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
-- (SALIN body dari 0013:500-621 apa adanya, HANYA tambah baris berikut sebagai
--  statement PERTAMA di dalam BEGIN blok utama, sebelum SELECT ... INTO v_period)
--
--   perform pg_advisory_xact_lock(hashtext('score_finalize:' || p_period_id::text));

-- CREATE OR REPLACE FUNCTION close_period_snapshot(p_period_id uuid) RETURNS int
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
-- (SALIN body dari 0013:625-672 apa adanya + patch 0039:154-208, HANYA tambah baris
--  berikut sebagai statement PERTAMA, sebelum SELECT ... FOR UPDATE)
--
--   perform pg_advisory_xact_lock(hashtext('score_finalize:' || p_period_id::text));

-- ACL: CREATE OR REPLACE preserve grant existing (per memory anon-public-rpc-grant-gotcha:
-- CREATE OR REPLACE ≠ DROP+CREATE; grant tidak reset). Cross-check dengan T-DB-3 di kontrak.

-- WAJIB catat rilis order:
-- 1. Apply 0079 ke staging → jalankan T-DB-1..6 → semua PASS.
-- 2. Apply 0079 ke produksi.
-- 3. Baru release build client dengan modal & hook baru (Fase 3-4).
```

**Refactor**: nol; Fase 0 hanya menambah 2 baris `pg_advisory_xact_lock` di dua fungsi. Nol perubahan signature, nol perubahan RLS.

**Regen types**: `npx supabase gen types typescript` **tidak perlu** — signature tidak berubah.

---

## Fase 1 — Data-layer: `previewFinalization`

### RED (extend `mobile/src/lib/__tests__/people-score.test.ts`)

Template salin dari `describe('calculatePeriodScores & closePeriodSnapshot')` line 466-503 + `describe('listUserScoreHistory ...')` line 260-324 untuk pola query builder.

```typescript
// T-DL-1 calculatePeriodScores sukses
describe('calculatePeriodScores', () => {
  beforeEach(() => { mockRpc.mockReset(); mockFrom.mockReset(); });

  it('T-DL-1: sukses → return int users_scored', async () => {
    mockRpc.mockResolvedValueOnce({ data: 5, error: null });
    const result = await calculatePeriodScores('p1');
    expect(result).toBe(5);
    expect(mockRpc).toHaveBeenCalledWith('calculate_period_scores', { p_period_id: 'p1' });
  });

  it('T-DL-2a: E1 sudah ditutup → throw dengan message persis', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Periode ini sudah ditutup dan tidak bisa diubah.' },
    });
    await expect(calculatePeriodScores('p1')).rejects.toEqual({
      message: 'Periode ini sudah ditutup dan tidak bisa diubah.',
    });
  });

  it('T-DL-2b: E2 tidak ditemukan (cross-org) → throw', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Periode tidak ditemukan.' } });
    await expect(calculatePeriodScores('p1')).rejects.toEqual({ message: 'Periode tidak ditemukan.' });
  });

  it('T-DL-2c: E3 tidak berwenang → throw (verified server text 0013:516 + 0039:39)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Anda tidak berwenang mengelola Score Formula.' },
    });
    await expect(calculatePeriodScores('p1')).rejects.toEqual({
      message: 'Anda tidak berwenang mengelola Score Formula.',
    });
  });

  it('T-DL-2d: network error → throw', async () => {
    mockRpc.mockRejectedValueOnce(new Error('Network request failed'));
    await expect(calculatePeriodScores('p1')).rejects.toThrow('Network request failed');
  });
});

// T-DL-3/4 previewFinalization — greenfield count query
describe('previewFinalization', () => {
  function makeCountThenable(result: { count: number | null; error: unknown }) {
    const b: any = {};
    for (const m of ['select', 'eq', 'is']) b[m] = jest.fn(() => b);
    b.then = (r: any, j: any) =>
      Promise.resolve({ data: null, count: result.count, error: result.error }).then(r, j);
    return b;
  }

  it('T-DL-3: sukses → return { eligibleUsers, activeOverrides }', async () => {
    // Implementasi memanggil 2 query berbeda (total eligible + override subset)
    // Test mock 2 builder berturut-turut via mockFrom.mockReturnValueOnce
    const totalBuilder = makeCountThenable({ count: 5, error: null });
    const overrideBuilder = makeCountThenable({ count: 1, error: null });
    mockFrom.mockReturnValueOnce(totalBuilder).mockReturnValueOnce(overrideBuilder);

    const result = await previewFinalization('p1');
    expect(result).toEqual({ eligibleUsers: 5, activeOverrides: 1 });
    expect(mockFrom).toHaveBeenCalledWith('user_score_results');
    expect(totalBuilder.eq).toHaveBeenCalledWith('period_snapshot_id', 'p1');
    expect(totalBuilder.eq).toHaveBeenCalledWith('is_current', true);
    expect(overrideBuilder.eq).toHaveBeenCalledWith('result_kind', 'override');
  });

  it('T-DL-4: bila 0 rows → return { 0, 0 } (bukan throw)', async () => {
    const zero1 = makeCountThenable({ count: 0, error: null });
    const zero2 = makeCountThenable({ count: 0, error: null });
    mockFrom.mockReturnValueOnce(zero1).mockReturnValueOnce(zero2);
    const result = await previewFinalization('p1');
    expect(result).toEqual({ eligibleUsers: 0, activeOverrides: 0 });
  });

  it('T-DL-5: bila error → throw dengan message persis', async () => {
    const err = makeCountThenable({ count: null, error: { message: 'boom' } });
    mockFrom.mockReturnValueOnce(err);
    await expect(previewFinalization('p1')).rejects.toEqual({ message: 'boom' });
  });
});
```

### GREEN (`mobile/src/lib/people-score.ts`)

```typescript
// Tambah setelah closePeriodSnapshot (line ~370).
export type FinalizationPreview = { eligibleUsers: number; activeOverrides: number };

export async function previewFinalization(periodId: string): Promise<FinalizationPreview> {
  const total = await supabase
    .from('user_score_results')
    .select('id', { count: 'exact', head: true })
    .eq('period_snapshot_id', periodId)
    .eq('is_current', true);
  if (total.error) throw total.error;

  const overrides = await supabase
    .from('user_score_results')
    .select('id', { count: 'exact', head: true })
    .eq('period_snapshot_id', periodId)
    .eq('is_current', true)
    .eq('result_kind', 'override');
  if (overrides.error) throw overrides.error;

  return {
    eligibleUsers: total.count ?? 0,
    activeOverrides: overrides.count ?? 0,
  };
}
```

**RLS pertimbangan**: `user_score_results` sudah punya RLS SELECT policy `manage_score_formula` gate + org guard (`0071_fix_score_ranking_rls_policies.sql`). Bila query dari user tanpa permission → return count=0. Ini konsisten dengan gate screen; nol risiko leak.

**Refactor**: bila implementer merasa 2 query bisa jadi 1 dengan aggregate FILTER, refactor pasca-GREEN dengan test tetap hijau. Preferensi awal: dua query terpisah (lebih mudah di-test isolated).

---

## Fase 2 — Hook: `useCalculatePeriodScores` + `usePreviewFinalization`

### RED (extend `mobile/src/hooks/__tests__/use-people-score.test.tsx`)

Salin blok `describe('useClosePeriod — WS-5 tutup periode')` line 313-408. Ganti nama & key list.

```typescript
describe('useCalculatePeriodScores', () => {
  it('T-H-1: mutateAsync → resolve dengan int users_scored', async () => {
    (peopleScore.calculatePeriodScores as jest.Mock).mockResolvedValueOnce(5);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: any) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => useCalculatePeriodScores(), { wrapper });

    let ret: number | undefined;
    await act(async () => { ret = await result.current.mutateAsync('p1'); });
    expect(ret).toBe(5);
    expect(peopleScore.calculatePeriodScores).toHaveBeenCalledWith('p1');
  });

  it('T-H-2: on success → invalidasi TEPAT 4 key skor; JANGAN sentuh active_period/latest_closed_period/ranking', async () => {
    (peopleScore.calculatePeriodScores as jest.Mock).mockResolvedValueOnce(5);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: any) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => useCalculatePeriodScores(), { wrapper });

    await act(async () => { await result.current.mutateAsync('p1'); });

    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]));
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify({ queryKey: ['my_score'] }),
        JSON.stringify({ queryKey: ['user_score'] }),
        JSON.stringify({ queryKey: ['my_score_history'] }),
        JSON.stringify({ queryKey: ['user_score_history'] }),
      ]),
    );
    // Negative: jangan invalidasi kunci status periode / ranking
    expect(keys).not.toContain(JSON.stringify({ queryKey: ['active_period'] }));
    expect(keys).not.toContain(JSON.stringify({ queryKey: ['latest_closed_period'] }));
    expect(keys).not.toContain(JSON.stringify({ queryKey: ['ranking'] }));
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('T-H-3: error passthrough — semua 4 branch WS-5 style', async () => {
    for (const msg of [
      'Periode ini sudah ditutup dan tidak bisa diubah.',
      'Periode tidak ditemukan.',
      'Anda tidak berwenang mengelola Score Formula.',
      'Network request failed',
    ]) {
      (peopleScore.calculatePeriodScores as jest.Mock).mockRejectedValueOnce(new Error(msg));
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const wrapper = ({ children }: any) =>
        createElement(QueryClientProvider, { client: qc }, children);
      const { result } = renderHook(() => useCalculatePeriodScores(), { wrapper });
      await expect(
        act(async () => { await result.current.mutateAsync('p1'); }),
      ).rejects.toThrow(msg);
    }
  });
});

describe('usePreviewFinalization', () => {
  it('T-H-4: query → return { eligibleUsers, activeOverrides }', async () => {
    (peopleScore.previewFinalization as jest.Mock).mockResolvedValueOnce({
      eligibleUsers: 5,
      activeOverrides: 1,
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: any) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => usePreviewFinalization('p1'), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ eligibleUsers: 5, activeOverrides: 1 }));
    expect(peopleScore.previewFinalization).toHaveBeenCalledWith('p1');
  });

  it('T-H-5: enabled=false ketika periodId undefined → tidak fetch', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: any) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => usePreviewFinalization(undefined), { wrapper });
    expect(peopleScore.previewFinalization).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});
```

### GREEN (`mobile/src/hooks/use-people-score.ts`)

```typescript
export function useCalculatePeriodScores() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (periodId: string) => calculatePeriodScores(periodId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my_score'] });
      qc.invalidateQueries({ queryKey: ['user_score'] });
      qc.invalidateQueries({ queryKey: ['my_score_history'] });
      qc.invalidateQueries({ queryKey: ['user_score_history'] });
    },
  });
}

export function usePreviewFinalization(periodId: string | undefined) {
  return useQuery({
    queryKey: ['finalize_preview', periodId],
    queryFn: () => previewFinalization(periodId!),
    enabled: !!periodId,
    staleTime: 0,      // preview harus segar tiap buka modal
    gcTime: 0,         // tidak simpan cache antar-open
  });
}
```

**Refactor**: nol; sisipkan setelah `useClosePeriod` untuk kesinambungan pembaca.

---

## Fase 3 — Modal `FinalizePeriodModal`

### Persiapan file (bukan RED)

1. `git mv mobile/src/components/close-period-modal.tsx mobile/src/components/finalize-period-modal.tsx`
2. Rename export `ClosePeriodModal` → `FinalizePeriodModal` di file baru.
3. Update konsumen `settings-score-formula.tsx:19` import + `:507` usage → langsung ke Fase 4.

### RED (baru `mobile/src/components/__tests__/finalize-period-modal.test.tsx`)

Struktur salin dari `mbr-completion.test.tsx` (isolated modal test) + `settings-score-formula-screen.test.tsx:26-41` (mock hooks). Contoh minimal skeleton:

```typescript
// setup
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
const mockUseCalc = jest.fn();
const mockUseClose = jest.fn();
const mockUsePreview = jest.fn();
jest.mock('@/hooks/use-people-score', () => ({
  __esModule: true,
  useCalculatePeriodScores: (...a: any[]) => mockUseCalc(...a),
  useClosePeriod: (...a: any[]) => mockUseClose(...a),
  usePreviewFinalization: (...a: any[]) => mockUsePreview(...a),
}));

import { FinalizePeriodModal } from '../finalize-period-modal';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';

const activePeriod = {
  id: 'p1', period_name: 'Juli 2026', period_start: '2026-07-01', period_end: '2026-07-31',
};

function factoryPreview(
  data: any,
  opts: Partial<{ isLoading: boolean; isError: boolean; refetch: jest.Mock }> = {},
) {
  return {
    data,
    isLoading: opts.isLoading ?? false,
    isError: opts.isError ?? false,
    refetch: opts.refetch ?? jest.fn(),
  };
}
function factoryMutation(overrides: any = {}) {
  return {
    mutateAsync: jest.fn(),
    isPending: false,
    reset: jest.fn(),
    ...overrides,
  };
}

describe('FinalizePeriodModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePreview.mockReturnValue(factoryPreview({ eligibleUsers: 5, activeOverrides: 1 }));
    mockUseCalc.mockReturnValue(factoryMutation({ mutateAsync: jest.fn().mockResolvedValue(5) }));
    mockUseClose.mockReturnValue(factoryMutation({ mutateAsync: jest.fn().mockResolvedValue(5) }));
  });

  it('T-M-1: preview loaded → step1 dengan copy pratinjau (N>0)', async () => {
    render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/5 pengguna akan diperingkat/i)).toBeTruthy(),
    );
    expect(screen.getByText(/1 Manual Override aktif/i)).toBeTruthy();
    expect(screen.getByLabelText('Saya paham, finalisasi periode & kunci peringkat')).toBeTruthy();
  });

  it('T-M-2: N=0 → warning kuning; tombol confirm tetap ada', async () => {
    mockUsePreview.mockReturnValue(factoryPreview({ eligibleUsers: 0, activeOverrides: 0 }));
    render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/Belum ada pengguna dengan template role/i)).toBeTruthy(),
    );
    expect(screen.getByLabelText('Saya paham, finalisasi periode & kunci peringkat')).toBeTruthy();
  });

  it('T-M-3: preview error → state error-preview + tombol Coba lagi (refetch injected via factory)', async () => {
    const refetch = jest.fn();
    mockUsePreview.mockReturnValue(factoryPreview(null, { isError: true, refetch }));
    render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText(/Gagal memuat pratinjau/i)).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Coba lagi'));
    expect(refetch).toHaveBeenCalled();
  });

  it('T-M-4/5: konfirmasi → calculating → locking', async () => {
    const calcAsync = jest.fn().mockResolvedValue(5);
    const closeAsync = jest.fn().mockResolvedValue(5);
    mockUseCalc.mockReturnValue(factoryMutation({ mutateAsync: calcAsync }));
    mockUseClose.mockReturnValue(factoryMutation({ mutateAsync: closeAsync }));
    render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByLabelText('Saya paham, finalisasi periode & kunci peringkat')).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Saya paham, finalisasi periode & kunci peringkat'));
    });
    expect(calcAsync).toHaveBeenCalledWith('p1');
    expect(closeAsync).toHaveBeenCalledWith('p1');
    await waitFor(() => expect(screen.getByText(/masuk peringkat/i)).toBeTruthy());
  });

  it('T-M-6: done copy untuk N>0 pakai nama periode', async () => {
    mockUseClose.mockReturnValue(factoryMutation({ mutateAsync: jest.fn().mockResolvedValue(5) }));
    render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat'));
    });
    await waitFor(() =>
      expect(screen.getByText(/Periode Juli 2026 difinalisasi\. 5 pengguna masuk peringkat/i))
        .toBeTruthy(),
    );
  });

  it('T-M-7: done copy N=0 menyebut kemungkinan template role', async () => {
    mockUseClose.mockReturnValue(factoryMutation({ mutateAsync: jest.fn().mockResolvedValue(0) }));
    mockUseCalc.mockReturnValue(factoryMutation({ mutateAsync: jest.fn().mockResolvedValue(0) }));
    render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat'));
    });
    await waitFor(() =>
      expect(screen.getByText(/0 pengguna diperingkat.*template role belum dipetakan/i))
        .toBeTruthy(),
    );
  });

  it('T-M-8a: calc E1 → error-calc + copy Indonesia + retry hanya calc', async () => {
    const calcAsync = jest.fn().mockRejectedValueOnce(
      new Error('Periode ini sudah ditutup dan tidak bisa diubah.'),
    );
    const closeAsync = jest.fn();
    mockUseCalc.mockReturnValue(factoryMutation({ mutateAsync: calcAsync }));
    mockUseClose.mockReturnValue(factoryMutation({ mutateAsync: closeAsync }));
    render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat'));
    });
    await waitFor(() =>
      expect(screen.getByText(/Periode ini sudah ditutup/i)).toBeTruthy(),
    );
    expect(closeAsync).not.toHaveBeenCalled();
    // retry
    calcAsync.mockResolvedValueOnce(5);
    closeAsync.mockResolvedValueOnce(5);
    await act(async () => { fireEvent.press(screen.getByLabelText('Coba lagi')); });
    expect(calcAsync).toHaveBeenCalledTimes(2);
    expect(closeAsync).toHaveBeenCalledTimes(1);
  });

  it('T-M-9a: close E1 → error-lock; retry mengulang calc + close', async () => {
    const calcAsync = jest.fn().mockResolvedValue(5);
    const closeAsync = jest.fn()
      .mockRejectedValueOnce(new Error('Periode ini sudah ditutup dan tidak bisa diubah.'))
      .mockResolvedValueOnce(5);
    mockUseCalc.mockReturnValue(factoryMutation({ mutateAsync: calcAsync }));
    mockUseClose.mockReturnValue(factoryMutation({ mutateAsync: closeAsync }));
    render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat'));
    });
    await waitFor(() => expect(screen.getByText(/Periode ini sudah ditutup/i)).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByLabelText('Coba lagi')); });
    expect(calcAsync).toHaveBeenCalledTimes(2);
    expect(closeAsync).toHaveBeenCalledTimes(2);
  });

  it('T-M-9b: close unique_violation (23505) → copy Indonesia bukan raw PG', async () => {
    const closeAsync = jest.fn().mockRejectedValueOnce(
      Object.assign(new Error('duplicate key value violates unique constraint "ranking_snapshots_period_snapshot_id_user_id_key"'),
        { code: '23505' }),
    );
    mockUseClose.mockReturnValue(factoryMutation({ mutateAsync: closeAsync }));
    render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat'));
    });
    await waitFor(() =>
      expect(screen.getByText(/Perhitungan sedang berjalan di sesi lain/i)).toBeTruthy(),
    );
    expect(screen.queryByText(/duplicate key value/i)).toBeNull();
  });

  it('T-M-10: onRequestClose no-op saat calculating/locking; boleh saat step1/done/error', async () => {
    const onClose = jest.fn();
    // Freeze calc supaya modal stuck di state calculating
    let releaseCalc: (v: any) => void;
    const calcAsync = jest.fn(() => new Promise((res) => { releaseCalc = res; }));
    mockUseCalc.mockReturnValue(factoryMutation({ mutateAsync: calcAsync, isPending: true }));
    const { rerender } = render(
      <FinalizePeriodModal visible={true} period={activePeriod} onClose={onClose} />,
    );
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat'));
    });
    // Simulasi hardware back / overlay tap via prop callback modal
    fireEvent(screen.getByTestId('finalize-modal'), 'requestClose');
    expect(onClose).not.toHaveBeenCalled();
    releaseCalc!(5);
    await waitFor(() => expect(screen.getByText(/masuk peringkat/i)).toBeTruthy());
    fireEvent(screen.getByTestId('finalize-modal'), 'requestClose');
    expect(onClose).toHaveBeenCalled();
  });

  it('T-M-11: confirm button disabled saat calcMutation.isPending', async () => {
    mockUseCalc.mockReturnValue(factoryMutation({ mutateAsync: jest.fn(), isPending: true }));
    render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    const btn = await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat');
    expect(btn.props.accessibilityState?.disabled).toBe(true);
  });

  it('T-M-12: label progres pakai accessibilityLiveRegion=polite', async () => {
    let releaseCalc: (v: any) => void;
    mockUseCalc.mockReturnValue(factoryMutation({
      mutateAsync: jest.fn(() => new Promise((res) => { releaseCalc = res; })),
    }));
    render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat'));
    });
    const progressLabel = await screen.findByText(/Langkah 1 dari 2 · Menghitung skor pengguna/i);
    expect(progressLabel.props.accessibilityLiveRegion).toBe('polite');
    releaseCalc!(5);
  });

  it('T-M-13: setelah done, tap Tutup memanggil onClose', async () => {
    const onClose = jest.fn();
    render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={onClose} />);
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat'));
    });
    await waitFor(() => expect(screen.getByText(/masuk peringkat/i)).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Tutup'));
    expect(onClose).toHaveBeenCalled();
  });

  // T-M-15 baru (dari critic F-8) — AC-FIN-2 loading-preview state
  it('T-M-15: preview isLoading → state loading-preview visible', async () => {
    mockUsePreview.mockReturnValue(factoryPreview(undefined, { isLoading: true }));
    render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText(/Memuat pratinjau/i)).toBeTruthy());
    // confirm button tidak boleh muncul saat masih loading
    expect(screen.queryByLabelText('Saya paham, finalisasi periode & kunci peringkat')).toBeNull();
  });

  // T-M-16 baru (dari critic F-8) — AC-FIN-20 footer note di state `done`
  it('T-M-16: done state menampilkan footer "Butuh mengoreksi?"', async () => {
    render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat'));
    });
    await waitFor(() =>
      expect(screen.getByText(/Butuh mengoreksi\?.*Buat periode berikutnya/i)).toBeTruthy(),
    );
  });

  it('T-M-14: canary AC-FIN-8b — calc>0 & close=0 → state error-mismatch', async () => {
    mockUseCalc.mockReturnValue(factoryMutation({ mutateAsync: jest.fn().mockResolvedValue(5) }));
    mockUseClose.mockReturnValue(factoryMutation({ mutateAsync: jest.fn().mockResolvedValue(0) }));
    render(<FinalizePeriodModal visible={true} period={activePeriod} onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Saya paham, finalisasi periode & kunci peringkat'));
    });
    await waitFor(() =>
      expect(screen.getByText(/Perhitungan selesai tapi peringkat tidak tersimpan/i))
        .toBeTruthy(),
    );
  });
});
```

### GREEN (`mobile/src/components/finalize-period-modal.tsx`)

Struktur reducer + effect pattern:

```typescript
type State =
  | { kind: 'loading-preview' }
  | { kind: 'step1'; preview: FinalizationPreview }
  | { kind: 'error-preview' }
  | { kind: 'calculating' }
  | { kind: 'locking' }
  | { kind: 'error-calc'; message: string }
  | { kind: 'error-lock'; message: string }
  | { kind: 'error-mismatch' }
  | { kind: 'done'; count: number };

const CONCURRENT_COPY = 'Perhitungan sedang berjalan di sesi lain. Muat ulang halaman dan coba lagi.';
const MISMATCH_COPY = 'Perhitungan selesai tapi peringkat tidak tersimpan (0 baris). Hubungi admin.';

function mapError(e: any): string {
  if (e?.code === '23505') return CONCURRENT_COPY;
  return e?.message ?? 'Terjadi kesalahan.';
}

async function runFinalize(
  periodId: string,
  setState: (s: State) => void,
  calcMut: ReturnType<typeof useCalculatePeriodScores>,
  closeMut: ReturnType<typeof useClosePeriod>,
) {
  setState({ kind: 'calculating' });
  let calcCount: number;
  try {
    calcCount = await calcMut.mutateAsync(periodId);
  } catch (e: any) {
    setState({ kind: 'error-calc', message: mapError(e) });
    return;
  }

  setState({ kind: 'locking' });
  let closeCount: number;
  try {
    closeCount = await closeMut.mutateAsync(periodId);
  } catch (e: any) {
    setState({ kind: 'error-lock', message: mapError(e) });
    return;
  }

  // AC-FIN-8b canary
  if (calcCount > 0 && closeCount === 0) {
    setState({ kind: 'error-mismatch' });
    return;
  }
  setState({ kind: 'done', count: closeCount });
}

export function FinalizePeriodModal({ visible, period, onClose }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading-preview' });
  const preview = usePreviewFinalization(visible ? period?.id : undefined);
  const calcMut = useCalculatePeriodScores();
  const closeMut = useClosePeriod();

  useEffect(() => {
    if (!visible) return;
    if (preview.isLoading) return setState({ kind: 'loading-preview' });
    if (preview.isError) return setState({ kind: 'error-preview' });
    if (preview.data) return setState({ kind: 'step1', preview: preview.data });
  }, [visible, preview.isLoading, preview.isError, preview.data]);

  const isBusy = state.kind === 'calculating' || state.kind === 'locking' || state.kind === 'loading-preview';

  return (
    <Modal
      testID="finalize-modal"
      visible={visible}
      onRequestClose={() => { if (!isBusy) onClose(); }}
      transparent
      animationType="fade"
    >
      {/* Render body per state.kind sesuai copy §6.4 spec. */}
      {/* Confirm button disabled saat calcMut.isPending || closeMut.isPending */}
      {/* Progress label accessibilityLiveRegion="polite" */}
    </Modal>
  );
}
```

**Refactor pasca-GREEN**:
- Ekstrak `runFinalize` ke helper terpisah bila body membesar.
- Copy string ke konstanta terpisah untuk memudahkan localization future.

---

## Fase 4 — Wire UI (screen + label update)

### RED (extend `settings-score-formula-screen.test.tsx`)

**T-UI-0 — batch update label** (14 line-item enumerated di spec §9.4):

```typescript
// Update semua occurrence 'Tutup Periode' → 'Finalisasi Periode & Peringkat' di file test.
// Line item: 275, 278, 285, 290, 294, 302, 309, 313, 329, 342, 359, 375, 391, 407.
// Ini bagian dari deliverable; assertion label mekanis.
```

**T-UI-0b — REWRITE `WS5-UI-06..14`** *(baru, dari critic F-5)* — modal internals berubah (state-machine 3-fase). Assertion existing WS-5 tidak akan cocok lagi:

- `/membekukan ranking/i` (line 316) → sudah tidak ada di modal baru
- `'Lanjutkan tutup periode'` (line 320, 345, 361, 378, 394, 411) → sudah tidak ada
- `'Tutup periode Q1'` (line 322, 348, 365, 381, 396, 413) → sudah tidak ada
- `/4 pengguna/` (line 351), `/0 pengguna/` (line 367) → berpindah ke unit modal-test

Strategi: **HAPUS** WS5-UI-06..14 di screen test setelah T-UI-2 (yang mock `FinalizePeriodModal` sebagai stub sederhana) memastikan tombol → modal wiring. Coverage flow modal ada di `finalize-period-modal.test.tsx` (T-M-*). Jangan tulis ulang — ini duplikasi vertikal yang mahal.

**T-UI-1** — tombol berlabel baru dirender:

```typescript
it('T-UI-1: menampilkan tombol "Finalisasi Periode & Peringkat" saat ada period aktif + can(manage_score_formula)', async () => {
  mockUseActivePeriod.mockReturnValue({ period: activePeriod, isLoading: false, isError: false, refetch: jest.fn() });
  mockUsePermission.mockReturnValue({ can: () => true });
  render(<SettingsScoreFormula />, { wrapper });
  expect(await screen.findByLabelText('Finalisasi Periode & Peringkat')).toBeTruthy();
});
```

**T-UI-2** — tap tombol membuka modal:

```typescript
it('T-UI-2: tap membuka FinalizePeriodModal (state initial loading-preview)', async () => {
  // Mock FinalizePeriodModal sederhana yang menerima `visible` prop
  jest.doMock('@/components/finalize-period-modal', () => ({
    FinalizePeriodModal: ({ visible }: any) => (visible ? <Text>MODAL_OPEN</Text> : null),
  }));
  render(<SettingsScoreFormula />, { wrapper });
  await act(async () => {
    fireEvent.press(await screen.findByLabelText('Finalisasi Periode & Peringkat'));
  });
  expect(screen.getByText('MODAL_OPEN')).toBeTruthy();
});
```

**T-UI-3** — invalidasi 3 kunci ter-fire pasca-done (pola WS5-H2, bukan `refetch`-mock static):

```typescript
// Ordering multi-hook (latest_closed_period → useRanking) verifikasi via SMOKE Fase 5.
// Di sini cukup unit-level assertion: `invalidateQueries` dipanggil dengan 3 key benar.
it('T-UI-3: setelah modal close (done), invalidateQueries dipanggil untuk active_period + latest_closed_period + ranking', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = jest.spyOn(qc, 'invalidateQueries');
  // Mock modal yang expose helper "simulate done": ia memanggil useClosePeriod().onSuccess handler tiruan
  jest.doMock('@/components/finalize-period-modal', () => ({
    FinalizePeriodModal: ({ visible, onClose }: any) => {
      if (!visible) return null;
      // simulate: close mutation success → invalidasi
      qc.invalidateQueries({ queryKey: ['active_period'] });
      qc.invalidateQueries({ queryKey: ['latest_closed_period'] });
      qc.invalidateQueries({ queryKey: ['ranking'] });
      return null;
    },
  }));
  render(<SettingsScoreFormula />, { wrapper: makeWrapper(qc) });
  await act(async () => {
    fireEvent.press(await screen.findByLabelText('Finalisasi Periode & Peringkat'));
  });
  const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]));
  expect(keys).toEqual(
    expect.arrayContaining([
      JSON.stringify({ queryKey: ['active_period'] }),
      JSON.stringify({ queryKey: ['latest_closed_period'] }),
      JSON.stringify({ queryKey: ['ranking'] }),
    ]),
  );
});
```

**T-UI-4** — non-CEO dengan `user_permissions.manage_score_formula=true` bisa render (reuse pola `useProfile` mock dari `settings-score-formula-screen.test.tsx:12-15`):

```typescript
it('T-UI-4: non-CEO dengan delegated manage_score_formula bisa render tombol', async () => {
  // Pola mock existing: jest.mock('@/hooks/use-profile', () => ({
  //   useProfile: () => ({ profile: { id: 'me' }, isLoading: false, can: mockCan }),
  // }));
  mockCan.mockReturnValue(true);  // pura-pura user non-CEO tapi delegated
  render(<SettingsScoreFormula />, { wrapper });
  expect(await screen.findByLabelText('Finalisasi Periode & Peringkat')).toBeTruthy();
});
```

### GREEN (`mobile/src/app/(app)/settings-score-formula.tsx`)

> **Kritik F-6 amendment**: Modal existing `ClosePeriodModal` menerima `onConfirm(periodId): Promise<number>` + `onError()` props. Modal baru **memanggil hooks internal** (`useCalculatePeriodScores` + `useClosePeriod` + `usePreviewFinalization`) sehingga prop `onConfirm`/`onError` **dihapus dari usage screen**. Diff harus mengangkat perubahan ini.

Diff:

```diff
-import { ClosePeriodModal } from '@/components/close-period-modal';
+import { FinalizePeriodModal } from '@/components/finalize-period-modal';
...
-              <Button
-                label="Tutup Periode"
-                variant="secondary"
-                onPress={() => setShowCloseModal(true)}
-              />
+              <Button
+                label="Finalisasi Periode & Peringkat"
+                variant="secondary"
+                onPress={() => setShowCloseModal(true)}
+              />
...
-          <ClosePeriodModal
-            visible={showCloseModal}
-            period={period}
-            onClose={() => setShowCloseModal(false)}
-            onConfirm={handleClose}      // ← DIHAPUS: modal baru pakai useClosePeriod internal
-            onError={handleCloseError}   // ← DIHAPUS: pesan server disurface di modal (surfaceServerError)
-          />
+          <FinalizePeriodModal
+            visible={showCloseModal}
+            period={period}
+            onClose={() => setShowCloseModal(false)}
+          />
```

Konsekuensi: helper `handleClose`/`handleCloseError` di screen menjadi dead code — hapus. `useClosePeriod` yang sebelumnya dipanggil di screen tidak lagi dibutuhkan; unmount dari screen (dipindah ke modal). Update mock screen test sesuai (`mockUseClose` dihapus dari screen suite; assertion pindah ke modal suite).

**Refactor pasca-GREEN**: rename state variable `showCloseModal` → `showFinalizeModal` untuk kejelasan (bukan blocking).

---

## Fase 5 — Smoke manual + ADR

### RED — checklist (bukan test kode)

Prasyarat seed periode aktif (kalau org uji belum punya):

```sql
-- Jalankan via docker exec supabase_db_supabase psql -U postgres -d postgres
-- (memory: supabase-local-vs-mcp-gotcha)
insert into period_snapshots (organization_id, period_name, period_start, period_end, status)
values ('<org-id-anda>', 'Juli 2026', '2026-07-01', '2026-07-31', 'active');
```

Langkah smoke:

1. Login user dengan `manage_score_formula` (CEO atau user dengan `user_permissions` granted).
2. Settings → Score Formula.
3. Tap "Finalisasi Periode & Peringkat" → observasi:
   - state `loading-preview` sekilas (bila query cepat, mungkin tidak terlihat)
   - step 1 dengan preview count
   - konfirmasi
   - state `calculating` (label "Langkah 1 dari 2 · Menghitung skor pengguna…")
   - state `locking` (label "Langkah 2 dari 2 · Mengunci peringkat…")
   - state `done` dengan copy "Periode Juli 2026 difinalisasi. N pengguna masuk peringkat."
4. Tutup modal.
5. Buka People screen → assert ranking terlihat, ≥1 baris untuk N>0.

### GREEN — ADR wajib (`wiki/concepts/score-period-immutability.md`)

```markdown
---
type: concept
tags: [governance, score, ranking, immutability, adr]
updated: 2026-07-19
sources: 2
---

# ADR — Score Period Immutability

## Keputusan

Setelah `close_period_snapshot` sukses, `period_snapshots.status='closed'` dan
`ranking_snapshots` **tidak dapat diubah, dibuka kembali, atau dihitung ulang**
dari dalam aplikasi.

## Alasan

- **Governance**: nilai skor yang telah dipublikasikan kepada pengguna adalah
  fakta historis; koreksi retroaktif tanpa audit trail terpisah merusak
  kepercayaan pengguna.
- **Invariant teknis**: trigger `ranking_snapshots_no_delete`
  ([[supabase/migrations/0013_fase7_people_score.sql]] K5) menegakkan append-only
  di lapis DB.
- **Owner decision** (2026-07-19): koreksi = periode berikutnya, bukan reopen.

## Konsekuensi

- Bila terjadi kesalahan hitung yang baru ketahuan pasca-close, koreksi ditangani
  di periode berikutnya + komunikasi manual kepada pengguna terdampak.
- Bila kebutuhan reopen ternyata sering muncul, buka spec follow-up
  `score-ranking-emergency-recount` dengan gate super-admin + 4-eyes.
- Backlog terkait: [[wiki/concepts/settings-consumers-spec]] tidak menyentuh ini.

## Referensi

- [[specs/score-ranking-finalization-bridge]] §2.2 NG-9, AC-FIN-20
- [[specs/fase-7-people-score]] AC-7.20
- Memory `score-ranking-finalization-owner-decisions`
```

---

## Strategi mocking (ringkasan)

| Layer | Pola dominant | Referensi | Novelty |
|---|---|---|---|
| Data-layer | `mockRpc.mockResolvedValue({ data, error })` + `makeQueryThenable` | `people-score.test.ts:42-54, 466-503` | `makeCountThenable` variant (§3 map) |
| Hook | `renderHook` + wrapper `QueryClientProvider` + `jest.spyOn(qc, 'invalidateQueries')` | `use-people-score.test.tsx:313-408` | none |
| Modal | `jest.mock('@/hooks/use-people-score')` + `factoryMutation` / `factoryPreview` | greenfield; pola diadopsi dari screen test | `testID="finalize-modal"` untuk simulate `requestClose` |
| Screen | `jest.mock('@/lib/supabase')` + mock hooks + `fireEvent.press(await findByLabelText(...))` | `settings-score-formula-screen.test.tsx:26-41, 313-322` | none |
| DB contract | `begin;...rollback;` + `do $$ ... $$` + `RAISE NOTICE 'PASS' / RAISE EXCEPTION 'FAIL'` | `supabase/tests/close_period_snapshot_contract.sql` | Static check body `pg_get_functiondef` untuk verifikasi advisory lock |

**Gotcha yang wajib dihindari** (dari mapping):

1. Test hook TANPA `retry: false` di QueryClient → hang.
2. Test modal TANPA `wrapper.displayName` → warning RN Testing Library.
3. `mockGetUser` default `{ user: { id: 'u1' } }` di beforeEach; test yang lupa reset akan bocor state.
4. Test `focus-restore` (T-M-13 varian ref-focus) — **tidak ada preseden**; assert `onClose` invoke, bukan focus DOM node.
5. Count query — tidak ada preseden test — gunakan `makeCountThenable` helper baru per §3 mapping.

---

## Ordering & commit boundaries

> **Kritik F-7 amendment**: RED-terpisah-GREEN akan gagal `npm run type-check` (test mengimpor simbol yang belum ada). **Pilih strategi ini** untuk setiap fase 1-4:
>
> - **Strategi A (default)**: RED+GREEN dalam **satu commit per fase** (7 commit total). Type-check hijau, jest hijau bersama. Lebih pragmatis untuk hotfix.
> - **Strategi B (TDD murni)**: Commit RED terpisah dengan test **`.skip`** (jest hijau, tsc perlu stub minimal `throw new Error('todo')` di file source). GREEN commit menghapus `.skip` + implementasi. Cocok kalau reviewer minta pemisahan eksplisit.
>
> Rekomendasi: **Strategi A untuk hotfix V1.8.3** — jangan pertaruhkan release velocity untuk purism TDD. Fase 5 tetap terpisah karena hanya ADR + smoke.

Setiap fase = 1 commit (Strategi A). Ordering ketat:

| # | Fase | Commit message |
|---|---|---|
| 1 | Fase 0 | `feat(db): 0079 advisory lock + T-DB-1..7 contract` |
| 2 | Fase 1 | `feat(lib): previewFinalization + T-DL-1..5` |
| 3 | Fase 2 | `feat(hooks): useCalculatePeriodScores + usePreviewFinalization + T-H-1..5` |
| 4 | Fase 3 | `feat(components): FinalizePeriodModal (rename) + T-M-1..16` |
| 5 | Fase 4 | `feat(screen): wire FinalizePeriodModal + label rename + T-UI-0/0b..4` |
| 6 | Fase 5 | `docs(wiki): ADR score-period-immutability + smoke bukti` |

**Pemeriksaan sebelum tiap commit** (dari `mobile/AGENTS.md`):

- `npm test` (atau `npm run test:ci` untuk `--runInBand`)
- `npm run type-check`
- `npm run lint`

**Pemeriksaan sebelum PR ke `staging`**:

- Semua fase merged; tidak boleh Fase 3 tanpa Fase 0.
- `wiki/concepts/score-period-immutability.md` ada di diff (B-3 MERGE-BLOCKER).
- Penomoran sudah final di `0079` (0078 = settings-consumers). Kalau saat merge ternyata 0079 juga terpakai, rename BERSAMAAN: migrasi + contract test + rujukan di spec/TDD plan + judul PR.
- Cross-check `mobile/src/lib/database.types.ts` — tidak perlu regen (nol signature change), tapi `git status` harus bersih.

---

## Adjudikasi kritik (2026-07-19)

Untuk telusur balik: 4 BLOCKER + 4 MAJOR + 5 MINOR dari critic. Semua BLOCKER + MAJOR di-patch dalam plan v2. MINOR: 4 di-patch, 1 didokumentasikan.

| # | Temuan | Severity | Resolusi |
|---|---|---|---|
| 1 | T-DL-2c / T-H-3 pesan E3 salah | BLOCKER | ✅ Patched: `'Anda tidak berwenang mengelola Score Formula.'` (0013:516) |
| 2 | T-UI-4 mock shape (`usePermission`/`useUser`) | BLOCKER | ✅ Patched: reuse `useProfile` mock + `mockCan.mockReturnValue(true)` |
| 3 | T-UI-3 static refetch mock tidak menguji ordering | BLOCKER | ✅ Patched: gunakan `jest.spyOn(qc, 'invalidateQueries')` (pola WS5-H2); ordering sungguhan → Fase 5 smoke |
| 4 | T-M-3 refetch injection cacat | BLOCKER | ✅ Patched: `factoryPreview` extend signature `{ refetch?: jest.Mock }` |
| 5 | T-UI-0 undersscopes WS5-UI-06..14 rewrite | MAJOR | ✅ Patched: T-UI-0b baru — HAPUS WS5-UI-06..14 (duplikasi vertikal; coverage di modal suite) |
| 6 | Fase 4 diff tidak hapus `onConfirm`/`onError` props | MAJOR | ✅ Patched: diff GREEN diperluas + catatan `handleClose`/`handleCloseError` dead code |
| 7 | Commit ordering vs type-check gate | MAJOR | ✅ Patched: Strategi A (RED+GREEN gabung per fase) direkomendasi; 6 commit total |
| 8 | Coverage gap AC-FIN-2/14/15/18/20 | MAJOR | ✅ Patched: T-M-15 (loading-preview), T-M-16 (footer), T-DB-7 (override coalesce). AC-FIN-14 punt eksplisit ke NG-7 (server E1 dipertahankan); AC-FIN-18 concurrency verifikasi manual Fase 5 |
| 9 | Regex T-DB-4/5 tidak tahan multi-line | MINOR | ✅ Patched: `[\s\S]*?` + `~*` case-insensitive |
| 10 | Spec vs plan drift T-M-13 (focus) | MINOR | ✅ Patched: assert `onClose` invoke; focus restoration ditambah ke smoke Fase 5 checklist |
| 11 | `fireEvent requestClose` zero precedent | MINOR | 📝 Dokumentasi: fallback via `screen.UNSAFE_getByType(Modal).props.onRequestClose()` bila `testID` tidak reachable |
| 12 | T-M-11 `isPending` statis | MINOR | 📝 Diterima: unit-level cukup; transisi diverifikasi Fase 5 smoke |
| 13 | T-DL-3 lock 2-query | MINOR | 📝 Diterima: plan sudah acknowledge trade-off; kontrak return yang di-lock, bukan bentuk query |

**Konfirmasi positif dari critic** (JANGAN diubah pada revision berikutnya):

1. `has_function_privilege` syntax T-DB-3 benar (pola `0043_activity_logs_retention_contract.sql:64-69`).
2. CREATE OR REPLACE preserve ACL correctness (memory `anon-public-rpc-grant-gotcha`).
3. Cross-org error text `'Periode tidak ditemukan.'` dengan trailing dot benar (`0039:48` + `0013:519`).
4. Done copy §6.4 pakai `.` (period), bukan `·` (middle dot); middle dot hanya di preview + progress labels.
5. Penomoran migrasi sudah diselesaikan: 0078 = settings-consumers, 0079 = spec ini.

---

## Referensi

- Spec: [specs/score-ranking-finalization-bridge.md](score-ranking-finalization-bridge.md)
- Precedent handoff: [specs/inbox-chat-attachments-tdd-handoff.json](inbox-chat-attachments-tdd-handoff.json)
- Precedent TDD plan: [specs/fase-7-tdd-plan.md](fase-7-tdd-plan.md)
- Test template close: `mobile/src/lib/__tests__/people-score.test.ts:466-503` (WS5-L1..L4)
- Hook template close: `mobile/src/hooks/__tests__/use-people-score.test.tsx:313-408` (WS5-H1..H8)
- Screen test analog: `mobile/src/app/(app)/__tests__/settings-score-formula-screen.test.tsx`
- DB contract precedent: `supabase/tests/close_period_snapshot_contract.sql`
- Memory: [score-ranking-finalization-owner-decisions](../../../../Users/zero/.claude/projects/D--Projects-RencanApp/memory/score-ranking-finalization-owner-decisions.md)
