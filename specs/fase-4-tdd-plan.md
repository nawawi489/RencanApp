# Rencana TDD — Fase 4 Performance Workspace (Hierarki Strategis)

> Sumber otoritatif: `specs/fase-4-performance-workspace.md` + `specs/fase-4-tdd-handoff.json`. Pola test mengikuti `supabase/tests/fase3_per_user_contract.sql`, `mobile/src/lib/__tests__/{cards,inbox,home}.test.ts`, `mobile/src/hooks/__tests__/*.test.tsx`. Keputusan mengikat K1–K9 dihormati.
>
> **Revisi (audit Critic terintegrasi):** 18 *missing case* difold ke §3/§4 dengan ID test eksplisit (bukan addendum terpisah); 11 *concern* struktural dijawab di §2 (tooling terkunci, urutan typegen diperbaiki, strategi mock konkret, kontrak hook & label dikunci) dan §5 (mitigasi).

## 1. Ringkasan fitur

Menambahkan lapisan strategis di atas Initiative datar Fase 1 sehingga hierarki **Goal → KPI Area → Strategy → Initiative → Action Plan** utuh.

- **Migrasi tunggal** `0010_fase4_performance_workspace.sql`: 5 tabel baru (`goal_templates`, `kpi_area_templates`, `goals`, `kpi_areas`, `strategies`) urutan dependency-safe + `ALTER initiatives ADD COLUMN strategy_id uuid` (nullable, `ON DELETE SET NULL`).
- **Write model (K1):** card dibuat via **INSERT langsung ber-RLS** (precedent `createInitiative` + policy `initiatives_insert` `0005:503`), BUKAN RPC. Hanya lifecycle `activate_goal`/`activate_kpi_area`/`activate_strategy` + `apply_goal_template` lewat RPC `SECURITY DEFINER set search_path=''`.
- **Gate MBR (K2):** HANYA gate keras "Goal aktif wajib ≥1 KPI Area" (PRD §20.4) + Strategy depth keras (alasan/risiko/alternatif wajib saat aktivasi, PRD §22). Mesin 3/3/3, indikator X/N, tabel `minimum_breakdown_rules` DEFER Fase 5; indikator tree **count-only**.
- **Tanpa reviewer_id (K3)** pada planning card (Reviewer hanya Action Plan).
- **Permission (K4):** `create_goal` & `create_kpi_area` = CEO/Super Admin default (TIDAK ditambahkan ke default `c_level`/`management`); `create_strategy` tetap default `c_level`/`management`; KPI Area dibuat C-Level lewat jalur parent-PIC di RLS WITH CHECK; mirror konsisten di `use-profile.ts` ROLE_DEFAULTS.
- **FK (K5):** planning chain `ON DELETE RESTRICT` (goals/kpi_areas) + `initiatives.strategy_id SET NULL`; tutup cross-org FK hole.
- **Seed (K6):** `kpi_area_templates` nama PERSIS PRD §47-48 (Omset 5 divisi @2 item; Profit: CFO 1 item, sisanya 2), `where not exists` (idempoten).
- **Helper (K7):** `can_access_goal`/`kpi_area`/`strategy` meniru `can_access_initiative` (`0005:207`).
- **Audit (K8):** violation planning append-only; CHECK `notifications` enum TIDAK diubah.
- **apply_goal_template atomik (K9).**
- **Client:** data layer tipis `goals.ts`/`kpi-areas.ts`/`strategies.ts`; `use-workspace.ts` (hooks tree); Workspace tree expand/collapse (state lokal); Goal Wizard 7-step; routes `/goal` `/kpi-area` `/strategy` `/goal-wizard`; regen `database.types.ts`.

Invarian Fase 0–3 (RLS, anti-self-approval Action Plan, evidence locking, audit append-only, multi-tenant, Home tak berubah) dipertahankan.

## 2. Keputusan tooling & kontrak (TERKUNCI — jawaban atas concern Critic)

### 2.1 Mekanisme test DB (server) — pola contract `.sql`, BUKAN pgTAP

Repo TIDAK memakai framework pgTAP. Pola terbukti: `supabase/tests/fase3_per_user_contract.sql`. Fase 4 menambah **`supabase/tests/fase4_performance_workspace_contract.sql`** dengan gaya identik:

- Tiap test = `begin; do $$ … $$; rollback;` (nol polusi data).
- Konteks user disimulasikan: `perform set_config('request.jwt.claims', json_build_object('sub', <uid>, 'role','authenticated')::text, true);`
- Assert via akumulasi `fails text`; di akhir `if fails <> '' then raise exception 'TESTn … FAIL: %', fails; end if; raise notice 'TESTn … PASS';`
- Pola negatif RLS/RPC: bungkus `begin perform <aksi>; fails:=fails||'X:NOERR; '; exception when others then if sqlerrm not like '%<pesan>%' then fails:=fails||…; end if; end;`
- Pola RLS insufficient_privilege (append-only / grant): `exception when insufficient_privilege then null;`
- Konstanta dev (ganti bila org dev berbeda): `org=4b07a19f-550d-4952-b0d8-44f38f651d89`, `ceo=ca8c1471-b870-4f09-a149-25e5eae99d6f`.
- **Cara jalan:** `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fase4_performance_workspace_contract.sql`, ATAU via Supabase MCP `execute_sql` (kirim tiap blok `do $$..$$` terpisah; `raise exception` memaksa rollback; pesan akhir `ALL_PASS`). "RED" = blok gagal karena objek/policy belum ada.

### 2.2 Urutan typegen (FIX concern: jangan di akhir)

`database.types.ts` di-regen **segera setelah migrasi 0010 diterapkan, SEBELUM menulis `goals.ts`** (langkah A4). Alasan: `goals.ts` memakai `Tables<'goals'>`; tanpa tipe ter-regen seluruh Layer B gagal kompilasi di jest-expo. Command: Supabase MCP `generate_typescript_types` → tulis ke `mobile/src/lib/database.types.ts` (atau `supabase gen types typescript --project-id <id> > mobile/src/lib/database.types.ts`).

### 2.3 Strategi mock data-layer (FIX concern: multi-tabel non-trivial)

Dua bentuk resolusi chain (dari kode existing):
- **Thenable** (di-await setelah `.order()/.eq()/.is()`): pakai `makeQueryThenable(result)` (lihat `inbox.test.ts:23`) — daftar method chainable + `.then`.
- **`.single()`-terminated** (`createInitiative`, `useProfile`): builder yang `select().eq().single()`/`insert().select().single()` mengembalikan Promise di `single()`.

`createGoal` memanggil **DUA** `from()` (`profiles` lalu `goals`). Helper bersama baru **`mobile/src/lib/__tests__/_supabase-mock.ts`**:
```ts
export function makeSingleBuilder(result) { // untuk insert(...).select().single() / select().eq().single()
  const b: any = {};
  for (const m of ['select','eq','is','insert','update','order','single','maybeSingle'])
    b[m] = jest.fn(() => (m === 'single' || m === 'maybeSingle') ? Promise.resolve(result) : b);
  return b;
}
export function routeFrom(map) { // map: { profiles: builderA, goals: builderB }
  return jest.fn((table: string) => map[table]);
}
```
`mockFrom.mockImplementation(routeFrom({ profiles: makeSingleBuilder({data:{organization_id:'org1'},error:null}), goals: makeSingleBuilder({data:{id:'g1'},error:null}) }))`. Catatan kerapuhan didokumentasikan di header file test.

### 2.4 Kontrak hook & data-layer (FIX concern: API belum stabil)

- `listInitiatives(opts?: { strategyId?: string | null })` — bila `opts.strategyId === null` tambahkan `.is('strategy_id', null)`; bila string tambahkan `.eq('strategy_id', id)`; tanpa opts = semua (backward-compat; pemanggil lama tak berubah).
- `use-workspace.ts` mengekspor: `useGoals()` key `['goals']`; `useGoal(id)` key `['goal', id]` `enabled:!!id`; `useKpiAreas(goalId)` key `['kpi_areas', goalId]` `enabled:!!goalId`; `useStrategies(kpiAreaId)` key `['strategies', kpiAreaId]` `enabled:!!kpiAreaId`; `useFlatInitiatives()` key `['initiatives','flat']` (strategy_id=null); `useGoalActions()`, `useKpiAreaActions(goalId)`, `useStrategyActions(kpiAreaId)`.
- Test screen me-mock modul hook (`jest.mock('@/hooks/use-workspace')`, `@/hooks/use-profile`) + `expo-router` (`useRouter`/`useFocusEffect` pola `home.test.tsx`). Gating FETCH (`enabled` saat expand) diuji di **test hook** (`use-workspace.test.tsx`), BUKAN test screen; test screen hanya menguji render kondisional `id ∈ expandedSet`.

### 2.5 Label UI Indonesia (TERKUNCI — cegah churn test)

Blok konstanta di `mobile/src/lib/workspace-copy.ts` (di-import screen & test):
```ts
export const WS_COPY = {
  sectionStrategis: 'Hierarki Strategis',
  sectionTanpaGoal: 'Initiative Tanpa Goal',
  btnGoalBaru: '+ Goal Baru',
  kpiCount: (n: number) => `KPI Area: ${n}`,      // count-only; boundary error/undefined → '—'
  kpiCountUnknown: 'KPI Area: —',
  emptyGoalTitle: 'Belum ada Goal',
  emptyGoalDescCan: 'Buat Goal pertama lewat Wizard, lalu pecah jadi KPI Area, Strategy, dan Initiative.',
  emptyGoalDescView: 'Anda akan melihat Goal di sini begitu menjadi PIC atau Reviewer sebuah card.',
} as const;
export const PLANNING_STATUS_LABEL = { draft:'Draft', active:'Aktif', done:'Selesai', archived:'Diarsipkan' };
```
`STATUS_TONE` di-import-ulang dari `cards.ts` (jangan duplikat nilai).

## 3. Daftar file test

| ID | Layer | File | Status | Cakupan utama (incl. missing case) |
|---|---|---|---|---|
| A | SQL/contract | `supabase/tests/fase4_performance_workspace_contract.sql` | BARU | schema; RLS insert/select/update; activate gates & otorisasi; FK; seed; template; audit; can_access_* |
| B1 | Data | `mobile/src/lib/__tests__/planning-cards.test.ts` | BARU | label/tone reuse; create/activate/list goals·kpi·strategies; applyTemplate; guard kosong; error |
| B2 | Data (regresi) | `mobile/src/lib/__tests__/cards.test.ts` | UBAH | `listInitiatives({strategyId})`; `createInitiative` strategy_id opsional + null eksplisit |
| C1 | Hooks | `mobile/src/hooks/__tests__/use-workspace.test.tsx` | BARU | query keys; `enabled` gating; actions invalidate; propagasi gate/depth error |
| C2 | Hooks (perm) | `mobile/src/hooks/__tests__/use-profile.test.tsx` | UBAH | K4 cabang ceo/default/grant (guard regresi) |
| D1 | UI | `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx` | UBAH | dua section; gate tombol; tree expand/collapse; count boundary; loading/error |
| D2 | UI | `mobile/src/app/(app)/goal-wizard/__tests__/wizard.test.tsx` | BARU | alur 7-step → applyTemplate; smoke-render step |
| D3 | UI | `mobile/src/app/(app)/goal/__tests__/detail.test.tsx` | BARU | deep-link `[id]` di luar scope → ErrorState (tak bocorkan keberadaan) |

## 4. Urutan langkah red → green → refactor

Strategi global: **bottom-up per layer** (SQL → typegen → data → hooks → UI). Tiap layer selesai red→green sebelum lanjut. Refactor di akhir tiap layer.

### Layer A — SQL / Migrasi (contract `.sql`)

**A1. RED** — Tulis `fase4_performance_workspace_contract.sql` (pola §2.1). Blok & assertion:
- **A-SCHEMA** — 5 tabel + kolom ada; `initiatives.strategy_id` ada (nullable). `period_end >= period_start` CHECK pada goals/kpi_areas/strategies → *missing [9]* (single-day legal; `end<start` ditolak `23514`).
- **A-INS** (RLS insert) — CEO INSERT goal OK; C-Level **tanpa** grant create_goal → `42501`; create_kpi_area: CEO OK; C-Level **PIC Goal induk** OK (jalur parent-PIC) → *missing [5] positif*; C-Level **bukan** PIC induk & tanpa grant → `42501` *missing [5] negatif*; strategies_insert: PIC KPI Area induk OK + non-PIC tanpa grant ditolak → *missing [6]*.
- **A-SELECT** (cross-org) — user org B `select` goal/kpi/strategy org A → 0 baris → *missing [4]*; `can_access_*` cabang EXISTS-turunan: PIC Action Plan dapat `select` Goal leluhur → *missing [12]*.
- **A-UPDATE** (Lihat≠Edit) — user `view_workspace` non-owner bisa SELECT tapi `update` goal/kpi/strategy → 0 baris terpengaruh / `42501` → *missing [3]*.
- **A-ACT** (lifecycle) — `activate_goal` 0 KPI Area → tolak "minimal 1 KPI Area"; `activate_strategy` alasan/risiko/alternatif kosong → tolak "wajib"; `activate_kpi_area` Target kosong → tolak → *missing [10]*; pemanggil bukan creator/pic/PIC-induk/manage_others_cards → tolak → *missing [1]*; aktifkan card status≠draft (double-activate) → tolak → *missing [2]*; buat turunan saat induk done/archived → tolak → *missing [2]*.
- **A-AUDIT** — INSERT goal & `activate_*` menulis `activity_logs` dgn `actor_id = auth.uid()` (bukan definer) → *missing [11]*; violation planning terlihat hanya via `view_governance_violation` (append-only).
- **A-GRANT** — `revoke execute` `activate_*`/`apply_goal_template` from `public`/`anon`; panggilan anon ditolak → *missing [13]*.
- **A-SEED** — `kpi_area_templates`: COUNT per (goal_template, divisi) & nama PERSIS PRD §47-48; khusus **CFO Profit = 1 item "Control Budgeting"**; total item per template benar → *missing [8]*.
- **A-TPL** — `apply_goal_template` atomik (error tengah → rollback total); idempoten by-name (apply 2× → tidak duplikat KPI Area, tidak menimpa data aktif) → *missing [7]*; eksekusi atomik *(K9)*.
- **A-INIT-COMPAT** — `createInitiative` dgn `strategy_id = null` eksplisit lolos RLS WITH CHECK (`strategy_id is null OR can_access(strategy)`) → *missing [14]*; cross-org `strategy_id` (org A → strategy org B) ditolak.
- **A-DEL** — `update_delegation`/override PIC turunan menulis `activity_logs` (FR-DEL-03) → *missing (concern: FR wajib yang sebelumnya hilang)*.

Jalankan suite → **FAIL** (objek belum ada).

**A2. GREEN** — Tulis `0010_fase4_performance_workspace.sql` (single-transaction, dependency-safe): tabel + CHECK periode; FK `RESTRICT`/`SET NULL` + cross-org guard; RLS `_select/_insert/_update` (insert: org + `has_permission(create_*)` ATAU parent-PIC; update: creator/pic/manage_others_cards); helper `can_access_goal/kpi_area/strategy`; trigger `log_card_creation('goal'|'kpi_area'|'strategy')`; RPC `activate_*` + `apply_goal_template` (`SECURITY DEFINER set search_path=''`, validasi gate + otorisasi + status draft, tulis `activity_logs` `actor_id=auth.uid()`); `revoke execute from public, anon`; seed templates `where not exists`. Jalankan suite → **PASS**.

**A3. REFACTOR** — Pastikan `has_permission` default TIDAK menambah create_goal/create_kpi_area (K4). Rapikan komentar; perilaku tetap.

**A4. TYPEGEN** — Regen `mobile/src/lib/database.types.ts` (§2.2). Verifikasi tipe `goals/kpi_areas/strategies/goal_templates/kpi_area_templates` + `initiatives.strategy_id` muncul. (Wajib sebelum Layer B.)

### Layer B — Data layer (`mobile/src/lib`)

**B1. RED** — `planning-cards.test.ts`: `PLANNING_STATUS_LABEL` benar + **goals.ts meng-import-ulang `STATUS_TONE` dari `cards.ts`** (assert identity `STATUS_TONE === cardsStatusTone`, bukan sekadar nilai sama → jawab concern reuse). FAIL.
**B2. GREEN** — Buat `goals.ts`: `PLANNING_STATUS_LABEL`, `export { STATUS_TONE } from './cards'`, `PersonRef` reuse. PASS.
**B3. RED** — `createGoal` (dua `from()` via `routeFrom` §2.3: profiles→org, goals→insert; rpc TIDAK dipanggil) + error propagation. FAIL.
**B4. GREEN** — `createGoal` (pola `createInitiative`). PASS.
**B5. RED** — `activateGoal` (`activate_goal {p_goal_id}`) gate error; `applyGoalTemplate` (`{p_goal_template_id,p_pic_id,p_period_start,p_period_end}`→goal_id) + error atomik; `listGoals` (thenable). FAIL.
**B6. GREEN** — Implement + `getGoal`. PASS.
**B7. RED** — `kpi-areas.ts`: `createKpiArea`, `activateKpiArea`, `listKpiAreas(goalId)` guard early-return `[]`. FAIL.
**B8. GREEN** — Implement. PASS.
**B9. RED** — `strategies.ts`: `createStrategy` (depth field nullable di create), `activateStrategy` + depth error, `listStrategies(kpiAreaId)` guard. FAIL.
**B10. GREEN** — Implement. PASS.
**B11. RED** — `cards.test.ts`: `listInitiatives({strategyId:null})` panggil `.is('strategy_id',null)`; `createInitiative` terima `strategy_id?` & teruskan; null eksplisit OK (backward-compat) → *missing [14] sisi klien*. FAIL.
**B12. GREEN** — Tambah `strategy_id?: string|null` ke `NewInitiative`; param opsi `listInitiatives`. PASS.
**B13. REFACTOR** — Konsolidasi helper `currentUserOrgInsert` antar goals/kpi-areas/strategies (jaga hijau).

### Layer C — Hooks (`mobile/src/hooks`)

**C1. RED** — `use-workspace.test.tsx`: `useGoals`/`useGoal('')` tak fetch; `useKpiAreas('')`/`useStrategies('')` tak fetch (assert `enabled` via `queryFn` tak terpanggil) → menutup gating fetch yang TAK bisa diuji di screen. FAIL.
**C2. GREEN** — `use-workspace.ts`: `useGoals/useGoal/useKpiAreas/useStrategies/useFlatInitiatives`. PASS.
**C3. RED** — `useGoalActions.create`→invalidate `['goals']`; `.activate`→invalidate `['goal',id]`+`['goals']` + propagate gate error; `.applyTemplate`→return goal_id + invalidate. `useKpiAreaActions(goalId).create`→invalidate `['goal',goalId]`+`['kpi_areas',goalId]`; `useStrategyActions.activate`→propagate depth error. FAIL.
**C4. GREEN** — Implement actions. PASS.
**C5. RED** — `use-profile.test.tsx` perluas K4 (override `mockSingle` per-test, reset di `beforeEach`): CEO `can('create_goal'|'create_kpi_area'|'create_strategy')===true`; c_level default `create_goal===false && create_kpi_area===false && create_strategy===true`; grant eksplisit `create_goal`→true, `create_kpi_area` tetap false. FAIL (suite baru).
**C6. GREEN** — Verifikasi `ROLE_DEFAULTS` benar (sudah: tak ada create_goal/kpi_area; create_strategy ada) → PASS tanpa ubah logika. **Catatan concern:** cabang `ceo` mengembalikan true utk semua key → test client = guard regresi mirror; penegak server diuji di A-INS (RLS). Dokumentasikan di header test.
**C7. REFACTOR** — Ekstrak `makeWrapper` ke util test bersama (opsional).

### Layer D — UI / Screen (`mobile/src/app`)

**D1. RED** — `workspace.test.tsx` (mock `@/hooks/use-workspace` + `use-profile` + `expo-router`): render section `WS_COPY.sectionStrategis` + `WS_COPY.sectionTanpaGoal`; Goal & flat-initiative tampil; section "Tanpa Goal" HANYA memuat item dari `useFlatInitiatives` (mock terpisah dari goals) → *missing [18]*. FAIL.
**D2. GREEN** — Ubah `workspace.tsx`: `useGoals()` + `useFlatInitiatives()`; dua section; import `WS_COPY`. PASS.
**D3. RED** — tombol `WS_COPY.btnGoalBaru` tampil saat `can('create_goal')` → push `/goal-wizard`; sembunyi saat false + EmptyState (`emptyGoalTitle`). FAIL.
**D4. GREEN** — Gate tombol + EmptyState. PASS.
**D5. RED** — node Goal `WS_COPY.kpiCount(n)` (count-only, tak ada `\d+/\d+`); count error/undefined → `WS_COPY.kpiCountUnknown` ('—') → *missing [17]*; expand/collapse tap toggle anak KPI (state lokal `Set<string>`, anak hilang saat collapse); loading `SkeletonList`, error `ErrorState` retry → refetch. FAIL.
**D6. GREEN** — Tree node + expand state + loading/error per-section. PASS.
**D7. RED** — `goal-wizard/__tests__/wizard.test.tsx`: alur pilih template→divisi→target→PIC→generate memanggil `useGoalActions().applyTemplate` 1× dgn payload benar; tiap step screen smoke-render → *missing [15]*. FAIL.
**D8. GREEN** — `goal-wizard/` 7-step (state lokal antar step / param) + panggilan applyTemplate di step akhir. PASS.
**D9. RED** — `goal/__tests__/detail.test.tsx`: `goal/[id]` dgn id di luar scope (hook error/empty) → `ErrorState` tanpa membocorkan keberadaan card → *missing [16]*. FAIL.
**D10. GREEN** — `goal/[id].tsx`, `goal/new.tsx`, `kpi-area/{new,[id]}.tsx`, `strategy/{new,[id]}.tsx` pola `initiative/*`; daftarkan route di `_layout.tsx`. PASS.
**D11. GREEN (full)** — `npm --prefix mobile test` penuh hijau; `npx tsc --noEmit` di mobile bersih (validasi typegen A4).
**D12. REFACTOR** — Ekstrak `TreeNode`/`CountBadge`; a11y label lengkap; breadcrumb. Test tetap hijau.

## 5. Risiko & strategi mocking (mitigasi concern Critic)

1. **Mock multi-tabel rapuh** → helper `_supabase-mock.ts` (§2.3) + header test mendokumentasikan dua bentuk resolusi (`.single()` vs thenable); hindari assert "trivial".
2. **Typegen sebagai blocker** → dijadikan langkah A4 eksplisit sebelum Layer B; D11 memverifikasi `tsc --noEmit`.
3. **K4 cabang CEO lemah di client** → ditandai guard regresi; penegak sebenarnya di A-INS (RLS contract). Tidak memberi false-confidence karena server diuji terpisah.
4. **STATUS_TONE reuse** → B1 meng-assert identity import (bukan kebetulan nilai), mengikat `goals.ts` tidak menduplikasi.
5. **String UI churn** → seluruh label dikunci di `WS_COPY` (§2.5); test merujuk konstanta, bukan literal.
6. **Kontrak hook belum stabil** → dikunci §2.4 sebelum test ditulis; `listInitiatives({strategyId})` backward-compat.
7. **Gating fetch vs render** → dipisah: `enabled` diuji di C1 (hook), render kondisional di D5 (screen).
8. **Eksekusi DB lokal vs remote** → contract `.sql` dijalankan via psql atau MCP `execute_sql` per blok terhadap dev project; "RED" bermakna karena objek belum ada. Konstanta org/ceo dev disesuaikan bila berbeda.
9. **FR-DEL-03 (delegasi)** → dimasukkan eksplisit ke A-DEL agar tidak hilang dari scope test.
