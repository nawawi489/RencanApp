# Rencanapp V1.82 — 01 · Konsep & Fondasi

> **Untuk AI agent:** File ini adalah north star dan guardrail. Baca pertama. Isinya: apa itu Rencanapp/EMS, batas scope V1.82, aturan bahasa, status card, struktur workspace, dua konsep periode utama (Period Focus Engine & Target Breakdown KPI Area), prinsip card, dan makna tiap jenis card. Untuk spesifikasi field & validasi card → [02-spesifikasi-card-dan-eksekusi.md](02-spesifikasi-card-dan-eksekusi.md). Untuk permission, data, score, governance → [03-sistem-permission-data-governance.md](03-sistem-permission-data-governance.md). Sumber otoritatif: [../PRD.md](../PRD.md).

---

## 1. Apa itu Rencanapp

Rencanapp adalah **Execution Management System (EMS)** yang membantu perusahaan mengubah target besar menjadi eksekusi nyata yang bisa dipantau, direview, dibuktikan, dan dipertanggungjawabkan.

Tagline: *Rencanakan. Jalankan. Tuntaskan.*

Rencanapp **bukan**: task management biasa, chat, social media, atau aplikasi perhitungan KPI formal seperti spreadsheet.

Rencanapp adalah sistem eksekusi berbasis **card** yang menghubungkan:

- **Performance:** Goal → KPI Area → Strategy → Initiative → Action Plan
- **Development:** Development Area → Problem Statement / Development Goal → Initiative → Action Plan

Prinsip utama:

> Perusahaan tidak membayar kesibukan. Perusahaan membayar eksekusi yang punya arah, bukti, review, dan hasil.

## 2. Tujuan Produk V1.82

1. Membantu user fokus pada pekerjaan yang relevan hari ini.
2. Membuat target tahunan dapat dieksekusi dalam periode berjalan tanpa membanjiri user dengan card.
3. Menghubungkan Goal tahunan dengan KPI Area, Strategy, Initiative, dan Action Plan secara rapi.
4. Membuat Development Workspace fokus pada pembangunan sistem, problem, dan perbaikan proses.
5. Mengganti follow up manual WhatsApp dengan Initiative Chat kontekstual.
6. Setiap pekerjaan punya PIC, Reviewer (jika perlu), deadline, output, bukti, dan review.
7. User non-teknis mudah memahami arti Goal/KPI Area/Strategy/Initiative/Action Plan.
8. Admin dapat mengatur permission, template, score formula, organization, rules, archive, governance.
9. People menampilkan performa objektif **tanpa mempermalukan** user.
10. UI mobile-first, minimalis, card-based, tidak menstres user, tidak seperti dashboard desktop.

## 3. Batas Scope V1.82

**Masuk V1.82:** Login, User profile, Organization, Department, Position, Team, Role template, User permission, Performance Workspace, Development Workspace, Goal & KPI Area Template Library, semua card (Goal/KPI Area/Strategy/Initiative/Action Plan), Action Plan One Time/Repeat/Instance, **Period Focus Engine**, **KPI Area Target Breakdown (Quarter + Bulan total 100%)**, Kelengkapan Card (backend guard + popup), Keterangan Card (icon `?`), Minimum Breakdown Rule, Kelengkapan Perencanaan (backend guard + popup), Bukti (versioning), Nilai Hasil, Review, Deadline Change Request, Evaluation, Activity Log, Governance Violation, Notifications, Inbox Initiative Chat, **Menu**, People, Score Formula, Repeat Compliance, Basic ranking, Settings, Archive, Search, Confidential Access, Manual Score Override.

**TIDAK masuk V1.82 (tolak jika diusulkan):** Feed, Company News, Announcement, CEO Broadcast, SOP Center penuh, Knowledge Center, HRIS penuh, Payroll, Inventory, CRM, WhatsApp integration, Google Calendar integration, AI Assistant, AI Review, Native Android/iOS, Routine entity, Checklist Routine entity, Watcher, Area Goal layer, KPI child table di bawah Area Goal, **Bobot antar planning card**.

## 4. Bahasa Sistem

Bahasa utama UI = **Bahasa Indonesia**. Semua label, tombol, validasi, pesan error, popup default = Indonesia.

**Istilah Inggris yang dipertahankan:** Goal, KPI Area, Strategy, Initiative, Action Plan, Card, Workspace, Notifications, Inbox, People, PIC, Reviewer, Minimum Breakdown Rule, Score Formula, Repeat, Action Plan Instance, Archive.

**Istilah yang DIHINDARI di UI utama:** Parent, Child, Publish, Posting, Watcher, Routine, Checklist Routine, Feed, Company News, Announcement, Area Goal, Planning Completeness (versi mentah), Incomplete/Complete (versi mentah), Validation Error mentah. (Parent/child boleh dipakai di DB/kode seperti `parent_id`, tapi tidak ditampilkan ke user bisnis.)

Padanan UI: Parent → **card induk**, Child → **card turunan**, Publish → **Aktifkan Card**, Routine → gunakan **Action Plan Repeat**.

Card tidak "diposting" atau "dipublish". Card **diaktifkan**.

## 5. Status Card (vocabulary)

**Status utama card:** Draft, Aktif, Selesai, Diarsipkan.

**Status tambahan Action Plan / Instance:** Assigned, In Progress, Menunggu Review, Revisi Diperlukan, Terlewat, Dibatalkan.

## 6. Dua Workspace & Strukturnya

**Performance Workspace** (target bisnis & hasil):
`Goal → KPI Area → Strategy → Initiative → Action Plan`
- Goal = arah besar (**tahunan**). KPI Area = area hasil yang harus bergerak (**mengikuti Goal tahunan**, tidak punya masa berlaku sendiri). Strategy = pendekatan utama (**fokus Quarter aktif**). Initiative = program eksekusi. Action Plan = pekerjaan konkret.
- **Tidak ada Area Goal, tidak ada KPI child table.**

**Development Workspace** (membangun mesin perusahaan):
`Development Area → Problem Statement / Development Goal → Initiative → Action Plan`
- Untuk: System, People, Organization, Technology, Infrastructure, Brand, Governance Development.
- Development berbasis problem/perbaikan, tidak wajib mengikuti pola KPI Area.

## 7. Period Focus Engine

Konsep periode utama V1.82 agar user tidak tenggelam melihat seluruh turunan tahunan sekaligus.

| Card | Cakupan periode |
|---|---|
| Goal | Tahunan (auto 1 Jan – 31 Des tahun aktif) |
| KPI Area | Ikut Goal tahunan (tanpa masa berlaku sendiri), diperinci lewat Target Breakdown |
| Strategy | Quarter aktif |
| Initiative | Quarter atau rentang program |
| Action Plan | Tanggal & deadline konkret |

**Workspace default menampilkan bulan berjalan.** Panel "Periode aktif" (mis. *Juni 2026 · Goal 2026 – Q2 – Bulan berjalan*) menyediakan segmented control **Bulan / Quarter** dan list periode (Archive · Aktif · Quarter).

**Card periode lewat**: tampil redup, label "Archive", detail tetap bisa dibuka, tombol tambah turunan dikunci (popup "Periode sudah lewat").

## 8. Target Breakdown KPI Area — 100%, bukan bobot

KPI Area punya **target tahunan** wajib, lalu dipecah ke:

1. Kontribusi **per Quarter** — total wajib **100%**.
2. Kontribusi **per Bulan** di dalam tiap Quarter — total wajib **100%**.

Tujuan: menampilkan "% gap" presisi pada periode berjalan (mis. "Aktual 620 / Target bulan 1.200 · Gap 580 · 65%").

> **Penting — bukan pelanggaran guardrail "tanpa bobot planning card":**
> Target Breakdown adalah **distribusi target KPI Area itu sendiri lintas waktu** (Quarter/Bulan). Ia bukan bobot antar-card, bukan bobot Goal → KPI Area, bukan bobot Strategy → Initiative. Guardrail V1.82 tetap: **planning card (Goal, KPI Area, Strategy, Initiative, Action Plan, Development Area, Problem Statement) tidak punya bobot antar-card.** Bobot antar-kategori hanya ada di Score Formula (file 03).

Kontribusi periode berjalan boleh diedit jika permission mengizinkan; wajib alasan, masuk Activity Log, dan tidak boleh mengubah periode yang sudah closed kecuali Super Admin override.

## 9. Prinsip Card

Semua unit kerja utama berbentuk card dan menjadi unit visual utama UI. Setiap card dapat memiliki: Nama, Keterangan Card, PIC, Reviewer (jika perlu), Periode, Deadline (jika perlu), Status, Kelengkapan Card, Kelengkapan Perencanaan (jika punya turunan), Bukti (jika perlu), Nilai Hasil (jika perlu), Komentar, Activity Log, Card turunan.

### 9.1 Card Interaction Rule (PRD §7.3)

Tap area card **tidak langsung** membuka detail. Setiap card struktur wajib punya:

1. Tombol **Detail** — masuk isi card.
2. Icon **panah** — buka/tutup turunan card.
3. Tombol `...` — aksi lain (edit, archive, permission, admin).
4. Tombol **tambah turunan** — hanya aktif jika permission & Minimum Breakdown Rule mengizinkan; jika belum, popup arahan muncul saat diklik.

### 9.2 UI Psikologis (PRD §7.8)

UI harus terasa tenang, minimalis, tidak seperti dashboard desktop, tidak seperti tabel besar, tidak mengintimidasi user dengan log/score dominan, tidak membuat user merasa terus diawasi, dan mengarahkan user ke tindakan berikutnya dengan jelas.

## 10. Keterangan Card (edukasi in-app)

**Keterangan Card** = edukasi singkat yang menjelaskan makna tiap jenis card. Tujuan: bantu user paham beda Goal/KPI/Strategy/Initiative/Action Plan, kurangi kesalahan, cegah semua ditulis sebagai Action Plan.

Wajib dapat diakses lewat: form buat card baru, halaman detail card, popup icon `?`, empty state, onboarding user baru. Isi harus pendek dan praktis; **bukan** tutorial panjang.

### Makna tiap card

| Card | Pertanyaan kunci | Definisi |
|---|---|---|
| **Goal** | Apa yang ingin dicapai tahun ini? | Target tahunan utama perusahaan. Contoh: Omset 48 Miliar 2026, Meningkatkan Profit. |
| **KPI Area** | Area hasil apa yang harus bergerak? | Area hasil yang harus meningkat/berubah agar Goal tercapai; punya target tahunan yang dipecah ke Quarter dan Bulan (§8). Contoh: Menambah Jumlah Customer, Meningkatkan Basket Size. |
| **Strategy** | Bagaimana cara mencapai KPI Area di Quarter ini? | Pendekatan utama untuk mengejar KPI Area, fokus Quarter aktif, dengan kontribusi Quarter yang jelas. |
| **Initiative** | Program/proyek apa yang dijalankan? | Program eksekusi untuk menjalankan Strategy. Contoh: Campaign Paket Hemat Pizza. |
| **Action Plan** | Siapa melakukan apa dan kapan? | Pekerjaan konkret yang diselesaikan PIC tertentu dengan deadline jelas. Bisa One Time atau Repeat. |
| **Development Area** | Area pengembangan apa yang dibangun? | Area pembangunan mesin perusahaan: sistem, organisasi, SDM, teknologi, brand, governance. |
| **Problem Statement / Development Goal** | Masalah/perbaikan apa yang ingin diselesaikan? | Masalah atau target perbaikan yang jadi dasar Initiative Development. |

### Popup Bantuan Card

Setiap tombol "+ [Card]" punya akses bantuan singkat via icon `?`. Contoh "+ Strategy": judul "Apa itu Strategy?", definisi, pertanyaan reflektif ("Bagaimana cara mencapai hasil KPI Area di Quarter ini?"), tombol [Buat Strategy] [Tutup]. Pola sama untuk tiap card.

## 11. Prinsip Card Turunan

Card turunan **selalu dibuat dari dalam card induknya**, bukan dengan memilih induk dari dropdown.
- KPI Area dibuat dari dalam Goal; Strategy dari dalam KPI Area; Initiative dari dalam Strategy; Action Plan dari dalam Initiative; Problem Statement dari dalam Development Area; Development Initiative dari dalam Problem Statement.
- Karena dibuat dari dalam induk, sistem otomatis tahu hubungan strukturnya. Maka "card induk" tidak perlu jadi syarat manual di Kelengkapan Card.

## 12. Guardrails Permanen

- **Tidak ada bobot antar planning card** (Goal, KPI Area, Strategy, Initiative, Action Plan, Development Area, Problem Statement). Bobot antar-kategori hanya di Score Formula (file 03). **Target Breakdown KPI Area (§8) bukan pelanggaran** — ia distribusi satu KPI Area lintas waktu (Quarter/Bulan), bukan bobot antar-card.
- **Anti-scope-creep (PRD V1.82 §6):** tolak Feed, Company News, Announcement, SOP Center penuh, HRIS penuh, Payroll, Inventory, CRM, WhatsApp integration, AI Assistant, AI Review, Native app, Social reaction, Story, Reels, Watcher, Routine module, Checklist Routine, Area Goal, KPI cascade automation. **Jika AI agent mengusulkan fitur ini untuk V1.82, tolak.**
- **Keamanan bukan tugas frontend.** Semua rule penting (Aktifkan Card, MBR, target 100%, generate Instance, submit Bukti/Nilai Hasil, review, anti self-approval, permission change, Score Formula activation, archive, confidential, override) **wajib divalidasi backend**. Frontend hanya menampilkan dan mengirim request.
- **Filosofi final:** Kerja yang benar bukan sekadar ramai aktivitas. Kerja yang benar adalah pekerjaan yang punya konteks, lengkap, dipahami maknanya, didelegasikan jelas, dieksekusi tepat waktu, punya bukti, direview, dan menghasilkan dampak yang bisa dipantau.
