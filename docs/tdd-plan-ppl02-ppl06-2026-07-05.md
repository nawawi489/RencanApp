# TDD Plan — PPL-02 & PPL-06 (People tab structure + People Profile completeness)

**Tanggal:** 2026-07-05
**Branch target:** fix/darkmode-a11y-consistency (atau branch turunan `feat/ppl-02-ppl-06`)
**Spec ref:** `docs/spec-ui-testfix-2026-07-05.md` §PPL-02, §PPL-06, §8 RESOLVED (OQ-5/6/7/9)
**Owner decisions terpakai:** OQ-5 (cross-user history in-scope RLS-gated), OQ-6 (Kontribusi = count AP completed periode aktif), OQ-7 (Quarter=placeholder DEFER), OQ-9 (Admin tab = entry-point ke layar admin eksisting, gate `manage_score_formula`).
**Tidak ada migrasi DB baru.** RLS 0013:799–815 sudah menutupi visibility (self | manage_score_formula | view_all_workspace | is_supervisor_of).

---

## 1. Ringkasan fitur

### PPL-02 — People screen tab structure
- People screen (`mobile/src/app/(app)/people.tsx`) yang saat ini berupa satu FlatList direfaktor menjadi tab structure dengan 4 tab: **Bulan ini · Quarter · Ranking · Admin**.
- **Bulan ini** = konten periode aktif eksisting (Skor saya · roster · search · ScoreLegend).
- **Quarter** = placeholder GuidanceNote "Laporan quarterly menyusul" (DEFER per OQ-7).
- **Ranking** = daftar `ranking_snapshots` dari periode closed terbaru (D9). Empty-state saat belum ada periode tertutup.
- **Admin** = daftar entry-point ke layar admin eksisting (misal `/settings-score-formula`). Tab ini hanya tampil untuk viewer dengan permission `manage_score_formula`.

### PPL-06 — People Profile completeness
- Profil (`mobile/src/app/(app)/people-profile/[id].tsx`) memperoleh:
  1. **Not-found state** saat deep-link `id` invalid (tidak lagi header blank).
  2. **Section "Kontribusi bulan ini"** = count Action Plan status='done' yang deadline-nya berada di window periode aktif (OQ-6).
  3. **Riwayat/tren skor cross-user** via hook baru `useUserScoreHistory(userId)` yang membungkus `listUserScoreHistory(userId)` (RLS-gated). Menggantikan pola sparkline yang saat ini hanya render untuk self.
  4. **Anti-self override** (D10) tetap berjalan: tombol Override tidak muncul untuk profil diri sendiri walaupun `manage_score_formula=true`.

---

## 2. Daftar file test yang dikerjakan

| Layer | File test | Kasus baru |
|---|---|---|
| data | `mobile/src/lib/__tests__/people-score.test.ts` | 11 (D1–D6 listUserScoreHistory, D7–D11 countCompletedActionPlansInPeriod) + 2 (PEOPLE_TAB_COPY) |
| hooks | `mobile/src/hooks/__tests__/use-people-score.test.tsx` | 5 (useUserScoreHistory ×4, invalidasi useScoreOverride ×1) |
| ui | `mobile/src/app/(app)/__tests__/people.test.tsx` | 8 (PPL-02-1..PPL-02-8) |
| ui | `mobile/src/app/(app)/__tests__/people-profile.test.tsx` | 7 (PPL-06-1..PPL-06-7) |

Total: **33 kasus test** baru. Tidak ada perubahan skema DB; tidak ada file di `supabase/migrations/` yang di-touch.

---

## 3. Urutan red → green → refactor

### Fase A. Data layer (people-score + cards)
1. **RED** — Tulis 13 kasus data di `people-score.test.ts`.
   - D1–D6: kontrak `listUserScoreHistory(userId, limit?)` — guard input, query shape, RLS graceful [], limit param, propagasi error, tidak panggil `auth.getUser`.
   - D7–D11: kontrak `countCompletedActionPlansInPeriod(userId, period)` — count 3 done, guard periode null, filter window `gte/lte(deadline)`, null-safe → 0, propagasi error.
   - PEOPLE_TAB_COPY: 4 label locking + `quarterlyPlaceholder` copy.
   - Jalankan `npm test -- people-score` → semua fail (TypeError undefined).
2. **GREEN** — Implementasi minimal di `mobile/src/lib/people-score.ts`:
   - `listUserScoreHistory` dengan guard, query `user_score_results` (`.eq('user_id', userId).eq('is_current', true).order('period_start', { ascending:false, foreignTable:'period_snapshots' }).limit(limit)`), throw pada error.
   - Konstanta `PEOPLE_TAB_COPY` (monthly/quarterly/ranking/admin/quarterlyPlaceholder).
3. **GREEN** — Implementasi `countCompletedActionPlansInPeriod` di `mobile/src/lib/cards.ts`: guard `!period → 0`, query `action_plans.eq('pic_id', userId).eq('status', 'done').gte('deadline', period.period_start).lte('deadline', period.period_end)`, return `data?.length ?? 0`, throw pada error.

### Fase B. Hooks layer
4. **RED** — Tambah 5 kasus di `use-people-score.test.tsx`:
   - `useUserScoreHistory('', 6)` → tidak fetch, history=[].
   - `useUserScoreHistory('u2', 6)` → fetch, queryKey `['user_score_history','u2',6]`.
   - `useUserScoreHistory` RLS deny (mock resolve []) → history=[], isError=false.
   - Default `limit=6` saat argumen tak diberi.
   - `useScoreOverride(...).override(...)` → `invalidateQueries` mencakup `{ queryKey: ['user_score_history'] }`.
5. **GREEN** — Implementasi `useUserScoreHistory` di `use-people-score.ts` dengan pola sama seperti `useMyScoreHistory` (`useQuery` + `enabled: !!userId` + fallback `data ?? []`). Perluas `useScoreOverride` mutation `onSuccess` untuk `invalidateQueries({ queryKey: ['user_score_history'] })` (tambahan, existing invalidations tetap dipertahankan).

### Fase C. UI — People screen (PPL-02)
6. **RED** — Tulis 8 kasus di `people.test.tsx` (PPL-02-1..PPL-02-8). Mock:
   - `@/hooks/use-people-score`, `@/hooks/use-workspace`, `@/hooks/use-profile`, `expo-router`.
   - Wrap `PeriodFocusProvider now={new Date(2026,6,5)}` + `QueryClientProvider`.
   - Setup default: `useActivePeriod` → periode Q1 aktif, `useMyScore` → skor 75, roster 1 orang.
7. **GREEN** — Refactor `people.tsx`:
   - Tambah state `activeTab` default `'monthly'`.
   - Tablist header 4 Pressable dengan `accessibilityRole='tab'` dan `accessibilityState={{ selected: activeTab===key }}`, label dari `PEOPLE_TAB_COPY`.
   - Gate Admin tab: `can('manage_score_formula')` (dari `useProfile()`), tab tak dirender jika false.
   - Konten per tab:
     - `monthly` = konten eksisting (Skor saya card · search TextInput · roster FlatList · ScoreLegend).
     - `quarterly` = `<GuidanceNote>{PEOPLE_TAB_COPY.quarterlyPlaceholder}</GuidanceNote>`.
     - `ranking` = `useLatestClosedPeriod` + `useRanking(periodId)`; jika `period===null` → GuidanceNote "Belum ada periode tertutup"; jika ada → daftar `{rank_number, full_name, score}` dengan `accessibilityLabel='Score X · <band>'`.
     - `admin` = daftar Pressable ke rute admin eksisting (mis. `/settings-score-formula`) — gunakan konstanta `ADMIN_TAB_ENTRIES` yang ditambahkan di people-score.ts saat refactor.
   - Verifikasi anti-regresi search + roster tetap di tab `monthly` default.

### Fase D. UI — People Profile (PPL-06)
8. **RED** — Tulis 7 kasus di `people-profile.test.tsx` (PPL-06-1..PPL-06-7). Mock hook baru `useUserScoreHistory`, mock query kontribusi (via `countCompletedActionPlansInPeriod` di data layer atau via wrapper hook `useContribution`).
9. **GREEN** — Refactor `people-profile/[id].tsx`:
   - **Not-found**: setelah `profilesLoading===false` dan `person==null`, return komponen `NotFound` dengan copy "Anggota tidak ditemukan" (SectionCard sederhana, bukan blank).
   - **Kontribusi bulan ini**: `useQuery({ queryKey:['contribution', person?.id, activePeriod?.id], queryFn:() => countCompletedActionPlansInPeriod(person!.id, activePeriod!), enabled: !!person?.id && !!activePeriod })`. Render:
     - `activePeriod===null` → GuidanceNote "Belum ada periode aktif".
     - `activePeriod!==null` → tampilkan angka (termasuk `0`) di dalam SectionCard "Kontribusi bulan ini".
   - **Tren cross-user**: `const { history } = isSelf ? useMyScoreHistory(6) : useUserScoreHistory(person?.id ?? '', 6);` (jaga rules-of-hooks: panggil keduanya kondisional via wrapper hook `useProfileHistory(personId, isSelf)` atau panggil keduanya + pilih hasil).
     - Render seksi `Tren` **hanya** bila `history.length > 0`. Reverse untuk visualisasi ASC.
     - Kontrak: `history=[]` (RLS deny) → seksi tidak muncul, bukan error.
   - **Anti-self override**: predicate `canManage && !isSelf && activePeriod` **wajib dipertahankan** apa adanya.

### Fase E. Refactor pasca-hijau
10. **REFACTOR** — Ekstrak sub-komponen `PeopleTabs`, `RankingTabContent`, `AdminTabContent`, `QuarterlyPlaceholder` dari people.tsx; ekstrak `ContributionSection`, `TrendSection` dari people-profile. Pindahkan `ADMIN_TAB_ENTRIES` ke `people-score.ts`. Semua test tetap hijau.
11. **REFACTOR** — Jalankan full `npm test` + `npx tsc --noEmit` di `mobile/`. Verifikasi tidak ada regresi 240 test existing.
12. **REFACTOR (docs)** — Update `docs/spec-ui-testfix-2026-07-05.md` (§PPL-02 & §PPL-06 → Resolved) + entry `wiki/log.md` `## [2026-07-05] update | PPL-02 & PPL-06 red-green-refactor`.

---

## 4. Strategi mocking

### 4.1 Data layer (`../supabase`)
```ts
const mockFrom = jest.fn();
const mockGetUser = jest.fn();
jest.mock('../supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    auth: { getUser: (...args: any[]) => mockGetUser(...args) },
  },
}));
```
Reuse `makeQueryThenable({ data, error })` yang sudah ada di `cards.test.ts`. Untuk `.eq` berulang, assert via `(builder.eq as jest.Mock).mock.calls` dengan `arrayContaining`. Untuk `countCompletedActionPlansInPeriod` (D9), buat `gte`/`lte` sebagai `jest.fn().mockReturnThis()` agar argumen tanggal dapat dikunci.

### 4.2 Hooks (`@/lib/people-score`)
```ts
jest.mock('@/lib/people-score', () => ({
  __esModule: true,
  getActivePeriod: jest.fn(),
  getLatestClosedPeriod: jest.fn(),
  getMyScore: jest.fn(),
  getUserScore: jest.fn(),
  listMyScoreHistory: jest.fn(),
  listUserScoreHistory: jest.fn(),
  listRanking: jest.fn(),
  overrideUserScore: jest.fn(),
  // + formula helpers seperti file existing
}));
```
`makeWrapper()` mengembalikan `{ qc, wrapper }` dengan `new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })`. QueryClient fresh per test (bukan modul-level). Untuk invalidation, `jest.spyOn(qc, 'invalidateQueries')` sebelum `act(async () => await result.current.override(...))`.

### 4.3 UI (hooks + expo-router + providers)
```ts
jest.mock('@/hooks/use-people-score', () => ({
  useActivePeriod: jest.fn(),
  useLatestClosedPeriod: jest.fn(),
  useMyScore: jest.fn(),
  useUserScore: jest.fn(),
  useMyScoreHistory: jest.fn(),
  useUserScoreHistory: jest.fn(),
  useRanking: jest.fn(),
  useScoreOverride: jest.fn(() => ({ override: jest.fn() })),
}));
jest.mock('@/hooks/use-workspace', () => ({
  useOrgProfiles: jest.fn(),
}));
jest.mock('@/hooks/use-profile', () => ({
  useProfile: jest.fn(),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: ({ children }: any) => children ?? null },
  Link: ({ children }: any) => children,
}));
```
Wrap render dengan `<PeriodFocusProvider now={new Date(2026,6,5)}><QueryClientProvider client={qc}>{...}</QueryClientProvider></PeriodFocusProvider>`.

### 4.4 Native modules
Verifikasi `jest.setup.js` sudah punya mock untuk `react-native-safe-area-context` dan `@expo/vector-icons` (pola existing). Jika belum, tambahkan mock lokal di file test (Fragment untuk ikon). Tidak perlu env Supabase karena data layer di-mock di level modul.

### 4.5 Guard bersama
- `beforeEach(() => { jest.clearAllMocks(); })` di setiap file test.
- Semua `jest.mock` di top-level file (auto-hoisted).
- Kontrak D6: verifikasi `expect(mockGetUser).not.toHaveBeenCalled()` — RLS satu-satunya gate.

---

## 5. Risiko

1. **RLS tidak dapat di-unit-test**: kontrak SELECT 0013:799-815 hanya di-verifikasi via mock (`data:[]`). Rekomendasikan smoke test integrasi (di luar scope) sebelum ship.
2. **Query shape drift `period_start` via foreignTable**: `.order('period_start', { foreignTable:'period_snapshots' })` mengandaikan join. Jika di masa depan `user_score_results` menyimpan `period_start` langsung, test D2 harus disinkronkan.
3. **`.length` vs `count:'exact'`** di `countCompletedActionPlansInPeriod`: implementasi awal menarik row id semua. Untuk dataset besar, refactor lanjut ke `head:true, count:'exact'` — perlu kasus test baru.
4. **Anti-self override regression** saat menambah cross-user history: predikat `!isSelf` mudah tergelincir hilang. PPL-06-7 dikunci sebagai anti-regresi.
5. **Quarter placeholder DEFER menjadi utang teknis**: tandai `// OQ-7 DEFER` di kode + catat di wiki log.
6. **Admin route hardcode**: `/settings-score-formula` diasumsikan ada. Grep terlebih dahulu di `app/(app)/settings-score-formula*` sebelum implementasi.
7. **Native import di test UI**: SafeAreaProvider / vector-icons harus di-mock global. Jika belum, tambahkan mock lokal supaya RED gagal karena assertion, bukan import.
8. **QueryClient cache bocor**: `makeWrapper()` harus di dalam setiap test, bukan describe-scope.
9. **Kondisi render Tren tunggal**: gunakan hanya `history.length > 0` sebagai penentu; jangan tambahkan permission-check di client (RLS satu-satunya gate).
10. **`database.types.ts` regen**: jika refactor mengubah select columns, mungkin butuh regenerate — flag jika muncul tsc error.

---

## 6. Definition of Done

- 33 test baru hijau (13 data + 5 hooks + 8 UI PPL-02 + 7 UI PPL-06).
- `npm test` full suite hijau (target: 273/273 termasuk 240 lama + 33 baru).
- `npx tsc --noEmit` di `mobile/` bersih.
- Tidak ada file di `supabase/migrations/` yang dimodifikasi.
- `docs/spec-ui-testfix-2026-07-05.md` §PPL-02 & §PPL-06 pindah ke §8 RESOLVED.
- `wiki/log.md` diappend entri `## [2026-07-05] update | PPL-02 & PPL-06 red-green-refactor`.
- Anti-self override tetap berfungsi (PPL-06-7 hijau).
- Manual smoke test: buka People screen sebagai (a) admin dgn `manage_score_formula` — lihat 4 tab; (b) non-admin — lihat 3 tab (tanpa Admin); (c) profil orang lain sebagai supervisor — Tren muncul; (d) profil orang lain sebagai out-of-scope — Tren hilang.

---

## 7. Critic — Audit Kelengkapan & Strategi Mocking

**Verdict:** perlu-perbaikan

### 7.1 Missing cases (21)

- **M1.** PPL-06/Kontribusi + isSelf: viewer melihat profil DIRINYA sendiri tanpa manage_score_formula → seksi 'Kontribusi bulan ini' tetap muncul dengan angka correct (kontrak self-visibility, mirroring RLS action_plans yang selalu izinkan self). Plan hanya menguji cross-user; skenario self di profil sendiri belum di-lock.
- **M2.** PPL-06/Kontribusi cross-user RLS deny: bila viewer di luar scope RLS action_plans (bukan self, bukan manage, bukan supervisor), query `countCompletedActionPlansInPeriod` return 0. UI plan render literal '0' — MISLEADING (viewer mengira target 0 AP done, padahal RLS-hidden). Butuh test yang membedakan 0 nyata vs RLS-deny; atau kontrak keputusan owner untuk kasus ini.
- **M3.** PPL-06/AP deadline null: AP status='done' dengan deadline=null (kolom nullable per pola listActionPlansByPic yang pakai nullsFirst:false). Query .gte('deadline')/.lte('deadline') mengeksklusi row deadline=null. Belum ada test yang mengunci semantik ini; harus dipilih eksplisit: filter by `deadline` (miss null) atau by `completed_at` (semantik 'selesai bulan ini' lebih benar).
- **M4.** PPL-06/AP completed_at vs deadline: OQ-6 tidak jelas — 'AP completed periode aktif' bisa berarti (a) deadline dalam window, (b) completed_at dalam window, (c) updated_at status→done dalam window. Test D9 mengunci ke `deadline`, tapi ini keputusan produk yang berdampak akurasi metric.
- **M5.** PPL-06/D12: listUserScoreHistory dengan limit=0 atau limit negatif — guard input atau propagate ke `.limit(0)`? Belum ditegakkan.
- **M6.** PPL-06/Achievement Score cross-user + Tren rules-of-hooks: pengganti sparkPoints. Memanggil useMyScoreHistory conditional akan crash. Plan menyebut 'panggil keduanya + pilih' tapi tidak ada test yang mengunci bahwa BOTH hooks dipanggil unconditionally (mockUseMyScoreHistory + mockUseUserScoreHistory keduanya harus terpanggil di render, hanya salah satu yang dikonsumsi).
- **M7.** PPL-06/useUserScoreHistory ↔ useScoreOverride race: setelah override skor user target, invalidateQueries harus juga meng-cover ['user_score'] agar Achievement Score card refresh. Existing invalidation ['user_score'] ada, tapi test kombinasi lintas key (user_score + user_score_history + ranking sekaligus) belum ada.
- **M8.** PPL-02/Admin tab role gating multi-permission: plan hanya cek `manage_score_formula`. Admin tab mestinya visible bila viewer punya ≥1 permission dari daftar entry (manage_users_permissions, manage_kpi_area_templates, dst). Skenario viewer punya `manage_users_permissions` tapi tidak `manage_score_formula` — Admin tab visible? Belum locked.
- **M9.** PPL-02/Tab selected state after press: default 'Bulan ini' selected ditest, tapi tidak ada test bahwa `fireEvent.press(quarterTab)` memindah `accessibilityState.selected` ke Quarter dan meng-unselect Bulan ini.
- **M10.** PPL-02/Tab switch preserves state: search text 'rina' di tab Bulan ini → pindah ke Quarter → balik ke Bulan ini → search tetap 'rina' atau reset? Belum ditegakkan.
- **M11.** PPL-02/Ranking tab konten DUPLIKASI dgn Bulan ini: perlu test bahwa Skor saya card TIDAK muncul di tab Ranking (agar tab benar-benar segregatif, bukan concat).
- **M12.** PPL-02/Quarter tab tidak bocor ke default: test bahwa TAB DEFAULT (Bulan ini) tidak accidentally render Quarter placeholder text 'Laporan quarterly menyusul' (regresi lupa switch content by tab).
- **M13.** PPL-02/Loading & Error di dalam tab: bila `useRanking` isLoading=true di tab Ranking, render SkeletonList atau kosong? Bila isError, ErrorState? Plan hanya set default success mocks.
- **M14.** PPL-02/Admin entry list source & order: konstanta `ADMIN_TAB_ENTRIES` — test yang mengunci keys, order, dan filtering per permission belum ada.
- **M15.** Data layer/RLS smoke: RISK-1 mengakui RLS 0013:799-815 tidak diuji unit. Plan tidak menjadwalkan pgTAP/psql smoke — di Rencanapp `supabase/tests/` biasanya ada db-contract test. Ketiadaan smoke = kebocoran risiko real.
- **M16.** listUserScoreHistory select shape: existing listMyScoreHistory pakai `'*, period_snapshots!period_snapshot_id(period_start)'`. Plan D2 tidak mengunci select join tersebut → implementasi minimal bisa lupa join → foreignTable order noop → hasil arbitrary tapi test lolos.
- **M17.** listUserScoreHistory client re-sort safety-net: existing listMyScoreHistory sort client-side setelah query. Plan tidak melakukannya pada listUserScoreHistory → inconsistent behavior + test tidak mengunci urutan hasil bila server order fickle.
- **M18.** PPL-06/isSelf true + Achievement Score null tapi punya history: kontrak render Tren tetap muncul? Belum locked.
- **M19.** PPL-06/deep-link id kosong ('') / undefined: test PPL-06-1 hanya menguji id invalid ('u-tidak-ada'), tidak mengunci mockUseUserScoreHistory tak terpanggil dengan '' saat person=undefined.
- **M20.** PPL-02 Admin tab entry post-press: setelah press entry link, RLS server tetap tegak. Skenario permission dicabut di sesi lain (stale can()): tidak diuji.
- **M21.** PPL-06/Supervisor pathway: is_supervisor_of adalah SATU DARI 4 RLS gate (0013:799-815) dan tidak diuji terpisah dari 'canManage=true'. Kepatuhan RLS supervisor pathway rentan drift.

### 7.2 Concerns pada strategi mocking / semantik (18)

- **C1.** STRATEGI-MOCK-1: makeQueryThenable helper diasumsikan ada di cards.test.ts dan bisa di-reuse dari people-score.test.ts (path berbeda). Bila helper file-local (bukan diekspor), plan D1-D6 dan D7-D11 akan hit TypeError missing import — bukan real RED. Ekstrak helper ke `mobile/src/lib/__tests__/_helpers/query-thenable.ts` sebelum RED, atau duplicate inline.
- **C2.** STRATEGI-MOCK-2: Plan tambah mock `@/hooks/use-profile` di people.test.tsx tapi test existing TIDAK meng-import useProfile. Setelah refactor people.tsx menambah useProfile(), TEST LAMA yang tidak set mockCan menerima undefined can() → crash. Perlu default mock `useProfile: () => ({ profile: null, can: () => false })` di beforeEach untuk cegah cascade regresi.
- **C3.** STRATEGI-MOCK-3: Rules of hooks untuk cross-user Tren — implementasi green harus SELALU panggil useMyScoreHistory dan useUserScoreHistory di setiap render. Untuk profil orang lain, useMyScoreHistory tetap fetch (network waste). Alternatif: wrapper hook `useProfileHistory(personId, isSelf)`. Plan tidak lock via test → developer bisa keliru conditional-call dan test lolos tapi crash produksi.
- **C4.** STRATEGI-MOCK-4: `mockCan.mockReturnValue(true)` di people-profile.test.tsx — perlu verifikasi bahwa file existing sudah punya pola mock useProfile; bila belum, penambahan mock cascade ke test cases existing yang tidak menyediakan can().
- **C5.** SEMANTIC-D9: `.gte('deadline', period.period_start).lte('deadline', period.period_end)` mengeksklusi AP done dengan deadline SEBELUM period_start (late completion). Semantic metric produk mungkin salah. Filter lebih benar: by `completed_at`. Owner OQ-6 harus konfirmasi sebelum lock D9.
- **C6.** SEMANTIC-COUNT: `data?.length ?? 0` menarik semua row id — boros bandwidth. Lebih optimal: `.select('id', {count:'exact', head:true})` + return `count ?? 0`. Test D9 mengunci pola boros — perbaikan future butuh rewrite test.
- **C7.** COVERAGE-RLS: RISK-1 diakui tapi tidak dieksekusi. Untuk kontrak visibility PPL-06 (security boundary), unit test dengan mock tidak cukup. Plan harus menambahkan step wajib pgTAP di `supabase/tests/*.sql` atau `psql --user <role>` smoke sebelum ship.
- **C8.** TAB-A11Y-RN: `accessibilityRole='tab'` di react-native-css Pressable belum tentu forward ke node yg dibaca RNTL `getAllByRole`. RNTL role matcher untuk 'tab' historically fickle. Rekomendasikan uji dengan `getByLabelText` + `accessibilityState.selected` sebagai fallback.
- **C9.** TAB-DEFAULT-CONTENT-LEAK: Bila tab structure diimplementasi dengan CSS display:none (bukan conditional render), RNTL tetap FIND element tab lain → PPL-02-4/5 assertion queryBy toBeNull FALSE POSITIVE. Butuh test eksplisit membedakan mount vs unmount per tab.
- **C10.** PERIOD-FOCUS-PROVIDER: Plan mention `<PeriodFocusProvider now=...>` — tapi people.tsx SAAT INI tidak konsumsi provider ini. Menambah wrapper di test tanpa alasan menambah surface area. Bila implementasi green tidak butuh, hapus dari plan; bila butuh, justifikasi baru.
- **C11.** EXPO-ROUTER-MOCK: Existing people.test.tsx mock `useRouter: () => ({ push: jest.fn() })` — jest.fn() BARU tiap render → mockPush di plan `expect(mockPush).toHaveBeenCalledWith(...)` gagal karena push instance beda. Harus refactor mock ke top-level `const mockPush = jest.fn()` — MENGUBAH test existing. Verifikasi tak break.
- **C12.** INVALIDATION-DRIFT: D5 mengharuskan invalidate ['user_score_history'] setelah override. Ini invalidate SEMUA user history dalam cache (broad blast). Refactor lebih tepat: invalidate ['user_score_history', userId]. Test mengunci broad blast → refactor precise memaksa rewrite test.
- **C13.** MOCK-SHAPE-DRIFT-useLatestClosedPeriod: existing hook tidak return `refetch`, tapi plan mock men-set `refetch: jest.fn()`. False safety bila implementasi UI mulai panggil refetch().
- **C14.** TAB-ADMIN-ENTRIES-COUPLING: Menempatkan `ADMIN_TAB_ENTRIES` (list route+label+permission) di `mobile/src/lib/people-score.ts` mencampur data-layer scoring dengan navigasi UI — violate separation of concerns. Refactor step 10 sebaiknya taruh di modul terpisah (mis. `mobile/src/lib/admin-entries.ts`).
- **C15.** DATA-VS-UI-SEPARATION countCompletedActionPlansInPeriod: plan menaruh di cards.ts. Metric 'Kontribusi' semantic milik Score/People, bukan action-plan CRUD. Lebih tepat di people-score.ts atau modul metrics baru. Konsistensi lokasi test penting.
- **C16.** COVERAGE-SUPERVISOR: Skenario supervisor (is_supervisor_of) — SATU DARI 4 RLS gate — tidak diuji terpisah dari canManage. Rentan drift.
- **C17.** DoD-DRIFT: DoD menyebut 273/273 (240 lama + 33 baru). Refactor step 10-11 mengubah struktur people.tsx signifikan; regresi test lama sangat mungkin karena mereka mengasumsikan konten header langsung terpapar (tanpa tab wrapper). DoD harus include 'update test lama yang break karena tab wrapper' — jangan asumsikan 240 tetap hijau tanpa perubahan.
- **C18.** MCP CONNECTORS: MCP servers plugin:product-management:* dan lainnya butuh OAuth authorization di claude.ai connector settings — tidak tersedia dalam session non-interaktif ini. Tidak berdampak langsung ke plan TDD, tapi bila di masa mendatang integrasi tool (Linear/Notion) dipakai untuk track testing status, harus authorize dulu.
