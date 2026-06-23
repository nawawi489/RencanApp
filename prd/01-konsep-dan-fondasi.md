# EMS V1.8.1 — 01 · Konsep & Fondasi

> **Untuk AI agent:** File ini adalah north star dan guardrail. Baca pertama. Isinya: apa itu EMS, batas scope, aturan bahasa, status card, struktur workspace, filosofi card, dan makna tiap jenis card. Untuk spesifikasi field & validasi card → [02-spesifikasi-card-dan-eksekusi.md](02-spesifikasi-card-dan-eksekusi.md). Untuk permission, data, score, governance → [03-sistem-permission-data-governance.md](03-sistem-permission-data-governance.md). Sumber: [../PRD.md](../PRD.md).

---

## 1. Apa itu EMS

EMS (Execution Management System) membantu perusahaan mengubah arah besar menjadi eksekusi nyata yang bisa dipantau, direview, dan dipertanggungjawabkan.

EMS **bukan**: task management biasa, chat, social media, atau aplikasi perhitungan KPI formal.

EMS adalah sistem eksekusi berbasis **card** yang menghubungkan:

- **Performance:** Goal → KPI Area → Strategy → Initiative → Action Plan
- **Development:** Development Area → Problem Statement / Development Goal → Initiative → Action Plan

Prinsip utama:

> Perusahaan tidak membayar kesibukan. Perusahaan membayar eksekusi yang punya arah, bukti, review, dan hasil.

## 2. Tujuan Produk

1. Mengubah target besar jadi struktur eksekusi yang jelas.
2. Setiap pekerjaan punya konteks dari card induknya.
3. Mengganti follow up manual WhatsApp jadi sistem kerja terstruktur.
4. Setiap card punya PIC, Reviewer, deadline, output diharapkan, dan bukti sesuai kebutuhan.
5. Strategy punya alasan, risiko, dan alternatif (tidak asal).
6. Action Plan bisa sekali selesai atau berulang seperti alarm.
7. Semua pekerjaan dipantau dari Home, Workspace, Notifications, Inbox, People.
8. User fokus pada card yang jadi tanggung jawabnya.
9. PIC card induk otomatis melihat seluruh turunannya.
10. Permission sederhana, tidak terlalu granular.
11. Performa user dihitung dari data eksekusi, bukan perasaan.
12. Organisasi tumbuh tanpa owner harus mengingat semua detail.
13. Mengedukasi user di dalam aplikasi agar paham arti tiap card.
14. Mengurangi kesalahan user saat membuat card.

## 3. Batas Scope V1.8.1

**Masuk V1.8.1:** Auth, User profile, Organization, Department, Position, Team, Role template, User permission, Performance Workspace, Development Workspace, Goal & KPI Area Template Library, semua card (Goal/KPI Area/Strategy/Initiative/Action Plan), Action Plan One Time/Repeat/Instance, Kelengkapan Card, Keterangan Card, Minimum Breakdown Rule, Kelengkapan Perencanaan, Bukti, Nilai Hasil, Review, Activity Log, Governance Violation, Notifications, Inbox Initiative Chat, People, Score Formula, Repeat Compliance, Basic ranking, Settings.

**TIDAK masuk V1.8.1 (tolak jika diusulkan):** Feed, Company News, Announcement, CEO Broadcast, SOP Center penuh, Knowledge Center, HRIS penuh, Payroll, Inventory, CRM, WhatsApp integration, Google Calendar integration, AI Assistant, AI Review, Routine entity, Checklist Routine entity, Watcher, Area Goal layer, KPI child table di bawah Area Goal, Bobot planning card.

## 4. Bahasa Sistem

Bahasa utama UI = **Bahasa Indonesia**. Semua label, tombol, validasi, pesan error, popup default = Indonesia.

**Istilah Inggris yang dipertahankan:** Goal, KPI Area, Strategy, Initiative, Action Plan, Card, Workspace, Notifications, Inbox, People, PIC, Reviewer, Minimum Breakdown Rule, Score Formula.

**Istilah yang DIHINDARI di UI utama:** Parent, Child, Planning Completeness, Publish, Posting, Incomplete, Complete, Validation Error. (Boleh dipakai di DB/kode seperti `parent_id`, tapi tidak ditampilkan ke user bisnis.)

Card tidak "diposting" atau "dipublish". Card **diaktifkan**.

## 5. Status Card (vocabulary)

**Status utama card:** Draft, Aktif, Selesai, Diarsipkan.

**Status tambahan Action Plan:** Assigned, In Progress, Menunggu Review, Revisi Diperlukan, Terlewat, Dibatalkan.

## 6. Dua Workspace & Strukturnya

**Performance Workspace** (target bisnis & hasil):
`Goal → KPI Area → Strategy → Initiative → Action Plan`
- Goal = arah besar. KPI Area = area hasil yang harus bergerak. Strategy = cara utama. Initiative = program eksekusi. Action Plan = pekerjaan konkret.
- KPI Area langsung di bawah Goal. **Tidak ada Area Goal, tidak ada KPI child table.**

**Development Workspace** (membangun mesin perusahaan):
`Development Area → Problem Statement / Development Goal → Initiative → Action Plan`
- Untuk: System, People, Organization, Technology, Infrastructure, Brand, Governance Development.
- Development berbasis problem/perbaikan, tidak wajib mengikuti pola KPI Area.

## 7. Prinsip Card

Semua unit kerja utama berbentuk card dan jadi unit visual utama UI. Setiap card dapat memiliki: Nama, Keterangan Card, PIC, Reviewer (jika perlu), Periode, Deadline (jika perlu), Status, Kelengkapan Card, Kelengkapan Perencanaan (jika punya turunan), Bukti (jika perlu), Nilai Hasil (jika perlu), Komentar, Activity Log, Card turunan.

## 8. Keterangan Card (edukasi in-app)

**Keterangan Card** = edukasi singkat yang menjelaskan makna tiap jenis card. Tujuan: bantu user paham beda Goal/KPI/Strategy/Initiative/Action Plan, kurangi kesalahan, jadikan EMS alat kerja sekaligus edukasi manajemen, cegah semua ditulis sebagai Action Plan.

Wajib tampil di: form buat card baru, halaman detail card, popup icon bantuan, empty state, onboarding user baru. Harus pendek dan praktis.

### Makna tiap card (teks edukasi)

| Card | Pertanyaan kunci | Definisi |
|---|---|---|
| **Goal** | Apa yang ingin dicapai? | Tujuan utama dalam suatu periode. Contoh: Meningkatkan Omset, Meningkatkan Profit, Membuka 10 Outlet. |
| **KPI Area** | Area hasil apa yang harus bergerak? | Area hasil yang harus meningkat/berubah agar Goal tercapai. Contoh: Menambah Customer, Meningkatkan Basket Size, Menurunkan OPEX. |
| **Strategy** | Bagaimana cara mencapai hasil itu? | Pendekatan utama untuk mengejar KPI Area. **Wajib punya alasan, risiko, alternatif** agar tidak berdasarkan feeling. |
| **Initiative** | Program/proyek apa yang dijalankan? | Program/proyek yang dieksekusi untuk menjalankan Strategy. Contoh: Campaign Paket Hemat, Pembukaan Outlet Sidrap. |
| **Action Plan** | Siapa melakukan apa dan kapan? | Pekerjaan konkret yang diselesaikan PIC tertentu dengan deadline jelas. Bisa sekali selesai atau berulang. |
| **Development Area** | Area pengembangan apa yang dibangun? | Area pembangunan mesin perusahaan: sistem, organisasi, SDM, teknologi, brand, governance. |
| **Problem Statement / Development Goal** | Masalah/perbaikan apa yang ingin diselesaikan? | Masalah atau target perbaikan yang jadi dasar Initiative Development. |

### Popup Bantuan Card

Setiap tombol "+ [Card]" punya akses bantuan singkat. Contoh "+ Strategy": judul "Apa itu Strategy?", definisi, pertanyaan reflektif ("Bagaimana cara mencapai hasil tersebut?"), checklist (Alasan, Risiko, Alternatif), tombol [Buat Strategy] [Tutup]. Pola sama untuk tiap card.

## 9. Prinsip Card Turunan

Card turunan **selalu dibuat dari dalam card induknya**, bukan memilih induk dari dropdown.
- KPI Area dibuat dari dalam Goal; Strategy dari dalam KPI Area; Initiative dari dalam Strategy; Action Plan dari dalam Initiative; Problem Statement dari dalam Development Area; Development Initiative dari dalam Problem Statement.
- Karena dibuat dari dalam induk, sistem otomatis tahu hubungan strukturnya. Maka "card induk" tidak perlu jadi syarat manual di Kelengkapan Card.

## 10. Guardrails Permanen

- **Tidak ada bobot pada planning card** (Goal, KPI Area, Strategy, Initiative, Action Plan, Development Area, Problem Statement). EMS adalah aplikasi eksekusi, bukan KPI formal. (Bobot hanya ada di Score Formula → file 03.)
- **Anti-scope-creep (PRD §88):** jangan melebar ke Feed, Company News, Announcement, SOP Center penuh, HRIS, Payroll, Inventory, CRM, WhatsApp integration, AI Assistant, AI Review, Native app, Social reaction, Story, Reels, Watcher, Routine module, Checklist module, Area Goal, KPI cascade automation. **Jika AI agent mengusulkan fitur ini untuk V1.8.1, tolak.**
- **Filosofi final:** Kerja yang benar bukan sekadar ramai aktivitas. Kerja yang benar adalah pekerjaan yang punya konteks, lengkap, dipahami maknanya, didelegasikan jelas, dieksekusi tepat waktu, punya bukti, direview, dan menghasilkan dampak yang bisa dipantau.
