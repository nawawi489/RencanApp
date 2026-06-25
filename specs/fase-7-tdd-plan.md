# Fase 7 — People & Score · Rencana TDD (red → green → refactor)

> Sumber spec: [specs/fase-7-people-score.md](fase-7-people-score.md). Verdict critic: **perlu-perbaikan** — lihat §Temuan Critic.

# Rencana TDD — Fase 7 People & Score (RencanApp)

> Status: eksekutabel. Mengikuti pola Fase 1–6 yang sudah ada di repo (thin caller `cards.ts`/`repeat.ts`, hook `use-workspace.ts`, screen `settings-mbr.tsx`/`people.tsx`, migrasi `0011`). Semua otorisasi ditegakkan server (RLS + RPC SECURITY DEFINER); kode mobile hanya pemanggil tipis.

## 1. Ringkasan Fitur

Achievement Score per user dengan formula berbobot per level (total wajib 100%), dihitung per periode, dengan ranking ter-freeze, manual override append-only, dan surface People + editor Score Formula. Tujuh tabel baru di migrasi `0013_fase7_people_score.sql` + RPC + RLS read-path + seed default. Data layer baru `mobile/src/lib/people-score.ts`, hooks `use-people-score.ts`, dan UI (People enrichment, ScoreBreakdown, editor formula, override surface).

### Keputusan kanonik (TIDAK diubah TDD)
- Version terkunci per-baris `user_score_results.score_formula_version_id`.
- Status enum `draft/active/archived` (formula) & `draft/active/closed` (periode) — bukan `is_active`.
- Bobot 100% ditegakkan di RPC `activate_score_formula_version`.
- Override append-only: `result_kind` + `is_current`, `auto_calculated_score` disalin utuh.
- Level via `profiles.role_template_id → role_templates.level` (NULL → skip deterministik).
- `review_pass_rate` dari `action_plan_submissions.review_status='approved'`.
- Agregasi repeat per-user BARU (`aggregate_repeat_metrics_per_user`).
- Skala metrik 0–100; clamp sebelum INSERT.
- V1 hanya seed-aktif formula fully-computable (Staff); template level-atas = `draft`.

### Pemblokir TERESOLUSI (2026-06-25) — lihat §0 spec
Semua pemblokir sudah diputuskan; tidak ada lagi langkah ditunda karena keputusan tertunda. Implikasi ke rencana TDD:
1. **Visibility = restriktif + atasan (D1/D2).** Tambah helper `is_supervisor_of(p_user)` (rantai PIC-induk→PIC-turunan, inline kolom). RLS SELECT `user_score_results`/`ranking_snapshots` punya 3 cabang. Wajib contract test untuk cabang positif (sendiri, atasan, manage) + negatif (orang asing → 0 baris).
2. **Trend = sparkline N periode (D6).** Tambah komponen `ScoreSparkline` + query histori skor lintas periode tertutup. Graceful saat <2 titik.
3. **Period window = submission approved (D3).** `aggregate_*`/completion mem-filter `action_plan_submissions.review_status='approved'` pada `[period_start, period_end]`. Tidak ALTER `action_plans`.
4. **`result_achievement` keluar (D4); `governance_discipline` SEKALI per tier (D5, revisi review).** Seed Staff = 6 kategori SUM=100; penalti = Σ atas `DISTINCT severity` (low2/med5/high15/crit40, maks 62) → deterministik & testable di contract SQL.
5. **Seed level-atas defer (D7); Dev Contribution = initiative-level (D8); Ranking post-close (D9).**
6. **Override SINGLE-actor (D10, revisi review).** Hanya `override_user_score` (efektif seketika, `result_kind='override'`/`is_current=true`, `approved_by`=`changed_by`). **TIDAK ada** `approve_score_override` & **tidak ada** `override_status`. Anti-self → `governance_violations` 'critical'; reason wajib; `activity_logs`. `effectiveScore` = `manual_adjusted_score ?? auto_calculated_score`.
7. **Tie-breaker rank kembar (D11); role-level dikunci saat open (D12); config formula transparan org (D13).**

### Koreksi atas temuan critic (verdict semula: perlu-perbaikan)
- **[KRITIS] Tambah layer contract SQL** `supabase/tests/fase7_people_score_contract.sql` (pola `fase6_development_workspace_contract.sql`: `set role authenticated` + set `request.jwt.claims` sub=auth.uid() + ROLLBACK). Ini menjadi **RED layer pertama** dan menanggung SEMUA invarian governance server yang TIDAK terjangkau Jest (yang me-mock RPC): AC-7.7, 7.14, 7.15, 7.17, 7.18, 7.19, 7.20, 7.26, 7.27, 7.28, 7.29, 7.30, 7.31, 7.34 + D5/D10/D11.
- **Reuse aset eksisting (jangan duplikasi):** `score.ts` (`scoreBand`/`SCORE_LABEL`/`SCORE_THRESHOLD`), `ScoreBadge`/`ScoreLegend`/`GuidanceNote` di `ui.tsx`, dan `people.tsx` yang SUDAH merender `ScoreBadge` saat `p.score!=null`. `ScoreBreakdown` & hook WAJIB reuse `scoreBand`; `effectiveScore` pakai `??` dan dipakai bersama oleh data layer + hook (satu sumber). People test pakai `getByLabelText` (ScoreBadge merender teks 2x: visible + a11y label → `getByText` melempar).
- **Lock komposisi seed Staff** lewat contract test (kategori + bobot eksak, SUM=100) agar "fully-computable" tak diam-diam regress.
- **Konsistenkan nama kolom override**: gunakan `override_changed_by`/`override_changed_at`/`override_reason`/`override_status`/`override_approved_by` (hindari drift `changed_by`). Regen `database.types.ts` via `generate_typescript_types` (bukan edit manual).
- **`open_period_snapshot` race**: WAJIB partial unique index `(organization_id) WHERE status='active'` (bukan hanya guard RPC).
- **Migrasi 0013 via branch**: `create_branch` → `apply_migration` → `get_advisors` (gate RLS/policy hilang) → `merge_branch`. Jadikan langkah berkomitmen, bukan catatan.

## 2. Daftar File Test

| File test | Layer | Status |
|---|---|---|
| `supabase/tests/fase7_people_score_contract.sql` | **DB invarian governern (RED pertama)** — pola fase6 contract | **BARU — wajib (fix KRITIS critic)** |
| `mobile/src/lib/__tests__/people-score.test.ts` | Data layer (mock `../supabase`) | BARU — 28 case |
| `mobile/src/hooks/__tests__/use-people-score.test.tsx` | Hooks (mock `@/lib/people-score`) | BARU — 12 case |
| `mobile/src/app/(app)/(tabs)/__tests__/people.test.tsx` | Screen | EXTEND — 5 case baru |
| `mobile/src/components/__tests__/ui-feedback.test.tsx` | Komponen | EXTEND — ScoreBreakdown |
| `mobile/src/app/(app)/__tests__/settings-score-link.test.tsx` | Screen guard | BARU — 2 case |
| `mobile/src/app/(app)/__tests__/settings-score-formula-screen.test.tsx` | Screen editor + override | BARU — 5 case |

File implementasi yang disentuh: `mobile/src/lib/people-score.ts` (BARU), `mobile/src/lib/database.types.ts` (regen tipe 7 tabel), `mobile/src/hooks/use-people-score.ts` (BARU), `mobile/src/components/ui.tsx` (ScoreBreakdown), `mobile/src/app/(app)/(tabs)/people.tsx` (migrasi), `mobile/src/app/(app)/settings.tsx` (link guard), `mobile/src/app/(app)/settings-score-formula.tsx` (BARU), `supabase/migrations/0013_fase7_people_score.sql` (BARU).

## 3. Urutan Langkah Red → Green → Refactor

Strategi: bangun bottom-up (DB → tipe → data layer → hooks → UI). Tiap layer: tulis SEMUA test merah-nya dulu (RED), lalu implementasi minimal sampai hijau (GREEN), lalu rapikan (REFACTOR). DB ditulis lebih awal agar tipe & invarian tersedia, tapi test mobile tidak bergantung DB live (semuanya di-mock).

### Layer 0 — Migrasi DB (fondasi, non-mobile-test)
1. **RED-ish/GREEN** `0013_fase7_people_score.sql`: 7 tabel + CHECK enum + RPC SECURITY DEFINER (`set search_path=''`, revoke public/anon mengikuti `0003`/`0011`) + RLS SELECT restriktif default + seed Staff. Invarian governance ditulis sebagai `raise exception` Indonesia. Verifikasi via `mcp__supabase` execute_sql / DB contract test bila ada harness.
2. **GREEN** regen tipe: `mobile/src/lib/database.types.ts` ditambah 7 tabel (atau lewat `generate_typescript_types`).

### Layer A — Data layer `people-score.ts`
3. **RED** Tulis seluruh `mobile/src/lib/__tests__/people-score.test.ts` (28 case). Header: `mockFrom`, `mockRpc`, `mockGetUser`, `jest.mock('../supabase', ...)`; helper `makeQueryThenable`/`makeSingleBuilder` disalin dari `cards.test.ts`; `mockFrom` dilacak per-tabel (map nama tabel → builder) untuk kasus [10]/[11]. Semua gagal import (file belum ada).
4. **GREEN** Buat `mobile/src/lib/people-score.ts` minimal: label maps (`PERIOD_STATUS_LABEL`, `FORMULA_STATUS_LABEL`, `METRIC_LABEL` 7 kunci, `RESULT_KIND_LABEL`), `effectiveScore(r)` pakai `??` (bukan `||`), reads (`getActivePeriod`/`getMyScore`/`listRanking`/`listScoreFormulaVersions`) via PostgREST `from().select().eq()...`, writes (`overrideUserScore`/`calculatePeriodScores`/`closePeriod`/`openPeriod`/`upsertScoreFormulaVersion`/`activateScoreFormulaVersion`/`assignScoreFormula`) via `supabase.rpc('...', { p_... })` dengan pola `if (error) throw error`.
5. **REFACTOR** Ekstrak konstanta `SELECT`, tipe `UserScoreResult`/`PeriodSnapshot`/`RankingSnapshot` dari `Tables<...>`, komentar boundary client-vs-server (anti-self di RPC).

### Layer B — Hooks `use-people-score.ts`
6. **RED** Tulis seluruh `mobile/src/hooks/__tests__/use-people-score.test.tsx` (12 case). `jest.mock('@/lib/people-score')`, `makeWrapper()` (QueryClient retry:false + provider), pola `use-workspace.test.tsx`. Gagal import.
7. **GREEN** Buat `mobile/src/hooks/use-people-score.ts`: `useActivePeriod` (key `['active_period']`, tanpa gate), `useMyScore` (key `['my_score']`, expose `score`/`effectiveScore`/`breakdown`, null→null bukan 0), `useRanking(periodId)` (key `['ranking', periodId]`, gate `enabled:!!periodId`, [] graceful), `usePeriodActions` (open → invalidate `['active_period']`), `useCalculateScores(periodId)` (invalidate `['ranking', periodId]` + `['my_score']`), `useScoreOverride(periodId)` (map arg → data layer, invalidate `['my_score']` + `['ranking', periodId]`).
8. **REFACTOR** Samakan bentuk return dengan hook lain (`{ data, isLoading, isError, refetch }`), pastikan `effectiveScore` reuse fungsi dari `people-score.ts` (jangan duplikasi `??`).

### Layer C — Komponen `ScoreBreakdown`
9. **RED** EXTEND `mobile/src/components/__tests__/ui-feedback.test.tsx`: import `ScoreBreakdown` (belum ada → throw).
10. **GREEN** Tambah `ScoreBreakdown({ metrics })` di `mobile/src/components/ui.tsx`: render `label` + `value%` clamp [0,100], tanpa label bobot. Reuse pola `ProgressBar`/`MetaGrid`.
11. **REFACTOR** Pastikan a11y (warna+teks berpasangan), token sesuai `DESIGN.md`.

### Layer D — Screen People
12. **RED** EXTEND `mobile/src/app/(app)/(tabs)/__tests__/people.test.tsx` dengan 5 case baru: null→GuidanceNote per-user (badge tak muncul), 0-nyata→ScoreBadge attention, breakdown render %, error nyata→ErrorState, tak ada periode→EmptyState. Ganti mock dari `@/lib/cards` ke mock hook `@/hooks/use-people-score`.
13. **GREEN** Migrasi `people.tsx`: konsumsi `useActivePeriod`/`useUserScores`(atau enrich) dari `use-people-score`; cabang null-vs-0 per-user; render `ScoreBreakdown`; EmptyState "Belum ada periode"; ErrorState hanya untuk kegagalan nyata (bukan RLS 0 baris).
14. **REFACTOR** Pisahkan `PersonScoreRow` sub-komponen; pertahankan kompat shape ketika skor absen.

### Layer E — Settings link guard
15. **RED** Tulis `mobile/src/app/(app)/__tests__/settings-score-link.test.tsx`: 2 case (can=false → tak navigasi; can=true → push `/settings-score-formula`). Mock `useProfile().can`, `useRouter().push`, `supabase` stub.
16. **GREEN** Di `settings.tsx`: isi entri `Score Formula` dengan `href:'/settings-score-formula'` + `permission:'manage_score_formula'` (mekanik `active`/`Pressable`/`accessibilityLabel` sudah ada).
17. **REFACTOR** Tidak ada (reuse mekanik SECTIONS).

### Layer F — Screen editor formula + override
18. **RED** Tulis `mobile/src/app/(app)/__tests__/settings-score-formula-screen.test.tsx`: 5 case (tanpa akses→pesan tolak + tak render template; dengan akses→template list + bobot %; activate SUM≠100→pesan error + status draft; override reason kosong→submit di-block; override anti-self error→pesan dirender). Mock `useProfile`, hooks formula/override, `expo-router` `Stack.Screen`/`useRouter`.
19. **GREEN** Buat `mobile/src/app/(app)/settings-score-formula.tsx` mengikuti pola `settings-mbr.tsx`: guard `can('manage_score_formula')`, list template + versi aktif + kategori (nama+bobot%), tombol Aktifkan (tangkap exception RPC → render pesan), form override (field reason wajib → submit disabled saat kosong; tampilkan pesan exception anti-self/closed/reason). Tambah hooks formula bila perlu (`useScoreFormulas`, `useFormulaActions`) di `use-people-score.ts` (atau file hook editor terpisah) — bila ditambah, tulis test hook-nya lebih dulu (RED) sebelum implementasi.
20. **REFACTOR** Ekstrak `TemplateCard`/`OverrideForm`; samakan gaya dengan `RuleCard`.

### Layer G — Hardening final
21. **REFACTOR/VERIFY** Jalankan `npm test` penuh; pastikan tidak ada regresi pada 240 test eksisting. Pastikan invarian governance DB (append-only, anti-self, 100%, idempotensi, NULL-skip, closed read-only) terverifikasi (DB contract test bila ada, atau via `mcp__supabase` execute_sql manual). Update wiki (`wiki/log.md`, entity/concept pages) sesuai CLAUDE.md.

## 4. Strategi Mocking (per layer)
Lihat field `mocking_strategy`.

## 5. Risiko
Lihat field `risks`.

---

## Langkah Berurutan (red → green → refactor)

### 1. [GREEN] 
Tulis migrasi 0013_fase7_people_score.sql: 7 tabel (score_categories, score_formula_templates, score_formula_versions, score_formula_assignments, period_snapshots, user_score_results, ranking_snapshots) dengan CHECK enum (draft/active/archived; draft/active/closed; auto/override; severity 4 tier), RPC SECURITY DEFINER set search_path='' (upsert/activate/assign formula, open/calculate/close period, override_user_score) dengan revoke public/anon (pola 0003/0011), RLS SELECT restriktif default (self OR manage_score_formula/CEO/view_all_workspace; supervisor DI-DEFER), seed Staff fully-computable (result_achievement dikeluarkan, re-normalisasi 100%), invarian governance via raise exception Indonesia. Verifikasi via MCP supabase di branch.

### 2. [GREEN] 
Regenerasi mobile/src/lib/database.types.ts untuk 7 tabel baru (generate_typescript_types atau edit manual) agar Tables<'...'> tersedia bagi people-score.ts.

### 3. [RED] 
Tulis seluruh people-score.test.ts (28 case): jest.mock('../supabase') dengan mockFrom/mockRpc/mockGetUser sebelum import; helper makeQueryThenable (+order,+maybeSingle) & makeSingleBuilder; mockFrom.mockImplementation per-tabel untuk getMyScore. Semua merah (file belum ada).

### 4. [GREEN] 
Buat people-score.ts: label maps (PERIOD_STATUS_LABEL, FORMULA_STATUS_LABEL, METRIC_LABEL x7, RESULT_KIND_LABEL), effectiveScore pakai ?? (bukan ||), reads via PostgREST (getActivePeriod/getMyScore/listRanking/listScoreFormulaVersions), writes via supabase.rpc dengan param p_ (override/calculate/close/open/upsert/activate/assign), pola if(error) throw error.

### 5. [REFACTOR] 
Ekstrak konstanta SELECT, tipe UserScoreResult/PeriodSnapshot/RankingSnapshot dari Tables<...>, komentar boundary client-vs-server (anti-self & 100% ditegakkan RPC).

### 6. [RED] 
Tulis use-people-score.test.tsx (12 case): jest.mock('@/lib/people-score'), makeWrapper QueryClient retry:false, spyOn invalidateQueries. Merah (hook belum ada).

### 7. [GREEN] 
Buat use-people-score.ts: useActivePeriod ['active_period'], useMyScore ['my_score'] (null->null bukan 0, effectiveScore manual??auto), useRanking ['ranking',id] gate enabled:!!periodId & [] graceful, usePeriodActions.open invalidate ['active_period'], useCalculateScores invalidate ['ranking',id]+['my_score'], useScoreOverride map arg + invalidate ['my_score']+['ranking',id].

### 8. [REFACTOR] 
Samakan bentuk return dgn hook lain ({data,isLoading,isError,refetch}); reuse effectiveScore dari people-score.ts (jangan duplikasi ??).

### 9. [RED] 
EXTEND ui-feedback.test.tsx: import ScoreBreakdown + render metrics [{label,value}] → nama + value% skala 0-100 tanpa bobot. Merah (komponen belum ada).

### 10. [GREEN] 
Tambah ScoreBreakdown di ui.tsx: map metrics → label + clamp(value,0,100)+'%', tanpa label bobot, a11y warna+teks.

### 11. [REFACTOR] 
Rapikan ScoreBreakdown (reuse pola ProgressBar/MetaGrid, token DESIGN.md).

### 12. [RED] 
EXTEND people.test.tsx 5 case: skor null->GuidanceNote per-user (badge absen), skor 0-nyata->ScoreBadge attention, breakdown render %, error nyata->ErrorState, tak ada periode->EmptyState. Ganti mock @/lib/cards -> mock @/hooks/use-people-score.

### 13. [GREEN] 
Migrasi people.tsx: konsumsi useActivePeriod/useUserScores; cabang null-vs-0 per-user; render ScoreBreakdown; EmptyState 'Belum ada periode'; ErrorState hanya kegagalan nyata (RLS 0 baris graceful).

### 14. [REFACTOR] 
Ekstrak sub-komponen PersonScoreRow; jaga kompat shape saat skor absen.

### 15. [RED] 
Tulis settings-score-link.test.tsx: can=false->tak push; can=true->push('/settings-score-formula'). Mock useProfile/useRouter/supabase.

### 16. [GREEN] 
Di settings.tsx isi entri Score Formula: href '/settings-score-formula' + permission 'manage_score_formula' (mekanik active/Pressable/accessibilityLabel sudah ada).

### 17. [RED] 
Tulis settings-score-formula-screen.test.tsx 5 case: tanpa akses->pesan tolak+template absen; akses->template list+bobot%; activate SUM!=100->pesan error+status draft; override reason kosong->submit di-block; override anti-self->pesan dirender. Mock useProfile, hooks formula/override, expo-router.

### 18. [RED] 
(Bila editor butuh hook formula baru useScoreFormulas/useFormulaActions) tulis test RED-nya di use-people-score.test.tsx lebih dulu agar tetap test-first.

### 19. [GREEN] 
Buat settings-score-formula.tsx (pola settings-mbr.tsx): guard can('manage_score_formula'), list template+versi aktif+kategori(nama+bobot%), tombol Aktifkan tangkap exception RPC->render pesan, OverrideForm reason wajib (submit disabled saat kosong)+tampil pesan anti-self/closed/reason. Implementasi hook editor bila ditambah.

### 20. [REFACTOR] 
Ekstrak TemplateCard/OverrideForm; samakan gaya dgn RuleCard; a11y label.

### 21. [REFACTOR] 
npm test penuh (no regresi 240 lama); verifikasi invarian governance DB via MCP/contract test; update wiki/log.md + entity/concept per CLAUDE.md.

---

## Strategi Mocking

PER LAYER, mengikuti pola repo yang sudah ada:

[DATA LAYER — mobile/src/lib/__tests__/people-score.test.ts] Mock `../supabase` di top-level SEBELUM import (pola cards.test.ts), karena people-score.ts meng-import ./supabase saat load → menghindari kebutuhan env/native. Struktur: `const mockFrom=jest.fn(); const mockRpc=jest.fn(); const mockGetUser=jest.fn(); jest.mock('../supabase', () => ({ supabase: { auth:{ getUser:(...a)=>mockGetUser(...a) }, from:(...a)=>mockFrom(...a), rpc:(...a)=>mockRpc(...a) } }));`. Salin helper `makeQueryThenable(result)` (chainable select/eq/is/in/order/limit + .then) dan `makeSingleBuilder(result)` (+.single/.maybeSingle) dari cards.test.ts; tambah `order` & `maybeSingle` ke builder thenable untuk getActivePeriod. Untuk kasus multi-tabel (getMyScore tanpa periodId: resolve period_snapshots LALU user_score_results, case [10]/[11]) gunakan `mockFrom.mockImplementation((table)=> table==='period_snapshots'?periodBuilder:scoreBuilder)` agar `mockFrom` bisa di-assert per-tabel dan cabang "tidak query period_snapshots saat periodId eksplisit" terverifikasi. `beforeEach`: reset semua mock + `mockGetUser.mockResolvedValue({ data:{ user:{ id:'u1' }}})`. RPC writes: `mockRpc.mockResolvedValue({ data, error:null })` untuk sukses, `{ data:null, error:{ message:'...'} }` untuk propagasi exception (assert `.rejects.toEqual(error)`). Anti-self TIDAK di-mock di client — test [17] memverifikasi client tetap memanggil rpc dengan p_user_id==auth.uid() tanpa throw sendiri. TIDAK ada validasi bobot 100% di client (test [23]/[24]).

[HOOKS — mobile/src/hooks/__tests__/use-people-score.test.tsx] Mock SELURUH data layer: `jest.mock('@/lib/people-score', () => ({ getActivePeriod:(...a)=>mockGetActivePeriod(...a), getMyScore:..., listRanking:..., openPeriod:..., calculatePeriodScores:..., closePeriod:..., overrideUserScore:..., effectiveScore:(r)=> r?.manual_adjusted_score ?? r?.auto_calculated_score ?? null }))` — sertakan effectiveScore di mock bila hook meng-import-nya, atau biarkan hook menghitung sendiri (test mengikat kontrak manual??auto). `makeWrapper()` = QueryClient `{ defaultOptions:{ queries:{ retry:false }}}` + QueryClientProvider via createElement (pola use-workspace.test.tsx). Pakai `renderHook(hook,{wrapper})` + `waitFor`/`act`. Invalidasi diuji via `jest.spyOn(qc,'invalidateQueries')` lalu assert `toHaveBeenCalledWith({ queryKey:[...] })`. Mutasi error: `mockX.mockRejectedValueOnce(new Error('...'))` lalu `await expect(result.current.action(...)).rejects.toThrow('...')` di dalam `act`. TIDAK mock react-query (pakai instance asli, retry:false).

[KOMPONEN — ui-feedback.test.tsx] Tanpa DB/mock. Import langsung `ScoreBreakdown` dari '../ui', `await render(...)` (RNTL v14 async), assert `screen.getByText`. `jest.setTimeout(30000)` karena cold transform react-native-css (pola eksisting).

[SCREEN People — people.test.tsx] Ganti sumber mock: dari `jest.mock('@/lib/cards', ...)` menjadi `jest.mock('@/hooks/use-people-score', ...)` mengembalikan state terkontrol (period, people+score, isLoading/isError). Tetap `jest.mock('@/lib/supabase', () => ({ supabase:{} }))` agar import aman. Mock `@/providers/auth-provider` (`useAuth`) bila people.tsx memakainya untuk user_id. QueryClient retry:false wrapper. `await render` + `screen.findByText`. Untuk distingsi null-vs-0: kontrol `score:null` vs `score:0` di data mock. Untuk "tak ada periode": hook mengembalikan `period:null,isError:false`. Untuk error nyata: `isError:true`.

[SCREEN Settings link — settings-score-link.test.tsx] Mock `@/hooks/use-profile` → `can: jest.fn(()=>false|true)`; mock `expo-router` → `useRouter:()=>({ push: pushSpy })` + `Href` passthrough; mock `@/lib/supabase`/`@/providers/auth-provider` minimal agar fetchProfile resolve. `fireEvent.press(screen.getByLabelText('Score Formula'))` hanya tersedia saat active (Pressable+accessibilityLabel); saat can=false baris non-Pressable → assert `pushSpy` tak terpanggil.

[SCREEN editor formula — settings-score-formula-screen.test.tsx] Mock `@/hooks/use-profile` (can), mock hook editor/override dari `@/hooks/use-people-score` (templates, activate mutation, override mutation) dengan `mockActivate.mockRejectedValue(new Error('Total bobot Score Formula harus tepat 100%. Saat ini 95%.'))` dll. Mock `expo-router` (`Stack.Screen` jadi komponen no-op, `useRouter`). `fireEvent.press(screen.getByLabelText(/Aktifkan/i))` lalu `await waitFor(()=>expect(screen.getByText(/harus tepat 100%/i)).toBeTruthy())`. Override: field reason kosong → assert `mockOverride` tak terpanggil (guard disabled klien); anti-self → mock reject lalu assert pesan dirender.

[DB / MIGRASI] Tidak diuji dari Jest (mobile test semua di-mock). Verifikasi via skill/MCP `mcp__supabase` (apply_migration di branch + execute_sql) atau DB contract test harness yang ada. Pola RPC mengikuti 0011: SECURITY DEFINER, `set search_path=''`, `revoke execute ... from public, anon`, RLS SELECT inline kolom (hindari gotcha 42501 — jangan self-requery di policy). Invarian governance diuji sebagai assertion SQL: insert override append-only, anti-self raise exception, SUM(weight)≠100 raise, double calculate idempotent, role NULL skip, periode closed read-only.

---

## Risiko

1. Mock per-tabel di getMyScore: kasus [10]/[11] menuntut mockFrom dilacak per nama tabel. Bila helper makeQueryThenable disalin apa adanya dari cards.test.ts (mockFrom.mockReturnValue tunggal), cabang 'tidak query period_snapshots saat periodId eksplisit' tak bisa diverifikasi. Wajib pakai mockFrom.mockImplementation((table)=>...).
2. builder thenable cards.test.ts belum punya method 'order' & 'maybeSingle' yang dibutuhkan getActivePeriod/listRanking/listScoreFormulaVersions. Lupa menambah → builder[m] undefined → TypeError saat chaining, bukan kegagalan assert yang diharapkan.
3. effectiveScore gotcha falsy-0: implementasi naif pakai || (bukan ??) membuat manual_adjusted_score=0 keliru jatuh ke auto. Test [3] mengunci ini; pastikan ?? dipakai konsisten di data layer DAN hook (atau hook reuse fungsi data layer, jangan duplikasi logika).
4. PEMBLOKIR kalkulasi (period-window, governance_discipline, result_achievement) belum diputuskan. RPC calculate_period_scores di V1 hanya boleh menghitung metrik deterministik; bila seed Staff menyertakan metrik ber-blocker, SUM bobot 100% & seed-aktif tak konsisten. Mitigasi: keluarkan result_achievement (re-normalisasi 100%), skip metrik window-ambiguous sampai kolom tanggal/angka penalti dikunci user.
5. RLS read-path supervisor di-defer (helper is_supervisor_of belum ada). Risiko: bila kemudian visibility diputuskan 'ranking global publik', policy restriktif default harus dilonggarkan — pastikan policy ditulis agar mudah diganti (satu policy SELECT, bukan tersebar).
6. Migrasi 0013 menyentuh DB live via MCP/CLI — risiko menabrak data Fase 0–6. Mitigasi: apply di branch Supabase (create_branch) lalu merge, jangan langsung ke produksi; verifikasi advisors (get_advisors) untuk RLS/policy yang hilang.
7. database.types.ts harus diregen untuk 7 tabel baru sebelum people-score.ts type-check. Bila lupa, import Tables<'user_score_results'> gagal kompilasi dan SEMUA test layer A/B/C mati karena error TS, bukan karena logika.
8. Migrasi mengganti sumber data People dari listOrgProfiles (cards) ke hook baru. people.test.tsx eksisting (4 state lama) bisa pecah jika mock lama tetap dipakai. Wajib migrasi mock people.test.tsx ke @/hooks/use-people-score dalam langkah yang sama (RED) agar tak ada test menggantung.
9. Pesan exception Indonesia harus identik persis antara RPC dan ekspektasi test (mis. 'Total bobot Score Formula harus tepat 100%. Saat ini X%.', 'Anda tidak bisa mengubah score Anda sendiri.', 'Alasan override wajib diisi.', 'Periode ini sudah ditutup dan tidak bisa diubah.'). Selisih spasi/titik → test rejects gagal cocok.
10. expo SDK 56 + NativeWind v5 gotcha (per MEMORY): render react-native-css cold-transform lambat → jest.setTimeout(30000) wajib di file screen/komponen baru, kalau tidak test flaky timeout.
11. Hook editor formula (useScoreFormulas/useFormulaActions) belum ada di daftar test merah hooks. Bila settings-score-formula.tsx membutuhkannya, hook itu harus ditambah test RED-nya sendiri sebelum implementasi agar tetap test-first (jangan implementasi tanpa test).

---

## Temuan Critic (verdict: perlu-perbaikan)

### Kasus yang Belum Tercakup
1. [KRITIS] Tidak ada `supabase/tests/fase7_people_score_contract.sql` di daftar test. Repo SUDAH punya harness contract yang mapan (fase4/5/6_*_contract.sql) yang mensimulasikan auth.uid() + set role authenticated + ROLLBACK untuk membuktikan invarian RLS/RPC. Plan malah menyerahkan SELURUH invarian governance ke 'mcp__supabase execute_sql manual' (langkah 1 & 21) — non-reproducible, tidak test-first, tidak masuk CI. SEMUA AC governance inti (di bawah) tak punya test berkomitmen, padahal mobile Jest semuanya mock RPC sehingga TIDAK menguji satupun aturan server.
2. AC-7.17 TIDAK DITEST sama sekali: override oleh user TANPA manage_score_formula (menembus UI guard) harus raise 'Anda tidak berwenang mengelola Score Formula.' DAN menulis governance_violations 'critical'. Plan hanya menguji anti-self (AC-7.18) di sisi pesan, tidak menguji jalur unauthorized-write→violation.
3. AC-7.18 sisi efek-samping tak tertutup: anti-self bukan cuma raise exception — spec mewajibkan TULIS governance_violations severity 'critical'. Test data-layer [17] justru memverifikasi client TIDAK throw; tak ada test bahwa baris violation benar-benar ter-insert. Butuh contract SQL.
4. AC-7.14 idempotency-vs-override (jantung fitur) tak tertutup: calculate ulang harus men-supersede baris auto (is_current=false→insert auto baru) TANPA menyentuh baris result_kind='override' yang is_current, dan auto_calculated_score historis tak pernah hilang. Test hook 'idempotent re-run' hanya assert mockCalculate dipanggil 2x — itu menguji mock, bukan invarian DB.
5. AC-7.19 close atomik / rollback parsial tak tertutup: dalam SATU transaksi ranking_snapshots ter-insert per user + status→closed + closed_at/closed_by; bila ada bagian gagal harus rollback penuh (tidak ada partial close). Tak ada test yang menyuntik kegagalan di tengah untuk membuktikan atomicity.
6. AC-7.7 closed read-only di sisi DB tak tertutup: UPDATE/DELETE langsung pada period_snapshots/user_score_results/ranking_snapshots periode closed harus ditolak. Plan hanya menguji pesan exception via mock RPC closePeriod, bukan penegakan trigger/constraint di tabel.
7. AC-7.26 RLS read negatif (Staff X query skor Staff Y → 0 baris graceful, BUKAN error) tak tertutup oleh test nyata. Plan men-defer supervisor tapi tetap perlu membuktikan default restriktif benar-benar mengembalikan 0 baris di bawah konteks user nyata — hanya bisa via contract SQL, bukan mock.
8. AC-7.27 (skor sendiri SELALU terbaca, user_id=auth.uid()) tak punya contract test; hanya diuji sebagai mock getMyScore di hook.
9. AC-7.28 NULL-skip role_template_id: user dengan role_template_id NULL harus di-SKIP deterministik tanpa menggagalkan atomicity batch DAN 'tercatat alasan skip'. Tak ada test untuk skip-logging maupun untuk batch tetap sukses saat sebagian user NULL.
10. AC-7.30 audit-log append-only: tiap operasi (score_formula_changed/activated, score_override_applied, period_closed) harus menulis activity_logs yang tak bisa diedit/dihapus. Nol test.
11. AC-7.31 no hard delete / soft-archive: template & versi hanya boleh status='archived'; user_score_results/ranking_snapshots/period_snapshots/activity_logs/governance_violations append-only (tak ada cascade/hard delete). Nol test.
12. AC-7.34 grant/revoke spesifik: calculate_period_scores & close_period_snapshot SECURITY DEFINER set search_path='' + revoke public/anon, dan 'bila RPC sistem juga revoke authenticated'. Plan menyebut pola 0003 tapi tak ada test yang memeriksa grant matrix (pola advisor/SQL pg_proc) — keputusan grant 'dikunci di kontrak' menurut spec, tapi kontraknya tak ditulis.
13. AC-7.15 isi baris override (menyalin auto_calculated_score UTUH, mengisi manual/reason/changed_by/changed_at, set is_current lama=false, partial-unique (period,user) where is_current) tak diverifikasi. Test [15] hanya assert nama param RPC, bukan bentuk baris hasil & invarian is_current tunggal.
14. Konkurensi open_period (AC-7.29 satu active/org): plan menyebut 'partial unique index ATAU RPC guard' tapi tak menguji RACE — dua open_period bersamaan harus tetap menyisakan satu active. Partial unique index wajib (guard RPC saja bocor pada race). Tak ada test.
15. Edge data-layer getMyScore: kasus periodId TIDAK eksplisit DAN getActivePeriod mengembalikan null (tak ada periode aktif). Apakah getMyScore return null tanpa query user_score_results, atau melempar? Tak ada case (hanya [10] active-ada dan [11] periodId-eksplisit).
16. Edge effectiveScore: input null/undefined record (r === null). Hook useMyScore kontraknya null→null, tapi util effectiveScore(null) tak punya case — bisa TypeError saat r?.manual diakses jika tak ada guard.
17. metric_breakdown clamp di ScoreBreakdown: case value>100 dan value<0 (mis. -5 atau 130) hanya disebut di prosa ('tidak ada teks >100% atau negatif') tapi tak ada case eksplisit yang mengirim value di luar [0,100] dan meng-assert hasil clamp. Spec metric scale 0–100 + 'clamp sebelum INSERT' menuntut ini.
18. ScoreBreakdown nilai non-integer / null: metric_breakdown bisa numeric(.) dari DB (mis. 66.67). Format '%' untuk desimal tak terdefinisi (round? floor?). Tak ada case.
19. Override UI: tombol simpan tetap ter-block saat reason hanya whitespace (' ') — bukan hanya string kosong ''. Spec 'reason wajib diisi'; guard klien harus trim. Tak ada case.
20. People: lebih dari satu user dengan skor + null bercampur dalam SATU list (sebagian dihitung, sebagian belum). Tiap case People hanya mengirim 1 user. Pembedaan per-user null-vs-0 di tengah list campuran tak teruji.
21. calculate_period_scores untuk metrik ber-BLOCKER (action_plan_completion/on_time_rate window, governance_discipline, result_achievement): seed Staff yang di-renormalisasi 100% TANPA result_achievement harus tetap SUM=100 dan fully-computable. Tak ada test yang mengunci komposisi seed Staff aktual (kategori mana + bobot) sehingga 'fully-computable' bisa diam-diam regress.

### Kekhawatiran
1. Strategi mocking data-layer SEBAGIAN tak realistis untuk jest-expo: helper `makeQueryThenable` eksisting di cards.test.ts memang punya 'order' (klaim risiko plan bahwa 'order belum ada' SALAH), tapi TIDAK punya 'maybeSingle'; sebaliknya `makeSingleBuilder` punya 'maybeSingle' tapi TIDAK punya 'order'/'is'/'in'. getActivePeriod butuh eq().maybeSingle() (pakai singleBuilder, OK) sedangkan listRanking/listScoreFormulaVersions butuh eq().order() (pakai thenable, OK) — jadi builder harus dipilih per-fungsi, bukan satu builder universal. Plan menggabungkan 'tambah order & maybeSingle ke builder thenable' yang menyiratkan satu builder; bila diterapkan begitu, getActivePeriod via thenable tak punya .single dan akan TypeError. Risiko salah diagnosis.
2. Klaim 'mockFrom.mockImplementation((table)=>...) untuk getMyScore' valid, tapi `beforeEach` eksisting memanggil mockFrom.mockReset() — setiap test harus memasang ulang mockImplementation; mudah lupa → builder undefined → TypeError alih-alih kegagalan assert yang diharapkan. Realistis tapi rapuh.
3. [BENTROK ASSERTION RNTL] People test meng-assert `screen.getByText('Score 0 · Perlu perhatian')`. Komponen ScoreBadge eksisting merender teks itu DUA KALI: sebagai visible <Text> DAN sebagai accessibilityLabel pada View pembungkus. Di RNTL `getByText` yang cocok >1 node MELEMPAR. Implementasi/test harus pakai getByLabelText atau pastikan hanya satu match — risiko test hijau-palsu/merah-tak-terduga. Plan tak menyadari ScoreBadge sudah ada (score.ts + ui.tsx 335-360) dan tak menyebut REUSE-nya; 'attention band' = skor <70, jadi skor 0 → 'Perlu perhatian' benar, tapi mekanik query salah.
4. Plan MENGABAIKAN aset eksisting: score.ts (scoreBand/SCORE_LABEL/SCORE_THRESHOLD) + ScoreBadge + ScoreLegend + GuidanceNote sudah ada dan people.tsx sudah merender ScoreBadge ketika p.score!=null. Pekerjaan nyata jauh lebih kecil dari yang digambarkan; risiko duplikasi logika band/threshold bila ScoreBreakdown atau hook menghitung ulang. effectiveScore HARUS reuse, dan band HARUS reuse scoreBand (jangan bikin ulang).
5. Migrasi 0013 menyentuh DB live via MCP (project dev fhnqwytqprsptjshoxfn). Tanpa create_branch + apply di branch lalu merge (plan menyebut tapi tak menjadikannya langkah berkomitmen), ada risiko menabrak data Fase 0–6. get_advisors WAJIB dijalankan setelah apply (RLS-disabled/policy-missing) — plan menyebut sekilas, tak dijadikan gate eksplisit.
6. Pesan exception Indonesia harus IDENTIK byte-for-byte antara RPC dan ekspektasi test di banyak tempat ('Total bobot Score Formula harus tepat 100%. Saat ini X%.', 'Anda tidak bisa mengubah score Anda sendiri.', 'Periode ini sudah ditutup dan tidak bisa diubah.', 'Sudah ada periode aktif...', 'Alasan override wajib diisi.', 'Anda tidak berwenang mengelola Score Formula.'). Karena RPC tidak diuji oleh Jest (mock) dan kontrak SQL tak ditulis, drift pesan antara migrasi & UI/mobile test tak akan tertangkap CI sampai runtime. Sumber kebenaran string tunggal tidak ditetapkan.
7. Plan menambah hook editor (useScoreFormulas/useFormulaActions) di langkah 18-19 sebagai 'bila perlu' — ini menyalahi test-first bila layar editor (langkah 17) ditulis sebelum hook-nya didefinisikan kontraknya. Layer F menulis screen test yang me-mock '@/hooks/use-people-score' untuk template list & activate mutation, padahal hook itu belum ada test merah-nya; urutan langkah 17(screen RED)→18(hook RED)→19(impl) membuat screen test bergantung pada bentuk hook yang belum dikunci.
8. database.types.ts: plan membolehkan 'edit manual' tipe 7 tabel. Karena project ID dev diketahui, generate_typescript_types lebih aman; edit manual rawan drift dengan kolom DB aktual (mis. override_changed_by vs changed_by — spec FR-7.6 pakai 'changed_by' di teks tapi FR-7.6/AC-7.15 menyebut 'override_changed_by'/'override_changed_at'). Ketidakkonsistenan nama kolom override di spec sendiri belum diresolusi dan akan menjalar ke tipe + people-score.ts.
9. openPeriod arg mapping di test [21] memakai param 'p_start'/'p_end', tapi tabel period (AC-7.8) memakai window [period_start, period_end]. Penamaan param RPC vs kolom belum konsisten; karena RPC tak diuji, mismatch p_start→period_start hanya ketahuan saat runtime.
10. Hook useRanking memakai useRanking('') untuk menguji gate enabled:!!periodId dalam renderHook gabungan { empty, listed }. React Query dengan dua useQuery di satu hook + retry:false realistis, tapi assert 'tidak menambah panggilan' bergantung pada queryKey ['ranking',''] tidak ter-cache bentrok; perlu queryKey stabil. Minor tapi mudah flaky bila key '' di-treat sama.
11. jest.setTimeout(30000) untuk file screen/komponen baru: benar per MEMORY (NativeWind v5 cold transform), tapi people.test.tsx eksisting yang DIPERLUAS akan men-switch mock dari @/lib/cards ke @/hooks/use-people-score — bila 4 test lama tak ikut dimigrasi mock-nya di langkah yang sama, mereka pecah. Plan menyadari ini (risiko) tapi tidak menjadikannya bagian dari case RED yang dieksekusi bersama; 4 test lama bisa menggantung.
12. Definisi 'metric_breakdown' di getMyScore/useMyScore: hook expose `breakdown` dari r.metric_breakdown, tapi data-layer test [10]/[12] hanya assert filter eq, tak pernah assert bentuk breakdown JSONB yang dikembalikan. Kontrak shape breakdown (keys = 7 metric codes) tak terkunci di data layer.
