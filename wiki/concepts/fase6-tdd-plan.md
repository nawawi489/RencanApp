# Rencana TDD — Fase 6 Development Workspace

Sumber kebenaran: `wiki/concepts/fase6-spec.md` (AC, DC-1..DC-21, EE-1..EE-10, K1..K9).
Migration target: `supabase/migrations/0012_fase6_development_workspace.sql`.
Disiplin: thick DB / thin client, red→green→refactor, satu test merah dulu lalu hijaukan.

---

## 1. Ringkasan Fitur

Fase 6 menambahkan jalur perencanaan kedua (Development) paralel dengan Performance:

- **DB**: tabel `development_areas` (root, mirror Goal) + `problem_statements` (child, mirror Strategy, FK `ON DELETE RESTRICT`); kolom `initiatives.problem_statement_id` (FK `ON DELETE SET NULL`) + CHECK `initiatives_single_parent` (strategy_id XOR problem_statement_id).
- **RLS + helper**: 8 helper SECURITY DEFINER (`is_development_area_pic`, `development_area_in_my_org`, `development_area_has_my_descendant`, `is_problem_statement_pic`, `problem_statement_in_my_org`, `problem_statement_has_my_descendant`, `can_access_development_area`, `can_access_problem_statement`, plus `i_am_problem_statement_pic_via_initiative` untuk action_plans). SELECT policy pakai INLINE kolom + helper yang query tabel LAIN (hindari 42501 INSERT...RETURNING).
- **RPC**: `activate_development_area`, `activate_problem_statement`; extend `activate_initiative` (+`is_problem_statement_pic`), `can_access_initiative` (+development chain).
- **MBR flip**: hapus early-return baris 182-184 di `check_minimum_breakdown_compliance`, tambah 2 cabang; extend trigger `tg_enforce_mbr_block_child` (baris 310 jadi `strategy_id null AND problem_statement_id null`, CASE expr, cabang problem_statements, trigger baru) + pasang ke problem_statements.
- **Seed**: `card_guidance_contents` idempoten (development_area, problem_statement). 7 DA TIDAK di-seed.
- **Mobile**: `development-areas.ts` (mirror goals.ts), `problem-statements.ts` (mirror strategies.ts), extend `cards.ts` (NewInitiative.problem_statement_id + listInitiatives.problemStatementId), `workspace-copy.ts` (WS_DEV_COPY), hooks baru di `use-workspace.ts`, dual-tab `workspace.tsx`, 4 route CRUD.
- Regenerasi `database.types.ts`.

## 2. Daftar File Test

| Layer | File test | Status |
|---|---|---|
| DB contract | `supabase/tests/fase6_development_workspace_contract.sql` | baru |
| Data layer cards | `mobile/src/lib/__tests__/cards.test.ts` | extend |
| Data layer DA | `mobile/src/lib/__tests__/development-areas.test.ts` | baru |
| Data layer PS | `mobile/src/lib/__tests__/problem-statements.test.ts` | baru |
| Copy const | `mobile/src/lib/__tests__/workspace-copy.test.ts` | baru (atau extend) |
| Hooks | `mobile/src/hooks/__tests__/use-development-workspace.test.tsx` | baru |
| Hooks MBR (dev types) | `mobile/src/hooks/__tests__/use-mbr.test.tsx` | extend |
| Hooks permission | `mobile/src/hooks/__tests__/use-profile.test.tsx` | extend/baru |
| UI dual-tab | `mobile/src/app/(app)/(tabs)/__tests__/workspace-dual-tab.test.tsx` | baru |
| UI routes (DA/PS new+detail) | `mobile/src/app/(app)/development-area/__tests__/*.test.tsx`, `problem-statement/__tests__/*.test.tsx` | baru (opsional di iterasi UI) |

## 3. Urutan Langkah Red → Green → Refactor

Prinsip: kontrak server (DB) lebih dulu karena data layer + hooks + UI bergantung padanya. Tiap blok ditulis red dulu, lalu dihijaukan dengan implementasi minimal.

### Blok A — DB schema + constraint (DC-1, DC-2, DC-3)
- A1 (red) tulis TEST schema di `fase6_development_workspace_contract.sql`: tabel ada, kolom kanonik, CHECK period_order, FK restrict PS→DA, kolom `initiatives.problem_statement_id`, CHECK `initiatives_single_parent` menolak dua-parent.
- A2 (green) tulis bagian CREATE TABLE + ALTER + index + trigger `set_updated_at`/`log_card_creation` di `0012_*.sql`; apply migration; jalankan kontrak → PASS.
- A3 (refactor) rapikan urutan DDL, komentar, idempotensi `create table if not exists`.

### Blok B — Helper functions + RLS (DC-4, DC-5, DC-6, DC-7, DC-8)
- B1 (red) TEST RLS di kontrak: SELECT DA (PIC DA lihat; non-PIC tidak kecuali view_all); SELECT PS (PIC DA via `is_development_area_pic`, PIC PS, descendant); INSERT DA butuh `create_development_area`; INSERT PS butuh PIC DA atau permission; lintas-org ditolak; `initiatives_select` extended (PIC PS lihat Initiative dev); `action_plans_select` extended (PIC PS via initiative).
- B2 (green) tulis 8 helper + `i_am_problem_statement_pic_via_initiative`, REVOKE EXECUTE; RLS policies (inline + helper tabel-lain); drop+recreate `initiatives_select` & `action_plans_select`. Apply, jalankan → PASS.
- B3 (refactor) konsolidasi pola helper, pastikan null-safety `*_in_my_org` (null→true).

### Blok C — RPC lifecycle + can_access + activate_initiative (DC-9, DC-10, DC-13, DC-14)
- C1 (red) TEST RPC: `activate_development_area` (not found / unauthorized / incomplete / sudah aktif / sukses→active+write_activity); `activate_problem_statement` idem + jalur PIC DA; `activate_initiative` jalur PIC PS; `can_access_initiative` true untuk PIC PS via chain.
- C2 (green) tulis 2 RPC baru + extend `activate_initiative` dan `can_access_initiative`. Apply → PASS.
- C3 (refactor) samakan pesan error Indonesia + pola gate dengan activate_kpi_area.

### Blok D — MBR flip (DC-11, DC-12, FR-6, K9)
- D1 (red) TEST MBR: `check_minimum_breakdown_compliance('development_area', id)` tidak lagi kosong (return count + mode); idem `problem_statement`; trigger problem_statements menolak saat mode blokir_akses_turunan & sibling<min; Initiative dengan problem_statement_id ikut enforcement (CASE route ke problem_statement_id); backward-compat: Initiative datar (dua null) lewati, Performance (strategy_id) tak terpengaruh.
- D2 (green) hapus early-return 182-184; tambah 2 cabang; ubah baris 310 jadi `strategy_id is null and problem_statement_id is null`; tambah cabang `problem_statements`; perluas CASE; buat trigger `problem_statements_enforce_mbr`. Apply → PASS.
- D3 (refactor) verifikasi tidak ada regresi pada suite Fase 5.

### Blok E — Seed + codegen (DC-15, DC-21)
- E1 (green) INSERT idempoten `card_guidance_contents` (development_area, problem_statement). Verifikasi via kontrak (where not exists).
- E2 (green) regen `database.types.ts` (`supabase gen types typescript`) → muncul `development_areas`, `problem_statements`, `initiatives.problem_statement_id`. (Tanpa codegen, test data layer TS tak compile.)

### Blok F — Data layer cards.ts (DC-18) — RED list "Data layer"
- F1 (red) extend `cards.test.ts`: listInitiatives problemStatementId 'ps1'→`.eq`; null→`.is`; tanpa opts & `{}` tak filter; propagasi error; createInitiative passthrough problem_statement_id ('ps1' / null eksplisit / absen→tidak ada field).
- F2 (green) tambah `problem_statement_id?: string | null` ke `NewInitiative`; di `listInitiatives` tambah cabang `opts.problemStatementId !== undefined` (eq/is) sejajar strategyId.
- F3 (refactor) hindari duplikasi cabang filter; pastikan strategyId & problemStatementId saling eksklusif secara kontrak.

### Blok G — Data layer development-areas.ts + problem-statements.ts (DC-16, DC-17)
- G1 (red) `development-areas.test.ts`: listDevelopmentAreas embedded count (`*, problem_statements(count)`, order desc), getDevelopmentArea single, createDevelopmentArea (org dari profiles + created_by + insert+select.single), activateDevelopmentArea rpc('activate_development_area', {p_development_area_id}). Plus propagasi error.
- G2 (red) `problem-statements.test.ts`: listProblemStatements('')→[] tanpa query; listProblemStatements('da1')→`.eq('development_area_id','da1').order(asc)`; getProblemStatement single; createProblemStatement (insert development_area_id+org+created_by); activateProblemStatement rpc.
- G3 (green) tulis kedua modul mirror goals.ts/strategies.ts byte-for-byte (ganti tabel/kolom/RPC).
- G4 (refactor) re-export STATUS_TONE/PLANNING_STATUS_LABEL tanpa duplikasi nilai.

### Blok H — workspace-copy WS_DEV_COPY (DC-19)
- H1 (red) test keys WS_DEV_COPY (subtitle, sectionDevAreas, btnDevAreaBaru, problemCount(n) fungsi→string, emptyDevAreaTitle, emptyDevAreaDescCan, emptyDevAreaDescView).
- H2 (green) tambah konstanta sesuai DC-19.

### Blok I — Hooks (use-development-workspace.test.tsx [1]-[8], use-mbr [9]-[10], use-profile [11])
- I1 (red) tulis `use-development-workspace.test.tsx` cases [1]-[8] (mock `@/lib/development-areas` & `@/lib/problem-statements`).
- I2 (green) tambah di `use-workspace.ts`: `useDevelopmentAreas`, `useDevelopmentArea(id)`, `useProblemStatements(devAreaId)`, `useProblemStatement(id)`, `useDevelopmentAreaActions`, `useProblemStatementActions(devAreaId)` — query keys terkunci, enabled gate, invalidasi sesuai kontrak.
- I3 (red) extend `use-mbr.test.tsx` [9]-[10]: useMbrCompliance('development_area',id) meneruskan compliance riil (is_compliant=false saat child 0); ('problem_statement',id) fail-open pending + refetch.
- I4 (green) hook generik sudah ada; yang membuat [9] hijau adalah flip RPC (Blok D) — pastikan mock memodelkan pasca-flip; tidak ada perubahan kode hook (regression guard). Bila perlu, verifikasi CardType sudah memuat dev types (sudah ada).
- I5 (red) extend `use-profile` test [11]: can('create_development_area') true hanya ceo; false c_level/management tanpa grant; true bila permissionKeys memuat grant.
- I6 (green) tidak menambah `create_development_area` ke ROLE_DEFAULTS (biarkan default false); test mengunci keputusan.

### Blok J — UI dual-tab workspace (DT-1..DT-7)
- J1 (red) `workspace-dual-tab.test.tsx` DT-1..DT-7 (mock `@/hooks/use-workspace`, `@/hooks/use-profile`, `expo-router`, import WS_COPY+WS_DEV_COPY).
- J2 (green) refactor `workspace.tsx` jadi SegmentedControl Performance/Development; default Performance; render daftar DA (lazy PS), empty/loading/error states; gating tombol via can('create_development_area'); useFocusEffect refetch goals+flat+devAreas; isolasi error antar tab.
- J3 (refactor) ekstrak komponen DevelopmentAreaRow sejajar GoalRow.

### Blok K — UI routes CRUD (DC-20)
- K1 (red) test new.tsx & [id].tsx untuk DA & PS (form fields, validasi YYYY-MM-DD + period_end>=start, PIC prefill induk, navigasi, MBR indicator + guardMbrActivation, ErrorState/Alert).
- K2 (green) tulis 4 route mirror goal/kpi-area/strategy.
- K3 (refactor) reuse GuidanceNote/SectionCard/MetaGrid.

## 4. Risiko

(lihat field risks)

## 5. Addendum Kritik (verdict: perlu-perbaikan)

Audit kelengkapan menemukan gap berikut — wajib ditutup sebelum/saat menulis test merah. Nomor ditambahkan ke daftar test blok terkait.

### 5a. Test case yang hilang (tambahkan ke Blok terkait)

- **MC-1** DB: INSERT-then-RETURNING (.insert().select().single()) untuk development_areas DAN problem_statements oleh PIC/creator — ini gotcha 42501 yang justru jadi alasan utama 'inline kolom di SELECT policy'. Plan menyebutnya sebagai risiko tapi TIDAK ada case eksplisit di daftar test DB. Tanpa ini, regresi 42501 (MEMORY rls-insert-returning-gotcha) lolos.
- **MC-2** DB MBR fail-open-tanpa-rule: check_minimum_breakdown_compliance baris 224-234 mengembalikan required_count=0 + meets_requirement=true bila current_minimum_breakdown_rule() null. Tidak ada case yang menguji cabang development_area/problem_statement saat rule TIDAK ada (mis. org menghapus seed) → harus tetap fail-open, bukan exception. Daftar test hanya mengasumsikan seed 1/1 selalu ada.
- **MC-3** DB trigger CASE: tidak ada case yang menguji Initiative dengan KEDUA strategy_id & problem_statement_id null tetapi di-INSERT ke tabel initiatives saat rule strategy→initiative ATAU problem_statement→initiative ber-mode blokir_akses_turunan — yakni bukti bahwa Initiative datar benar-benar bypass (return new di baris 310 yang diubah) untuk KEDUA cabang, bukan cuma satu.
- **MC-4** DB activate_*: tidak ada case mode 'blokir_aktivasi' untuk activate_development_area / activate_problem_statement. Spec DC-9 menyisakan gate 'inline atau via helper' tanpa keputusan; risks#10 mengakui ini tapi tak ada test yang mengikat perilaku gate. Saat org set mode blokir_aktivasi & DA belum punya PS, apakah RPC menolak? Tidak teruji → keputusan implementasi tak terkunci.
- **MC-5** DB lifecycle status: tidak ada case archived. Apakah problem_statement ber-status archived dihitung sebagai descendant di problem_statement_has_my_descendant / development_area_has_my_descendant? Spec check_mbr memakai status<>'archived' untuk count, tapi helper visibility chain tidak menyebut filter status. Initiative/AP archived bisa membocorkan visibilitas DA ke user yang seharusnya tak lagi punya akses.
- **MC-6** DB FK ON DELETE RESTRICT (DC-2 / K1): tidak ada case yang menguji DELETE development_area yang punya problem_statement child → harus gagal (foreign_key_violation). EE-8 menyebut 'arsip bukan delete' tapi RESTRICT itu sendiri tidak punya test.
- **MC-7** DB can_access_initiative divergence: migrasi 0008 L40-50 mencatat 'DB dev TIDAK punya can_access_initiative (Fase 1 deployed memakai initiative_has_my_action_plan)'. DC-13 meng-ALTER can_access_initiative dengan asumsi fungsi ada & berbentuk seperti migration source. Tidak ada case yang memverifikasi bentuk fungsi yang BENAR-BENAR ter-deploy sebelum di-extend — risiko mengedit fungsi yang berbeda dari yang dipakai RLS.
- **MC-8** DB notifications/comments untuk Development Initiative: EE-9 mengklaim chat room & notifications jalan untuk Development Initiative tanpa perubahan, tapi tidak ada contract test yang membuktikan trigger initiative_chat_room (0008) fires saat Initiative ber-problem_statement_id diaktifkan, maupun bahwa can_access_initiative (dipakai inbox/comments Fase 3) mengizinkan PIC PS.
- **MC-9** Data layer: createDevelopmentArea/createProblemStatement mirror goals.ts yang punya guard `if (!uid) throw` & `if (!profile?.organization_id) throw` — TAPI createInitiative TIDAK. Tidak ada case yang menguji jalur guard ini (getUser→null user, atau profile.organization_id null) untuk modul baru; kalau benar-benar mirror goals.ts, dua branch throw itu wajib punya test.
- **MC-10** Data layer cards: tidak ada case mutual-exclusivity di sisi klien — createInitiative dengan strategy_id DAN problem_statement_id keduanya non-null. Walau CHECK ada di DB, daftar test DC-18 tak mengikat bahwa klien meneruskan keduanya apa adanya (membiarkan server menolak) vs. memvalidasi lebih dulu.
- **MC-11** Hooks: case [9]/[10] memverifikasi useMbrCompliance untuk tipe dev, tetapi TIDAK ada case yang mengikat invalidasi ['mbr_compliance','development_area',id] / ['mbr_compliance','problem_statement',id] saat createProblemStatement / createInitiative dev sukses. Tanpa ini, indikator Kelengkapan Perencanaan di UI tidak refresh setelah menambah child (regresi UX MBR).
- **MC-12** UI workspace.test.tsx EXISTING (Fase 4) akan PECAH: mock factory `jest.mock('@/hooks/use-workspace')` di file itu hanya mengekspor useGoals/useFlatInitiatives/useKpiAreas. Setelah refactor dual-tab, workspace.tsx memanggil useDevelopmentAreas → 'undefined is not a function'. Plan membuat file BARU (workspace-dual-tab.test.tsx) tapi tidak menyebut memperbarui/menggabungkan workspace.test.tsx. Harus ada langkah eksplisit memperbarui test lama.
- **MC-13** UI routes: tidak ada case period_start kosong tapi period_end terisi (atau sebaliknya) → validasi YYYY-MM-DD vs CHECK period_order parsial. Juga tidak ada case PIC prefill saat induk (DA) ber-pic_id null → default PIC turunan 'ikut induk' jadi apa? FR-5.1 default ikut induk; kalau induk null, fallback ke diri sendiri (US-6.01) tidak teruji.
- **MC-14** UI: tidak ada case deep-link PGRST116 untuk problem-statement/[id] (hanya disebut umum di EE-4). Dan tidak ada case Alert anti-self-approval pada Action Plan Development (EE-4 reuse Fase 1) untuk membuktikan jalur Development benar-benar memakai infrastruktur yang sama.

### 5b. Concern desain/strategi (kunci keputusan sebelum green)

- **CN-1** Urutan dependensi keras yang diakui plan (risks#1) sebenarnya lebih parah: SELURUH red test data-layer & UI (Blok F-K, langkah 11-28) TIDAK bisa di-compile sebelum database.types.ts diregenerasi (langkah 10), yang butuh migrasi ter-apply ke Supabase. Ini bukan 'red-green' murni — ini 'apply DB dulu, baru bisa nulis red test TS'. Disiplin TDD red-first untuk layer TS hanya bisa ditegakkan jika tim menerima augmentasi tipe sementara, yang tak disebut di steps. Realistis: langkah 1-10 adalah satu gelombang 'green DB' tanpa red TS murni.
- **CN-2** Strategi mock untuk createDevelopmentArea/createProblemStatement KURANG presisi vs realita kode. cards.test.ts setup() me-route mockFrom by table (profiles vs initiatives) dan mengandalkan mockGetUser. Jika modul baru benar mirror goals.ts, ia juga memanggil getUser DAN punya guard throw — mock di plan (mocking_strategy poin 2) menyebut route by table tapi tidak menyebut bahwa profiles builder HARUS mengembalikan {organization_id:'org1'} via .single() ATAU guard `!profile?.organization_id` melempar 'Organization not found' dan test create gagal bukan karena logika tapi karena mock kurang. Perlu eksplisit.
- **CN-3** Mock useMbrCompliance [9] hanya merepresentasikan BENTUK pasca-flip; hook generik tidak berubah. Artinya case [9]/[10] adalah regression-guard yang lewat HANYA karena mock mengembalikan is_compliant:false — ia tidak benar-benar membuktikan early-return RPC dihapus. Sumber kebenaran SATU-SATUNYA untuk flip adalah DB contract (Blok D). Bila DB contract D tidak menguji 'compliance dev tidak lagi kosong + meets_requirement mencerminkan child_count nyata', flip bisa salah dan [9] tetap hijau (false green). Plan menyadari ini (risks#2) tapi tidak menjadikan D1 case yang cukup spesifik.
- **CN-4** jest-expo + react-native-css/components: workspace.tsx & route detail meng-import dari 'react-native-css/components' dan Alert dari 'react-native'. UI test mengandalkan getAllByLabelText('Memuat…') untuk SkeletonList & findByText('Gagal memuat') untuk ErrorState — string ini berasal dari komponen @/components/ui, BUKAN dari screen. Bila pola SegmentedControl baru tidak memakai komponen ui yang sama, label a11y bisa berbeda; mock-level di plan (mock hooks bukan styling) realistis, tapi SegmentedControl/Tab perlu accessibilityRole/label yang ditest belum didefinisikan di copy/komponen manapun (WS_DEV_COPY tak punya label tab 'Performance'/'Development' — DT-1 query literal 'Performance'/'Development', bukan konstanta). Ini melanggar aturan 'test rujuk konstanta' yang dipakai file lain.
- **CN-5** Gate MBR di activate_development_area/activate_problem_statement: spec DC-9/DC-10 yang dikutip TIDAK menyertakan blok gate (hanya komentar '-- MBR gate ... inline atau via helper'). Implementor bisa lupa memasang gate sama sekali dan semua test tetap hijau karena tidak ada case mode blokir_aktivasi. Keputusan harus dikunci sebelum green (konsisten activate_kpi_area), bukan disisakan ambigu.
- **CN-6** DT-7/EE-7 'fetch independen per tab': useDevelopmentAreas dipanggil di level screen (selalu mount) berarti query Development jalan walau tab Performance aktif. Itu kontra 'lazy per tab' yang mungkin diinginkan, tapi DT-6 (error Performance tak blok Development) JUSTRU butuh keduanya selalu ter-mount. Ada tegangan desain antara 'lazy' (hemat) vs 'selalu fetch' (isolasi error) yang plan tidak resolve eksplisit — implementor bisa pilih lazy dan menggagalkan DT-6, atau selalu-fetch dan boros. Perlu keputusan.
- **CN-7** Permission server-side: T4/FR-1.3 mengharuskan has_permission() server hardcode CEO-only untuk create_development_area. Plan langkah 22 hanya memastikan ROLE_DEFAULTS klien TIDAK memuatnya, dan [11] hanya menguji can() klien. Tidak ada langkah/test yang memverifikasi has_permission() DI SERVER (RLS INSERT DA) menolak C-Level tanpa grant via 42501. Langkah 4 menyebut RLS INSERT 'butuh create_development_area' tapi daftar test DB tidak punya case spesifik 'C-Level tanpa grant INSERT DA ditolak 42501' vs 'C-Level dengan grant berhasil'. Ini governance-critical.
- **CN-8** problem_statement_in_my_org null-safe (null→true) WAJIB benar atau SEMUA INSERT/UPDATE Performance Initiative (problem_statement_id null) gagal. Plan menyebut null-safety (B3, DC-4) tapi daftar test DB tidak punya case eksplisit 'Initiative Performance (problem_statement_id null) INSERT tetap lolos setelah problem_statement_in_my_org ditambah ke initiatives_insert WITH CHECK'. Ini regresi katastrofik bila helper null-unsafe; harus jadi case backward-compat wajib.
