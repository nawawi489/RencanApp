# PRD.md Rename Mapping — Workspace Terminology

Dokumen ini adalah **daftar perubahan PRD.md V1.8.2** yang akan di-commit di **F0**, mengikuti default rekomendasi RWT-01..RWT-12 di [rename-workspace-terminology.md](rename-workspace-terminology.md) §4.

Owner sudah menerima default (2026-07-11); yang PENDING hanya RWT-12 (Content Lead DRI + tanggal).

Semua baris kutipan diambil verbatim dari `PRD.md` versi commit `1ac977a` (origin/staging @ 2026-07-11).

---

## §2 Product Overview

**Baris 40** (Performance hierarchy)
```
Before: Goal -> KPI Area -> Strategy -> Initiative -> Action Plan
After:  Goal -> Strategy -> Initiative -> Action Plan -> Task
```

**Baris 44** (Development hierarchy, per **RWT-01 default A** — Development label ikut geser)
```
Before: Development Area -> Problem Statement / Development Goal -> Initiative -> Action Plan
After:  Development Area -> Problem Statement / Development Goal -> Action Plan -> Task
```

**Sisipan setelah baris 28** (positioning justifikasi, per **RWT-02 default A**)
```
+ Rencanapp bukan task management biasa. Task di Rencanapp bukan checklist bebas —
+ Task tunduk Reviewer, evidence, dan Score Formula. Level "Task" adalah unit
+ eksekusi terkecil yang ter-review, bukan to-do publik.
```

---

## §3 Tujuan Produk V1.82

**Baris 56, 58, 60**
```
Before line 56: 3. Menghubungkan Goal tahunan dengan KPI Area, Strategy, Initiative, dan Action Plan secara rapi.
After  line 56: 3. Menghubungkan Goal tahunan dengan Strategy, Initiative, Action Plan, dan Task secara rapi.

Before line 58: 5. Mengganti follow up manual di WhatsApp dengan Initiative Chat yang kontekstual.
After  line 58: 5. Mengganti follow up manual di WhatsApp dengan Diskusi Rencana Aksi yang kontekstual.
                (per RWT-04 default A — chat surface tetap di level 3 struktural,
                 label berubah dari "Initiative Chat" → "Diskusi Rencana Aksi")

Before line 60: 7. Membuat user non-teknis mudah memahami arti Goal, KPI Area, Strategy, Initiative, dan Action Plan.
After  line 60: 7. Membuat user non-teknis mudah memahami arti Goal, Strategy, Initiative, Action Plan, dan Task.
```

---

## §5 Bahasa dan Terminologi

**Baris 96-112** (daftar istilah Inggris yang dipertahankan)
```
Before                              After
1. Goal.                             1. Goal.
2. KPI Area.                         2. Strategy (label UI: Strategi).
3. Strategy.                         3. Initiative (label UI: Inisiatif).
4. Initiative.                       4. Action Plan (label UI: Rencana Aksi).
5. Action Plan.                      5. Task (label UI: Tugas).
6. Card.                             6. Card.
7. Workspace.                        7. Workspace.
8. Notifications.                    8. Notifications.
9. Inbox.                            9. Inbox.
10. People.                          10. People.
11. PIC.                             11. PIC.
12. Reviewer.                        12. Reviewer.
13. Minimum Breakdown Rule.          13. Minimum Breakdown Rule.
14. Score Formula.                   14. Score Formula.
15. Repeat.                          15. Repeat.
16. Action Plan Instance.            16. Task Instance (label UI: Instance).
                                        (per RWT-10 default A — pertahankan Inggris "Instance")
17. Archive.                         17. Archive.
```

**Sisipan setelah baris 112** (catatan pergeseran)
```
+ Catatan V1.8.3:
+ Istilah level pada Performance & Development bergeser bottom-up. Identifier kode
+ (tabel DB, RPC, route folder) memakai identifier snake_case baru: strategy, initiative,
+ action_plan, task. UI Bahasa Indonesia mengikuti label di kolom "label UI" di atas.
```

---

## §6 Batasan Produk V1.82

**Baris 153-163** (list Card entities)
```
Before                              After
12. KPI Area Template Library.       12. Strategy Template Library.
14. KPI Area Card.                   14. Strategy Card.
15. Strategy Card.                   15. Initiative Card.
16. Initiative Card.                 16. Action Plan Card.
17. Action Plan Card.                17. Task Card.
18. Action Plan One Time.            18. Task One Time.
19. Action Plan Repeat.              19. Task Repeat.
20. Action Plan Instance.            20. Task Instance.
22. KPI Area Target Breakdown.       22. Strategy Target Breakdown.
35. Inbox Initiative Chat.           35. Inbox Diskusi Rencana Aksi.
```

**Baris 134** (padanan UI)
```
Before: 5. Routine tidak digunakan. Gunakan Action Plan Repeat.
After:  5. Routine tidak digunakan. Gunakan Task Repeat.
```

---

## §7 Keputusan UX Utama

**Baris 293** (MBR blocking copy default)
```
Before: KPI Area ini baru punya 2 dari 3 Strategy. Tambahkan 1 Strategy lagi dulu, baru tombol + Initiative aktif.
After:  Strategy ini baru punya 2 dari 3 Initiative. Tambahkan 1 Initiative lagi dulu, baru tombol + Action Plan aktif.
```

---

## §9 User Role

**Baris 426-429** (izin membuat)
```
Before                              After
3. Membuat KPI Area.                 3. Membuat Strategy.
4. Membuat Strategy.                 4. Membuat Initiative.
5. Membuat Initiative.               5. Membuat Action Plan.
6. Membuat Action Plan.              6. Membuat Task.
```

---

## §10 Core Entity

**§10.1 Performance Workspace — baris 455**
```
Before: Goal -> KPI Area -> Strategy -> Initiative -> Action Plan
After:  Goal -> Strategy -> Initiative -> Action Plan -> Task
```

**§10.2 Development Workspace — baris 461** (per **RWT-01 default A**)
```
Before: Development Area -> Problem Statement / Development Goal -> Initiative -> Action Plan
After:  Development Area -> Problem Statement / Development Goal -> Action Plan -> Task
```

**§10.3 heading + §10.4 heading**
```
Before §10.3 Action Plan         After §10.3 Task
Before §10.4 Action Plan Instance  After §10.4 Task Instance
```

**Baris 465, 470, 472** (body)
```
Before: Action Plan punya dua mode:      After: Task punya dua mode:
Before: Repeat adalah setting di Action Plan.  After: Repeat adalah setting di Task.
Before: sistem menghasilkan Action Plan Instance.  After: sistem menghasilkan Task Instance.
```

---

## §11 Period Focus Engine

**Baris 496-502**
```
Before                                          After
KPI Area mengikuti periode Goal tahunan.         Strategy mengikuti periode Goal tahunan.
Strategy fokus pada Quarter.                     Initiative fokus pada Quarter.
Initiative fokus pada Quarter atau rentang.     Action Plan fokus pada Quarter atau rentang.
Action Plan fokus pada tanggal & deadline.       Task fokus pada tanggal & deadline.
```

---

## §12 Target Breakdown

**Heading baris 532**
```
Before: ## 12. Target Breakdown KPI Area
After:  ## 12. Target Breakdown Strategy
```

**Baris 536, 538, 540**
```
Before: KPI Area tidak punya masa berlaku sendiri...      After: Strategy tidak punya masa berlaku sendiri...
Before: KPI Area wajib punya target tahunan.              After: Strategy wajib punya target tahunan.
Before: KPI Area dapat dipecah ke:                        After: Strategy dapat dipecah ke:
```

---

## §13-15 Workspace Overview & Trees

**§13 baris 591, 593**
```
Before: Flow text: Goal -> KPI Area -> Strategy -> Initiative -> Action Plan.
After:  Flow text: Goal -> Strategy -> Initiative -> Action Plan -> Task.

Before: Metric ringkas: Goal, KPI Area, Alert.
After:  Metric ringkas: Goal, Strategy, Alert.
```

**§13 baris 599** (Development, RWT-01 A)
```
Before: Flow text: Development Area -> Problem Statement -> Initiative -> Action Plan.
After:  Flow text: Development Area -> Problem Statement -> Action Plan -> Task.
```

**§14 Performance Workspace Tree, baris 630-665** (Card definitions bergeser satu tingkat)
```
Card "KPI Area" (baris 633-641) — HAPUS blok, entity ini digabung ke Card Strategy baru.

Card "Strategy" (baris 643-651) — RENAME jadi Card Initiative:
  Label: Strategy → Label: Initiative
  Kontribusi 42% dst tetap
  Actions "+ Initiative" → "+ Action Plan"
  "+ Initiative bisa dikunci MBR" → "+ Action Plan bisa dikunci MBR"

Card "Initiative" (baris 653-661) — RENAME jadi Card Action Plan:
  Label: Initiative → Label: Action Plan
  Actions arrow "buka Action Plan" → "buka Task"

Card "Action Plan" (baris 663-665) — RENAME jadi Card Task:
  Label: Action Plan → Label: Task

TAMBAHAN: Card baru "Strategy" (menggantikan Card KPI Area lama) di posisi teratas
(label, gap, target breakdown attribution, MBR = 3 Initiative).
```

**§15 Development Tree, baris 699-711** (RWT-01 A)
```
Before: Actions: Detail, `...`, + Initiative.           After: Actions: Detail, `...`, + Action Plan.
Before: Initiative:                                     After: Action Plan:
Before: 1. Sama pola dengan Performance Initiative.     After: 1. Sama pola dengan Performance Action Plan.
Before: 2. Bisa membuka Chat Initiative.                After: 2. Bisa membuka Diskusi Rencana Aksi.
Before: 3. Bisa membuat Action Plan jika...             After: 3. Bisa membuat Task jika...
Before: Action Plan:                                    After: Task:
Before: 1. Sama pola dengan Performance Action Plan.    After: 1. Sama pola dengan Performance Task.
```

---

## §18-19 New KPI Area & Template Library

**§18 heading baris 767** dan seluruh body
```
Before: ## 18. New KPI Area                              After: ## 18. New Strategy (Area Hasil)
Before: Membuat KPI Area di bawah Goal tahunan.          After: Membuat Strategy di bawah Goal tahunan.
Before: Tombol Pakai Template tersedia di dalam Data KPI Area.  After: ... di dalam Data Strategy.
Before: 1. Nama KPI Area.                                After: 1. Nama Strategy.
Before: 1. Masa berlaku KPI Area.                        After: 1. Masa berlaku Strategy.
Before: 1. Masa berlaku KPI Area otomatis mengikuti Goal tahunan.  After: 1. Masa berlaku Strategy...
Before: migrasi 0032 + `lib/kpi-gap.ts` + layar KPI form/detail + kartu Home "Gap KPI Area".
After:  migrasi 0032 + `lib/strategy-gap.ts` + layar Strategy form/detail + kartu Home "Gap Strategy".
                (nb: rename lib file terjadi di F4, PRD boleh sudah pakai nama baru)
Before: 5. Setelah template dipilih, Nama KPI Area, PIC rekomendasi, Target awal, dan Ekspektasi Hasil terisi otomatis.
After:  5. Setelah template dipilih, Nama Strategy, PIC rekomendasi, Target awal, dan Ekspektasi Hasil terisi otomatis.
```

**§19 heading baris 823 + body baris 875**
```
Before: ## 19. KPI Area Template Library                 After: ## 19. Strategy Template Library
Before: Update template tidak otomatis mengubah KPI Area aktif.  After: ... mengubah Strategy aktif.
```

*(Isi template Sales/Ops/Finance/HC/Growth tidak berubah — masih valid semantik sebagai "area hasil".)*

---

## §20 New Strategy (LAMA) → jadi §20 New Initiative

**Heading + body baris 879-905** — geser identitas satu level
```
Before: ## 20. New Strategy                              After: ## 20. New Initiative (Pendekatan Q-focused)
Before: Membuat pendekatan eksekusi untuk KPI Area.      After: Membuat pendekatan eksekusi untuk Strategy.
Before: 1. Nama Strategy.                                After: 1. Nama Initiative.
Before: 1. Strategy berada di bawah KPI Area.            After: 1. Initiative berada di bawah Strategy.
Before: 2. Strategy fokus pada Quarter aktif.            After: 2. Initiative fokus pada Quarter aktif.
Before: 3. Strategy tidak punya target tahunan.          After: 3. Initiative tidak punya target tahunan.
Before: 4. Strategy menjelaskan cara mencapai KPI Area.  After: 4. Initiative menjelaskan cara mencapai Strategy.
Before: 5. Strategy dapat dibuat Draft dan diaktifkan... After: 5. Initiative dapat dibuat Draft dan diaktifkan...
Before: 1. Context bar menampilkan KPI Area, bulan aktif, dan quarter.  After: ... menampilkan Strategy, bulan aktif, dan quarter.
```

---

## §21 New Initiative (LAMA) → jadi §21 New Action Plan

**Heading + body baris 909-933** — semantic: bekas "Initiative" (program unit) sekarang "Action Plan"
```
Before: ## 21. New Initiative                            After: ## 21. New Action Plan (Program Unit)
Before: Membuat program eksekusi di bawah Strategy atau Problem Statement.
After:  Membuat program eksekusi di bawah Initiative atau Problem Statement.
Before: 1. Nama Initiative.                              After: 1. Nama Action Plan.
Before: 1. Initiative punya Chat Initiative otomatis setelah aktif.
After:  1. Action Plan punya Diskusi Rencana Aksi otomatis setelah aktif.  (RWT-04 A)
Before: 2. Initiative dapat memiliki Action Plan.        After: 2. Action Plan dapat memiliki Task.
Before: 4. Initiative tidak menampilkan pengaturan akses manual di form utama.
After:  4. Action Plan tidak menampilkan pengaturan akses manual di form utama.
```

---

## §22 New Action Plan (LAMA) → jadi §22 New Task

**Heading + body baris 937-976**
```
Before: ## 22. New Action Plan                           After: ## 22. New Task
Before: Membuat pekerjaan konkret di bawah Initiative.   After: Membuat pekerjaan konkret di bawah Action Plan.
(sisa field & rule ikut geser: PIC, deadline, evidence, Repeat toggle tetap; label internal ganti)
```

---

## §29 Inbox

**Baris 1157**
```
Before: Khusus Initiative Chat.                          After: Khusus Diskusi Rencana Aksi. (RWT-04 A)
```

**Baris 1166-1168**
```
Before: 2. Search Initiative atau pesan.                 After: 2. Search Rencana Aksi atau pesan.
Before: 4. List Chat Initiative.                         After: 4. List Diskusi Rencana Aksi.
```

---

## §30 Initiative Chat → Diskusi Rencana Aksi

**Heading baris 1181 + body 1183-1206**
```
Before: ## 30. Initiative Chat                           After: ## 30. Diskusi Rencana Aksi
Before: Tempat diskusi Initiative dan konteks Action Plan.  After: Tempat diskusi Rencana Aksi dan konteks Task.
Before: 3. Button buka Initiative.                       After: 3. Button buka Rencana Aksi.
Before: 10. Action Plan reply context banner.            After: 10. Task reply context banner.
Before: 1. Chat selalu terikat Initiative.               After: 1. Chat selalu terikat Rencana Aksi (level 3 struktural).
Before: 2. Action Plan dapat membuka chat dengan konteks reply.  After: 2. Task dapat membuka chat dengan konteks reply.
Before: 3. Action Plan tidak membuat chat terpisah.      After: 3. Task tidak membuat chat terpisah.
Before: 4. Bukti tetap dikirim melalui Action Plan, bukan sebagai chat biasa.  After: 4. Bukti tetap dikirim melalui Task, bukan sebagai chat biasa.
```

**Catatan RWT-04 (default A):** membership chat stabil. Row `chat_rooms` yang sebelumnya
terikat `initiatives.id` sekarang terikat kolom baru `action_plan_id` (ex-`initiative_id`);
tidak ada baris di-migrate ke tabel lain. UI label "Initiative Chat" berubah jadi
"Diskusi Rencana Aksi" murni cosmetic.

---

## §31 Menu (Template accordion)

**Baris ~1230 (item Template Library)**
```
Before: KPI Area Template Library                        After: Strategy Template Library
```

*(§32 People, §33 People Profile, §34.1-.3 tidak menyentuh terminologi ini.)*

---

## §34.4 Minimum Breakdown Rule (Performance)

**Baris 1373-1375 (§34.4)**
```
Before                                                  After
1. KPI Area minimal 3 Strategy sebelum + Initiative aktif.  1. Strategy minimal 3 Initiative sebelum + Action Plan aktif.
2. Strategy minimal 3 Initiative sebelum + Action Plan aktif.  2. Initiative minimal 3 Action Plan sebelum + Task aktif.
3. Initiative minimal 3 Action Plan sebagai standar eksekusi lengkap.  3. Action Plan minimal 3 Task sebagai standar eksekusi lengkap.
                                                        + 4. Task tidak punya MBR (level operasional harian) — per RWT-09 default A meninggalkan angka 3
                                                            tapi opsional; seed 0049 menyalakan default 3, admin org bisa nonaktifkan per level.
```

**Catatan RWT-09 (default A):** seed `minimum_breakdown_rules` menambahkan default `3` untuk pasangan `('action_plan', 'task')` sehingga pola 3/3/3 lama menjadi 3/3/3/3. Admin org bisa turunkan ke 0 lewat Settings.

---

## §34.6 MBR Development

**Baris 1380-1382 (§34.6)**
```
Before                                                  After (per RWT-01 A)
2. Problem Statement minimal 1 Initiative.               2. Problem Statement minimal 1 Action Plan.
3. Initiative minimal 3 Action Plan.                     3. Action Plan minimal 3 Task.
```

---

## §35 Activity Log

**Sisipan setelah paragraf pembuka §35** (catatan RWT-07 default A)
```
+ Catatan V1.8.3:
+ Row historis Activity Log yang menyimpan literal `entity_type = 'kpi_area' | 'strategy' | 'initiative' | 'action_plan' | 'action_plan_instance'`
+ TIDAK di-backfill (audit integrity). Read-side rendering menggunakan helper
+ `map_legacy_entity_type(text)` untuk menampilkan label baru; row baru menulis literal enum V1.8.3.
```

---

## §42 Screen List V1.82

**Baris 1631-1634, 1638, 1648** (nama layar bergeser)
```
Before                                                  After
13. New KPI Area.                                        13. New Strategy.
14. New Strategy.                                        14. New Initiative.
15. New Initiative.                                      15. New Action Plan.
16. KPI Area Detail.                                     16. Strategy Detail.
17. Strategy Detail.                                     17. Initiative Detail.
18. Initiative Detail.                                   18. Action Plan Detail.
19. Action Plan Detail.                                  19. Task Detail.
20. New Action Plan.                                     20. New Task.
24. Action Plan Instance Detail.                         24. Task Instance Detail.
30. Initiative Chat.                                     30. Diskusi Rencana Aksi.  (RWT-04 A)
38. KPI Area Template Library.                           38. Strategy Template Library.
```

---

## §43 Seed Data Prototype

**Baris 1688-1694** (Performance chain sample)
```
Before                                                  After
2. KPI Area: Menambah Jumlah Customer.                   2. Strategy: Menambah Jumlah Customer.
3. KPI Area: Meningkatkan Basket Size.                   3. Strategy: Meningkatkan Basket Size.
4. KPI Area: Meningkatkan Output Produk.                 4. Strategy: Meningkatkan Output Produk.
5. Strategy: Akuisisi Customer via Meta Ads.             5. Initiative: Akuisisi Customer via Meta Ads.
6. Initiative: Campaign Paket Hemat Pizza.               6. Action Plan: Campaign Paket Hemat Pizza.
7. Action Plan: Upload 5 konten angle hemat.             7. Task: Upload 5 konten angle hemat.
```

**Baris 1699-1701** (Development sample, RWT-01 A)
```
Before                                                  After
3. Initiative: Bangun EMS V1.                            3. Action Plan: Bangun EMS V1.
4. Action Plan: Finalisasi UI blueprint mobile.          4. Task: Finalisasi UI blueprint mobile.
```

---

## Non-menyentuh (verifikasi)

Section-section di bawah **TIDAK** menyentuh terminologi Performance chain — tidak perlu diubah:

- §4 Tech Stack Target
- §8 Design System (kecuali §Workspace pill — direct-update via DESIGN.md, bukan PRD)
- §17 New Goal (label Goal tetap)
- §23 Repeat Setting (Repeat semantik tetap; label form "Task Repeat" digantikan lewat §22)
- §24 Bukti, Nilai Hasil, Review (Card-agnostic)
- §25 Deadline Change Request
- §26 Evaluation
- §27 Home (label copy diatur di `workspace-copy.ts`, PRD hanya sebut "Card" agnostik)
- §28 Notifications (helper `map_legacy_entity_type` menangani render, konten §28 stabil)
- §32 People, §33 People Profile
- §36 Governance Violation, §37 Archive, §38 Search, §39 Login, §40 Empty/Loading/Error, §41 API rule, §44 Acceptance, §45 Final Statement

---

## Ringkasan hitungan

- **Section modified:** 13 (§2, §3, §5, §6, §7, §9, §10, §11, §12, §13-15, §18-19, §20-22, §29-30, §31, §34.4, §34.6, §35, §42, §43)
- **Section renumbered:** 0 (heading number tetap, konten dalamnya bergeser)
- **Baris berubah kasar:** ~120 dari 163 hit terminologi
- **Sisipan baru:** 3 paragraf (§2 positioning, §5 catatan V1.8.3, §35 audit compat)

---

## Approval

Setelah owner OK, saya akan:
1. Apply diff ke `PRD.md` dalam satu commit `docs(prd): rename Performance chain terminology (RWT-01..RWT-12 defaults)`.
2. Update `wiki/log.md` entry `[2026-07-11] update | PRD.md V1.8.3 rename Performance chain`.
3. Isi status `DECIDED (A) 2026-07-11` di [rename-workspace-terminology.md](rename-workspace-terminology.md) §4 untuk 11 RWT (RWT-12 tetap PENDING sampai owner isi DRI+tanggal).
4. Mark task #1 (F0 gate) sebagai completed, buka F1 (task #2).

**Kalau ada baris yang ingin di-override**, sebutkan nomor section (mis. "override §5 baris 5 — Task ganti jadi 'Aksi'"), saya adjust sebelum apply.
