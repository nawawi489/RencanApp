# Spec — Perbaikan Bug UI (testing-report 2026-07-05-ui)

Status: **semua 6 bug fase eksekusi UI selesai atau di-hold dengan alasan tercatat.** OQ-1/4/5/6/7/9 diputuskan owner pada session-session 2026-07-05 (lihat §8 RESOLVED). PPL-02/PPL-06 fully closed lewat PR #28 + #29. AUTH-02b/CFG-01 closed di commit terdahulu. THEME-01 CLOSED pending konfirmasi manual (verifikasi runtime 2026-07-05 tidak reproducible di dev preview). WS-04 UI landed; server hardening di-defer sebagai governance debt tercatat (OQ-1 Opsi A).

Sumber kebenaran: PRD V1.8.2 (repo root) + `prd/*`, `DESIGN.md` (token & a11y §4), `specs/fase-7-people-score.md`, wiki (`concepts/*`, `entities/*`), workspace-lock a11y amendment (2026-07-03). Semua klaim implementasi di bawah diverifikasi langsung terhadap kode.

---

## 1. Problem & Goals

Laporan manual testing UI `docs/testing-report-2026-07-05-ui.md` menemukan 6 kegagalan dalam tiga kelompok: **governance/gating** (WS-04), **UX & validasi dasar** (AUTH-02b, MENU-03/THEME-01), **kelengkapan surface terhadap spec** (PPL-02, PPL-06), plus satu **kesalahan konfigurasi dev** (CFG-01 error Supabase lokal di web preview).

### Akar masalah (terverifikasi terhadap kode)

1. **WS-04 — Archive gating gagal.** Di `Workspace > Performance`, setelah memilih periode arsip, tombol `+ Goal` tetap aktif dan membuka `goal-wizard`. Akar: (a) tombol section-level `+ Goal`/`+ Development Area` dan empty-state action di `workspace-screen.tsx` **tidak punya gate periode sama sekali** (hanya gate `canCreate`/permission); (b) gate per-kartu memakai `cardPeriodStatus(card,focus)` yang menilai window **milik card**, dan Goal berperiode tahunan (PRD §17: 1 Jan–31 Des) sehingga tak pernah ter-flag `past`. Yang menentukan "arsip" adalah **status periode fokus** (`enumerateMonths(...).status`), yang belum dipropagasi ke renderer.
   - **KOREKSI GOVERNANCE (fakta, bukan open question):** create card memakai **`.insert()` langsung ber-RLS** (`cards.ts:325/329`, `355/359`), **bukan** RPC. Tidak ada `create_goal/create_kpi/create_strategy`. RLS insert (0005/0010/0012) hanya memvalidasi `organization_id + created_by + has_permission(create_*)` — **tidak ada cek periode**. Artinya **enforcement server-side untuk archive gating TIDAK ADA hari ini**. Klaim "penegakan didukung server-side" **tidak boleh** dinyatakan sebagai given. Keputusan scope = **OQ-1** (owner).

2. **AUTH-02b — Validasi panjang password client bocor.** `login.tsx:35` hanya cek `!email.trim() || !password` (kosong). Password `"123"` diteruskan; server balas `invalid login credentials` → diterjemahkan "Email atau kata sandi salah." (`login.tsx:16`). Cabang "password should be at least" (`login.tsx:19`) tak pernah tercapai pada login.
   - **KOREKSI KEAMANAN (fakta):** Supabase Auth menegakkan panjang password saat **sign-UP**, bukan **sign-IN**. Pada login, password pendek hanya menghasilkan invalid-credentials. Maka **client adalah satu-satunya sinyal panjang di jalur login** (acceptable — login tak bisa membuat password lemah). Jangan menulis AC yang menuntut server menolak panjang di sign-in.

3. **MENU-03 / THEME-01 — Toggle Gelap tidak apply.** `theme-provider.tsx` (`mobile/src/providers/theme-provider.tsx`) benar secara desain (native `Appearance.setColorScheme`; web class `.dark`/`.light` di `document.documentElement`). Namun di web preview mode Gelap tidak tampak.
   - **KANDIDAT ROOT CAUSE (terverifikasi statis, belum runtime):** `global.css:7` mendefinisikan `@custom-variant dark (&:where(.dark, .dark *))`. Selector `:where()` berspesifisitas **0**, sehingga base component style dapat **menang** atas varian `dark:` meski class `.dark` ter-set di root. Ini menjelaskan "class benar tapi layar tetap terang". **Wajib dibuktikan runtime dulu (OQ-4)** sebelum menulis fix.

4. **PPL-02 — Struktur tab People absen.** `people.tsx` (269 baris) **tidak punya tab/segmented sama sekali** — hanya satu FlatList + kartu "Skor saya" + link "Papan peringkat" + search + roster. PRD.md:1269 & prd/03:132 **mengikat** menuntut Tabs (Ranking/Bulan ini/Quarter/Admin). Ini **gap penuh terhadap requirement keras PRD**, bukan "kelengkapan minor di atas yang sudah ada".

5. **PPL-06 — Profil belum lengkap.** `people-profile/[id].tsx` sudah kaya (identitas, ranking card, Achievement Score, breakdown, tugas, override), tetapi: (a) tidak ada seksi **"Kontribusi bulan ini"** terpisah (PRD §33 #7 WAJIB); (b) **riwayat/tren** hanya untuk `isSelf` (`useMyScoreHistory` self-only) — profil orang lain tak menampilkan riwayat; (c) tidak ada not-found state untuk id invalid.

6. **CFG-01 — Supabase local error di web.** `mobile/.env` baris 2: `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` (nilai tunggal, tanpa cabang platform). Web preview di `localhost:8081` → request lintas-origin `localhost`→`127.0.0.1` di-abort ("Failed to fetch"/`ERR_ABORTED`). Native/emulator butuh host berbeda.

### Goals

- **PG-1 (WS-04):** Saat periode fokus arsip dipilih, **semua** aksi tambah turunan (Goal/KPI/Strategy/Initiative/AP + section-level + empty-state) nonaktif secara **fungsional** (`accessibilityState.disabled=true`, bukan hanya redup) dan memunculkan popup "Periode sudah lewat"; detail tetap read-only. **Lapisan server = OQ-1** (UI-only + governance debt tercatat, ATAU tambah gate server).
- **PG-2 (AUTH-02b):** Login memvalidasi `password.length < 6` di client sebelum request dengan pesan spesifik (konstanta), berbeda dari error kredensial. Client adalah sinyal panjang di jalur login.
- **PG-3 (MENU-03/THEME-01):** Setelah root cause diisolasi (OQ-4), memilih "Gelap" benar-benar menerapkan dark mode lintas layar (computed style gelap), persist, dengan locked surface theme-aware; native tidak regresi.
- **PG-4 (PPL-02):** People menampilkan struktur tab PRD-mandated (Bulan ini/Quarter/Ranking/Admin) di atas konten eksisting tanpa memecahkannya; Ranking = periode closed (D9); Admin = `manage_score_formula`; visibility ikut RLS yang benar.
- **PG-5 (PPL-06):** Profil melengkapi Kontribusi bulan ini (OQ-6), riwayat (OQ-5), not-found state, dengan mempertahankan ranking/breakdown/null-vs-0/override anti-self.
- **PG-6 (CFG-01):** Web preview bersih dari error Supabase; native tidak regresi; `.env.example` terdokumentasi.
- **PG-7 (a11y binding):** Semua kontrol yang disentuh patuh `DESIGN.md §4`: touch ≥44px; warna bukan satu-satunya sinyal; solid+teks putih = `brand-dark #1564b3`.

---

## 2. Non-Goals

Lihat daftar `non_goals` terstruktur (NG-1 s/d NG-11). Ringkas: tidak ada scope creep di luar V1.8.2; People tetap di Menu; tidak mengaktifkan score produksi; tidak ada skema baru kecuali owner memilih WS-04 hardening / PPL-06 cross-user history; **tidak menyatakan enforcement server-side WS-04 yang tidak ada.**

---

## 3. User Stories (ringkas per peran)

Peran mengikuti [[permission-model]] (berbasis tanggung jawab, ditegakkan RLS).

- **WS-04 (CEO / C-Level / Manager pemegang cabang):** memilih periode arsip → semua aksi tambah turunan terkunci + tampak nonaktif + popup "Periode sudah lewat"; detail read-only tetap terbuka.
- **AUTH-02b (semua peran login):** password < 6 → pesan jelas sebelum request, bukan "email/password salah".
- **THEME-01 (semua peran):** pilih "Gelap" → seluruh app gelap konsisten lintas layar; locked surface ikut gelap (bukan light island).
- **PPL-02 (PIC melihat diri + supervisor melihat cabang):** People dengan tab Bulan ini/Quarter/Ranking/(Admin); visibility ikut RLS (self OR manage_score_formula OR view_all_workspace OR supervisor).
- **PPL-06 (self + supervisor + pemegang view_all_workspace):** profil dengan ranking, kontribusi bulan ini, rincian score, riwayat.
- **CFG-01 (dev/QA):** web preview terhubung Supabase lokal tanpa error jaringan.

---

## 4. Functional Requirements

### FR-WS04 — Archive-period gating
- **FR-WS04.1** Tambah helper murni `focusPeriodStatus(focus: PeriodFocus, now: Date): CardPeriodStatus` di `period-focus.ts`, diturunkan dari status opsi `enumerateMonths/enumerateQuarters`. **Kontrak final (dipilih, bukan dua opsi):** helper murni baru + dikonsumsi di `workspace-screen.tsx` (`SectionHeader.onPrimary`, empty-state action, dan baris aksi kartu). Provider `usePeriodFocus()` tidak wajib diubah.
- **FR-WS04.2** Saat `focusPeriodStatus==='past'`, **semua** tombol tambah turunan kelima level (Performance) dan Development, **termasuk** section-level `+ Goal`/`+ Development Area` dan empty-state action, `accessibilityState.disabled=true` + redup.
- **FR-WS04.3** Penekanan tombol ter-gate → `showPastPeriodAlert()` (copy `WS_COPY.archivePeriodTitle`/`archivePeriodMsg`); wizard TIDAK terbuka.
- **FR-WS04.4** Detail card tetap read-only terbuka; hanya create yang dikunci.
- **FR-WS04.5** `[governance — fakta]` Enforcement server-side archive gating **TIDAK ADA** saat ini (create = `.insert()`, RLS org-only). **OQ-1** memutuskan: (a) UI-only + catat governance debt (AC-WS04-7 sebagai gap-documentation test), atau (b) tambah gate server (RPC atau RLS `WITH CHECK period_end<current_date`) sebagai pekerjaan in-scope + audit row.
- **FR-WS04.6** `[a11y]` Tombol ter-gate tetap ≥44px; state disabled diekspos ke screen reader; MBR gating adalah rule independen (copy berbeda, jangan digabung).

### FR-AUTH02 — Password min-length client validation
- **FR-AUTH02.1** Sebelum `signInWithPassword`, `submit()` memvalidasi `password.length >= 6`; bila `< 6`, set feedback + `return` tanpa network request.
- **FR-AUTH02.2** Pesan via konstanta baru `AUTH_COPY.passwordTooShort = 'Kata sandi minimal 6 karakter.'` (reuse teks dari `login.tsx:19`); berbeda dari error kredensial.
- **FR-AUTH02.3** Urutan: field kosong → "Email dan kata sandi wajib diisi." didahulukan; lalu panjang. Password **tidak** di-trim (spasi boleh bagian password); email tetap di-trim.
- **FR-AUTH02.4** `[keamanan — koreksi]` Server tidak menegakkan panjang di sign-in; client sole signal di jalur login. Jangan tulis AC server re-validasi panjang login.
- **FR-AUTH02.5** Feedback via `accessibilityRole="alert"` + `accessibilityLiveRegion="polite"` (existing); password tidak di-log.

### FR-THEME01 — Dark mode apply
- **FR-THEME01.1** `[prasyarat]` Isolasi root cause runtime (OQ-4) via `preview_inspect` computed background-color sebelum menulis fix. Kandidat: `:where()` specificity-0 di `global.css:7`.
- **FR-THEME01.2** `[web]` `setMode('dark')` → `document.documentElement` ber-class `dark`, tidak `light`; selector `@custom-variant dark` cocok dengan class root; varian `dark:` teraktivasi (dibuktikan lewat computed style, bukan hanya class presence).
- **FR-THEME01.3** `effective` konsisten dengan class root; komponen warna imperatif (mis. `login.tsx` gradient) bereaksi terhadap `effective`.
- **FR-THEME01.4** Persist di key `rencanaapp:theme`; nilai invalid fallback `system`; mode `system` live-update OS; native `Appearance.setColorScheme` dipertahankan.
- **FR-THEME01.5** `[a11y]` Di dark, locked surface theme-aware (bukan light island); solid+teks putih = `brand-dark #1564b3` di kedua mode.

### FR-PPL02 — People tab structure
- **FR-PPL02.1** Tambah segmented/tab dengan label terkunci di konstanta `PEOPLE_TAB_COPY`: Bulan ini / Quarter / Ranking / Admin (Admin bersyarat permission). **Struktur ini ABSEN saat ini** (requirement keras PRD).
- **FR-PPL02.2** `[anti-regresi]` Konten eksisting (Skor saya, Papan peringkat, search, roster, ScoreLegend) tidak pecah.
- **FR-PPL02.3** Tab "Bulan ini" → periode aktif (`useActivePeriod`). Tab "Quarter" → **DEFER (OQ-7 diputuskan 2026-07-05):** render placeholder/GuidanceNote sampai data quarterly-rollup skoring ada (Fase 7 aktivasi). **Dilarang** mencampur Period Focus (kalender) dengan period_snapshots (skoring). Tab lain tetap fungsional.
- **FR-PPL02.4** `[D9]` Tab "Ranking" hanya periode closed (`ranking_snapshots`); belum ada closed → GuidanceNote.
- **FR-PPL02.5** `[permission]` Tab "Admin" hanya `manage_score_formula`/CEO; non-admin → tab tidak dirender. **Isi tab (OQ-9 diputuskan 2026-07-05):** daftar link/entry-point ke layar admin eksisting (mis. User & Permission, Score Formula, dst.) — reuse, TANPA surface admin baru; gate `manage_score_formula`.
- **FR-PPL02.6** `[RLS — kontrak yang benar]` Visibility = `user_id=self OR has_permission('manage_score_formula') OR has_permission('view_all_workspace') OR is_supervisor_of(user_id)` (terverifikasi 0013:799–805). Pemegang `view_all_workspace` melihat SEMUA orang. Di luar scope → 0 baris (roster render, badge absen), bukan error. UI tidak memfilter permission sisi klien.
- **FR-PPL02.7** `[a11y]` Tab role/tab, state terpilih eksplisit, ≥44px.

### FR-PPL06 — People Profile lengkap
- **FR-PPL06.1** Ranking (`rank_number` periode closed); absen bila tak ada closed (D9).
- **FR-PPL06.2** Seksi "Kontribusi bulan ini" (PRD §33 #7) — **metrik (OQ-6 diputuskan 2026-07-05):** jumlah Action Plan `completed` pada periode aktif (mis. "7 tugas selesai bulan ini"); metrik ini SENGAJA berbeda makna dari Achievement Score/Rincian Score. Belum ada AP selesai / periode aktif kosong → GuidanceNote "Skor menyusul".
- **FR-PPL06.3** Rincian Score = breakdown per kategori (nama + persentase, **tanpa** label bobot; skala 0–100); periode aktif, fallback closed.
- **FR-PPL06.4** Riwayat/tren — **cross-user IN-scope (OQ-5 diputuskan 2026-07-05):** tambah `listUserScoreHistory(userId)` RLS-gated (RLS eksisting sudah mengizinkan self/supervisor/`manage_score_formula`/`view_all_workspace` — **tidak perlu migrasi**). Viewer di luar scope → `[]` graceful (bukan error). Profil orang lain menampilkan tren bila viewer punya visibilitas.
- **FR-PPL06.5** `[RLS]` Semua skor/riwayat/kontribusi RLS-gated dengan predikat lengkap (§FR-PPL02.6).
- **FR-PPL06.6** null → "Skor menyusul"; 0 nyata → band attention.
- **FR-PPL06.7** `[anti-self D10]` Override hanya `manage_score_formula` AND `!isSelf` AND periode aktif; server `override_user_score` tetap raise saat `p_user_id=auth.uid()` (0013:687).
- **FR-PPL06.8** Not-found state untuk id yang tidak match anggota org.

### FR-CFG01 — Supabase web config
- **FR-CFG01.1** Web app menjangkau Supabase lokal tanpa Failed to fetch/ERR_ABORTED; host sesuai origin (web → `localhost:54321`).
- **FR-CFG01.2** Resolusi host per platform (OQ-7); native (`127.0.0.1`/`localhost` iOS sim, `10.0.2.2` Android emu) tidak regresi.
- **FR-CFG01.3** Guard `env.ts` (throw bila kosong) dipertahankan.
- **FR-CFG01.4** `.env.example` mendokumentasikan host per-platform; hanya `EXPO_PUBLIC_*` di bundle (tidak ada service-role key).

---

## 5. Data Contracts

| Bug | Skema baru? | RPC/policy baru? | Tipe/fungsi baru? | Dampak RLS |
|-----|-------------|------------------|-------------------|------------|
| WS-04 | Tidak (kecuali OQ-1=hardening) | Opsional (OQ-1: RPC atau RLS WITH CHECK) | Ya: `focusPeriodStatus()` helper murni | Hanya bila hardening |
| AUTH-02b | Tidak | Tidak | Konstanta `AUTH_COPY.passwordTooShort` | Tidak |
| THEME-01 | Tidak | Tidak | Tidak (CSS/cascade) | Tidak |
| PPL-02 | Tidak (0013 cukup) | Tidak | View-model tab + `PEOPLE_TAB_COPY` | Tidak (RLS eksisting) |
| PPL-06 | Tidak | Tidak | Opsional `listUserScoreHistory(userId)` (OQ-5) | Tidak (RLS eksisting mengizinkan) |
| CFG-01 | Tidak | Tidak | Opsional `resolveSupabaseUrl(Platform.OS)` | Tidak |

**Anti-konflasi periode (mengikat):** `PeriodFocus` (lensa kalender Workspace, `period-focus.ts`) ≠ `period_snapshots` (siklus skoring Fase 7). WS-04 beroperasi pada `PeriodFocus`. Tab People "Bulan ini/Quarter" **tidak boleh** mencampur keduanya tanpa keputusan OQ-7.

**Kontrak visibility (dikoreksi, terverifikasi 0013:799–815):**
```
user_score_results_select / ranking_snapshots_select USING:
  organization_id = current_user_org()
  AND ( user_id = auth.uid()
        OR has_permission('manage_score_formula')
        OR has_permission('view_all_workspace')
        OR is_supervisor_of(user_id) )
```
`is_supervisor_of` **SUDAH ada** (0013:199) — bukan blocker. Klaim "belum ada di skema" adalah SALAH dan tidak dipakai.

**Kontrak WS-04 client:**
```ts
export function focusPeriodStatus(focus: PeriodFocus, now: Date): CardPeriodStatus;
// past → semua "+turunan" locked (disabled+dim) + showPastPeriodAlert()
// current/future → aktif (future TIDAK dikunci per default; OQ-2)
```

**Kontrak WS-04 backend (hanya jika OQ-1=b):** Opsi A RPC `create_<card>` SECURITY DEFINER menolak periode lewat + tulis `governance_violations`; Opsi B RLS `WITH CHECK period_end < current_date`. Kolom tidak berubah.

---

## 6. Acceptance Criteria

Lihat daftar `acceptance_criteria` terstruktur (AC-WS04-1..8, AC-AUTH02-1..6, AC-THEME01-1..7, AC-PPL02-1..7, AC-PPL06-1..8, AC-CFG01-1..5). Semua Given/When/Then, level uji disebut (unit/komponen/integrasi RLS/smoke).

Catatan pengikat lintas AC:
- AC-WS04-7 (gap-documentation) WAJIB ada agar absennya server gate terlihat; AC-WS04-8 bersyarat OQ-1.
- AC-THEME01-1 (isolasi root cause) adalah deliverable pertama; AC perbaikan menyusul.
- AC-PPL02-7 & AC-PPL06-6 memakai predikat RLS **lengkap** (termasuk `view_all_workspace`), dan menambahkan skenario pemegang `view_all_workspace` melihat semua orang.
- AC-PPL06-2 (Kontribusi = jumlah AP selesai periode aktif) & AC-PPL06-4 (riwayat cross-user RLS-gated) **AKTIF** (OQ-6/OQ-5 diputuskan 2026-07-05). Tab Quarter tetap DEFER sebagai placeholder (OQ-7 diputuskan).

---

## 7. Edge Cases

- **WS-04:** empty-state di periode past juga terkunci; periode future default TIDAK dikunci (OQ-2); dua-gate (archive + MBR) → archive menang, copy terpisah; permission dievaluasi dulu (tombol muncul/tidak), lalu past (redup+alert).
- **AUTH-02b:** password 6 spasi lolos ambang (tak di-trim); jalur reset password tidak kena min-length; email-empty menang urutan.
- **THEME-01:** storage tak tersedia (web private) → toggle tetap apply sesi ini; nilai persist invalid → `system`; hindari desync `effective` vs class root; FOUC singkat diterima (di luar scope).
- **PPL-02:** tab default "Bulan ini"; Ranking tanpa closed → GuidanceNote; roster error → ErrorState+retry, tapi RLS-denied → roster render tanpa badge (bukan error); search tetap berfungsi lintas tab.
- **PPL-06:** null → GuidanceNote + note konteks (bukan halaman kosong); 0 → band attention; id invalid → not-found; override diri sendiri → tombol absen; viewer di luar visibility → skor kosong graceful, identitas tetap.
- **CFG-01:** web=localhost, native emu Android=10.0.2.2; fetch gagal → ErrorState/empty (bukan crash); env kosong → throw existing; fix hanya menghilangkan error koneksi, tidak men-seed data.

---

## 8. Open Questions (pemblokir ditandai)

Lihat daftar `open_questions` terstruktur (OQ-1..OQ-10). **Semua OQ pemblokir sudah RESOLVED** — tidak ada blocker owner tersisa untuk fase eksekusi UI batch 2026-07-05.

**RESOLVED — spec+design session 2026-07-05 (owner):**
- **OQ-5 (PPL-06 riwayat cross-user) → Cross-user, RLS-gated.** Tambah `listUserScoreHistory(userId)` RLS-gated; profil orang lain menampilkan tren bila viewer berhak; di luar scope → `[]`. Tidak ada migrasi. → FR-PPL06.4.
- **OQ-6 (PPL-06 "Kontribusi bulan ini") → Jumlah AP `completed` periode aktif.** Metrik = count Action Plan selesai pada periode aktif; sengaja beda makna dari Achievement Score. → FR-PPL06.2, AC-PPL06-2 tidak lagi DEFER.
- **OQ-7 (PPL-02 tab Quarter) → DEFER (placeholder).** Tab Quarter render placeholder/GuidanceNote hingga data quarterly-rollup skoring ada (Fase 7 aktivasi); dilarang mencampur PeriodFocus (kalender) dengan period_snapshots (skoring). → FR-PPL02.3.
- **OQ-9 (PPL-02 tab Admin) → Entry-point ke layar admin eksisting.** Isi tab = daftar link ke layar admin yang sudah ada, gate `manage_score_formula`; tanpa surface baru. → FR-PPL02.5.

**RESOLVED — THEME-01 runtime verification session 2026-07-05 (`preview_eval` di ems-web):**
- **OQ-4 (THEME-01 root cause) → `:where()` cascade hypothesis REFUTED + THEME-01 bug tidak tereproduksi post-login.** Verifikasi lengkap 2 fase:

  **Fase 1 — pra-login (/login):**
  - Fresh load: `document.documentElement.className = "dark"` (dari `storage.theme = "dark"`) — theme-provider apply() bekerja.
  - Elemen dgn class `text-[#092753] dark:text-white` (title "Rencanaapp"): tanpa `.dark` → color `rgb(9, 39, 83)`; dgn `.dark` → color `rgb(255, 255, 255)`. **Dark variant menang atas base — cascade `:where()` TIDAK mengalahkan `dark:` di dev preview.**
  - Login page tidak memiliki elemen `text-black`/`bg-white` tanpa pasangan `dark:*` (0 leak).

  **Fase 2 — post-login (login CEO `ceo@rencan.local`, navigasi lintas layar):**
  - `/menu` (tempat theme toggle Sistem/Terang/Gelap berada): click "Terang" → `docClass="light"`, `storage="light"`, heading `text-black dark:text-white` → `rgb(0, 0, 0)`. Click "Gelap" → `docClass="dark"`, `storage="dark"`, heading → `rgb(255, 255, 255)`. **Toggle round-trip bekerja penuh; storage persist; computed color transisi terverifikasi.**
  - `/workspace`: 49 elemen `text-black`, semua punya pasangan `dark:text-*` (0 leak). 18 elemen `bg-white`, hanya 1 tanpa `dark:bg-*` — yaitu `bg-white/20` (overlay transparan, intentional).
  - `/people`: 12 elemen `text-black` + 4 elemen `bg-white`, semua punya pasangan `dark:*` (0 leak).

- **Konsekuensi:** AC-THEME01-1 (isolasi root cause runtime) → **TERTUTUP** dgn kesimpulan hipotesis refuted DAN bug tidak tereproduksi di dev preview lintas layar. Kemungkinan bug asli sudah ter-fix inadvertently oleh commit `a1de95b test(theme): lock theme-provider behavior` sebelum PPL work, atau environment-specific pada saat manual testing. AC-THEME01-2..N (fix implementation) **TIDAK DIJADWALKAN** — tidak ada bug untuk di-fix. THEME-01 dianggap **CLOSED** pending konfirmasi manual testing ulang.

**RESOLVED — WS-04 governance session 2026-07-05 (owner):**
- **OQ-1 (WS-04 scope server) → Opsi A: UI-only + governance debt tercatat.** Enforcement archive-period gating **hanya di client** (`workspace-screen.tsx` gate via `focusPeriodStatus` helper). Create card path tetap pakai `.insert()` langsung ber-RLS di `cards.ts`; RLS INSERT policy (0005/0010/0012) **tidak** memeriksa periode fokus/parent — hanya validasi `organization_id + created_by + has_permission(create_*)`. Bypass path via akses Supabase langsung (script/devtools) TIDAK di-block. Governance debt dicatat di [[ws-04-governance-debt]] beserta signal kapan wajib re-open backend hardening. AC-WS04-8 (server-side test) → **TIDAK DIJADWALKAN** (governance debt, bukan gap AC).

---

## 9. Handoff ke TDD

**Feature (untuk `tdd-plan`):** lihat `tdd_handoff.feature`. Urutan disarankan:
1. **AUTH-02b** (paling terisolasi; unit/komponen murni, konstanta baru).
2. **CFG-01** (config, unit `resolveSupabaseUrl` + smoke) — buka jalan QA batch berikutnya.
3. **WS-04** (helper murni `focusPeriodStatus` unit → komponen gating → AC-WS04-7 gap-doc **SELESAI** di commit `6037a7f`). OQ-1 diputuskan Opsi A (UI-only + governance debt); AC-WS04-8 (server-side test) **TIDAK DIJADWALKAN**. Governance debt tercatat di [[ws-04-governance-debt]] dengan signal kapan wajib re-open.
4. **THEME-01** (AC-THEME01-1 isolasi runtime **SELESAI**: verifikasi 2 fase — pra-login (`/login`) DAN post-login (login CEO → `/menu` toggle round-trip Terang↔Gelap terverifikasi; `/workspace` + `/people` 0 hardcoded color leak). Hipotesis `:where()` cascade REFUTED. Bug **tidak tereproduksi** — kemungkinan sudah ter-fix inadvertently oleh commit `a1de95b`. **CLOSED pending konfirmasi manual testing ulang.** AC-THEME01-2..N tidak dijadwalkan).
5. **PPL-02** (tab + anti-regresi; tab Quarter = placeholder DEFER [OQ-7]; tab Admin = entry-point ke layar admin eksisting, gate `manage_score_formula` [OQ-9]). **Tidak ada blocker tersisa.**
6. **PPL-06** (ranking/breakdown/null-vs-0/not-found; Kontribusi = jumlah AP selesai periode aktif [OQ-6]; riwayat cross-user via `listUserScoreHistory(userId)` RLS-gated [OQ-5]). **Tidak ada blocker tersisa.**

**Koreksi faktual yang WAJIB dipatuhi tdd-plan** (jangan jadwalkan pekerjaan yang salah):
- `is_supervisor_of` SUDAH ADA (`supabase/migrations/0013_fase7_people_score.sql:199`) — bukan blocker, jangan buat ulang.
- Visibility skor lebih luas dari "self+supervisor": tambahkan `manage_score_formula` dan `view_all_workspace`.
- Supabase menegakkan panjang password saat sign-UP, bukan sign-IN — jangan tulis AC server re-validasi panjang di login.
- WS-04 tidak punya gate server (create = `.insert()` ber-RLS tanpa cek periode) — OQ-1 diputuskan **Opsi A UI-only + governance debt** (lihat [[ws-04-governance-debt]]). AC server rejection tidak dijadwalkan sampai ada trigger re-open backend hardening.

**Paths (kemungkinan tersentuh):** lihat `tdd_handoff.paths`.


---

# Lampiran — Daftar Terstruktur


## A. Non-Goals

- NG-1: Tidak menambah fitur di luar PRD V1.8.2 (Feed/News/Announcement, Watcher, Routine, Area Goal layer, Bobot/weight pada planning card tetap ditolak — PRD §6/§44, scope-guardrails).
- NG-2: Tidak memindahkan People ke bottom-nav. People tetap diakses dari Menu (PRD §7.1/§31). PPL-02/PPL-06 adalah kelengkapan struktur DI DALAM layar People, bukan perubahan navigasi.
- NG-3: Tidak mengaktifkan score produksi. Struktur People & Score boleh dibangun (surface + query), tapi aktivasi produksi menunggu data eksekusi nyata (BUILD-PLAN Fase 7). Tab/profil harus graceful saat kosong.
- NG-4: Tidak menambah formula/metrik score baru di luar default. V1 hanya formula Staff yang aktif; Management/C-Level/CEO tetap seed draft (D4/D7). PPL menampilkan yang ada, bukan menghitung sumber baru.
- NG-5: Tidak mengubah skema DB untuk kelima bug UI. Tabel Fase 7 (user_score_results, ranking_snapshots, period_snapshots) sudah ada di migrasi 0013. SATU pengecualian potensial: jika owner memilih WS-04 backend hardening (OQ-1 Opsi A/B) atau PPL-06 cross-user history (fungsi read baru), itu menambah RPC/policy/fungsi read — bukan kolom.
- NG-6: Tidak memindahkan penegakan rule ke client saja SEBAGAI DESAIN. Namun spec mengakui secara jujur bahwa WS-04 archive gating saat ini TIDAK punya lapisan server; keputusan apakah menambahnya adalah OQ-1 (owner), bukan asumsi bahwa lapisan itu sudah ada.
- NG-7: Tidak menyelesaikan self-register / manajemen akun. Login tetap login-only (PRD §39). AUTH-02b hanya validasi panjang password client-side.
- NG-8: Tidak mendefinisikan kebijakan keamanan password baru. Ambang 6 dipilih agar cermin minimum Supabase Auth (yang berlaku di sign-up); ini keputusan UX konsistensi, bukan pengetatan policy.
- NG-9: Tidak menutup failing/other case lain di laporan (CRUD penuh, review bukti, DCR, repeat instance, score override end-to-end, governance matrix penuh, confidential access, a11y detail seperti dynamic type/screen-reader tree). Spec ini hanya menutup 6 case.
- NG-10: Tidak menambah token warna/tema baru tanpa mendaftarkan di DESIGN.md dulu. Perbaikan dark mode memakai token & varian yang sudah ada.
- NG-11: Tidak memasang ranking live selama periode aktif. Ranking hanya tampil setelah periode ditutup (ranking_snapshots beku, D9); periode aktif menampilkan skor berjalan tanpa ranking.

## B. Acceptance Criteria (41)

- AC-WS04-1 (unit, deterministik): Given helper focusPeriodStatus(focus, now) baru di period-focus.ts dan now=2026-07-05, When focus={mode:'month',year:2026,month:1} (Januari 2026), Then focusPeriodStatus mengembalikan 'past'; When focus=bulan berjalan Then 'current'.
- AC-WS04-2 (komponen): Given user berhak (canCreate) di Workspace>Performance dan focusPeriodStatus='past', When pane dirender, Then tombol section '+ Goal' dan tombol tambah turunan (+KPI/+Strategy/+Initiative/+AP) plus empty-state action ter-render dengan accessibilityState.disabled===true dan tampil redup (tidak dihapus), dengan accessibilityLabel menyebut alasan periode arsip.
- AC-WS04-3 (komponen): Given kondisi AC-WS04-2, When user menekan '+ Goal' (atau turunan mana pun / empty-state action), Then showPastPeriodAlert() terpanggil menampilkan WS_COPY.archivePeriodTitle + archivePeriodMsg DAN router.push ke wizard TIDAK terpanggil.
- AC-WS04-4 (komponen): Given focusPeriodStatus='past', When user menekan tombol Detail sebuah card, Then detail terbuka normal (read-only) dan expand/collapse turunan tetap berfungsi (gating hanya mengunci create, bukan read).
- AC-WS04-5 (komponen, regresi negatif): Given focusPeriodStatus='current' (bulan berjalan), When tombol tambah dirender, Then semua disabled===false dan menekan '+ Goal' melakukan router.push('/goal-wizard'); tidak ada popup arsip.
- AC-WS04-6 (komponen, interaksi dua gate): Given sebuah tombol '+turunan' level-kartu yang kena DUA gate sekaligus (focusPeriodStatus='past' DAN MBR belum lengkap), When ditekan, Then popup archive (WS_COPY.archivePeriodMsg) yang menang; copy archive != copy MBR (dua konstanta terpisah, tidak digabung).
- AC-WS04-7 (governance, dokumentasi gap — WAJIB): Given jalur create card memakai .insert() langsung tanpa RPC/cek periode (terverifikasi cards.ts:325/355), When sebuah .insert() ke goals/kpi_areas/strategies/initiatives/action_plans dilakukan untuk periode arsip via bypass UI, Then insert SAAT INI BERHASIL (tidak ada gate server). Test ini mendokumentasikan gap secara eksplisit; resolusinya (accept UI-only vs tambah gate server) adalah OQ-1 keputusan owner sebelum tdd-plan menutup WS-04.
- AC-WS04-8 (bersyarat, hanya jika OQ-1 memilih backend hardening): Given policy WITH CHECK atau RPC create yang menolak periode lewat ditambahkan, When bypass insert ke periode arsip dilakukan, Then ditolak dengan error periode-closed dan tidak ada card ter-insert; penolakan menulis baris audit governance_violations bila jalur RPC dipilih. Bila OQ-1 memilih UI-only, AC ini di-DEFER (non-blocking) dan dicatat sebagai governance debt.
- AC-AUTH02-1 (komponen): Given email valid dan password '123' (len<6), When user menekan Masuk, Then feedback error menampilkan konstanta AUTH_COPY.passwordTooShort ('Kata sandi minimal 6 karakter.') DAN supabase.auth.signInWithPassword TIDAK terpanggil (spy=0) DAN loading tidak menyala.
- AC-AUTH02-2 (komponen, boundary): Given email valid dan password '123456' (len=6), When submit, Then validasi client lolos dan signInWithPassword dipanggil (batas >=6 inklusif, bukan >6); password '12345' (5) tetap ditahan.
- AC-AUTH02-3 (komponen, regresi + urutan): Given email dan/atau password kosong, When submit, Then muncul 'Email dan kata sandi wajib diisi.' (email-empty menang lebih dulu), bukan pesan panjang; pesan panjang hanya untuk password non-kosong len<6.
- AC-AUTH02-4 (komponen, whitespace): Given password '      ' (6 spasi), When submit, Then length diukur mentah (password TIDAK di-trim) sehingga 6 spasi lolos ambang panjang; email tetap di-trim sesuai perilaku existing.
- AC-AUTH02-5 (komponen, a11y + no-leak): Given validasi client memblokir, Then feedback dirender via accessibilityRole='alert' + accessibilityLiveRegion='polite' (existing) DAN nilai password tidak di-log/echo ke console pada jalur validasi.
- AC-AUTH02-6 (dokumentasi, koreksi keamanan): Given jalur sign-IN, Then TIDAK ada AC yang menuntut server menolak password pendek pada login — Supabase menegakkan panjang saat sign-UP, bukan sign-IN; pada login password pendek hanya menghasilkan invalid-credentials. Client adalah satu-satunya sinyal panjang di jalur ini (acceptable: login tak bisa membuat password lemah).
- AC-THEME01-1 (prasyarat runtime — deliverable pertama, blocking): Given web preview di localhost:8081 dengan mode dark aktif, When surface utama diinspeksi via preview_inspect computed background-color, Then root cause kegagalan dark diisolasi dan didokumentasikan (kandidat terverifikasi: @custom-variant dark memakai :where(.dark,.dark *) berspesifisitas 0 sehingga base component style menang). AC perbaikan (THEME01-2..7) hanya ditulis SETELAH root cause dikonfirmasi.
- AC-THEME01-2 (unit/komponen): Given Platform.OS==='web' dan setMode('dark') terpanggil, Then document.documentElement.classList mengandung 'dark' dan tidak mengandung 'light'; setMode('light') membalik (dark hilang, light ada).
- AC-THEME01-3 (komponen, computed style — bukan sekadar class presence): Given mode dark aktif, When layar utama (Home/Workspace/People/Menu) dirender di web preview, Then computed background-color surface utama benar-benar gelap (nilai token dark, bukan warna terang) — membuktikan varian dark: ter-cascade, bukan hanya class root ter-set.
- AC-THEME01-4 (komponen, persist): Given setMode('dark') lalu ThemeProvider re-mount, Then nilai key 'rencanaapp:theme'='dark' dibaca dan apply('dark') dijalankan saat mount; nilai persisted invalid fallback ke 'system' tanpa crash.
- AC-THEME01-5 (komponen, a11y locked surface): Given mode dark aktif, When locked surface (period panel Workspace / tombol solid) dirender, Then surface ikut gelap (bukan light island) dengan teks anak kontras AA; solid fill + teks putih memakai brand-dark #1564b3 di kedua mode (DESIGN §4 + amendment 2026-07-03).
- AC-THEME01-6 (komponen, native tidak regresi): Given runtime native, Then Appearance.setColorScheme tetap dipanggil (setColorScheme('dark'|'light') untuk pilihan eksplisit, null untuk 'system'); fix web tidak meregresi native.
- AC-THEME01-7 (komponen, system live): Given mode='system' di web, When skema OS berubah, Then class root berpindah light<→dark tanpa reload (listener existing dipertahankan).
- AC-PPL02-1 (komponen): Given user membuka People dari Menu, When layar dirender, Then tampil segmented/tab dengan label terkunci di konstanta PEOPLE_TAB_COPY: 'Bulan ini', 'Quarter', 'Ranking', dan 'Admin' (Admin hanya bila berwenang), masing-masing accessibilityRole tab + state terpilih eksplisit (bukan warna saja) + touch target >=44px. Struktur tab ini ABSEN sepenuhnya di people.tsx saat ini (requirement keras PRD.md:1269/prd-03:132, bukan enhancement).
- AC-PPL02-2 (komponen, anti-regresi): Given tab ditambahkan, Then konten eksisting yang sudah berfungsi (kartu 'Skor saya', link 'Papan peringkat', search, roster ter-ranking, ScoreLegend) TIDAK pecah dan tetap dapat diakses dalam tab yang sesuai.
- AC-PPL02-3 (integrasi + komponen): Given tab 'Bulan ini' aktif, Then daftar/skor mengacu periode aktif (useActivePeriod, period_snapshots.status='active'); label periode aktif tampil.
- AC-PPL02-4 (komponen, D9): Given tab 'Ranking', When belum ada periode closed / ranking_snapshots, Then tampil GuidanceNote 'Papan peringkat tersedia setelah administrator menutup periode' (bukan error/kosong); ranking hanya menampilkan angka dari ranking_snapshots periode closed — tidak untuk periode aktif.
- AC-PPL02-5 (komponen, permission): Given user tanpa manage_score_formula, Then tab 'Admin' TIDAK dirender (bukan dirender-lalu-disabled). Tab 'Admin' tampil hanya untuk pemegang manage_score_formula/CEO selaras gating MENU-02.
- AC-PPL02-6 (komponen, null vs 0): Given user level-atas tanpa formula aktif (D7) atau skor belum dihitung (null), Then tab bergantung-skor menampilkan GuidanceNote 'Skor menyusul' (bukan 0 / kosong / error); skor 0 nyata tampil band 'Perlu perhatian'.
- AC-PPL02-7 (integrasi RLS, kontrak visibility yang benar): Given skor per-user dimuat, Then hanya baris yang lolos RLS user_score_results_select (user_id=self OR manage_score_formula OR view_all_workspace OR is_supervisor_of(user_id), terverifikasi 0013:799-805) yang terlihat; pemegang view_all_workspace melihat SEMUA orang (bukan hanya supervisor chain); di luar scope = 0 baris (roster tetap render, badge skor absen), bukan error. UI TIDAK memfilter permission sisi klien.
- AC-PPL06-1 (komponen): Given profil dibuka dan ada periode closed dengan ranking_snapshots untuk orang itu, Then kartu Ranking #N (rank_number periode closed terbaru) tampil; tanpa periode closed, kartu ranking absen (D9).
- AC-PPL06-2 (komponen, OQ-6 diputuskan = jumlah AP selesai periode aktif): Given metrik 'Kontribusi bulan ini' = count Action Plan `completed` pada periode aktif, When profil dibuka pada periode aktif, Then seksi 'Kontribusi bulan ini' menampilkan jumlah AP selesai (mis. '7 tugas selesai bulan ini'), nilai yang SENGAJA berbeda dari Achievement Score/Rincian Score; bila belum ada AP selesai / periode aktif kosong → GuidanceNote 'Skor menyusul'.
- AC-PPL06-3 (komponen): Given metric_breakdown tersedia, Then seksi Rincian Score menampilkan breakdown per kategori (nama kategori + persentase, TANPA label bobot; skala 0-100) dari periode aktif, fallback ke breakdown periode closed.
- AC-PPL06-4 (komponen + integrasi, bergantung OQ-5): Given riwayat/tren skor. Jika OQ-5 memutuskan cross-user in-scope: tambah listUserScoreHistory(userId) RLS-gated; profil orang lain menampilkan tren bila RLS mengizinkan (self OR manage_score_formula OR view_all_workspace OR supervisor), bila di luar scope → [] graceful (bukan tren parsial bocor, bukan error diam). Jika OQ-5 memutuskan self-only by design: FR/AC dikoreksi sehingga riwayat hanya untuk profil sendiri dan profil orang lain menampilkan disclosure eksplisit 'Riwayat tidak tersedia untuk profil ini'.
- AC-PPL06-5 (komponen, null vs 0): Given skor null (belum dihitung / level tanpa formula), Then GuidanceNote 'Skor menyusul' dan seksi ranking/breakdown/tren tersembunyi, DENGAN satu note ringkas yang menjelaskan mengapa (bukan halaman nyaris kosong tanpa konteks); skor 0 nyata → band attention.
- AC-PPL06-6 (integrasi RLS): Given viewer di luar visibility (bukan self, bukan supervisor, tanpa view_all_workspace/manage_score_formula), When profil orang lain dibuka, Then identitas tampil namun skor/breakdown/riwayat kosong via GuidanceNote (0 baris dari RLS, bukan error); viewer dengan view_all_workspace tetap melihat skor.
- AC-PPL06-7 (komponen, anti-self-approval D10): Given profil, Then tombol 'Override Skor' hanya tampil bila can(manage_score_formula) AND !isSelf AND ada periode aktif; server override_user_score tetap raise saat p_user_id=auth.uid() (0013:687) — regresi guard: wiring UI tidak boleh memanggil override pada diri sendiri.
- AC-PPL06-8 (komponen, not-found): Given id profil tidak match anggota org (deep-link invalid), When dirender setelah profilesLoading selesai, Then tampil not-found state (bukan header 'Anggota' dengan seksi kosong).
- AC-CFG01-1 (unit config, deterministik): Given fungsi resolusi host Supabase (mis. resolveSupabaseUrl(Platform.OS) atau env yang benar), When Platform.OS==='web', Then URL memakai host yang reachable dari origin browser localhost:8081 (mis. http://localhost:54321) sehingga tidak ada Failed to fetch/ERR_ABORTED akibat host-mismatch 127.0.0.1.
- AC-CFG01-2 (unit config, native tidak regresi): Given Platform.OS native (ios/android), Then host tetap valid untuk konteks native (localhost/127.0.0.1 untuk simulator iOS, 10.0.2.2 untuk Android emulator bila termasuk target per OQ-7); fix web tidak merusak native.
- AC-CFG01-3 (unit, guard dipertahankan): Given EXPO_PUBLIC_SUPABASE_URL / ANON_KEY kosong, Then env.ts tetap throw pesan yang mengarahkan menyalin .env.example (existing env.ts:5-9 tidak dilemahkan).
- AC-CFG01-4 (smoke web): Given web preview di localhost:8081 dengan stack Supabase lokal aktif, When app load pasca-login dan idle, Then console tidak memunculkan Failed to fetch / net::ERR_ABORTED ke endpoint Supabase; auth/query dasar berhasil.
- AC-CFG01-5 (dokumentasi): Given .env.example, Then didokumentasikan host per-platform (web=localhost:54321, iOS sim=127.0.0.1/localhost, Android emu=10.0.2.2) agar reproducible; hanya EXPO_PUBLIC_* (URL+anon key) yang di-bundle, tidak ada service-role key.

## C. Testable Behaviors (16)

- focusPeriodStatus(focus, now) baru di period-focus.ts mengembalikan 'past'|'current'|'future' berbasis window periode fokus terpilih (deterministik via now injektabel).
- Tombol section '+ Goal'/'+ Development Area', semua tombol tambah turunan, dan empty-state action di workspace-screen.tsx menjadi disabled (accessibilityState.disabled) + redup saat focusPeriodStatus='past', dan memicu showPastPeriodAlert() alih-alih router.push.
- Detail card tetap terbuka read-only pada periode arsip; hanya create turunan yang terkunci.
- Test dokumentasi gap governance: .insert() ke tabel kartu untuk periode arsip berhasil hari ini (tidak ada gate server) — menandai OQ-1.
- login.tsx submit() menahan password.length<6 sebelum signInWithPassword, menampilkan konstanta AUTH_COPY.passwordTooShort, dengan spy signInWithPassword=0.
- Urutan validasi login: field kosong → 'Email dan kata sandi wajib diisi.' didahulukan, lalu password len<6 → pesan panjang; boundary >=6 lolos; password tidak di-trim.
- setMode('dark') di web menyetel class 'dark' pada document.documentElement dan menghapus 'light'; computed background-color surface utama benar-benar gelap (varian dark: ter-cascade, bukan hanya class root).
- Root cause THEME-01 diisolasi via preview_inspect sebelum menulis fix (kandidat :where() specificity-0).
- Preferensi tema persist di key 'rencanaapp:theme'; native memanggil Appearance.setColorScheme; mode 'system' live-update dengan OS.
- Locked surface (period panel/tombol solid) theme-aware di dark; solid+teks putih = brand-dark #1564b3.
- People menampilkan tab Bulan ini/Quarter/Ranking/Admin (label dari PEOPLE_TAB_COPY) dengan a11y role + state terpilih; konten eksisting (Skor saya, Papan peringkat, search, roster) tidak pecah.
- Tab Ranking hanya render dari ranking_snapshots periode closed (D9); belum ada closed → GuidanceNote; tab Admin hanya untuk manage_score_formula.
- Visibility skor mengikuti RLS user_score_results_select yang benar: self OR manage_score_formula OR view_all_workspace OR is_supervisor_of; pemegang view_all_workspace melihat semua; di luar scope → roster render tanpa badge skor, bukan error.
- People Profile menampilkan Ranking (#N periode closed), Rincian Score (breakdown tanpa bobot), null→'Skor menyusul' vs 0→band attention, not-found state untuk id invalid, override gating anti-self.
- Riwayat score profil: cross-user `listUserScoreHistory(userId)` RLS-gated (OQ-5 diputuskan 2026-07-05); viewer berhak melihat tren orang lain, di luar scope → `[]` graceful.
- Resolusi host Supabase memilih host reachable per Platform.OS (web=localhost:54321) tanpa meregresi native; env.ts guard dipertahankan; .env.example mendokumentasikan host per-platform.

## D. Open Questions (10)

- OQ-1 (WS-04 scope, PEMBLOKIR — keputusan owner sebelum tdd-plan): Create card memakai .insert() langsung ber-RLS (terverifikasi cards.ts:325/355, tidak ada RPC create_goal/create_kpi/create_strategy, dan RLS 0005/0010/0012 hanya cek org+created_by+has_permission — TIDAK ada cek periode). Karena itu gating archive saat ini HANYA bisa client-side. Owner harus memilih: (a) WS-04 UI-only untuk siklus ini + AC-WS04-8 di-DEFER sebagai governance debt eksplisit, ATAU (b) sertakan backend hardening (Opsi A: RPC create_<card> SECURITY DEFINER yang menolak periode lewat + tulis audit; Opsi B: RLS WITH CHECK period_end<current_date pada tabel kartu). Tanpa keputusan ini, klaim 'enforcement server-side' TIDAK boleh dinyatakan sebagai given.
- OQ-2 (WS-04 semantik future): PRD §7.7/§11.3 fokus pada 'periode lewat'; period-focus.ts memperlakukan future ~ current. Apakah periode 'Akan datang' (future) juga mengunci create turunan, atau hanya 'past'/arsip? Default spec: future TIDAK dikunci. Perlu konfirmasi owner (mengubah jumlah test case).
- OQ-3 (AUTH-02b konstanta copy): Kunci nama+lokasi konstanta pesan client (usulan AUTH_COPY.passwordTooShort='Kata sandi minimal 6 karakter.', reuse dari login.tsx:19) agar test merujuk konstanta bukan literal. Konfirmasi ambang 6 (bukan 8) — PRD §39 tidak menyebut min-length eksplisit; 6 diturunkan dari kebijakan sign-up Supabase.
- OQ-4 (THEME-01 root cause — deliverable pertama, PEMBLOKIR AC perbaikan): @custom-variant dark memakai :where(.dark,.dark *) berspesifisitas 0 (terverifikasi global.css:7), sehingga base component style bisa menang atas varian dark: meski class .dark ter-set di documentElement. Perlu verifikasi runtime web preview (preview_inspect computed background-color) untuk membuktikan apakah ini akar kegagalan, atau timing mount / cache preview / komponen tak punya varian dark: yang konsisten. Fix tidak boleh ditulis sebelum root cause dikonfirmasi.
- OQ-5 (PPL-06 riwayat cross-user, PEMBLOKIR AC-PPL06-4): useMyScoreHistory self-only (people-score.ts filter user_id=auth.uid()). PRD §33 mencantumkan Riwayat Score sebagai komponen profil umum. Apakah riwayat orang lain in-scope? Jika ya: tambah listUserScoreHistory(userId) yang bergantung RLS eksisting (SUDAH mengizinkan supervisor/manage/view_all_workspace — TIDAK perlu migrasi baru). Jika tidak: riwayat self-only by design + disclosure di profil orang lain. Keputusan owner mengubah AC-PPL06-4.
- OQ-6 (PPL-06 definisi 'Kontribusi bulan ini', PEMBLOKIR AC-PPL06-2): PRD §33 #7 mencantumkan 'Kontribusi bulan ini' sebagai komponen WAJIB terpisah dari Rincian Score (#8) dan Achievement Score. Field/metrik persis belum ditetapkan (jumlah AP selesai? development_contribution FR-7.5? skor berjalan periode aktif?). Perlu data contract konkret dari owner/mockup 33 agar tidak dobel-makna dengan Achievement Score dan agar AC testable.
- OQ-7 (PPL-02 tab Quarter — sumber data, PEMBLOKIR tab Quarter): period_snapshots (0013) hanya punya period_name (teks bebas) + period_start/period_end, tanpa konsep quarter terstruktur, dan tidak ada hook agregasi quarter. Tetapkan: apakah tab People difilter oleh Period Focus (kalender bulan/quarter) atau oleh period_snapshots (siklus skoring) — JANGAN dicampur (anti-konflasi). Definisikan pemetaan bulan/quarter→period_snapshot sebelum implementasi tab Quarter, atau keluarkan tab Quarter dari batch ini.
- OQ-8 (PPL-02 label tab — kontradiksi PRD internal): PRD.md:1269 menulis label dinamis 'Q3 2026' sedangkan prd/03:132 memakai generik 'Quarter'. Kunci satu (rekomendasi: label kuartal aktual berjalan agar cocok Period Focus + PRD utama) dan simpan di konstanta PEOPLE_TAB_COPY.
- OQ-9 (PPL-02 isi tab Admin): PRD §32 menyebut 'Admin panel kelola user jika permission admin' tanpa merinci isi/entry-point/gate persis (manage_score_formula vs CEO-only). Definisikan konten (entry-point ke layar admin eksisting vs surface baru) + gate, atau keluarkan Admin dari AC 'harus hadir' menjadi placeholder ber-flag.
- OQ-10 (CFG-01 target platform): Perlu URL Supabase per-platform (web=localhost, iOS sim=127.0.0.1/localhost, Android emu=10.0.2.2) atau cukup ganti .env tunggal ke localhost:54321? Konfirmasi apakah Android emulator termasuk target preview — menentukan apakah fix cukup ganti host env atau perlu cabang Platform.OS di resolusi URL.

## E. TDD Handoff — Paths

- `mobile/src/lib/period-focus.ts`
- `mobile/src/screens/workspace-screen.tsx`
- `mobile/src/app/(auth)/login.tsx`
- `mobile/src/providers/theme-provider.tsx`
- `mobile/src/global.css`
- `mobile/src/app/(app)/people.tsx`
- `mobile/src/app/(app)/people-profile/[id].tsx`
- `mobile/src/lib/people-score.ts`
- `mobile/src/lib/use-people-score.ts`
- `mobile/src/lib/env.ts`
- `mobile/src/lib/supabase.ts`
- `mobile/.env`
- `mobile/.env.example`
- `mobile/src/lib/cards.ts`
- `supabase/migrations/0013_fase7_people_score.sql`
- `mobile/src/lib/workspace-copy.ts`