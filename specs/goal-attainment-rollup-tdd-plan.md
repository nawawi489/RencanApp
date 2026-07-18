# TDD Plan: Kuantifikasi Capaian Goal via % Attainment Roll-up (P1)

Rencana red→green→refactor untuk spec [goal-attainment-rollup.md](goal-attainment-rollup.md). Disusun via /tdd-plan (2026-07-18).
Baseline: **1405/1405 jest, `tsc` clean**. Contract SQL **manual** (CI tak jalankan `supabase/tests/*.sql`).

---

## 0. Strategi Mocking per Layer

| Layer | Mocking |
|---|---|
| **DB-contract (SQL)** | Tak ada mock — DB nyata lokal. Seed sebagai `postgres` (bypass RLS), lalu `set_config('request.jwt.claims', json_build_object('sub',<uid>,'role','authenticated')::text, true)` + `set local role authenticated` untuk memanggil RPC sebagai peran. Bungkus `begin; … rollback;`. Pola: [0063](../supabase/tests/0063_cross_org_isolation_contract.sql), assert katalog pola [0054](../supabase/tests/0054_search_chat_messages_contract.sql). Jalankan `docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0070_*.sql` atau `mcp__supabase__execute_sql`. |
| **data/util (jest)** | `jest.mock('../supabase', () => ({ supabase:{ rpc:(...a)=>mockRpc(...a) }}))`; import setelah mock; `beforeEach(mockRpc.mockReset)`. Util murni (`treeOrbLabel`, sublabel) tanpa mock. |
| **hooks (jest)** | `makeWrapper()` = `QueryClient({queries:{retry:false}})` + `QueryClientProvider` via `createElement`. Mock `@/lib/*` di batas modul (mis. `fetchCardProgress`, `reviewInstanceSubmission`). Invalidation: `jest.spyOn(qc,'invalidateQueries')` + `await act(async …)`. |
| **ui (RNTL)** | Mock hooks per-hook (`mockUseCardProgress`, `useGoal`, `useStrategies`, …) + `expo-router`. `await act(async () => render(...))`. Query via `getByText`/`getByLabelText` (regex substring untuk a11y). `computeKpiGap` **asli** (jangan mock `@/lib/strategy-gap`). `flattenStyle` untuk cek gaya; `testID` bukan className. |

**Wajib (bukan test):** default mock `useCardProgress` di [workspace.test.tsx:210-212](../mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx) ditambah `measuredOf: () => false` — tanpa ini seluruh suite workspace crash (bukan red bersih) begitu `TreeOrbCell` memanggil `measuredOf`.

---

## 1. Urutan Increment (red → green → refactor)

Bottom-up: DB → data → hooks → komponen → screen. Tiap increment: tulis test merah dulu, lalu implementasi hijau.

### Increment 0 — Migrasi RPC + contract SQL
- **RED-0** — Tulis `supabase/tests/0070_goal_attainment_contract.sql` (14 case, §2). Gunakan **signature-guard** (`pg_get_function_result` harus memuat `is_measured`) di awal tiap case governance/cross-org supaya benar-benar merah pre-migrasi. Jalankan manual → semua FAIL (kolom `is_measured` belum ada; RPC masih %done).
- **GREEN-0** — Tulis `supabase/migrations/0070_workspace_card_progress_attainment.sql` (§5 spec): `DROP FUNCTION` (tanpa CASCADE, verifikasi `pg_depend` dulu) + `CREATE FUNCTION` `RETURNS TABLE(card_id, progress, is_measured)`, `SECURITY INVOKER` **eksplisit** + `SET search_path=''`, CTE `status_rollup` (6 cabang **verbatim** [0046:2692-2727](../supabase/migrations/0046_rewrite_bodies_and_policies.sql)) + `goal_attainment` (mean clamp-per-child, guard `target_numeric>0`) + `strategy_attainment` + `measured` union; `REVOKE EXECUTE … FROM PUBLIC, anon` + `GRANT EXECUTE … TO authenticated`. Apply lokal via `docker exec psql`. Jalankan contract → semua PASS.
- **GREEN-0b** — Regen types: **`npx supabase gen types typescript --local > src/lib/database.types.ts`** — WAJIB `--local`, JANGAN MCP (`mcp__supabase__generate_typescript_types` menunjuk project remote yang belum punya 0070 → `Returns` tanpa `is_measured` → tsc merah semu). `Returns` kini punya `is_measured: boolean`. Catatan: `tsc` memang **merah di antara Increment 0→1** sampai regen selesai — itu wajar TDD, bukan regresi.

### Increment 1 — data/util (jest, tanpa DB)
- **RED-1** — Update [workspace-progress.test.ts](../mobile/src/lib/__tests__/workspace-progress.test.ts): (a) `treeOrbLabel` — flip 3 assertion lama + tambah tabel `(kind,isMeasured)` (goal/strategy×true→Capaian, ×false→Progress, 5 kind lain→Progress apapun flag, arity-1 default→Progress); (b) `fetchCardProgress` — row mock +`is_measured`, assertion jadi `.progress`/`.isMeasured`, coercion `=== true`, clamp di `.progress`. Tambah [progress.test.ts](../mobile/src/lib/__tests__/progress.test.ts) block `measuredStrategiesSublabel` (3/5, 2/4, 0/4, []→"Belum ada turunan", negatif=kualitatif). → merah.
- **GREEN-1** — `progress.ts`: `treeOrbLabel(kind, isMeasured=false)` = `(kind==='goal'||kind==='strategy') && isMeasured ? 'Capaian':'Progress'`; tambah `measuredStrategiesSublabel(strategies)` — **exclude `status` selain `'active'`/`'done'`** (populasi = active+done; selaras mean server FR-15, O4), lalu n=`targetNumeric>0`, m=`count active/done`; m=0→"Belum ada turunan". `workspace-progress.ts`: `CardProgressRow` +`is_measured`; `CardProgress = {progress,isMeasured}`; `fetchCardProgress` → `Map<string,CardProgress>` (clamp `.progress`, `isMeasured: row.is_measured===true`).
- **RED-1 tambahan (M3/M4):** sublabel case archived+draft — `[{status:'active',targetNumeric:100},{status:'archived',targetNumeric:50},{status:'draft',targetNumeric:80},{status:'active',targetNumeric:null}]` → "1/2 Strategi terukur" (archived DAN draft dikecualikan dari n & m, O4). Tanpa ini, sublabel klien bisa kontradiktif dengan label "Progress" server.

### Increment 2 — hooks
- **RED-2a** — [use-workspace.test.tsx](../mobile/src/hooks/__tests__/use-workspace.test.tsx): tambah `[P8][P9][P10]` (`measuredOf` flag/null-safe/memo-stable); ubah `[P1][P3][P3b][P4][P5]` ke Map objek + unwrap `.progress`. → merah.
- **GREEN-2a** — `useCardProgress`: `progressOf = map?.get(id)?.progress ?? null`; tambah `measuredOf = map?.get(id)?.isMeasured ?? false` (memo atas `[map]`).
- **RED-2b** — Tambah `useInstanceReview` tests di [use-repeat-instances.test.tsx](../mobile/src/hooks/__tests__/use-repeat-instances.test.tsx): `[R1]` approve→invalidate `['workspace_card_progress']`; `[R2]` reject idem + `reviewInstanceSubmission` args; `[R3]` regression guard invalidasi lama (`['instance']`/`['repeat-instances']`/`['repeat-compliance']` tetap); `[R4]` error propagate + key progress **tak** ter-invalidate saat gagal. → merah (hook belum ada).
- **GREEN-2b** — Ekstrak `useInstanceReview(inst, instanceId)` ke [use-repeat-instances.ts](../mobile/src/hooks/use-repeat-instances.ts) (rumah `['repeat-instances']`); `onSuccess` invalidate set lama **+** `['workspace_card_progress']`. Adopsi di [task/instance/[id].tsx](../mobile/src/app/(app)/task/instance/[id].tsx) (ganti `reviewM` inline). One-time task ([task/[id].tsx:357](../mobile/src/app/(app)/task/[id].tsx)) sudah invalidate key ini — biarkan (opsional selaraskan).

### Increment 3 — komponen ui
- **RED-3** — Buat [progress-orb.test.tsx](../mobile/src/components/__tests__/progress-orb.test.tsx): `[FR16-1]` `label="Progress"` → a11y `/^Progress 80 persen/`; `[FR16-2]` default→"Capaian"; `[FR18-1]` a11y memuat label teks + sublabel. → merah.
- **GREEN-3** — [ui.tsx](../mobile/src/components/ui.tsx) `ProgressOrb`: tambah `label?: string` (default `'Capaian'`); a11y `${label ?? 'Capaian'} ${pct} persen…`.

### Increment 4 — workspace tree orb wiring
- **RED-4** — [workspace.test.tsx](../mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx): `setOrb(progress, measured)` helper; `[FR13-1..5]` — goal/strategi ×measured→label; kind lain measured=true tetap "Progress" (guard). → merah.
- **GREEN-4** — [workspace-screen.tsx](../mobile/src/screens/workspace-screen.tsx): `TreeOrbCell` terima `isMeasured`, teruskan `treeOrbLabel(kind, isMeasured)` (:151,:157); 7 kontainer destruktur `measuredOf` dan pass `isMeasured={measuredOf(id)}`.

### Increment 5 — detail screens (rekonsiliasi)
> **⚠️ M1 (blocker) — update suite existing DULU.** [goal/__tests__/detail.test.tsx](../mobile/src/app/(app)/goal/__tests__/detail.test.tsx) & [strategy/__tests__/mbr-completion.test.tsx](../mobile/src/app/(app)/strategy/__tests__/mbr-completion.test.tsx) mem-`jest.mock('@/hooks/use-workspace')` **tanpa** `useCardProgress`. Begitu GREEN-5 menambah `useCardProgress` di screen, mock lama kembalikan `undefined` → `useCardProgress is not a function` → **suite CRASH (bukan merah bersih)**. Sebagai bagian RED-5, **tambahkan `useCardProgress: (ids)=>mockUseCardProgress(ids)` ke kedua mock itu** + default `{progressOf:()=>null, measuredOf:()=>false, isLoading:false, isError:false}`.
- **RED-5a** — Update `detail.test.tsx` (inject mock) + buat [goal/__tests__/[id].test.tsx](../mobile/src/app/(app)/goal/__tests__): `[G2]` orb header = attainment RPC (bukan ratioDone); `[G1]` "Capaian hasil" numerik, "Progress kerja" tetap status; `[G-KUAL]` kualitatif → hanya Progress; `[D1]` sublabel "3/5 Strategi terukur"; `[D3]` []→"Belum ada turunan"; `[MetaGrid]` "Target Tahunan" tetap teks. → merah.
- **GREEN-5a** — [goal/[id].tsx](../mobile/src/app/(app)/goal/[id].tsx): orb header pakai `useCardProgress([id])` (`progressOf`+`measuredOf`) + prop `label`; kartu "Capaian hasil" = attainment (bila measured) / sembunyikan bila kualitatif; sublabel `measuredStrategiesSublabel`. "Progress kerja" (ratioActive) & "Target Tahunan" (target_value) tetap.
- **RED-5b** — Update `mbr-completion.test.tsx` (inject mock) + buat [strategy/__tests__/[id].test.tsx](../mobile/src/app/(app)/strategy/__tests__): `[G3]` orb header ≡ kartu untuk attainment ≤100%; **`[G3-over]` over-achiever (numeric_total 120/target 100): orb header "Capaian 100 persen" (clamp) sementara badge kartu "Capaian vs Target" tetap "120%" (eksak) — DISENGAJA (FR-15b), keduanya "Capaian"**; `[G4]` kualitatif → Progress saja. → merah.
- **GREEN-5b** — [strategy/[id].tsx](../mobile/src/app/(app)/strategy/[id].tsx): orb header pakai `useCardProgress([id])` (= attainment RPC ter-clamp); badge kartu "Capaian vs Target" TETAP `computeKpiGap.percent` eksak (boleh >100); kualitatif → label "Progress". **Jangan clamp badge kartu** (over-achievement adalah info).

### Increment 6 — refactor + gate
- Refactor duplikasi (helper `setOrb`, shared mock). Jalankan `npm test` (target hijau + net-baru), `npm run type-check`, `npm run lint`. Jalankan contract SQL manual. Verifikasi nomor migrasi 0070 saat merge (repo pernah tabrakan paralel).

---

## 2. Inventaris Test

| File | Aksi | Case |
|---|---|---|
| `supabase/tests/0070_goal_attainment_contract.sql` | baru | 17 (shape, mean, not-weighted, exclude-kualitatif, nol-terukur, no-value 0%, target=0 guard, clamp-before-mean, cross-org, per-role no-leak, invoker+search_path, ACL anon/authenticated, view invoker, 6-branch verbatim, **[15] value_type currency/percentage ikut numeric_total & boolean/text/option TIDAK**, **[16] Strategi terukur archived/draft dikecualikan dari mean (Goal semua-terukur-archived/draft → is_measured=false, O4)**, **[17] Goal campuran penuh: terukur-aktif + kualitatif + terukur-archived + terukur-draft → mean hanya atas terukur active/done**) |
| `mobile/src/lib/__tests__/workspace-progress.test.ts` | update | treeOrbLabel (flip 3 + tabel baru), fetchCardProgress (shape+coercion+clamp) |
| `mobile/src/lib/__tests__/progress.test.ts` | tambah | `measuredStrategiesSublabel` ×5 |
| `mobile/src/hooks/__tests__/use-workspace.test.tsx` | update | `[P8][P9][P10]` + ubah `[P1][P3][P3b][P4][P5]` |
| `mobile/src/hooks/__tests__/use-repeat-instances.test.tsx` | tambah | `useInstanceReview` `[R1..R4]` |
| `mobile/src/components/__tests__/progress-orb.test.tsx` | baru | `[FR16-1][FR16-2][FR18-1]` |
| `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx` | tambah | `[FR13-1..5]` + default mock +measuredOf |
| `mobile/src/app/(app)/goal/__tests__/[id].test.tsx` | baru | `[G2][G1][G-KUAL][D1][D3][MetaGrid]` |
| `mobile/src/app/(app)/strategy/__tests__/[id].test.tsx` | baru | `[G3][G4]` |

---

## 3. Risiko & Mitigasi
1. **DROP+CREATE reset ACL / hilang invoker** — GREEN-0 wajib `SECURITY INVOKER` eksplisit + `REVOKE PUBLIC,anon` + `GRANT authenticated`; dikunci contract `[11][12]`.
2. **Drift 6 cabang `child_status`** — salin verbatim 0046; contract `[14]` (termasuk `problem_statement→action_plans` via `problem_statement_id`).
3. **Contract SQL nol proteksi CI (O3)** — jalankan manual tiap perubahan skema; pertimbangkan wire advisor/pgTAP (task infra terpisah).
4. **9+ assertion existing merah** (workspace-progress.test.ts + use-workspace.test.tsx `[P1..P5]`) — bagian dari RED yang direncanakan, bukan regresi.
5. **Screen suite crash tanpa default `measuredOf`** — update mock default [workspace.test.tsx:210-212](../mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx) **DAN** [goal/__tests__/detail.test.tsx](../mobile/src/app/(app)/goal/__tests__/detail.test.tsx) + [strategy/__tests__/mbr-completion.test.tsx](../mobile/src/app/(app)/strategy/__tests__/mbr-completion.test.tsx) (inject `useCardProgress`) sebelum RED-4/5 — kalau tidak, crash bukan merah bersih (M1).
6. **Rekonsiliasi detail hanya black-box** — bukti orb≡kartu bersandar keduanya menarik dari `useCardProgress` sama; test memaksa nilai RPC menang atas `ratioDoneOfChildren`. Untuk >100% orb & kartu SENGAJA divergen (FR-15b).
7. **Per-role leak test butuh lever RLS konkret** (contract `[10]`) — pilih mekanisme visibility eksisting (pic/departemen/confidential); varian ringan AC-E4 (task-value tak visible → NULL→0%) bila two-role seed berat.
8. **Ekstraksi `useInstanceReview` jangan regresi [instance-detail.test.tsx](../mobile/src/app/(app)/task/instance/__tests__/instance-detail.test.tsx)** (menguji `reviewInstanceSubmission` dipanggil) — screen harus tetap memanggilnya via hook; jaga suite ini hijau.
9. **`tsc` merah di antara Increment 0→1** (sebelum regen types `--local`) adalah normal TDD, bukan regresi — jangan "perbaiki" prematur.

---

## 4. Handoff eksekusi
Mulai Increment 0 (contract merah → migrasi hijau → regen types), lalu 1→5 bottom-up, tutup dengan Increment 6 (gate hijau + contract manual). `computeKpiGap` & `goals` schema **tidak** disentuh (Non-Goals). Home `listGoalNeedsAttention` **OUT of V1**.
