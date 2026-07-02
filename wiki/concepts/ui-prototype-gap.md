---
type: concept
tags: [ui, design, prototype, backlog, gap-analysis]
updated: 2026-07-02
sources: 3
---

# UI Prototype Gap — Backlog Visual & Struktural

Hasil perbandingan menyeluruh **`design.html`** (prototype 46 layar) vs implementasi `mobile/src/app/` (Expo Router + NativeWind v5). Dokumen ini berfungsi sebagai **backlog UI** — setiap item memakai ID stabil (`UI-G-###` lintas-layar, `UI-S-###` per-layar) supaya bisa dirujuk dari PR/issue.

Sumber acuan: [[overview]], [[surfaces]], `design.html`, dan `DESIGN.md`. Pasangan kontras/AA mengikat [[architecture#a11y|DESIGN.md §4]].

---

## 1. Diagnosis menyeluruh

Perbedaan terbesar **bukan "salah implementasi"** — melainkan dua filosofi yang berbeda yang harus didamaikan:

| | Prototype `design.html` | Aplikasi `mobile/` |
|---|---|---|
| Identitas | Dashboard visual kaya | Utility eksekusi fungsional |
| Sinyal capaian | Progress orb + persen + tone risk | Badge status teks |
| Form "baru" | Stepper + Draft & Aktifkan | Single "Simpan sebagai Draft" |
| Navigasi sekunder | Tab **Menu** (hub) | Avatar → Settings |
| Permission/governance | Implisit di copy | Eksplisit (gate, anti-self, audit) — lihat [[permission-model]], [[audit-governance]] |
| Repeat/MBR | Hint inline statis | Lifecycle + guard `Alert` + ratio badge ([[minimum-breakdown-rule]]) |

**Konsekuensi:** sebagian besar gap di app adalah **kekayaan visual yang dihapus**, bukan logika yang salah. Backlog ini mengangkat keduanya menjadi item terukur.

> [!info] Yang sudah benar di app dan **tidak** boleh diregresi saat menutup gap
> Anti-self-approval, draft→aktif lifecycle, gate MBR, append-only audit, repeat compliance (frekuensi/weekday/missed-rule/grace), permission gating reviewer, prefilled PIC turunan, state loading/empty/error proper. Lihat [[execution-loop]] & [[audit-governance]].

---

## 2. Gap sistemik (lintas-layar) — paling berdampak

Item-item ini muncul di banyak layar sekaligus → satu PR bisa menutup banyak baris di Bagian 4.

| ID | Gap | Lokasi prototype | Acceptance criteria ringkas |
|---|---|---|---|
| **UI-G-001** | Tidak ada **progress orb / persen capaian** di mana pun | Hampir semua kartu Performance (Home, tree, detail, action plan) | Komponen `ProgressOrb` (size 56/72) di `ui.tsx`; integrasi minimal di Goal/KPI/Strategy/Initiative/Action Plan detail header |
| **UI-G-002** | Tidak ada panel **"Log Aktivitas"** di layar detail | Goal/KPI/Strategy/Initiative/DevArea/Problem/AP detail | Collapsible "Log Aktivitas" memakai data `activity_log` (sudah append-only, [[audit-governance]]); reuse di semua detail ✅ **IMPLEMENTED 2026-06-28** — `components/activity-log-panel.tsx` (lazy fetch saat expand) + `lib/activity-governance.ts::listEntityActivityLog`; ter-wire di 7 layar detail (Goal/KPI/Strategy/Initiative/DevArea/ProblemStatement/ActionPlan). |
| **UI-G-003** | **MetaGrid 4-sel** pada header detail (saat ini 1–2 sel) | Semua layar detail | Tambah Parent reference + PIC nama + 2 metrik konteks (Target/Aktual atau Kontribusi/Periode) |
| **UI-G-004** | **Stepper "Langkah N dari M" + footer Draft & Aktifkan** di form "baru" | Semua form `*/new.tsx` | Komponen `WizardHero` + `StickyActions`; satu screen tetap pakai single button bila form ≤4 field |
| **UI-G-005** | **Search pill di topbar** & entry point ke global search | Semua layar utama | Tambah `TopSearchPill` di `AppHeader`; route ke `/(app)/search` ✅ **IMPLEMENTED 2026-06-28 (Cat-3)** — Ionicons search-outline di app-header.tsx → router.push(/search). |
| **UI-G-006** | **Tombol help "?"** per kartu/section (mengeluarkan sheet dengan glossary) | Hampir semua kartu prototype | Komponen `CardHelpTrigger` + glossary content store (per-entity) ✅ **IMPLEMENTED 2026-06-28** — `components/card-help-trigger.tsx` (tombol "?" 24×24, tap → native Alert) + `lib/glossary.ts` (13 topik: goal/kpi_area/strategy/initiative/action_plan/development_area/problem_statement/mbr/score_formula/achievement_score/activity_log/evaluation/target_breakdown). Ter-wire di Goal detail (KPI Area), KPI Area detail (Strategy), dan Settings MBR; sisanya tinggal `<CardHelpTrigger topic=...>` per surface. |
| **UI-G-007** | **Sumbu warna brand** beda (`#208aef` vs `#1877f2` prototype) — fonts Inter belum dimuat | Global | Sudah dicatat di `DESIGN.md` §11; keputusan terbuka — angkat ke status `[?]` di backlog |
| **UI-G-008** | **Radius kartu** 16px app vs 8px prototype (rasa lebih bulat vs lebih "spreadsheet-like") | Global | Putuskan radius kanonik di `DESIGN.md` lalu pilih: turunkan `rounded-2xl` → `rounded-xl`/`rounded-lg`, atau tetap. |
| **UI-G-009** | **Per-card overflow `⋯`** untuk aksi sekunder (Arsipkan, Ubah, Salin, Hapus draft) | Semua tree-card & list row | `RowActionsMenu` (bottom sheet) konsisten lintas list ✅ **IMPLEMENTED 2026-06-28 (S3)** — `components/row-actions-menu.tsx` generik (open/onClose + items[]); ter-wire ke `GoalRow`/`DevelopmentAreaRow`/`InitiativeRow` di Workspace. Item Ubah/Arsipkan/Salin masih placeholder V1 (Alert "Belum tersedia"). |
| **UI-G-010** | **Period switcher (Bulan/Quarter + arsip periode)** | `performance-workspace`, `development-workspace`, profil people | Komponen `PeriodSwitcher` yang membaca [[score-formula|periode aktif/closed]] ✅ **IMPLEMENTED 2026-06-28 (S1)** — `components/period-switcher.tsx` + `lib/period-focus.ts` + `providers/period-focus-provider.tsx`; terpasang di Workspace (Performance & Development pane); kartu past auto-redup. People profil dipasang nanti. |
| **UI-G-011** | **Tile ikon per kartu tidak ada** — prototype memberi setiap `menu-card` tile ikon SVG berwarna (`menu-icon`, varian default/green/amber/red/violet) dan `icon-button` di hero row (Inbox search/+, Menu gear); app hanya punya ikon di login, `app-header`, dan tab bar — kartu Menu polos (teks + chevron) | `menu` (semua grid + list), `inbox` hero, `people` hero | ✅ **IMPLEMENTED 2026-07-02 (Menu)** — komponen `IconTile` di `ui.tsx` (Ionicons `@expo/vector-icons`, ukuran 40 grid / 36 list, `rounded-xl`, 6 tone bg-soft + warna ikon selaras palet app DESIGN §8, dark via `useColorScheme`, disembunyikan dari a11y karena label teks = sumber makna §4). Mapping `icon`+`tone` per item `SETTINGS_GROUPS` di `settings.tsx`; render di grid tile & list row. Verifikasi live: 19 tile, 19 glyph unik, 5 tone warna tepat; tsc bersih; jest ui-feedback 20/20 + settings 5/5. Token didaftarkan di `DESIGN.md` §7+§10. **Sisa (icon-button hero Inbox/People)** ditunda — dampak kecil, layar hero belum terstruktur ulang. |

---

## 3. Gap navigasi (struktural)

| ID | Gap | Severity |
|---|---|---|
| **UI-N-001** | **Tab "Menu" hilang** (slot 5 dipakai People). Hub Menu (profil + template + settings + governance + logout) tersebar | MAJOR ✅ **RESOLVED V1.8.2 §7.1: Menu menang**, People masuk Menu. ✅ **IMPLEMENTED 2026-06-28 (S0)** — `(tabs)/menu.tsx` re-export hub `(app)/settings.tsx` + baris People & People Ranking; `(tabs)/people.tsx` → `(app)/people.tsx` (stack route). |
| **UI-N-002** | **Workspace hub-card → tab-switcher**: 2 kartu hub Performance/Development hilang (kehilangan ringkasan + entry yang sengaja "berat") | MAJOR ✅ **STAGE 2 IMPLEMENTED 2026-06-28 (Approach A)** — `HubView` di workspace.tsx jadi default state (lobby); 2 `WorkspaceHubCard` (Performance + Development) dgn `ProgressOrb` 72px (% rasio status=active) + 3-stat row (Goal/KPI Area/Aktif & Dev Area/Problem/Aktif) + "Masuk ›" CTA. Tap hub → pindah ke pane (TabBar tetap untuk switching dalam pane). Tombol "← Workspace" balik ke hub. Stats derived dari `useGoals`/`useDevelopmentAreas` — zero query baru. |
| **UI-N-003** | **Pohon hanya 2 level** (Goal→KPI; DevArea→Problem). Strategy/Initiative/Action Plan tidak ada di tree workspace | MAJOR ✅ **STAGE 1 IMPLEMENTED 2026-06-28 (B′ tree 3-level)** — KpiAreaSubRow + StrategySubRow di Performance pane (Goal→KPI→Strategy inline); ProblemStatementSubRow + InitiativeSubRow di Development pane (DevArea→PS→Initiative inline). Lazy fetch via `useStrategies(id, enabled)` + `useProblemStatementInitiatives(id, enabled)`. Tap-count Goal→Strategy turun 3→1. Initiative/AP tetap stack-nav (4-5 level penuh ditunda per CEO review). |
| **UI-N-004** | Beberapa layar prototype terlipat ke layar lain — bukan regresi tapi catat sebagai keputusan: `repeat-setting`, `result-value-input`, `review-flow`, `card-completeness`, `kpi-template-library` | INFO |

**Rekomendasi:** ~~UI-N-001 & UI-N-002 perlu keputusan produk dulu~~ — **UI-N-001 ✅ DONE 2026-06-28**: bottom nav kini `Home·Notif·Workspace·Inbox·Menu`, People reachable via `/people` (stack route) dan via row di hub Menu. UI-N-002 (Workspace hub-card) masih perlu keputusan terpisah.

---

## 4. Gap per-layar (rangking severity)

> Severity: **MAJOR** = sebagian besar layar terstruktur ulang/elemen utama hilang · **MINOR** = polishing/penambahan komponen · **MATCH** = sejajar (tidak ada item backlog).

### 4.1 Home & shell — `(tabs)/index.tsx`, `app-header.tsx`, `greeting-hero.tsx`

| ID | Item | Severity |
|---|---|---|
| UI-S-H01 | Priority rail naikkan ke **3 kartu** — tambahkan **"Gap KPI Area"** | MAJOR |
| UI-S-H02 | Kartu **"Snapshot Tim"** (Butuh bantuan / KPI Area Gap %) | MAJOR |
| UI-S-H03 | Kartu **"Fokus Hari Ini"** kaya: progress bar + %, "Output/Ekspektasi" subhead, tombol Detail | MAJOR |
| UI-S-H04 | Ringkas 6 list section ke ≤3 (rekomendasi: Fokus / Repeat / Perlu review) | MINOR |
| UI-S-H05 | Hero: pill tanggal (bukan caption uppercase) | MINOR ✅ **IMPLEMENTED 2026-06-28** — pill `bg-white/20 rounded-full` di `greeting-hero.tsx`. |

### 4.2 Notifications — `(tabs)/notifications.tsx`

| ID | Item | Severity |
|---|---|---|
| UI-S-N01 | **Tombol aksi inline** per row (Review / Lihat Bukti / Buka Request) | MAJOR ✅ **IMPLEMENTED 2026-06-28** — `inlineAction(item)` derive dari (type, entity_type); tombol secondary di NotificationRow → tap = mark read + push route. Review→Review Sekarang (disambiguate vs tab). |
| UI-S-N02 | **Grup "Baru" / "Sebelumnya"** (date divider) | MINOR ✅ **IMPLEMENTED 2026-06-28** — `groupByRecency` (≤24 jam=Baru) + SectionList + SectionHeader uppercase. |

### 4.3 Workspace — `(tabs)/workspace.tsx`

| ID | Item | Severity |
|---|---|---|
| UI-S-W01 | **2 hub-card** (Performance/Development) dengan orb + 3-stat row + "Masuk →" | MAJOR ✅ **IMPLEMENTED 2026-06-28 Stage 2** — lihat UI-N-002. |
| UI-S-W02 | **Pohon 4–5 level** dengan expand/collapse + per-node `+ child` button (terkait UI-N-003) | MAJOR ✅ **STAGE 1 IMPLEMENTED 2026-06-28 (3-level kompromi)** — lihat UI-N-003. Initiative + AP level masih stack-nav per kompromi CEO review (mobile real-estate concern). Stage 2 (hub-card UI-N-002) sebagai polish berikut. |
| UI-S-W03 | **Period switcher** (lihat UI-G-010) | MAJOR ✅ **IMPLEMENTED 2026-06-28 (S1)** |
| UI-S-W04 | **Subhead kaya** per node (Aktual/Target/Gap, Kontribusi %, Risiko) | MAJOR |

### 4.4 Performance forms — Goal/KPI/Strategy/Initiative

| ID | Item | Severity |
|---|---|---|
| UI-S-G01 | `goal/new`: field **Target Tahunan**; field **Tahun Goal** + context-bar period otomatis | MAJOR ✅ **IMPLEMENTED 2026-06-28** — migrasi 0023 ALTER goals.target_value text; form ganti `period_start/end` jadi `Tahun Goal` (4-digit) → derive `YYYY-01-01`/`YYYY-12-31`; `Target Tahunan` free-form. |
| UI-S-K01 | `kpi-area/new`: **Pecahan Target** (Q1–Q4 breakdown bulanan, total 100%) | MAJOR ✅ **IMPLEMENTED 2026-06-28 (S2)** — panel inline `KpiAreaBreakdownPanel` di `kpi-area/[id]` (view + edit modal, Σ=100% live, monthly opsional). Migrasi 0021 + RPC `kpi_area_breakdown_replace` (audit `target_breakdown_updated`). Inline-form `kpi-area/new` ditunda — V1 atur breakdown dari halaman detail. |
| UI-S-K02 | `kpi-area/new`: **template picker** (Pakai Template + summary card) | MAJOR ✅ **IMPLEMENTED 2026-06-28** — `KpiAreaTemplatePicker` (bottom-sheet Modal) filter `goal_template_id` parent Goal, grouped per `division_label`. **Prefill lengkap PRD §18** pasca-migrasi 0027 (`target_hint` + `expected_outcome_hint`): tap template = isi Nama + Target + Ekspektasi Hasil. PIC rekomendasi belum (perlu kolom `recommended_pic_role` follow-up). |
| UI-S-K03 | `kpi-area/new`: field **Ekspektasi Hasil** | MINOR ✅ **IMPLEMENTED 2026-06-28** — migrasi 0025 `kpi_areas.expected_outcome text`; form input wajib (PRD §18). |
| UI-S-S01 | `strategy/new`: **Kontribusi Q%** ke parent KPI | MAJOR ✅ **IMPLEMENTED 2026-06-28** — migrasi 0023 ALTER strategies.contribution_pct numeric(6,3) CHECK [0..100]; form input numeric (0–100, koma/titik), null saat Draft. **Σ=100% sibling enforce DONE via migrasi 0024** patch `activate_strategy` (NULL = reject; Σ aktif+ini ≠ 100 = reject). |
| UI-S-I01 | `initiative/new`: field **Tim** | MINOR ✅ **IMPLEMENTED 2026-06-28** — migrasi 0025 `initiatives.team_id uuid FK teams ON DELETE SET NULL`; form `TeamChipSelector` query `listTeams({activeOnly:true})` (PRD §21). |
| UI-S-I02 | Date picker native untuk semua form (saat ini text `YYYY-MM-DD`) | MINOR ✅ **IMPLEMENTED 2026-06-28** — `components/date-field.tsx` (iOS: Modal+inline @expo/ui calendar; Android: dialog presentation; web/test: TextInput fallback). Wired ke 7 form: goal/kpi-area/strategy/initiative/problem-statement/development-area/action-plan new (4 date fields). |

### 4.5 Performance detail

| ID | Item | Severity |
|---|---|---|
| UI-S-GD1 | `goal/[id]`: **Progress vs Capaian** dual progress bars | MAJOR |
| UI-S-KD1 | `kpi-area/[id]`: kartu **"Cakupan & Gap"** (Target bulan / Nilai Hasil / Gap + capaian %) | MAJOR |
| UI-S-KD2 | `kpi-area/[id]`: kartu **"Nilai Hasil"** (current vs proposed) + "Input Nilai Hasil" + "Buka Review" actions | MAJOR |
| UI-S-KD3 | `kpi-area/[id]`: **Pecahan Target** panel + **Sumber Nilai Hasil** | MAJOR |
| UI-S-ID1 | `initiative/[id]`: **"Buka Chat"** action menuju Inbox room | MAJOR |
| UI-S-ID2 | `initiative/[id]`: kartu **"Ruang Eksekusi"** (Action Plan/Bukti/Keputusan counts) + **"Tim & Akses Otomatis"** roster | MAJOR ✅ **IMPLEMENTED 2026-06-28** — `ExecSpaceCard` 5-tile (Aktif/Review/Selesai/Revisi/Draft) + "Buka Chat Initiative" CTA (V1 route ke /(tabs)/inbox; per-initiative room ditunda); `RosterCard` unique PIC+Reviewer dari AP turunannya + Initiative PIC badge. Bukti/Keputusan counts ditunda (perlu query submissions per initiative). |
| UI-S-PD1 | **Kelengkapan Card** checklist per-field (Konteks/PIC/Target/Bukti rule) — bukan sekadar rasio MBR | MAJOR |

### 4.6 Development Workspace

| ID | Item | Severity |
|---|---|---|
| UI-S-DA1 | `development-area/new`: field **Visibilitas** | MINOR |
| UI-S-DA2 | `development-area/[id]`: **summary-strip** (Progress/Problem/Initiative counts) | MAJOR |
| UI-S-PR1 | `problem-statement/new`: field **Dampak** (High/Med/Low) + **Bukti awal** + context-bar parent | MAJOR ✅ **IMPLEMENTED 2026-06-28** — migrasi 0030 `problem_statements.impact text CHECK ('high','medium','low')` + `initial_evidence text`. Form: `ImpactSelector` chip 3-pilihan (wajib) + multiline "Bukti Awal" + context-bar "Development Area induk: ..." (PRD §15 metadata). |
| UI-S-PR2 | `problem-statement/[id]`: **summary-strip** + kartu "Bukti Problem Statement" | MAJOR |

### 4.7 Action Plan & eksekusi loop

| ID | Item | Severity |
|---|---|---|
| UI-S-AP1 | `action-plan/[id]`: panel **"Panduan Selesai"** checklist | MAJOR ✅ **IMPLEMENTED 2026-06-28** — `GuidanceChecklist` 5-langkah PIC journey (Pelajari brief → Aktifkan → Mulai kerja → Submit bukti → Tunggu approval); centang otomatis dari `ap.status`+lastSubmission; ratio badge `N/5` + note "Revisi" saat status=revision. |
| UI-S-AP2 | `action-plan/[id]`: panel **"Gate & kendala"** | MAJOR ✅ **IMPLEMENTED 2026-06-28** — `GateAndConstraints` 6-row derivasi field (PIC, Reviewer≠PIC, Deadline, Output, DoD, Bukti) + row Repeat rule saat repeat=true. Summary badge "N blokir"/"N perhatian"/"Tidak ada kendala" tone otomatis. |
| UI-S-AP3 | `action-plan/[id]`: tombol **"Buka Chat"** + shortcut "Ubah deadline" inline di Brief | MINOR |
| UI-S-AP4 | `action-plan/new`: **context-bar** parent Initiative; field **"Bukti yang diminta"** deskriptif (selain toggle wajib) | MINOR ✅ **IMPLEMENTED 2026-06-28** — migrasi 0027 `action_plans.evidence_description text` + form input multiline; context-bar parent Initiative (query `getInitiative(initiativeId)` + header strip "Initiative induk: ..."); gate aktivasi (0028) Bukti yang Diminta wajib bila `evidence_required=true` (PRD §22.5). |
| UI-S-AP5 | `action-plan/submit`: **file upload** (saat ini hanya text_note + link) | MAJOR |
| UI-S-AP6 | `action-plan/submit`: pisah **Result Value Input** dengan **linkage KPI Area + nilai lama→baru** ([[execution-loop]]) | MAJOR |
| UI-S-AP7 | `action-plan/instance/[id]`: **"Hari Ini N/M"** + ringkasan repeat (Target/Selesai/Terlewat/Grace) + **"Panduan Hari Ini"** checklist | MAJOR ✅ **IMPLEMENTED 2026-06-28 (Cat-3)** — SectionCard Ringkasan Hari Ini + Panduan Hari Ini kuratorial V1. |
| UI-S-EV1 | `evaluation.tsx`: checklist **"Perlu jadi SOP?" / "Perlu rollout?"** (loop balik ke Development) + field "Achievement %" | MAJOR ✅ **IMPLEMENTED 2026-06-28** — checkbox row dgn ≥44px touch target; flag `should_become_sop` + `rollout_needed` + textarea `rollout_notes` (conditional); RPC `record_evaluation` sudah terima 3 param (sejak migrasi 0014). Field "Achievement %" ditunda (perlu derivasi dari KPI Area). |

### 4.8 Inbox & chat

| ID | Item | Severity |
|---|---|---|
| UI-S-IN1 | `inbox.tsx`: **search input**, **filter chips** (Semua/Unread/Saya PIC/Review/Deadline), **avatar + preview pesan terakhir** | MAJOR |
| UI-S-IN2 | `inbox/[roomId]`: **chat bubble** kiri/kanan, **sender + avatar**, **date divider** | MAJOR |
| UI-S-IN3 | `inbox/[roomId]`: **banner konteks** (membalas AP/Initiative), **reaksi**, **read receipt**, **reply-quote**, **system events** | MAJOR |
| UI-S-IN4 | `inbox/[roomId]`: composer dengan **attach evidence** (paperclip) + circular send button | MAJOR |

### 4.9 People & Score

| ID | Item | Severity |
|---|---|---|
| UI-S-PP1 | `(tabs)/people.tsx`: **search**, **tabs** (Ranking/Bulan/Quarter/Admin), **"+ User"** primary button | MAJOR ✅ **PARTIAL 2026-06-28** — TextInput search (filter name/email/position/role case-insensitive) + 3-chip tabs (Ranking/Bulan/Quarter; Bulan & Quarter beri Badge "V1: filter periode menyusul"). Counter "N/total user". Tab "Admin" + "+ User" ditunda (lihat UI-S-PP3 — perlu putusan admin scope). |
| UI-S-PP2 | `(tabs)/people.tsx`: subhead row = **role/dept** (bukan email) | MINOR ✅ **IMPLEMENTED 2026-06-28** — `listOrgProfilesWithRoles` join role_templates; `personSubhead(p)` = position_title + role_name (fallback email kalau dua-duanya kosong). |
| UI-S-PP3 | `(tabs)/people.tsx`: panel admin **"Kelola User"** (invite, Import CSV, Salin Undangan, manage rows) — *blokir UI-N-001 yang relevan* | MAJOR |
| UI-S-PR1 | `people-profile/[id]`: **header cover + status pill + verified dot + role/join date** | MAJOR ✅ **IMPLEMENTED 2026-06-28** — `lib/cards.ts::getOrgProfileDetail` join `role_templates`; header sekarang tampilkan Aktif/Nonaktif pill, role+level, position_title, email, join date. Cover image ditunda. |
| UI-S-PR2 | `people-profile/[id]`: **action row** (Chat / Tugaskan / ⋯) | MAJOR ✅ **IMPLEMENTED 2026-06-28** — tombol "Chat" + overflow `⋯` (keduanya route ke `/(tabs)/inbox`); hidden saat profil milik diri sendiri. "Tugaskan" diskip (AP butuh konteks Initiative — bukan dari context profile). |
| UI-S-PR3 | `people-profile/[id]`: kartu **Ranking** (rank besar + periode) | MAJOR ✅ **IMPLEMENTED 2026-06-28** — `SectionCard` dgn tile `#N` brand-dark 64×64 + nama periode tertutup; tampil hanya bila ada `ranking_snapshots` entry (D9). |
| UI-S-PR4 | `people-profile/[id]`: kartu **Detail People** (Dept/Atasan/Hak Akses) + **Tugas** collapsible + **Kontribusi Bulan Ini** | MAJOR ✅ **PARTIAL 2026-06-28** — "Detail People" row Status/Hak akses/Posisi/Email dari `getOrgProfileDetail`; "Tugas aktif" collapsible (lazy fetch saat expand) via `listActionPlansByPic(userId)` + RLS. "Kontribusi Bulan Ini" + "Atasan" ditunda (perlu schema reporting graph). |
| UI-S-PR5 | `people-profile/[id]`: **Riwayat Score** + "Lihat Period Snapshot" | MINOR |
| UI-S-SF1 | `settings-score-formula`: **inline editor bobot** + validasi total 100% live + draft/activate footer ([[score-formula]]) | MAJOR ✅ **DONE** — editor inline (commit 50f3f59); versioning/effective-date/audit display di card versi read-only ditambah 2026-06-28 (effective_date label, change_reason quote, activated_at). |
| UI-S-SF2 | `settings-score-formula`: **role chips** (Staff/Management/C-Level/CEO/Custom) sebagai selector template | MAJOR ✅ **CLOSED 2026-06-28 (Cat-3)** — SF1 sudah implement LevelChips 4-chip (Staff/Mgmt/C-Level/CEO); Custom hidden per binding DEC-9. |
| UI-S-MO1 | `manual-score-override`: **4-tile grid** (Skor otomatis / Disesuaikan / Approval / Formula) — *opsional, kontradiksi dengan keputusan single-actor D10* | MINOR |

### 4.10 Admin & settings

| ID | Item | Severity |
|---|---|---|
| UI-S-PRM1 | `settings-permission-users`: **Scope pill per permission** (own/team/dept/org) + **Scope selector card** (lihat [[permission-model]]) | MAJOR ✅ **IMPLEMENTED 2026-06-28 (Cat-3)** — migrasi 0022 ALTER user_permissions.scope + RPC set_user_permission_scope; scope pill row di PermToggle. |
| UI-S-OR1 | `settings-org-structure`: tambahkan **Posisi**, **Tim**, **Garis laporan**, **Role Template** (kini hanya Departemen) | MAJOR ✅ **PARTIAL 2026-06-28 (Cat-3)** — 4 tab Dept/Posisi/Tim/Role aktif (migrasi 0022 create_position/role_template RPC). Garis laporan ditunda (perlu schema graph). |
| UI-S-KT1 | **Layar mandiri KPI Area Template** dengan grouping per divisi + Edit per-item | MAJOR ✅ **IMPLEMENTED 2026-06-28 (Cat-3)** — settings-kpi-area-templates.tsx (read-only, grouping per Goal Template); edit lewat Goal Template Library. |
| UI-S-GV1 | `settings-governance-violation`: aksi **"Selesaikan"** + **Resolution Note** + "Lihat entity" | MAJOR ✅ **IMPLEMENTED 2026-06-28 (Cat-3)** — migrasi 0022 ALTER + RPC resolve_governance_violation; tombol Selesaikan modal + Lihat entity link + filter status. |
| UI-S-AL1 | `settings-activity-log`: **search**, **filter chips**, **timeline + timestamp + actor** | MAJOR ✅ **IMPLEMENTED 2026-06-28 (Cat-3)** — TextInput search + 7 filter chip kategori + timestamp per row. |
| UI-S-AR1 | `settings-archive`: **filter chip** (Goal/Initiative/AP/Repeat) + **restore button** + metadata (oleh/alasan/tanggal) | MINOR ✅ **IMPLEMENTED 2026-06-28 (Cat-3)** — migrasi 0022 RPC restore_card; 8 filter chip per entity type + tombol Pulihkan ke Draft per row. ✅ **Metadata tanggal selesai 2026-06-28** via `lib/activity-governance.ts::getArchiveMetadata` (lookup action `card_archived` di `activity_logs`); tampil "Diarsipkan <tanggal>" per row. Nama actor resolusi ditunda. |
| UI-S-MBR1 | `settings-mbr`: **kartu "Contoh Tombol Ditahan"** demo visual (opsional, edukatif) | MINOR ✅ **IMPLEMENTED 2026-06-28** — `MbrExampleCard` di `settings-mbr.tsx` (badge Edukasi + mock Strategy "Tingkatkan retensi" 1/2 = 50% + tombol Aktifkan opacity-40 dengan caption dialog). |
| UI-S-CA1 | `settings-confidential-access`: resolve `user_id` → nama; pertimbangkan overview org-wide (selain entity-scoped) | MINOR |

---

## 5. Prioritisasi backlog (rekomendasi)

**P0 — pengalaman inti yang rusak**
- ~~UI-S-IN1 → UI-S-IN4~~ ✅ **Selesai 2026-06-26** (Inbox/chat full UI di belakang migrasi 0018; jest 540/540).
- ~~UI-S-SF1~~ ✅ **Selesai 2026-06-27** (editor bobot inline + validasi 100% live + 4 chip level + 2 RPC migrasi 0020; jest 600/600).
- ~~UI-G-001~~ ✅ **Selesai 2026-06-27** (komponen `ProgressOrb` 56/72 + `lib/progress.ts` derivasi children-done & status-AP; terintegrasi di header detail Goal/KPI/Strategy/Initiative/Action Plan; jest 614/614).
- ~~UI-S-AP5~~ ✅ **Selesai 2026-06-26** (file upload via Supabase Storage + 2-phase commit; migrasi 0019).
- ~~UI-S-AP6~~ ✅ **Selesai 2026-06-26** (KPI Area linkage + DeltaArrow + ImpactApprovalCard; previous_value server-computed via VIEW).

**P1 — gap fungsional yang nyata**
- UI-S-K01 (Pecahan Target Q/M). ✅ done.
- UI-S-S01 (Kontribusi Q% strategy). ✅ done 2026-06-28.
- UI-S-G01 (Target Tahunan goal). ✅ done 2026-06-28.
- UI-S-PR1 (Dampak + Bukti awal di Problem Statement).
- UI-S-GV1 (Governance: aksi "Selesaikan"). ✅ done.
- UI-S-OR1 (Org: Posisi/Tim/Garis laporan/Role Template). ✅ partial.
- UI-S-PRM1 (Scope pill di permission). ✅ done.
- UI-S-KT1 (KPI Template management). ✅ done.
- UI-S-EV1 (Evaluation SOP/rollout checklist). ✅ done 2026-06-28.
- UI-S-AP7 (Instance daily summary + Panduan Hari Ini). ✅ done.

**P2 — kekayaan visual & navigasi (perlu putusan produk dulu)**
- ~~UI-N-001 (Menu tab vs People tab)~~ ✅ **DONE 2026-06-28 (S0)** — `(tabs)/menu.tsx` aktif; People = stack route `/people`.
- ~~UI-N-002 / UI-S-W01 (Workspace hub-card).~~ ✅ **STAGE 2 DONE 2026-06-28** — `HubView` + 2 `WorkspaceHubCard` (orb % rasio active + 3-stat + Masuk CTA), default state `tab='hub'`, tombol "← Workspace" balik. Stats derived dari hook existing — zero query baru.
- UI-N-003 / UI-S-W02 (Tree 4–5 level inline). ✅ **STAGE 1 DONE 2026-06-28 (B′ kompromi 3-level)**. Tap-count Goal→Strategy 3→1. Initiative+AP tetap stack-nav per CEO review (mobile real-estate concern; 4-5 level penuh bisa degradasi UX untuk org besar).
- ~~UI-G-002 (Log Aktivitas panel sistemik)~~ ✅ **DONE 2026-06-28** — `activity-log-panel.tsx` ter-wire di 7 detail.
- UI-G-003 / UI-G-004 / UI-G-006 / UI-G-009 / UI-G-010 (MetaGrid, stepper, help "?", overflow ⋯, period switcher). MetaGrid+overflow+period switcher+help "?" selesai; stepper ditunda (perlu putusan UX form lifecycle).
- UI-S-PP3 (admin "Kelola User"). 🔒 perlu putusan.
- UI-S-PR1 (header rich chrome). ✅ done 2026-06-28 (cover image ditunda).
- UI-S-PR2 (action row Chat). ✅ done 2026-06-28. Tugaskan diskip (butuh konteks Initiative).
- UI-S-PR3 (ranking card besar). ✅ done 2026-06-28.
- UI-S-PR4 (detail people + tugas). ✅ partial 2026-06-28. Kontribusi Bulan Ini + Atasan ditunda (perlu reporting-graph schema).
- UI-S-H01–H03 (Home rail + Snapshot Tim + Fokus kaya). Ditunda (perlu data Snapshot Tim).

**P3 — token visual & polish**
- UI-G-011 (tile ikon per kartu Menu). ✅ **done 2026-07-02** — `IconTile` (6 tone) di grid + list Menu. icon-button hero Inbox/People ditunda.
- UI-G-005 (search pill di topbar). ✅ done.
- UI-G-007 / UI-G-008 (hue brand, radius kartu). 🔒 perlu putusan tim desain.
- UI-S-AL1 (Activity Log timeline polish). ✅ done.
- UI-S-AR1 (Archive filter + restore + metadata tanggal). ✅ done 2026-06-28.
- UI-S-H05 (pill tanggal di hero). ✅ done 2026-06-28.
- UI-S-MBR1 (demo visual MBR). ✅ done 2026-06-28.

---

## 6. Cara pakai dokumen ini

1. Setiap PR yang menutup item **wajib** mencantumkan ID-nya (mis. `feat(ui): UI-S-AP5 — upload bukti via Supabase Storage`).
2. Saat item selesai, ubah status di sini menjadi `~~UI-S-XXX~~ ✅` (strike + tanggal) dan pindahkan ringkas ke `wiki/log.md`.
3. Item P2/P3 yang butuh keputusan produk: angkat dulu di sesi `/office-hours` atau `/plan-ceo-review`, tulis verdict-nya sebagai catatan di bawah baris item.
4. Saat menambah komponen visual baru (orb, stepper, help-trigger, dll.), daftarkan dulu token & kelas di `DESIGN.md` lalu implementasi di `mobile/src/components/ui.tsx` — lihat aturan di [[architecture]] & `DESIGN.md` §7.
