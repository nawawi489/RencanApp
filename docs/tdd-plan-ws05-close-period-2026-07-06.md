# Rencana TDD — WS-5 Close-Period UI (Tutup Periode)

> Spec: `docs/spec-ws05-close-period-2026-07-06.md` (24 AC). Resolusi owner binding: gate = permission `manage_score_formula` (BUKAN `role_level='ceo'`); close-only (tanpa open-period UI); n=0 = sukses; copy = kandidat AC. Branch: `fix/ap03-repeat-instance-flow`.

## 1. Ringkasan fitur

Surface UI admin "Tutup Periode" di layar Score Formula, pembungkus tipis di atas RPC `close_period_snapshot(p_period_id uuid) returns int` (migration 0013, sudah final — **tanpa perubahan backend/skema**). Menambah:

1. **Hook** `useClosePeriod()` standalone di `use-people-score.ts` — panggil `closePeriodSnapshot`, onSuccess invalidate **tepat 3 key**: `['active_period']`, `['latest_closed_period']`, `['ranking']`.
2. **Screen** `settings-score-formula.tsx` — tombol pemicu 'Tutup Periode' hanya saat `period && status==='active' && !isError`; cabang `isError` baru + 'Coba lagi'→refetch; copy state-kosong tidak menyesatkan (ganti 'Buka periode skoring...').
3. **Modal dua-langkah** `close-period-modal.tsx` — langkah-1 ringkasan dampak, langkah-2 tombol final 'Saya paham, tutup periode' (solid `bg-brand-dark #1564b3` + `text-white`, AA 5.99:1); umpan-balik sukses/n=0/error **inline-di-modal** (tanpa toast); lock dismiss + cegah double-submit saat pending.
4. **A11y** — `Button` (ui.tsx) meng-hardcode `accessibilityLabel=label`; perluas prop opsional ATAU tombol kustom agar label final menyebut `period_name` (FR-14/AC-WS5-10).
5. **DB contract test** — invarian RPC (atomik, unauthorized, re-close, cross-org, audit termasuk n=0, append-only).

### Fakta terverifikasi yang mengikat test
- **Migration 0036 GRANT EXECUTE** `close_period_snapshot` ke anon+authenticated → gerbang tunggal = `has_permission` in-RPC. **JANGAN** tulis test berasumsi "anon tak bisa execute".
- `getActivePeriod()` hard-filter `status='active'` → cabang S7 "disabled untuk closed" **UNREACHABLE**, jangan diimplementasi.
- Error RPC (Bahasa Indonesia) disurface **apa adanya** di modal.

## 2. Daftar file test

| File | Status | Layer |
|---|---|---|
| `mobile/src/lib/__tests__/people-score.test.ts` | extend | Data (mock `../supabase`) |
| `mobile/src/hooks/__tests__/use-people-score.test.tsx` | extend | Hooks (QueryClientProvider) |
| `mobile/src/app/(app)/__tests__/settings-score-formula-screen.test.tsx` | BARU | UI/screen (RNTL + jest-expo) |
| `mobile/src/components/__tests__/close-period-modal.test.tsx` | BARU (opsional) | Modal unit |
| `supabase/tests/close_period_snapshot_contract.sql` | BARU | DB contract (docker psql) |

### File produksi disentuh
- `mobile/src/hooks/use-people-score.ts` (hook baru)
- `mobile/src/app/(app)/settings-score-formula.tsx` (tombol + isError + copy)
- `mobile/src/components/close-period-modal.tsx` (BARU)
- `mobile/src/components/ui.tsx` (perluas Button ATAU tidak, bila tombol kustom)
- `mobile/src/lib/people-score.ts` (tidak berubah; hanya regression-lock + opsional konstanta copy)

## 3. Urutan Red → Green → Refactor

| # | Jenis | File | Test |
|---|---|---|---|
| 1 | 🔴 red | lib test | WS5-L1..L4 (error E1/E2/E3 apa-adanya + n=0 resolve 0) |
| 2 | 🟢 green | people-score.ts | wrapper sudah benar (regression-lock; kemungkinan langsung hijau) |
| 3 | 🔴 red | hook test | WS5-H1..H8 (passthrough, invalidasi 3 key, n=0, error, isPending, tepat 3x, bukan salin useScoreOverride) |
| 4 | 🟢 green | use-people-score.ts | implementasi `useClosePeriod()` |
| 5 | 🔴 red | screen test | WS5-UI-02/03/04/05 (null→no button, guard, isError+Coba lagi, copy) |
| 6 | 🟢 green | settings-score-formula.tsx | cabang isError + refetch + copy state-kosong |
| 7 | 🔴 red | screen test | WS5-UI-01/06/07/08 (tombol pemicu, modal langkah-1→2, batal) |
| 8 | 🟢 green | close-period-modal.tsx + screen | modal dua-langkah + tombol pemicu gated |
| 9 | 🔴 red | screen test | WS5-UI-09..14 (sukses n>0, n=0, error+refetch, pending-lock, a11y label, alert role) |
| 10 | 🟢 green | modal + ui.tsx + screen | umpan-balik inline, lock pending, a11y (perluas Button/kustom) |
| 11 | 🔴 red | DB contract | AC-WS5-13..24 invarian server |
| 12 | 🟢 green | DB contract | jalankan via docker psql (RPC sudah ada → PASS) |
| 13 | 🔧 refactor | modal/ui/lib | ekstrak konstanta copy, jaga Button backward-compat, no S7 |
| 14 | 🔧 refactor | all | `npm test` + `npm run type-check` + docker psql contract |

## 4. Strategi mocking (per layer)

**Data layer** — `jest.mock('../supabase')` module-scope (sudah ada). Set `mockRpc.mockResolvedValue({data,error})`. Error supabase = objek `{message}` → `rejects.toEqual({message})`. Tanpa native/provider.

**Hooks** — extend `jest.mock('@/lib/people-score')` dengan `closePeriodSnapshot: (...a)=>mockClosePeriodSnapshot(...a)`. `makeWrapper()` (QueryClientProvider, retry:false) sudah ada. Spy invalidasi: `jest.spyOn(qc,'invalidateQueries')` + map `JSON.stringify(c[0])`. isPending via promise tertunda manual + `waitFor`. Di test hook, mock reject dengan `new Error(msg)` agar `rejects.toThrow` valid.

**UI/screen** — jest-expo + RNTL. Mock `@/hooks/use-profile` (`can`), `@/hooks/use-people-score` (`useActivePeriod`, `useClosePeriod`, dll). RN `Modal` render inline → `getByText` menembus. `onRequestClose` dipicu manual di test lock-pending (bukan gesture nyata). Styling (brand-dark/44px/dark) diverifikasi via **className string / accessibilityRole / accessibilityLabel**, BUKAN komputasi CSS/layout (NativeWind tak resolve di jest). Fallback `jest.mock('expo-router')` bila Stack.Screen error.

**Modal unit (opsional)** — render `<ClosePeriodModal .../>` dengan callback jest.fn; tidak butuh QueryClient (presentational, hook di-drill via props). Mock theme-provider bila dipakai.

**DB contract** — do-block `begin;...rollback` (pola fase7 contract). Konteks user via `set_config('request.jwt.claims',...)` + `set local role authenticated`. Fixture insert auth.users+profiles+period. Cross-org: buat org kedua. Unauthorized: user tanpa grant. Jalankan: `docker exec supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/close_period_snapshot_contract.sql`.

## 5. Risiko utama

1. **Styling tak teruji di jest** — AA/warna/44px/dark hanya via className assertion; verifikasi visual butuh web-preview manual.
2. **Bentuk error supabase** (objek vs Error) — konsistenkan mock: lib pakai `{message}`, hook pakai `new Error(msg)`.
3. **RN Modal onRequestClose** tak terpicu otomatis di jest — uji handler manual.
4. **Baseline pre-existing failures** (memory) — jalankan `npm test` sebelum implementasi untuk menandai baseline.
5. **Perluasan Button** dipakai luas — jaga backward-compat (default `accessibilityLabel=label`) atau pakai tombol kustom di modal.
6. **DB contract butuh Docker** lokal up + junction node_modules/.env di worktree.
7. **n=0 falsy trap** — jaga assertion `typeof number` + `resolve` agar 0 tak diperlakukan gagal.
8. **OQ risiko produk** — close-only tanpa open-period UI = aksi satu-arah; copy state-kosong sengaja tak menjanjikan open.

## 6. Verifikasi wajib (definition of done)
Dari `mobile/`:
- `npm test` — seluruh suite hijau (termasuk baseline existing)
- `npm run type-check` — `tsc --noEmit` bersih

Plus:
- `docker exec supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/close_period_snapshot_contract.sql` → semua 'PASS'