---
type: concept
tags: [ui, design, prototype, backlog, gap-analysis]
updated: 2026-06-26
sources: 2
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
| **UI-G-002** | Tidak ada panel **"Log Aktivitas"** di layar detail | Goal/KPI/Strategy/Initiative/DevArea/Problem/AP detail | Collapsible "Log Aktivitas" memakai data `activity_log` (sudah append-only, [[audit-governance]]); reuse di semua detail |
| **UI-G-003** | **MetaGrid 4-sel** pada header detail (saat ini 1–2 sel) | Semua layar detail | Tambah Parent reference + PIC nama + 2 metrik konteks (Target/Aktual atau Kontribusi/Periode) |
| **UI-G-004** | **Stepper "Langkah N dari M" + footer Draft & Aktifkan** di form "baru" | Semua form `*/new.tsx` | Komponen `WizardHero` + `StickyActions`; satu screen tetap pakai single button bila form ≤4 field |
| **UI-G-005** | **Search pill di topbar** & entry point ke global search | Semua layar utama | Tambah `TopSearchPill` di `AppHeader`; route ke `/(app)/search` |
| **UI-G-006** | **Tombol help "?"** per kartu/section (mengeluarkan sheet dengan glossary) | Hampir semua kartu prototype | Komponen `CardHelpTrigger` + glossary content store (per-entity) |
| **UI-G-007** | **Sumbu warna brand** beda (`#208aef` vs `#1877f2` prototype) — fonts Inter belum dimuat | Global | Sudah dicatat di `DESIGN.md` §11; keputusan terbuka — angkat ke status `[?]` di backlog |
| **UI-G-008** | **Radius kartu** 16px app vs 8px prototype (rasa lebih bulat vs lebih "spreadsheet-like") | Global | Putuskan radius kanonik di `DESIGN.md` lalu pilih: turunkan `rounded-2xl` → `rounded-xl`/`rounded-lg`, atau tetap. |
| **UI-G-009** | **Per-card overflow `⋯`** untuk aksi sekunder (Arsipkan, Ubah, Salin, Hapus draft) | Semua tree-card & list row | `RowActionsMenu` (bottom sheet) konsisten lintas list |
| **UI-G-010** | **Period switcher (Bulan/Quarter + arsip periode)** | `performance-workspace`, `development-workspace`, profil people | Komponen `PeriodSwitcher` yang membaca [[score-formula|periode aktif/closed]] |

---

## 3. Gap navigasi (struktural)

| ID | Gap | Severity |
|---|---|---|
| **UI-N-001** | **Tab "Menu" hilang** (slot 5 dipakai People). Hub Menu (profil + template + settings + governance + logout) tersebar | MAJOR |
| **UI-N-002** | **Workspace hub-card → tab-switcher**: 2 kartu hub Performance/Development hilang (kehilangan ringkasan + entry yang sengaja "berat") | MAJOR |
| **UI-N-003** | **Pohon hanya 2 level** (Goal→KPI; DevArea→Problem). Strategy/Initiative/Action Plan tidak ada di tree workspace | MAJOR |
| **UI-N-004** | Beberapa layar prototype terlipat ke layar lain — bukan regresi tapi catat sebagai keputusan: `repeat-setting`, `result-value-input`, `review-flow`, `card-completeness`, `kpi-template-library` | INFO |

**Rekomendasi:** UI-N-001 & UI-N-002 perlu keputusan produk dulu (apa "Menu tab" bawa nilai cukup vs ruang People tab). Catat keputusan di sini sebelum implementasi.

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
| UI-S-H05 | Hero: pill tanggal (bukan caption uppercase) | MINOR |

### 4.2 Notifications — `(tabs)/notifications.tsx`

| ID | Item | Severity |
|---|---|---|
| UI-S-N01 | **Tombol aksi inline** per row (Review / Lihat Bukti / Buka Request) | MAJOR |
| UI-S-N02 | **Grup "Baru" / "Sebelumnya"** (date divider) | MINOR |

### 4.3 Workspace — `(tabs)/workspace.tsx`

| ID | Item | Severity |
|---|---|---|
| UI-S-W01 | **2 hub-card** (Performance/Development) dengan orb + 3-stat row + "Masuk →" | MAJOR (lihat UI-N-002) |
| UI-S-W02 | **Pohon 4–5 level** dengan expand/collapse + per-node `+ child` button (terkait UI-N-003) | MAJOR |
| UI-S-W03 | **Period switcher** (lihat UI-G-010) | MAJOR |
| UI-S-W04 | **Subhead kaya** per node (Aktual/Target/Gap, Kontribusi %, Risiko) | MAJOR |

### 4.4 Performance forms — Goal/KPI/Strategy/Initiative

| ID | Item | Severity |
|---|---|---|
| UI-S-G01 | `goal/new`: field **Target Tahunan**; field **Tahun Goal** + context-bar period otomatis | MAJOR |
| UI-S-K01 | `kpi-area/new`: **Pecahan Target** (Q1–Q4 breakdown bulanan, total 100%) | MAJOR |
| UI-S-K02 | `kpi-area/new`: **template picker** (Pakai Template + summary card) | MAJOR |
| UI-S-K03 | `kpi-area/new`: field **Ekspektasi Hasil** | MINOR |
| UI-S-S01 | `strategy/new`: **Kontribusi Q%** ke parent KPI | MAJOR |
| UI-S-I01 | `initiative/new`: field **Tim** | MINOR |
| UI-S-I02 | Date picker native untuk semua form (saat ini text `YYYY-MM-DD`) | MINOR |

### 4.5 Performance detail

| ID | Item | Severity |
|---|---|---|
| UI-S-GD1 | `goal/[id]`: **Progress vs Capaian** dual progress bars | MAJOR |
| UI-S-KD1 | `kpi-area/[id]`: kartu **"Cakupan & Gap"** (Target bulan / Nilai Hasil / Gap + capaian %) | MAJOR |
| UI-S-KD2 | `kpi-area/[id]`: kartu **"Nilai Hasil"** (current vs proposed) + "Input Nilai Hasil" + "Buka Review" actions | MAJOR |
| UI-S-KD3 | `kpi-area/[id]`: **Pecahan Target** panel + **Sumber Nilai Hasil** | MAJOR |
| UI-S-ID1 | `initiative/[id]`: **"Buka Chat"** action menuju Inbox room | MAJOR |
| UI-S-ID2 | `initiative/[id]`: kartu **"Ruang Eksekusi"** (Action Plan/Bukti/Keputusan counts) + **"Tim & Akses Otomatis"** roster | MAJOR |
| UI-S-PD1 | **Kelengkapan Card** checklist per-field (Konteks/PIC/Target/Bukti rule) — bukan sekadar rasio MBR | MAJOR |

### 4.6 Development Workspace

| ID | Item | Severity |
|---|---|---|
| UI-S-DA1 | `development-area/new`: field **Visibilitas** | MINOR |
| UI-S-DA2 | `development-area/[id]`: **summary-strip** (Progress/Problem/Initiative counts) | MAJOR |
| UI-S-PR1 | `problem-statement/new`: field **Dampak** (High/Med/Low) + **Bukti awal** + context-bar parent | MAJOR |
| UI-S-PR2 | `problem-statement/[id]`: **summary-strip** + kartu "Bukti Problem Statement" | MAJOR |

### 4.7 Action Plan & eksekusi loop

| ID | Item | Severity |
|---|---|---|
| UI-S-AP1 | `action-plan/[id]`: panel **"Panduan Selesai"** checklist | MAJOR |
| UI-S-AP2 | `action-plan/[id]`: panel **"Gate & kendala"** | MAJOR |
| UI-S-AP3 | `action-plan/[id]`: tombol **"Buka Chat"** + shortcut "Ubah deadline" inline di Brief | MINOR |
| UI-S-AP4 | `action-plan/new`: **context-bar** parent Initiative; field **"Bukti yang diminta"** deskriptif (selain toggle wajib) | MINOR |
| UI-S-AP5 | `action-plan/submit`: **file upload** (saat ini hanya text_note + link) | MAJOR |
| UI-S-AP6 | `action-plan/submit`: pisah **Result Value Input** dengan **linkage KPI Area + nilai lama→baru** ([[execution-loop]]) | MAJOR |
| UI-S-AP7 | `action-plan/instance/[id]`: **"Hari Ini N/M"** + ringkasan repeat (Target/Selesai/Terlewat/Grace) + **"Panduan Hari Ini"** checklist | MAJOR |
| UI-S-EV1 | `evaluation.tsx`: checklist **"Perlu jadi SOP?" / "Perlu rollout?"** (loop balik ke Development) + field "Achievement %" | MAJOR |

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
| UI-S-PP1 | `(tabs)/people.tsx`: **search**, **tabs** (Ranking/Bulan/Quarter/Admin), **"+ User"** primary button | MAJOR |
| UI-S-PP2 | `(tabs)/people.tsx`: subhead row = **role/dept** (bukan email) | MINOR |
| UI-S-PP3 | `(tabs)/people.tsx`: panel admin **"Kelola User"** (invite, Import CSV, Salin Undangan, manage rows) — *blokir UI-N-001 yang relevan* | MAJOR |
| UI-S-PR1 | `people-profile/[id]`: **header cover + status pill + verified dot + role/join date** | MAJOR |
| UI-S-PR2 | `people-profile/[id]`: **action row** (Chat / Tugaskan / ⋯) | MAJOR |
| UI-S-PR3 | `people-profile/[id]`: kartu **Ranking** (rank besar + periode) | MAJOR |
| UI-S-PR4 | `people-profile/[id]`: kartu **Detail People** (Dept/Atasan/Hak Akses) + **Tugas** collapsible + **Kontribusi Bulan Ini** | MAJOR |
| UI-S-PR5 | `people-profile/[id]`: **Riwayat Score** + "Lihat Period Snapshot" | MINOR |
| UI-S-SF1 | `settings-score-formula`: **inline editor bobot** + validasi total 100% live + draft/activate footer ([[score-formula]]) | MAJOR |
| UI-S-SF2 | `settings-score-formula`: **role chips** (Staff/Management/C-Level/CEO/Custom) sebagai selector template | MAJOR |
| UI-S-MO1 | `manual-score-override`: **4-tile grid** (Skor otomatis / Disesuaikan / Approval / Formula) — *opsional, kontradiksi dengan keputusan single-actor D10* | MINOR |

### 4.10 Admin & settings

| ID | Item | Severity |
|---|---|---|
| UI-S-PRM1 | `settings-permission-users`: **Scope pill per permission** (own/team/dept/org) + **Scope selector card** (lihat [[permission-model]]) | MAJOR |
| UI-S-OR1 | `settings-org-structure`: tambahkan **Posisi**, **Tim**, **Garis laporan**, **Role Template** (kini hanya Departemen) | MAJOR |
| UI-S-KT1 | **Layar mandiri KPI Area Template** dengan grouping per divisi + Edit per-item | MAJOR |
| UI-S-GV1 | `settings-governance-violation`: aksi **"Selesaikan"** + **Resolution Note** + "Lihat entity" | MAJOR |
| UI-S-AL1 | `settings-activity-log`: **search**, **filter chips**, **timeline + timestamp + actor** | MAJOR |
| UI-S-AR1 | `settings-archive`: **filter chip** (Goal/Initiative/AP/Repeat) + **restore button** + metadata (oleh/alasan/tanggal) | MINOR |
| UI-S-MBR1 | `settings-mbr`: **kartu "Contoh Tombol Ditahan"** demo visual (opsional, edukatif) | MINOR |
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
- UI-S-K01 (Pecahan Target Q/M).
- UI-S-S01 (Kontribusi Q% strategy).
- UI-S-G01 (Target Tahunan goal).
- UI-S-PR1 (Dampak + Bukti awal di Problem Statement).
- UI-S-GV1 (Governance: aksi "Selesaikan").
- UI-S-OR1 (Org: Posisi/Tim/Garis laporan/Role Template).
- UI-S-PRM1 (Scope pill di permission).
- UI-S-KT1 (KPI Template management).
- UI-S-EV1 (Evaluation SOP/rollout checklist).
- UI-S-AP7 (Instance daily summary + Panduan Hari Ini).

**P2 — kekayaan visual & navigasi (perlu putusan produk dulu)**
- UI-N-001 (Menu tab vs People tab).
- UI-N-002 / UI-S-W01 (Workspace hub-card).
- UI-N-003 / UI-S-W02 (Tree 4–5 level inline).
- UI-G-002 (Log Aktivitas panel sistemik).
- UI-G-003 / UI-G-004 / UI-G-006 / UI-G-009 / UI-G-010 (MetaGrid, stepper, help "?", overflow ⋯, period switcher).
- UI-S-PP3 / UI-S-PR1–PR4 (People + profile rich chrome).
- UI-S-H01–H03 (Home rail + Snapshot Tim + Fokus kaya).

**P3 — token visual & polish**
- UI-G-005 (search pill di topbar).
- UI-G-007 / UI-G-008 (hue brand, radius kartu).
- UI-S-AL1 (Activity Log timeline polish).
- UI-S-AR1 (Archive filter + restore).
- UI-S-MBR1 (demo visual MBR).

---

## 6. Cara pakai dokumen ini

1. Setiap PR yang menutup item **wajib** mencantumkan ID-nya (mis. `feat(ui): UI-S-AP5 — upload bukti via Supabase Storage`).
2. Saat item selesai, ubah status di sini menjadi `~~UI-S-XXX~~ ✅` (strike + tanggal) dan pindahkan ringkas ke `wiki/log.md`.
3. Item P2/P3 yang butuh keputusan produk: angkat dulu di sesi `/office-hours` atau `/plan-ceo-review`, tulis verdict-nya sebagai catatan di bawah baris item.
4. Saat menambah komponen visual baru (orb, stepper, help-trigger, dll.), daftarkan dulu token & kelas di `DESIGN.md` lalu implementasi di `mobile/src/components/ui.tsx` — lihat aturan di [[architecture]] & `DESIGN.md` §7.
