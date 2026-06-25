# Rencana TDD — Fase 5: Minimum Breakdown Rule (MBR) + Kelengkapan Perencanaan

## 1. Ringkasan Fitur

MBR menegakkan jumlah minimum kartu turunan sebelum kartu induk boleh diaktifkan / sebelum akses turunan dibuka. Penegakan otoritatif ada di server (RPC SECURITY DEFINER + RLS). Klien hanya: (a) membaca aturan & status kepatuhan, (b) menampilkan indikator "Kelengkapan Perencanaan", (c) memberi gating UI ramah (popup "Tidak Dapat Melanjutkan") untuk `blokir_aktivasi`, tetapi server tetap penegak akhir.

Tiga `enforcement_mode`: `hanya_peringatan` (warn, tidak memblokir), `blokir_aktivasi` (danger, blok aktivasi induk), `blokir_akses_turunan` (danger, blok buka turunan).

Layer yang disentuh (test-first):
1. **Data layer** — `mobile/src/lib/settings-mbr.ts` (const map + 4 fungsi + 1 util murni).
2. **Hooks** — `mobile/src/hooks/use-mbr.ts` (`useMbrRules`, `useMbrCompliance`, `useMbrRuleActions`).
3. **UI** — gating + indikator di `mobile/src/app/(app)/kpi-area/[id].tsx`.
4. **Contract DB** (di luar jest, plpgsql) — `supabase/tests/fase5_minimum_breakdown_rules_contract.sql` + migrasi `supabase/migrations/00NN_fase5_minimum_breakdown_rules.sql`.

## 2. Daftar File Test (merah)

| Layer | File test | Jumlah kasus |
|---|---|---|
| data-layer | `mobile/src/lib/__tests__/settings-mbr.test.ts` | 9 |
| hooks | `mobile/src/hooks/__tests__/use-mbr.test.tsx` | 11 |
| ui | `mobile/src/app/(app)/kpi-area/__tests__/mbr-completion.test.tsx` | 5 |
| contract (plpgsql) | `supabase/tests/fase5_minimum_breakdown_rules_contract.sql` | — |

## 3. Strategi Mocking per Layer

### Data layer (`settings-mbr.test.ts`)
Mirror byte-for-byte `goals.test.ts`. Di atas file, sebelum import modul:
```ts
const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock('../supabase', () => ({
  supabase: { rpc: (...a: unknown[]) => mockRpc(...a), from: (...a: unknown[]) => mockFrom(...a) },
}));
// eslint-disable-next-line import/first
import { ENFORCEMENT_MODE_LABEL, ENFORCEMENT_MODE_TONE, listMbrRules, setMbrRule, checkMbrCompliance, complianceLabel } from '../settings-mbr';
```
`beforeEach`: `mockRpc.mockReset()`. Const map & `complianceLabel` adalah util murni (tidak menyentuh supabase) — tetap diuji dengan boilerplate mock di atas agar import tidak butuh env/native. RPC dimock per-test via `mockRpc.mockResolvedValue({ data, error })`; error-path via `mockResolvedValue({ data: null, error: { message } })` lalu `await expect(...).rejects.toEqual({ message })`.

### Hooks (`use-mbr.test.tsx`)
Mirror `use-repeat-instances.test.tsx`: mock **data layer**, bukan supabase langsung.
```ts
const mockGetMbrRules = jest.fn();
const mockSetMbrRule = jest.fn();
const mockCheckMbrCompliance = jest.fn();
jest.mock('@/lib/settings-mbr', () => ({
  getMbrRules: (...a: unknown[]) => mockGetMbrRules(...a),
  setMbrRule: (...a: unknown[]) => mockSetMbrRule(...a),
  checkMbrCompliance: (...a: unknown[]) => mockCheckMbrCompliance(...a),
}));
// eslint-disable-next-line import/first
import { useMbrRules, useMbrCompliance, useMbrRuleActions } from '../use-mbr';
```
`makeWrapper()` membuat `QueryClient({ defaultOptions: { queries: { retry: false } } })` + `QueryClientProvider` via `createElement`. Gunakan `renderHook` + `waitFor`. Untuk invalidation, `jest.spyOn(qc, 'invalidateQueries')`. Catatan: nama export data layer yang dipakai hook adalah `getMbrRules` (bukan `listMbrRules`) — sediakan `getMbrRules` sebagai alias/ekspor di `settings-mbr.ts` agar test data-layer ([3] `listMbrRules`) dan test hook (`getMbrRules`) sama-sama hijau. Hindari bentrok query key Fase 4: kunci baru `['mbr_rules']` dan `['mbr_compliance', type, id]` saja.

### UI (`mbr-completion.test.tsx`)
Mirror `goal/__tests__/detail.test.tsx`. Mock berlapis:
- `jest.mock('@/lib/supabase', () => ({ supabase: {} }))` — agar import transitif aman.
- `jest.mock('@/hooks/use-workspace', ...)` — `useStrategies(id)`, `usePerson`.
- `jest.mock('@/hooks/use-mbr', () => ({ useMbrCompliance: () => ({ compliance: {...}, isLoading: false }) }))` — kontrol state kepatuhan per test.
- `jest.mock('@/lib/kpi-areas', ...)` dengan `mockActivate = jest.fn().mockResolvedValue({})` untuk men-spy panggilan `activateKpiArea`.
- `jest.mock('@tanstack/react-query', ...)` ATAU sediakan `QueryClientProvider` wrapper dan mock `useQuery` agar `['kpi_area','k1']` mengembalikan KpiArea draft. (Pakai pola yang sama dengan goal detail: mock hook, bungkus QueryClientProvider.)
- `jest.mock('expo-router', ...)` → `Stack.Screen: () => null`, `useLocalSearchParams: () => ({ id: 'k1' })`, `useRouter`, `useFocusEffect: () => {}`.
- `jest.spyOn(Alert, 'alert')` dari `react-native` untuk verifikasi popup. `await render(...)` (RTL versi repo butuh await), assert via `screen.findByText` / `findByLabelText`, interaksi via `fireEvent.press`.

### Contract DB
Bukan jest. Pola `fase4_performance_workspace_contract.sql`: `begin; do $$ declare ... begin ... assert ...; end $$; rollback;`. SECURITY DEFINER mem-bypass RLS sehingga authz diuji eksplisit. Jalankan via supabase CLI/psql, di luar `npm test`.

## 4. Urutan Langkah Red → Green → Refactor

### Bagian A — Data layer
1. **RED** — tulis `settings-mbr.test.ts` (9 kasus). Jalankan `npm test settings-mbr` → gagal (modul belum ada).
2. **GREEN** — buat `settings-mbr.ts`: `ENFORCEMENT_MODE_LABEL`, `ENFORCEMENT_MODE_TONE`, `listMbrRules` (+ alias `getMbrRules`), `setMbrRule` (map camelCase→`p_*`), `checkMbrCompliance` (normalisasi null→`{compliant:true,count:0,min_count:0}`), `complianceLabel`. Hijau.
3. **REFACTOR** — ekstrak tipe `MbrRule`/`MbrCompliance` dari `database.types`, re-export `STATUS_TONE` jika perlu, samakan gaya komentar dengan `goals.ts`. Test tetap hijau.

### Bagian B — Hooks
4. **RED** — tulis `use-mbr.test.tsx` (11 kasus). Gagal (hook belum ada).
5. **GREEN** — buat `use-mbr.ts`: `useMbrRules` (queryKey `['mbr_rules']`, `rules: data ?? []`, `isError`), `useMbrCompliance(type,id)` (queryKey `['mbr_compliance', type, id]`, `enabled: !!id && !!type`, computed `isCompliant` default `true`), `useMbrRuleActions` (`setRule` → `mutateAsync`, `onSuccess` invalidate `['mbr_rules']`). Hijau.
6. **REFACTOR** — selaraskan bentuk return dengan `use-repeat-instances` (objek `{data, isLoading, isError, refetch}`). Test hijau.

### Bagian C — UI
7. **RED** — tulis `mbr-completion.test.tsx` (5 kasus). Gagal (indikator & gating belum ada).
8. **GREEN** — di `kpi-area/[id].tsx`: import `useMbrCompliance`, render indikator "Kelengkapan Perencanaan" (rasio `X/N` via `complianceLabel`, tone dari `ENFORCEMENT_MODE_TONE`); bungkus `onActivate` dengan cek: jika `enforcement_mode==='blokir_aktivasi' && !is_compliant` → `Alert.alert('Tidak Dapat Melanjutkan', ...)` dan **tidak** memanggil `activateM.mutate()`; mode lain/compliant → panggil seperti biasa. Hijau.
9. **REFACTOR** — ekstrak `ComplianceIndicator` + helper gating ke `components/ui.tsx` (atau komponen lokal) agar dapat dipakai ulang di strategy/initiative detail. Test hijau.

### Bagian D — Contract DB (paralel, di luar jest)
10. **RED** — tulis `fase5_minimum_breakdown_rules_contract.sql` (skema+RLS, `set_minimum_breakdown_rule` authz/UPSERT/tolak baris sistem/audit, `check_minimum_breakdown_compliance` count+fallback org→sistem+authz+dev early-return, gate mode 1 di `activate_kpi_area`, gate mode 2 di `create_<child>` menulis `governance_violations`). Gagal.
11. **GREEN** — migrasi `00NN_fase5_minimum_breakdown_rules.sql`: tabel `minimum_breakdown_rules` (`org_id` NULL=sistem, CHECK `min_count>=1`, enum mode, RLS SELECT org+sistem, write default-deny), 3 RPC, 2 gate. Hijau.
12. **REFACTOR** — regenerasi `database.types.ts` (supabase gen types), sinkronkan tipe klien. Jalankan ulang `npm test` penuh.

## 5. Catatan Eksekusi
- Const map `ENFORCEMENT_MODE_TONE` mengikuti pola `STATUS_TONE` Fase 1 (`'neutral'|'info'|'warn'|'success'|'danger'`).
- `complianceLabel(count,min)` → `count>=min ? 'Lengkap' : `${count}/${min}``.
- Jangan ubah query key Fase 4; tambahkan key baru saja.
- Permission `manage_minimum_breakdown_rule` digate via `useProfile().can(...)` untuk Settings MBR (di luar lima kasus UI inti, tambahkan saat layar Settings dikerjakan).
