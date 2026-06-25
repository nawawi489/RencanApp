# Spec Fase 4 — Performance Workspace (Hierarki Strategis)

> Status: FINAL (siap di-handoff ke `tdd-plan`). Bahasa: Indonesia. Sumber otoritatif: PRD.md, prd/01–03, BUILD-PLAN.md, wiki/, dan kode/migrasi terkini (`supabase/migrations/0001–0009`, `mobile/src/`). Pola format mengikuti `specs/fase-3-*`.
>
> **Catatan grounding:** seluruh fakta load-bearing telah diverifikasi terhadap kode: `has_permission` (0005:21-34) hanya memberi default `create_initiative/create_action_plan/create_strategy` ke `c_level/management`; card Fase 1 dibuat via **INSERT langsung ber-RLS** (`cards.ts:199`, policy `initiatives_insert` 0005:503), bukan RPC; `notifications.type/entity_type` di-CHECK ke `action_plan/initiative/action_plan_instance` (0008); nama KPI Area Template tersedia eksplisit di **PRD §47–48**.

---

## 1. Problem & Goals

### 1.1 Problem
Setelah Fase 1–3, loop eksekusi harian utuh (Owner tugaskan Action Plan → PIC submit Bukti + Nilai Hasil → Reviewer approve/reject → Repeat Instance + Compliance → Home/Notifications/Inbox). **Tetapi struktur strategisnya belum ada.** Initiative hidup sebagai *container datar* tanpa induk — keputusan sementara Fase 1 (BUILD-PLAN §37). Migrasi `0001`–`0009` tidak punya `goals/kpi_areas/strategies/goal_templates/kpi_area_templates`; `workspace.tsx` menampilkan list Initiative datar dengan teks "Hierarki strategis penuh menyusul di Fase 4"; `cards.ts` hanya menyentuh Initiative + Action Plan. Akibatnya produk bisa *menjalankan* pekerjaan tapi tak bisa *menjelaskan kenapa* pekerjaan itu ada, dan Owner UKM tak punya titik masuk terstruktur.

### 1.2 Goals
Hierarki final (PRD §6, BUILD-PLAN §85): **Goal → KPI Area → Strategy → Initiative → Action Plan**. KPI Area langsung di bawah Goal (tanpa Area Goal, tanpa KPI child).
1. Hierarki utuh: tiga entitas baru + relink Initiative ke induk (nullable).
2. Strategy yang dipaksa berpikir: Alasan/Risiko/Alternatif wajib saat aktivasi (PRD §22).
3. Goal dari nol tanpa bingung (gerbang validasi): Template Library (2 Goal × 5 divisi) + Goal Wizard 7-step.
4. Delegasi PIC bertingkat: default turunan ikut induk, kecuali Action Plan (eksekutor eksplisit).
5. Card tree expand/collapse mobile-first dengan indikator jumlah turunan.
6. Backward-compat penuh: Initiative datar Fase 1 tetap hidup; Action Plan lama tetap jalan.
7. Invarian governance Fase 0–3 dipertahankan tanpa kompromi.

### 1.3 Ringkasan Nilai
Workspace berubah dari **daftar tugas datar** menjadi **peta strategi yang bisa dieksekusi**: traceability Action Plan → Goal, kualitas perencanaan terstruktur, tanggung jawab berjenjang, tetap aman.

---

## 2. Non-Goals
- **Mesin MBR kuantitatif (3/3/3), indikator Kelengkapan Perencanaan numerik (X/N), mode Blokir, tabel `minimum_breakdown_rules`, editor Settings = DEFER Fase 5.** Fase 4 hanya gate keras "Goal aktif wajib ≥1 KPI Area" (PRD §20.4) + kelengkapan field per card.
- Tanpa bobot/weight (hanya Score Formula Fase 7).
- Tanpa Area Goal / KPI child table.
- **Tanpa Reviewer/`reviewer_id` pada planning card** (Goal/KPI Area/Strategy/Initiative) — Reviewer & approval hanya di Action Plan (PRD §23). Penambahan `reviewer_id` planning DEFER — **penyimpangan sadar dari PRD §54** (yang mengizinkan opsional).
- Tanpa perubahan Home (tetap Fase 3).
- Tanpa Development Workspace (Fase 6); People/Score/Search/Settings lengkap (Fase 7–8).
- Tanpa chat room Goal/KPI Area/Strategy (tetap per-Initiative).
- Tanpa custom template oleh user (Wizard pakai template bawaan FINITE).
- Tanpa hard-delete (soft-delete via `archived`; FK RESTRICT/SET NULL).
- Tanpa notifikasi push untuk violation planning card (CHECK enum `notifications` tak diubah).
- Tanpa relink otomatis Initiative datar.
- Istilah UI: hindari Parent/Child/Publish/Validation Error.

---

## 3. Resolusi 5 Kontradiksi Grill (keputusan mengikat)

| # | Isu | Keputusan |
|---|-----|-----------|
| K1 | Mode MBR Fase 4 | **Gate keras hanya untuk "Goal aktif wajib ≥1 KPI Area"** (syarat aktif Card PRD §20.4, disajikan sebagai pesan UX) + **Strategy depth keras** (PRD §22). MBR kuantitatif 3/3/3 + indikator X/N + mode Blokir + tabel `minimum_breakdown_rules` = **DEFER Fase 5**. Tree menampilkan **count-only** ("KPI Area: 2"), bukan "2/3". |
| K2 | Write model | **Card dibuat via INSERT langsung ber-RLS** (precedent Fase 1), **BUKAN** REVOKE+RPC. Hanya lifecycle `activate_*` lewat RPC SECURITY DEFINER. Tidak ada blanket REVOKE INSERT/UPDATE pada goals/kpi_areas/strategies. |
| K3 | `reviewer_id` planning card | **DEFER total.** DDL strategies/initiatives **tidak** menambah `reviewer_id`. Penyimpangan sadar dari PRD §54 (Initiative memang belum punya kolomnya di skema Fase 1; tak ada jalur approval planning). |
| K4 | Default `create_goal`/`create_kpi_area` | **CEO/Super Admin default** (tidak masuk default `c_level/management`). `create_strategy` **tetap** default `c_level/management` (kode 0005 & prd/03 §36). KPI Area dibuat C-Level lewat **jalur parent-PIC** di RLS WITH CHECK (PIC Goal induk boleh INSERT KPI Area), bukan role default → menutup "delegation hole" tanpa melanggar prd/03 §36 ("KPI Area jika diizinkan"). |
| K5 | FK delete chain | `goals`/`kpi_areas` FK induk **ON DELETE RESTRICT**; `initiatives.strategy_id` **ON DELETE SET NULL** (cascade tak menghapus Action Plan + evidence terkunci). Soft-delete via `archived` satu-satunya penghapusan user-facing. |

---

## 4. User Stories

> PIC & Reviewer = peran **per-card**. Otorisasi server (RLS + RPC SECURITY DEFINER). Format `US-<area><n>`.

### 4.1 CEO / Super Admin — pemilik Goal
- **US-G1 (Goal Wizard — gerbang validasi):** Sebagai CEO, saya buat 1 Goal lengkap lewat Wizard (Blank/Template → Goal Template → divisi → KPI Area Template → set Target → tunjuk PIC → generate) sampai turun ke Action Plan **tanpa bingung**.
- **US-G2 (Goal manual/Blank):** Sebagai CEO, saya buat Goal kosong (Nama, Periode, PIC) tanpa template.
- **US-G3 (lihat pohon):** Sebagai CEO `view_all_workspace`, saya expand/collapse seluruh tree.
- **US-G4 (delegasi PIC KPI Area):** Sebagai CEO/PIC Goal, saya buat KPI Area **dari dalam Goal** & tunjuk PIC (default ikut PIC Goal). *(Sebagai PIC Goal induk, INSERT diizinkan tanpa role-default `create_kpi_area` — jalur parent-PIC.)*
- **US-G5 (aktivasi Goal sadar-kelengkapan):** Tombol Aktifkan Goal hanya berhasil saat field wajib lengkap **dan** ada ≥1 KPI Area; jika 0 KPI Area → pesan UX "Goal harus memiliki minimal 1 KPI Area", bukan error.

### 4.2 C-Level / Management — PIC induk
- **US-K1 (Strategy):** Sebagai PIC KPI Area, saya buat Strategy dari dalam KPI Area & tunjuk PIC (default ikut PIC KPI Area). *(default `create_strategy` ada di role ini.)*
- **US-K2 (Strategy tidak dangkal):** Tak dapat mengaktifkan Strategy sampai Alasan + Risiko Utama + Alternatif terisi.
- **US-K3 (Initiative):** Sebagai PIC Strategy, saya buat Initiative dari dalam Strategy (default PIC ikut Strategy).
- **US-K4 (lihat turunan, tak edit bukti):** Lihat ≠ Edit; audit trail utuh.
- **US-K5 (Terapkan dari Template aditif):** "Terapkan dari Template" hanya menambah item belum ada (PRD §50).

### 4.3 Staff / PIC eksekutor
- **US-S1 (Action Plan):** Sebagai PIC Initiative, saya buat Action Plan dengan **PIC eksekutor eksplisit** + Reviewer wajib.
- **US-S2 (loop Fase 1 utuh):** Loop submit Bukti + Nilai Hasil → Review tetap tanpa perubahan.
- **US-S3 (isolasi data):** Tidak melihat Goal/KPI/Strategy di luar tanggung jawab (RLS).

### 4.4 Lintas-peran
- **US-M1 (Initiative datar hidup):** Initiative `strategy_id` NULL Fase 1 tetap diakses/dijalankan.
- **US-M2 (Home tidak berubah):** Goal/KPI/Strategy tidak muncul di Home.

### 4.5 Edukasi in-app
Setiap form buat/aktivasi Goal/KPI Area/Strategy/Initiative menampilkan `getGuidance(<type>)` dari `card_guidance_contents` (tabel existing 0005).

---

## 5. Functional Requirements

> **(WAJIB)** = invarian/gerbang; **(SEBAIKNYA)** = boleh degradasi. Enforcement di server (RLS + `can_access_*` + RPC `SECURITY DEFINER set search_path=''`). Client tipis: card create via INSERT ber-RLS, lifecycle via RPC.

### 5.1 Hierarki & Goal (`FR-GOAL-*`)
- **FR-GOAL-01 (WAJIB)** Hierarki final Goal→KPI Area→Strategy→Initiative→Action Plan; KPI Area langsung di bawah Goal. (PRD §6)
- **FR-GOAL-02 (WAJIB)** Card turunan selalu dibuat **dari dalam induk**; `parent_id` (goal_id/kpi_area_id/strategy_id) di-set otomatis. (PRD §18)
- **FR-GOAL-03 (WAJIB)** Syarat aktif Goal: Nama, Periode (start+end), PIC. (PRD §20)
- **FR-GOAL-04 (WAJIB)** Goal tanpa bobot/metode. Field bobot dilarang. (PRD §44)
- **FR-GOAL-05 (WAJIB)** `create_goal` default = CEO/Super Admin (`user_role_level()='ceo'` + grant eksplisit). TIDAK ditambahkan ke default `c_level/management`. Penolakan = pesan UX.
- **FR-GOAL-06 (WAJIB)** Status ∈ {draft, active, done, archived}; nonaktif via `archived`; tanpa hard-delete.
- **FR-GOAL-07 (WAJIB)** Periode valid `period_end >= period_start` (date, single-day legal). Operator `>=` dipakai konsisten di CHECK, RPC, dan AC. Subset periode anak⊆induk = open question (default tidak ditegakkan).
- **FR-GOAL-08 (WAJIB)** Guidance Goal via `getGuidance('goal')`.

### 5.2 KPI Area (`FR-KPI-*`)
- **FR-KPI-01 (WAJIB)** Dibuat dari detail Goal; `goal_id` auto-set.
- **FR-KPI-02 (WAJIB)** Syarat aktif: Nama, PIC, Periode, **Target** (text). Satuan/bobot/metode TIDAK wajib (PRD §24).
- **FR-KPI-03 (WAJIB)** `create_kpi_area` default = CEO/Super Admin. **C-Level/Management membuat KPI Area lewat jalur parent-PIC** (PIC Goal induk diizinkan INSERT via RLS WITH CHECK), bukan role default — selaras prd/03 §36 ("KPI Area jika diizinkan").
- **FR-KPI-04 (WAJIB)** PIC KPI Area default = PIC Goal jika tak diubah; bisa override.
- **FR-KPI-05 (WAJIB)** Guidance via `getGuidance('kpi_area')`.

### 5.3 Strategy (`FR-STR-*`)
- **FR-STR-01 (WAJIB)** Dibuat dari detail KPI Area; `kpi_area_id` auto-set.
- **FR-STR-02 (WAJIB)** Syarat aktif: Nama, **Alasan Strategy**, **Risiko Utama**, **Alternatif Strategy**, Periode, PIC. Ketiga field depth wajib non-kosong (`trim()<>''`) — **blok keras** di `activate_strategy` (PRD §22).
- **FR-STR-03 (WAJIB)** Tanpa bobot/metode.
- **FR-STR-04 (WAJIB)** PIC Strategy default = PIC KPI Area jika tak diubah. `create_strategy` default `c_level/management` (tak diregresi). **Tidak ada `reviewer_id`** (lihat K3).
- **FR-STR-05 (WAJIB)** Guidance `getGuidance('strategy')` menekankan alasan anti-dangkal.

### 5.4 Initiative & Migrasi (`FR-INIT-*`)
- **FR-INIT-01 (WAJIB)** Tambah kolom `initiatives.strategy_id` (FK → strategies, **ON DELETE SET NULL**). Initiative hierarkis baru mengisi `strategy_id`; dibuat dari detail Strategy.
- **FR-INIT-02 (WAJIB)** Backward-compat: `strategy_id` nullable, existing rows NULL, tanpa relink otomatis. Action Plan lama tetap berfungsi.
- **FR-INIT-03 (WAJIB)** Skema/semantik field Initiative existing tidak berubah (hanya penambahan `strategy_id`). Tidak menambah `reviewer_id`.
- **FR-INIT-04 (WAJIB)** PIC Initiative default = PIC Strategy jika tak diubah.
- **FR-INIT-05 (WAJIB)** Pembuatan Initiative hierarkis = **perluas `createInitiative` existing** dengan field `strategy_id` (INSERT ber-RLS), **bukan RPC baru** (minim permukaan). Auto-create chat room Initiative (trigger Fase 3) tetap berlaku; Fase 4 tak menambah chat room Goal/KPI/Strategy.

### 5.5 Tree Workspace (`FR-TREE-*`)
- **FR-TREE-01 (WAJIB)** Card tree expand/collapse Goal→…→Action Plan. (PRD §82)
- **FR-TREE-02 (WAJIB)** Tiap node: nama, status, PIC, **indikator jumlah turunan langsung count-only** ("KPI Area: 2"), bukan "X/N".
- **FR-TREE-03 (WAJIB)** Tree hanya menampilkan card yang boleh diakses (RLS, bukan filter client). Archived tak tampil.
- **FR-TREE-04 (WAJIB)** State expand/collapse = **state lokal client** (tidak persist). Fetch tree direkomendasikan **query per-level dari client** (preseden Fase 3 R5, retry granular); RPC agregat `get_goal_tree` opsional (open question).
- **FR-TREE-05 (WAJIB)** Loading/error/empty per node/section; error satu cabang tak meruntuhkan cabang lain.

### 5.6 Kelengkapan & Gate Aktivasi (`FR-GATE-*`)
- **FR-GATE-01 (WAJIB)** `activate_goal`/`activate_kpi_area`/`activate_strategy` memvalidasi kelengkapan field (FR-GOAL-03/KPI-02/STR-02). Field kosong → tetap Draft, ditolak pesan UX.
- **FR-GATE-02 (WAJIB)** `activate_goal` **menolak** aktivasi jika 0 KPI Area (gate keras, syarat aktif PRD §20.4) — pesan UX "Goal harus memiliki minimal 1 KPI Area sebelum diaktifkan."
- **FR-GATE-03 (WAJIB)** `activate_strategy` **menolak keras** jika alasan/risiko/alternatif kosong (governance PRD §22).
- **FR-GATE-04 (Non-Goal Fase 4)** MBR kuantitatif (3/3/3), indikator X/N, mode Blokir Akses, popup "Tidak Dapat Melanjutkan", tabel `minimum_breakdown_rules` = **DEFER Fase 5**. Tidak diimplementasi di Fase 4.

### 5.7 Template & Goal Wizard (`FR-TPL-*`)
- **FR-TPL-01 (WAJIB)** `goal_templates` & `kpi_area_templates` = blueprint non-mengikat; `organization_id` boleh NULL (sistem, pola `card_guidance_contents`).
- **FR-TPL-02 (WAJIB)** FINITE: 2 Goal Template ("Meningkatkan Omset Penjualan", "Meningkatkan Profit") × 5 divisi (CMO/COO/CFO/CHRO/CBO), **nama KPI Area persis PRD §47–48** (lihat §6.3 seed). User tak membuat template custom di Fase 4.
- **FR-TPL-03 (WAJIB)** Goal Wizard 7-step: (1) Blank/Template → (2) Goal Template → (3) divisi → (4) KPI Area Template → (5) isi Target tiap KPI Area → (6) PIC → (7) generate Goal + KPI Area.
- **FR-TPL-04 (WAJIB)** Goal dapat dibuat tanpa template (Blank).
- **FR-TPL-05 (WAJIB)** `apply_goal_template` **atomik** (single transaction); idempoten menambah-saja (match by name), tidak menimpa/menghapus data aktif (PRD §50).
- **FR-TPL-06 (WAJIB)** Wizard memenuhi gerbang validasi: Owner buat 1 Goal lengkap sampai Action Plan tanpa bingung.

### 5.8 Delegasi PIC (`FR-DEL-*`)
- **FR-DEL-01 (WAJIB)** Pemilik induk membuat turunan & menentukan PIC-nya.
- **FR-DEL-02 (WAJIB)** Default PIC turunan ikut induk; **pengecualian: Action Plan wajib PIC eksplisit**.
- **FR-DEL-03 (WAJIB)** Override PIC diizinkan tiap level; perubahan dicatat `activity_logs` (`update_delegation`).
- **FR-DEL-04 (WAJIB)** Anti-self-approval invarian **tetap di Action Plan** (`pic_id <> reviewer_id`, 0005:322). Fase 4 tak membuat jalur approval baru; planning card tak punya Reviewer.

### 5.9 Governance (`FR-GOV-*`)
- **FR-GOV-01 (WAJIB)** RLS non-negotiable: `can_access_goal/kpi_area/strategy(uuid)` SECURITY DEFINER — org sama DAN (`can_view_workspace()` OR PIC/creator OR PIC induk OR EXISTS pemilik turunan). Lihat ≠ Edit. (pola 0005:207)
- **FR-GOV-02 (WAJIB)** **Write model = INSERT ber-RLS** (precedent Fase 1). RLS WITH CHECK menggate create; **tidak ada blanket REVOKE INSERT/UPDATE** pada planning card. Lifecycle (`activate_*`, `apply_goal_template`) via RPC SECURITY DEFINER. RPC read-only grant execute ke `authenticated`.
- **FR-GOV-03 (WAJIB)** Audit append-only: create/activate/update menulis `activity_logs` dengan `actor_id = auth.uid()` (atribusi pemanggil). `activity_logs`/`governance_violations` tetap tanpa write policy baru.
- **FR-GOV-04 (WAJIB)** Violation planning card (aktivasi tidak lengkap) di-log append-only & terlihat pemegang `view_governance_violation`. **Notifikasi push untuk entity goal/kpi_area/strategy = DEFER** — CHECK `notifications.type/entity_type` (0008) **tidak diubah**.
- **FR-GOV-05 (WAJIB)** Tidak ada jalur approval/penulisan baru untuk planning card (planning only). Evidence locking & submission versioning Action Plan tak disentuh.
- **FR-GOV-06 (WAJIB)** Multi-tenant: tiap row + template wajib `organization_id` (kecuali template sistem NULL); RLS isolasi antar-org. **`initiatives.strategy_id` non-null wajib referensi strategy org sama** (tutup cross-org FK hole) di WITH CHECK.
- **FR-GOV-07 (WAJIB)** Scope guardrails: tanpa bobot, Area Goal, KPI child, Feed/AI/Watcher; Home tak berubah.
- **FR-GOV-08 (WAJIB)** Tree/listing tak membocorkan data lintas-akses (RLS). Search penuh defer.

### 5.10 Data Layer & Tipe (`FR-DATA-*`)
- **FR-DATA-01 (WAJIB)** Migrasi tunggal `0010_fase4_performance_workspace.sql`: urutan dependency-safe (lihat §6.1), RLS+policy+RPC+index+seed di migrasi.
- **FR-DATA-02 (WAJIB)** Regen `database.types.ts`; modul tipis `goals.ts`/`kpi-areas.ts`/`strategies.ts` (reuse `PersonRef`/`STATUS_TONE`). `initiatives` Row/Insert/Update memperoleh `strategy_id` nullable + relationship.
- **FR-DATA-03 (WAJIB)** Permission key `create_goal`/`create_kpi_area`/`create_strategy` dikenali `has_permission`. **`create_goal`/`create_kpi_area` TIDAK ditambahkan ke default role list**; `create_strategy` default `c_level/management` byte-for-byte. **Mirror `mobile/src/hooks/use-profile.ts` ROLE_DEFAULTS** harus tetap konsisten dengan server (tidak menambah `create_goal`/`create_kpi_area`).
- **FR-DATA-04 (WAJIB)** Routes baru: `/goal/new`, `/goal/[id]`, `/kpi-area/new`, `/kpi-area/[id]`, `/strategy/new`, `/strategy/[id]`, layar Goal Wizard. `workspace.tsx` berevolusi flat list → card tree (hapus placeholder "Fase 4").
- **FR-DATA-05 (WAJIB)** Loading/error/empty tiap layar; form pola Fase 1 (LabeledInput, UserPicker, GuidanceNote).

---

## 6. Data Contracts

> Grounded pada `0001`–`0009` + `cards.ts` + `database.types.ts`. Pola **menjiplak Fase 1** (`initiatives`/`action_plans`): tabel ber-RLS, **create via INSERT ber-RLS**, lifecycle via RPC definer, `can_access_*` untuk SELECT, `write_activity` untuk audit.

### 6.0 Delta blueprint
- **Ditambah (5 tabel):** `goal_templates`, `kpi_area_templates`, `goals`, `kpi_areas`, `strategies`.
- **Diubah (1 kolom):** `initiatives.strategy_id` (FK nullable, ON DELETE SET NULL).
- **Tidak disentuh:** `action_plans` & seluruh loop eksekusi/collab Fase 1–3.

### 6.1 Migrasi `0010` — urutan DDL
Urutan create: `goal_templates` → `kpi_area_templates` (FK goal_template_id ON DELETE CASCADE) → `goals` → `kpi_areas` (FK goal_id **ON DELETE RESTRICT**) → `strategies` (FK kpi_area_id **ON DELETE RESTRICT**) → `ALTER TABLE initiatives ADD COLUMN strategy_id uuid REFERENCES public.strategies(id) ON DELETE SET NULL`. Lalu: index → trigger `set_updated_at`/`log_card_creation` per tabel → helper `can_access_*` → RPC lifecycle → RLS enable + policy → seed.

**Kolom inti (snake_case):** `id uuid PK default gen_random_uuid()`, `organization_id uuid NOT NULL → organizations ON DELETE CASCADE`, `name text NOT NULL`, `description text`, `pic_id uuid → profiles ON DELETE SET NULL`, `period_start date`, `period_end date`, `status text NOT NULL default 'draft' CHECK in ('draft','active','done','archived')`, `created_by uuid → profiles ON DELETE SET NULL`, `created_at/updated_at timestamptz NOT NULL default now()`. CHECK `period_end is null or period_start is null or period_end >= period_start`.

- **`goals`**: + `target_result text` (nullable). Parent = organization. **Tanpa bobot, tanpa reviewer_id.**
- **`kpi_areas`**: + `goal_id uuid NOT NULL → goals ON DELETE RESTRICT`, `target text`, `satuan text` (nullable). **Tanpa bobot, tanpa reviewer_id.**
- **`strategies`**: + `kpi_area_id uuid NOT NULL → kpi_areas ON DELETE RESTRICT`, `alasan_strategy text`, `risiko_utama text`, `alternatif_strategy text` (semua nullable di kolom; ditegakkan saat aktivasi). **Tanpa bobot, tanpa reviewer_id.**
- **`initiatives` (ALTER)**: `strategy_id uuid → strategies ON DELETE SET NULL` — nullable, tanpa backfill, **tanpa reviewer_id**.
- **`goal_templates`**: `id`, `organization_id uuid` **nullable** (null = sistem), `name`, `description`, `default_kpi_count int`, `created_by`, timestamps.
- **`kpi_area_templates`**: `id`, `organization_id uuid` nullable, `goal_template_id uuid NOT NULL → goal_templates ON DELETE CASCADE`, `name`, `description`, `satuan text` (nullable), `created_by`, timestamps.

**Index:** `idx_goals_organization`, `idx_goals_pic`; `idx_kpi_areas_goal`, `idx_kpi_areas_pic`, `idx_kpi_areas_organization`; `idx_strategies_kpi_area`, `idx_strategies_pic`, `idx_strategies_organization`; `idx_initiatives_strategy`; `idx_kpi_area_templates_goal_template`. (Tidak ada `idx_*_reviewer` — kolom tak ada.)

### 6.2 RPC (`SECURITY DEFINER set search_path=''`)
Create card mengikuti precedent Fase 1 = **INSERT langsung dari client** (bukan RPC). RPC hanya lifecycle + template:
- `activate_goal(p_goal_id)` — cek found, otorisasi (creator/pic/PIC induk konteks/`manage_others_cards`), `status='draft'`, kelengkapan name/period/pic, **GATE KERAS `exists` ≥1 kpi_areas** → raise jika 0, update status active, `write_activity('goal', id, 'activate')`.
- `activate_kpi_area(p_kpi_area_id)` — kelengkapan name/pic/period/target; **tanpa** gate MBR kuantitatif (defer Fase 5).
- `activate_strategy(p_strategy_id)` — kelengkapan name/period/pic + alasan/risiko/alternatif (`coalesce(trim(...),'')=''` → raise; **blok keras**).
- `apply_goal_template(p_goal_template_id, p_pic_id, p_period_start, p_period_end) returns uuid` — **atomik**; generate 1 `goals` draft + N `kpi_areas` draft dari `kpi_area_templates`; idempoten menambah-saja (match by name); mengembalikan `goal_id`.

**Revoke:** RPC tulis `revoke execute from public, anon` (biarkan `authenticated`). `write_activity` tetap `revoke from authenticated` (internal definer).

### 6.3 Seed template (di 0010, idempoten `where not exists`, organization_id NULL)
Goal Template **"Meningkatkan Omset Penjualan"** → kpi_area_templates:
- CMO: `Menambah Jumlah Customer`, `Meningkatkan Basket Size`
- COO: `Meningkatkan Output Produk`, `Meningkatkan Produktivitas`
- CFO: `Ketersediaan Arus Kas yang Memadai`, `A/R Collection`
- CHRO: `Meningkatkan Kompetensi Karyawan`, `Ketersediaan Karyawan (MPP)`
- CBO: `Menambah Jumlah Cabang Baru`, `Menciptakan Produk / Brand Baru`

Goal Template **"Meningkatkan Profit"** → kpi_area_templates:
- CMO: `Increase Sales Price`, `Minimize Budget`
- COO: `Menurunkan OPEX`, `Menurunkan Komplain Pelanggan`
- CFO: `Control Budgeting` *(1 item)*
- CHRO: `Mengurangi Biaya Lembur`, `Menurunkan Turnover`
- CBO: `Ketersediaan Pendanaan Ekspansi Outlet Baru`, `Efisiensi Biaya Ekspansi`

Plus seed rows guidance `getGuidance('goal'|'kpi_area'|'strategy')` di `card_guidance_contents` (organization_id NULL).

### 6.4 Helper visibilitas (`SECURITY DEFINER`, pola `can_access_initiative` 0005:207)
- `can_access_goal(p_goal uuid)`: org sama DAN (`can_view_workspace()` OR `pic_id=auth.uid()` OR `created_by=auth.uid()` OR EXISTS turunan kpi_areas/strategies/initiatives/action_plans yang user PIC/creator-nya).
- `can_access_kpi_area`: org sama DAN (workspace OR PIC/creator OR PIC Goal induk OR EXISTS turunan).
- `can_access_strategy`: org sama DAN (workspace OR PIC/creator OR PIC KPI Area induk OR EXISTS turunan).
- Semua `revoke execute from public, anon`.

### 6.5 RLS (per tabel, pola `initiatives_*` 0005:489)
- `*_select`: `for select to authenticated using (public.can_access_<x>(id))`.
- `goals_insert`: `with check (organization_id = current_user_org() and created_by = auth.uid() and public.has_permission('create_goal'))`.
- `kpi_areas_insert`: `with check (organization_id = current_user_org() and created_by = auth.uid() and (public.has_permission('create_kpi_area') or exists(select 1 from goals g where g.id = goal_id and g.pic_id = auth.uid())))` — **jalur parent-PIC** untuk C-Level.
- `strategies_insert`: idem dengan `has_permission('create_strategy') or PIC KPI Area induk`.
- `*_update`: `using (org sama and (created_by = auth.uid() or pic_id = auth.uid() or has_permission('manage_others_cards'))) with check (org sama)`. **Tidak ada klausa `reviewer_id = auth.uid()`** (planning card tak punya Reviewer).
- Template `*_select`: `using (organization_id is null or organization_id = current_user_org())`. INSERT/UPDATE template = defer (tak ada policy write Fase 4).
- `initiatives`: **perluas** `initiatives_insert`/`initiatives_update` WITH CHECK agar, bila `strategy_id` non-null, strategy referensi org sama: `... and (strategy_id is null or exists(select 1 from strategies s where s.id = strategy_id and s.organization_id = current_user_org()))`. Klausa lain (org, created_by, has_permission('create_initiative')) tak berubah.

### 6.6 Permission framework (delta)
Permission key sudah ter-seed di `0001`. `has_permission` di-`create or replace` di 0010 untuk mengenali key baru, **tanpa** menambah `create_goal`/`create_kpi_area` ke default `c_level/management` (tetap CEO-only + grant). `create_strategy` di default list **byte-for-byte tidak berubah**. Mirror `use-profile.ts` ROLE_DEFAULTS tetap `['create_initiative','create_action_plan','create_strategy']`. **AC regresi wajib.**

### 6.7 Tipe & data layer client
Regen `database.types.ts`; modul `goals.ts`/`kpi-areas.ts`/`strategies.ts`: `export type Goal = Tables<'goals'>`; create via `.insert({...})` (pola `createInitiative` 0005), activate via `supabase.rpc('activate_goal', { p_goal_id })`, `applyGoalTemplate` via rpc returns `goal_id`. Query `.select('*, pic:pic_id(id, full_name, email)')`. `createInitiative` payload diperluas dengan `strategy_id?`.

---

## 7. Acceptance Criteria (Given/When/Then)

> Lihat daftar lengkap pada `acceptance_criteria` (kode AC-S*, AC-W-MODEL, AC-V*, AC-P*, AC-D*, AC-A*, AC-T*, AC-W*, AC-E*, AC-GATE*, AC-X*, AC-PERM-REGRESS, AC-GOV-*). Highlight gerbang & must-fix:
- **AC-A3 / AC-GATE2:** `activate_goal` menolak 0 KPI Area dengan pesan UX (gate keras PRD §20.4).
- **AC-A5:** `activate_strategy` blok keras saat alasan/risiko/alternatif kosong.
- **AC-S7:** tidak ada `reviewer_id` di strategies/initiatives.
- **AC-W-MODEL:** write via INSERT ber-RLS, bukan REVOKE+RPC.
- **AC-P2/AC-P2b/AC-PERM-REGRESS:** `create_goal`/`create_kpi_area` CEO-only default; `create_strategy` default c_level/management tak diregresi; client mirror konsisten.
- **AC-P3:** C-Level PIC Goal boleh INSERT KPI Area via jalur parent-PIC.
- **AC-P5b:** cross-org FK strategy_id ditolak.
- **AC-T2:** seed nama KPI Area persis PRD §47–48 (CFO Profit = 1 item).
- **AC-T4b:** `apply_goal_template` atomik.
- **AC-W4:** indikator tree count-only (bukan X/N).
- **AC-S6/AC-W6/AC-W6b:** backward-compat Initiative datar (tampil di section "Tanpa Goal", INSERT datar baru tetap jalan).
- **AC-GOV-VIOL:** violation planning di-log, notifikasi push entity baru defer.
- **AC-GATE1:** gerbang validasi end-to-end Owner via Wizard tanpa error mentah.

---

## 8. Edge Cases, Error & Empty/Loading

> Prinsip: **Permission ditolak = tidak terlihat**, bukan error. Komponen reuse `EmptyState`/`ErrorState`/`SkeletonList`/`GuidanceNote`.

### 8.1 Permission-denied
- User tanpa `create_goal` → tombol "+ Goal Baru" tidak dirender; EmptyState pasif.
- PIC induk read-only tanpa `create_kpi_area`/parent-PIC → tombol "Tambah …" tidak dirender; tree tetap expand/collapse.
- Staff → hanya card yang ia PIC/Reviewer + turunan (RLS); lainnya tidak muncul.
- Deep-link `/goal/[id]` dst di luar scope → `ErrorState` "Tidak dapat diakses" tanpa membocorkan keberadaan.

### 8.2 Gate aktivasi (bukan MBR penuh)
- Goal tanpa KPI Area → `activate_goal` ditolak; UI tampilkan pesan ramah + tombol "Tambah KPI Area", bukan `ErrorState`.
- Strategy field depth kosong → tandai field spesifik mana yang kurang; pertahankan input.
- **Tidak ada** popup "Tidak Dapat Melanjutkan" / mode Blokir Akses di Fase 4 (defer Fase 5).

### 8.3 State error & data basi (tanpa Realtime)
- Query section/tree gagal → `ErrorState` per-section retry granular; satu cabang gagal tak meruntuhkan lain.
- Item basi → RPC menolak → inline "Item sudah berubah, menyegarkan…" + refetch (refresh on-focus + pull-to-refresh).
- Buat turunan saat induk `done`/`archived` → RPC/RLS menolak; pesan ramah.
- `period_end < period_start` → tolak (`period_end >= period_start`); inline error field tanggal.
- Initiative datar (`strategy_id` null) → tetap tampil di section terpisah "Tanpa Goal"; tidak di-relink otomatis.

### 8.4 Empty & loading
- Loading awal tree/list → `SkeletonList` hanya saat `isLoading && !data`; refetch menahan data lama.
- Goal tanpa KPI Area → EmptyState dalam node + `GuidanceNote('kpi_area')`.
- Workspace tanpa Goal → EmptyState: jika `can('create_goal')` CTA "Buat Goal pertama lewat Wizard"; jika tidak, narasi pasif.
- Template gagal load → `ErrorState` retry (template FINITE, di-seed 0010).
- Wizard gagal generate di langkah akhir → pertahankan state + inline retry; `apply_goal_template` atomik (tak ada parsial).
- Boundary count error pada indikator → tampilkan "—", bukan "0".

### 8.5 Invarian dipertahankan
- Append-only audit; tulis card via INSERT ber-RLS (langsung ditolak 42501 bila tanpa permission/parent-PIC), lifecycle via RPC.
- FK planning RESTRICT/SET NULL — cascade DB tak menghapus Action Plan + evidence; "hapus" = `archived`.
- Anti-self-approval tetap di Action Plan; planning card tak punya Reviewer.
- CHECK `notifications` enum tak diubah.

---

## 9. Open Questions
Lihat daftar `open_questions` (penempatan UI Initiative datar; dedicated route vs modal Wizard; RPC agregat vs per-level; subset periode; template custom org; onboarding hint). Tidak ada yang memblokir gerbang validasi inti; default spec sudah ditetapkan untuk masing-masing.

---

## 10. Handoff ke TDD
Lihat `tdd_handoff` untuk ringkasan padat + daftar `paths`. Urutan red-green-refactor yang disarankan:
1. **Migrasi 0010 (server tests via supabase/tests):** DDL urutan + kolom inti + tanpa bobot/reviewer_id + FK RESTRICT/SET NULL (AC-S1–S8, AC-W-MODEL).
2. **Helper + RLS:** `can_access_*`, isolasi org, parent-PIC, lihat≠edit, cross-org FK (AC-V*, AC-P3/P4/P5b).
3. **Permission regresi:** `has_permission` + mirror `use-profile.ts` (AC-P1/P2/P2b/PERM-REGRESS).
4. **RPC lifecycle:** `activate_goal` gate ≥1 KPI Area, `activate_strategy` depth keras, atomicity `apply_goal_template`, atribusi audit (AC-A*, AC-T4b, AC-GOV-ATTR).
5. **Seed template** (AC-T1/T2).
6. **Data layer client** goals/kpi-areas/strategies + regen types (AC-X8).
7. **UI:** Workspace tree, form Goal/KPI/Strategy, Goal Wizard 7-step, backward-compat Initiative datar (AC-W*, AC-T6/T7, AC-E*, AC-GATE1).
8. **Non-regresi lintas-surface** (AC-X1–X7).