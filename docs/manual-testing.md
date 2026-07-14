# Skenario Manual Testing — Rencanapp (EMS Mobile)

Dokumen ini adalah panduan pengujian manual menyeluruh aplikasi mobile Rencanapp (`mobile/`).
Basis: PRD V1.8.2 (root `PRD.md`), DESIGN.md (token & aksesibilitas), dan rute yang terimplementasi di `mobile/src/app/`.

- **Versi dokumen**: 1.0 — 2026-07-05
- **Lingkup**: seluruh layar dan alur utama aplikasi mobile (Expo SDK 56, web preview & device)
- **Di luar lingkup**: pengujian otomatis (sudah dicakup Jest), load/performance testing, penetration testing

---

## 1. Persiapan Lingkungan

### 1.1 Prasyarat

| Item | Detail |
|---|---|
| Supabase lokal | Berjalan di port 54321 (API) / 54322 (DB). DDL lokal via `docker exec supabase_db_supabase psql` |
| Edge Functions | Fitur Tambah User memanggil function `create-user`. Lokal: `npx supabase functions serve create-user` (stack lokal harus jalan). Staging: `npx supabase link --project-ref fhnqwytqprsptjshoxfn` lalu `npx supabase functions deploy create-user` |
| Seed data | Database sudah berisi seed (user, goal, KPI Area, dst.) sesuai PRD §43 |
| App | `cd mobile && npm run web` (atau `npm run android` / `npm run ios`) |
| Viewport | Uji utama di lebar **390 px** (acceptance criteria PRD §44.1) |
| `.env` | `mobile/.env` menunjuk ke Supabase lokal |

### 1.2 Akun Uji per Role

Siapkan minimal satu akun untuk tiap role. Role menentukan permission default:

#### Kredensial Login

| Email | Role | Password |
|---|---|---|
| `ceo@rencan.local` | CEO | `rencan123` |
| `cmo@rencan.local` | C-Level | `rencan123` |
| `mgr.sales@rencan.local` | Manager | `rencan123` |
| `mgr.ops@rencan.local` | Manager | `rencan123` |
| `staff.sales@rencan.local` | Staff | `rencan123` |
| `staff.finance@rencan.local` | Staff | `rencan123` |

| Role | Permission default | Catatan |
|---|---|---|
| `staff` | Tanpa permission manajerial | Melihat, mengerjakan Action Plan, submit bukti |
| `management` | `create_initiative`, `create_action_plan`, `create_strategy`, `create_department`, `manage_teams`, `review_deadline_changes` | Default melekat pada role |
| `c_level` | Sama dengan `management` | Default melekat pada role |
| `ceo` | **Bypass total** — semua permission | Tidak lewat daftar permission |

Permission individual dapat diubah lewat layar **User & Permission** — pengujian role harus mempertimbangkan override ini (gunakan akun dengan default murni).

Permission key eksplisit lain (grant individual, dengan scope `own`/`team`/`dept`/`org`): `view_activity_log`, `manage_kpi_area_templates`, `manage_users_permissions`, `manage_minimum_breakdown_rule`, `manage_card_completion_rule`, `manage_settings`, `manage_score_formula`, `view_governance_violation`, `manage_confidential_access`.

### 1.3 Catatan Teknis Penting (gotcha pengujian)

1. **RLS diam-diam menyaring** — user tanpa akses mendapat list kosong, bukan error 403. Pastikan permission diberikan sebelum menyimpulkan "data hilang" sebagai bug.
2. **Aturan D9 (periode tertutup)** — score/ranking orang lain hanya tampil dari periode yang sudah **ditutup** admin. Sebelum menguji People/Ranking, tutup dulu satu periode uji.
3. **Instance Repeat tidak realtime** — instance baru dibuat oleh siklus/background job, bukan seketika. Untuk pengujian, picu pembuatan instance secara manual/lewat endpoint uji.
4. **Breakdown harus tepat 100%** — tidak ada toleransi pembulatan (99,9% atau 100,1% ditolak).
5. **Recompute score tertunda** — override manual tidak langsung menghitung ulang score otomatis; mungkin perlu memicu RPC recompute.
6. **Confidential Access berbatas waktu** — akses override kedaluwarsa (±1 jam); uji juga kondisi setelah kedaluwarsa.

### 1.4 Konvensi Pencatatan

Setiap kasus uji dicatat: **ID | Hasil (Pass/Fail/Blocked) | Tanggal | Penguji | Catatan/bukti (screenshot)**.

Prioritas:
- **P1** — alur inti; kegagalan = blocker rilis.
- **P2** — fitur penting; kegagalan = bug mayor.
- **P3** — kosmetik/edge case.

Format bug report: judul singkat, langkah reproduksi, hasil aktual vs diharapkan, screenshot, akun/role yang dipakai, ID kasus uji terkait.

### 1.5 Checklist Review UI

Sebelum menutup review atau manual test untuk perubahan UI/copy, cek cepat:

1. **Nama produk konsisten** — surface yang terlihat user memakai `Rencanapp`, bukan `RencanApp`.
2. **Identifier teknis tetap aman** — nama repo/path/tooling yang memang fixed tetap memakai `RencanApp`.
3. **Wordmark/header sinkron** — login, header global, onboarding hint, dan surface utama tidak memakai ejaan campuran.
4. **Copy acuan selaras** — jika ada copy baru, cocokkan dengan aturan penamaan di `PRD.md` dan `DESIGN.md`.

---

## 2. Autentikasi & Sesi (AUTH)

Layar: `(auth)/login`. Tidak ada layar registrasi — akun dibuat lewat seed/admin.

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| AUTH-01 | P1 | Login sukses | Isi email & kata sandi valid → tekan masuk | Redirect ke Home; bottom nav 5 tab muncul |
| AUTH-02 | P1 | Login field kosong | Kosongkan salah satu field → submit | Pesan "Email dan kata sandi wajib diisi."; tidak ada request |
| AUTH-02b | P2 | Kata sandi terlalu pendek | Isi kata sandi < 6 karakter → submit | Validasi menolak sebelum request |
| AUTH-02c | P3 | Toggle lihat kata sandi | Tekan ikon mata pada field kata sandi | Kata sandi tampil/tersembunyi; ikon punya label aksesibilitas |
| AUTH-02d | P3 | Hubungi Admin | Tekan tombol "Hubungi Admin" | Info bahwa akun hanya dibuat oleh admin perusahaan (tidak ada self-signup) |
| AUTH-03 | P1 | Kredensial salah | Email valid + kata sandi salah | Pesan error berbahasa Indonesia (hasil `translateAuthError`), bukan pesan mentah bahasa Inggris |
| AUTH-04 | P2 | Reset kata sandi tanpa email | Tekan "Lupa kata sandi" dengan field email kosong | Pesan "Isi email dulu untuk reset kata sandi." |
| AUTH-05 | P2 | Reset kata sandi dengan email | Isi email → tekan "Lupa kata sandi" | Pesan sukses netral ("Jika email terdaftar, link reset ... dikirim") — tidak membocorkan apakah email terdaftar |
| AUTH-06 | P1 | Sesi bertahan | Login → tutup app/refresh → buka lagi | Tetap masuk (session persist), langsung ke Home |
| AUTH-07 | P1 | Logout | Menu → Logout | Kembali ke layar Login; back tidak bisa kembali ke area app |
| AUTH-08 | P2 | Guard rute | Dalam keadaan logout, buka URL rute dalam `(app)` langsung (web) | Diarahkan ke Login, bukan render layar kosong/error |
| AUTH-09 | P3 | Loading state login | Submit login, amati tombol | Tombol menampilkan state busy (accessibilityState `busy`), tidak bisa double-submit |

---

## 3. Navigasi Global & Kerangka UI (NAV)

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| NAV-01 | P1 | Bottom nav final | Amati bottom nav setelah login | Tepat 5 tab: **Home, Notif, Workspace, Inbox, Menu** (PRD §44.2) — bukan "People" |
| NAV-02 | P1 | Pindah antar tab | Tap tiap tab bergantian | Layar berganti tanpa crash; posisi scroll/tab state wajar |
| NAV-03 | P2 | Header global | Amati header di layar utama | Header "Rencanapp" konsisten antar layar (PRD §44.3) |
| NAV-04 | P2 | Deep navigation & back | Home → detail Action Plan → back | Kembali ke layar asal, bukan reset ke root |
| NAV-05 | P3 | Tidak ada fitur terlarang | Telusuri seluruh app | Tidak ada Feed, Company News, Announcement, Routine, Checklist Routine, Watcher, Area Goal (PRD §44.28) |

---

## 4. Home (HOME)

Layar: `(tabs)/index`. Home = pusat kendali hari ini, bukan feed panjang.

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| HOME-01 | P1 | Komposisi Home | Buka Home | Ada: greeting singkat, "Fokus Hari Ini", prioritas (muat satu layar, tanpa horizontal scroll), Action Plan penting hari ini, update terbaru relevan |
| HOME-02 | P1 | Card Fokus Hari Ini — satu CTA | Amati card fokus | Hanya satu CTA "Detail"; tidak ada deretan tombol Bukti/Chat/Detail sekaligus |
| HOME-03 | P1 | KPI gap — KPI numerik | Pastikan ada KPI Area dengan `target_numeric` + `unit` terisi dan progress sebagian | Home menampilkan sinyal **% gap** presisi untuk KPI tsb. |
| HOME-04 | P2 | KPI gap — KPI kualitatif | KPI Area tanpa target numerik | Fallback ke sinyal tanpa-progress (bukan angka % palsu, bukan error) |
| HOME-05 | P2 | Home tanpa tugas | Login akun tanpa Action Plan aktif | Empty state ramah (PRD §40), bukan layar kosong |
| HOME-07 | P3 | Hint onboarding | Login akun berumur < 7 hari | Hint onboarding tampil; hilang untuk akun lama |
| HOME-06 | P3 | Larangan konten | Amati seluruh Home | Tidak ada shortcut besar duplikat nav, feed sosial, announcement |

---

## 5. Notifications (NOTIF)

Layar: `(tabs)/notifications`. Notifications = alert & action center, bukan chat.

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| NOTIF-01 | P1 | Struktur list | Buka tab Notif dengan data campuran | Segmentasi 8 tab: **Semua, Perlu Tindakan, Review, Deadline, Komentar, Terlewat, Repeat, Governance**; section **Baru** dan **Sebelumnya**; tiap row: avatar/ikon, judul, konteks, waktu, status read/unread |
| NOTIF-01b | P1 | Filter per tab | Buka tiap tab bergantian | Isi tersaring benar per jenis; tab kosong menampilkan empty state "Belum ada notifikasi di tab ini." |
| NOTIF-02 | P1 | Read marker | Tap satu notifikasi unread | Status berubah menjadi read (marker jelas); membuka konteks terkait |
| NOTIF-02b | P2 | Mark all read | Saat ada unread, gunakan aksi tandai semua dibaca di header | Semua unread menjadi read; badge hilang |
| NOTIF-03 | P1 | Notifikasi review diperlukan | Sebagai PIC submit bukti → login sebagai reviewer | Reviewer menerima notifikasi "Review diperlukan" yang menaut ke item benar |
| NOTIF-04 | P2 | Jenis notifikasi lain | Picu: bukti dikirim, DCR, deadline lewat, mention, permission berubah, governance warning, MBR warning, repeat due today | Masing-masing muncul dengan konteks yang benar |
| NOTIF-05 | P2 | Action button kecil | Amati row yang punya aksi | Tombol aksi kecil, tidak makan ruang; hanya muncul jika perlu |
| NOTIF-06 | P3 | Empty state | Akun baru tanpa notifikasi | Empty state, bukan spinner abadi |

---

## 6. Workspace & Period Focus (WS)

Layar: `workspace/index` (hub), `workspace/performance`, `workspace/development`.

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| WS-01 | P1 | Hub workspace | Buka tab Workspace | Hub menampilkan pintu ke Performance & Development + statistik ringkas; pola UI keduanya konsisten (PRD §44.6) |
| WS-02 | P1 | Panel periode aktif | Buka Performance Workspace | Panel kompak: label "Periode aktif", nilai bulan berjalan (mis. "Juli 2026"), keterangan "Goal 2026 - Q3 - Bulan berjalan", tombol **Ubah** |
| WS-03 | P1 | Ganti periode Bulan/Quarter | Tekan Ubah → segmented Bulan/Quarter → pilih periode | List periode benar (bulan lewat berlabel Archive, bulan berjalan Aktif, quarter); pilihan diterapkan; card area tidak menyempit |
| WS-04 | P1 | Periode lewat (archive) | Pilih bulan yang sudah lewat | Card tampil **redup** + label Archive; detail tetap bisa dibuka; tombol tambah turunan **nonaktif dengan popup penjelasan** (PRD §44.9) |
| WS-05 | P1 | Card tree Performance | Telusuri tree Goal → KPI Area → Strategy → Initiative → Action Plan | Hierarki benar; tiap card punya aksi **Detail** dan **panah expand terpisah** (PRD §44.5) |
| WS-06 | P1 | Card tree Development | Telusuri Development Area → Problem Statement → Initiative → Action Plan | Hierarki development benar, pola UI sama dengan Performance |
| WS-07 | P2 | Anatomi card kompak | Amati card di tree pada viewport 390px | Card kompak, terbaca, tidak overflow; status pakai warna **+ label teks** |
| WS-09 | P2 | Progress orb | Amati orb progress pada card dengan capaian berbeda | Warna sesuai ambang: ≥100%/selesai hijau, 70–99% biru brand, 35–69% amber, <35% merah; belum ada data = "—" (bukan 0%) |
| WS-10 | P2 | Kembali ke hub | Dari pane Performance/Development, tekan "Kembali" di header | Kembali ke hub Workspace; tidak ada tab bar ganda di dalam pane |
| WS-11 | P1 | Buat Development Area | Development pane → New Development Area → isi & aktifkan | Tercipta dan tampil di tree Development |
| WS-12 | P1 | Buat Problem Statement | Dari Development Area → New Problem Statement | Tercipta di bawah Dev Area; bisa lanjut buat Initiative → Action Plan |
| WS-13 | P2 | Arsip & restore card | Arsipkan satu card via menu ⋯ → buka Menu → Arsip → restore | Card hilang dari tree, muncul di Arsip, kembali ke tree setelah restore |
| WS-08 | P2 | Default periode | Logout-login ulang, buka Workspace | Periode default kembali ke bulan berjalan (PRD §44.7) |

---

## 7. Goal (GOAL)

Layar: `goal/new`, `goal/[id]`, `goal-wizard`.

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| GOAL-01 | P1 | Buat Goal manual | Workspace → New Goal → isi field wajib → simpan | Goal tahunan tercipta, muncul di tree (Goal bersifat tahunan, PRD §44.10) |
| GOAL-02 | P1 | Goal wizard | Jalankan `goal-wizard` sampai selesai | Tiap step tervalidasi; tidak bisa lanjut dengan field wajib kosong; hasil akhir konsisten dengan input |
| GOAL-03 | P1 | Validasi wizard | Kosongkan field wajib di tiap step → coba lanjut | Pesan validasi jelas per field; step tidak berpindah |
| GOAL-04 | P2 | Goal detail | Buka Goal Detail | Info lengkap; daftar KPI Area turunan; aksi sesuai permission |
| GOAL-05 | P2 | Goal Template Library | Menu → Goal Template Library → pakai template | Goal terbentuk dari template dan bisa diedit |
| GOAL-06 | P2 | Edit Goal | Ubah field Goal yang ada → simpan | Perubahan tersimpan; tercatat di Activity Log |

---

## 8. KPI Area & Target Breakdown (KPI)

Layar: `kpi-area/new`, `kpi-area/[id]`. Aturan inti: breakdown Quarter total 100%, breakdown Bulan per Quarter total 100% (PRD §12).

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| KPI-01 | P1 | Buat KPI Area manual | Dari Goal → New KPI Area → isi manual | Default mode **manual**; template hanya ditawarkan sebagai popup solusi cepat (PRD §44.13) |
| KPI-02 | P1 | Template popup | Buka New KPI Area → pilih jalur template | Popup template muncul; pilih template → field terisi dan bisa disesuaikan |
| KPI-03 | P1 | Target tahunan wajib | Simpan/aktifkan KPI Area tanpa target tahunan | Ditolak dengan pesan validasi |
| KPI-04 | P1 | Breakdown Quarter ≠ 100% | Isi pecahan quarter total ≠ 100% → Aktifkan Card | **Aktivasi ditahan**; popup validasi menjelaskan total yang belum sesuai; progress bar total kontribusi terlihat |
| KPI-05 | P1 | Breakdown Bulan ≠ 100% | Dalam satu quarter, isi pecahan bulan total ≠ 100% → aktifkan | Sama seperti KPI-04, untuk level bulan |
| KPI-06 | P1 | Breakdown 100% valid | Set breakdown tepat 100% → aktifkan | Aktivasi sukses; badge total berubah hijau saat tepat 100% (amber jika belum); catatan: breakdown 100% pada satu slot **diperbolehkan** (berbeda dari aturan Bobot) |
| KPI-06b | P2 | Presisi 100% | Coba total 99% dan 101% | Keduanya ditolak — harus **tepat** 100%, tanpa toleransi pembulatan |
| KPI-06c | P3 | Input bobot non-angka | Isi bobot dengan huruf/nilai >100 | Input dibatasi (0–100, angka saja) |
| KPI-07 | P1 | Target numerik + unit | Isi `target_numeric` + `unit` (opsional) | Tersimpan; KPI detail & Home menampilkan % gap presisi (lihat HOME-03) |
| KPI-08 | P2 | KPI kualitatif | Buat KPI Area tanpa target numerik | Valid; tampil tanpa % gap (fallback) |
| KPI-09 | P2 | Kelengkapan saat aktivasi | Buat KPI Area dengan data minim → aktifkan | Kelengkapan **tidak** memenuhi layar saat mengisi, tapi divalidasi saat "Aktifkan Card" (PRD §44.14) |
| KPI-10 | P2 | KPI Area Template Library | Menu → KPI Area Template → CRUD template (role admin) | Template dapat dikelola sesuai permission |

---

## 9. Strategy & Initiative (STR / INIT)

Layar: `strategy/new`, `strategy/[id]`, `initiative/new`, `initiative/[id]`.

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| STR-01 | P1 | Buat Strategy | Dari KPI Area → New Strategy (akun dengan `create_strategy`) | Strategy tercipta, fokus Quarter |
| STR-02 | P1 | Staff tanpa permission | Login staff → coba buat Strategy | Aksi tidak tersedia / ditolak dengan jelas |
| STR-03 | P2 | Field khusus Strategy | Aktifkan Strategy tanpa alasan / risiko utama / alternatif | Aktivasi ditahan — ketiga field wajib untuk Strategy (di luar name/PIC/periode) |
| INIT-01 | P1 | Buat Initiative | Dari Strategy → New Initiative (akun dengan `create_initiative`) | Initiative tercipta; otomatis punya chat room (lihat CHAT) |
| INIT-02 | P1 | Minimum Breakdown Rule | Pada card yang belum memenuhi MBR, coba buat turunan | Popup "Kelengkapan Perencanaan" menjelaskan kekurangan (mis. "baru punya 1 dari 2 Strategy"); berlaku juga di KPI Area & Strategy |
| INIT-03 | P2 | MBR terpenuhi | Penuhi syarat MBR → coba lagi | Tombol turunan aktif normal |
| INIT-03b | P2 | Mode MBR guarding vs blocking | Set rule ke `guarding`, lalu `blocking` (via ADM-03), uji aktivasi | `guarding`: hanya popup peringatan; `blocking`: server (RPC aktivasi) menolak sampai rule terpenuhi |
| INIT-03c | P2 | Rule terkunci | Buka settings MBR | Pasangan Goal → KPI Area terkunci (selalu min. 1 KPI Area), tidak bisa dihapus |
| INIT-04 | P2 | Detail Initiative | Buka Initiative Detail | Info, daftar Action Plan, akses chat, status MBR/completion terlihat |
| INIT-05 | P2 | Field khusus Initiative | Aktifkan Initiative tanpa target hasil (`target_result`) | Aktivasi ditahan dengan pesan validasi |

---

## 10. Action Plan, Repeat & Instance (AP)

Layar: `action-plan/new`, `action-plan/[id]`, `action-plan/instance/[id]`, `action-plan/submit`.

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| AP-01 | P1 | Buat Action Plan One Time | Dari Initiative → New Action Plan tipe One Time; isi PIC, deadline, output | Tercipta dengan tanggal/deadline konkret |
| AP-02 | P1 | Buat Action Plan Repeat | New Action Plan tipe Repeat → atur Repeat Setting | Repeat rule tersimpan; **Action Plan Instance** tergenerate sesuai jadwal (PRD §44.17) |
| AP-03 | P1 | Instance detail | Buka `action-plan/instance/[id]` dari Home/Workspace | Instance menampilkan induknya, jadwal, dan status; instance due today muncul di Home/Notif. Catatan: instance dibuat oleh siklus/background job — picu manual untuk pengujian (§1.3.3) |
| AP-03b | P2 | Kepatuhan repeat (compliance) | Buat repeat dengan sebagian instance telat/tidak submit | % compliance benar; **belum ada submission sama sekali = "—" (null)**, sedangkan 0 tepat waktu = **0%** (band merah) — keduanya harus dibedakan |
| AP-04 | P1 | Field wajib | Simpan Action Plan tanpa PIC/deadline | Validasi menolak dengan pesan jelas |
| AP-05 | P2 | Reviewer opsional | Buat AP dengan dan tanpa Reviewer | Keduanya valid; alur review hanya muncul jika ada reviewer |
| AP-06 | P2 | Periode lewat | Coba buat AP di bawah card periode archive | Ditolak (tombol nonaktif + popup, konsisten WS-04) |

---

## 11. Bukti, Nilai Hasil & Review (EVD / REV)

Layar: `action-plan/submit`. Aturan: bukti versioning; nilai hasil masuk KPI hanya setelah review disetujui (PRD §24).

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| EVD-01 | P1 | Submit bukti file | Sebagai PIC → submit bukti berupa file | Upload sukses (Supabase Storage); bukti tampil dengan versi; submit memakai 2 fase (draft → submit) — jika gagal di tengah, tidak ada data setengah jadi |
| EVD-01b | P2 | Batas 5 file | Coba lampirkan 6 file | Ditolak; maksimal 5 file per submission |
| EVD-01c | P2 | MIME gating | Coba file tipe tidak didukung dan file sangat besar (>100MB) | Tipe tak didukung ditolak di picker; file besar gagal dengan pesan jelas, bukan hang |
| EVD-01d | P2 | Baris hasil KPI | Pada form submit, tautkan nilai hasil ke KPI Area via picker | Hanya KPI Area kandidat yang muncul; delta (panah naik/turun) tampil dengan angka + label, bukan warna saja |
| EVD-02 | P1 | Bukti versioning | Upload bukti baru di atas bukti lama | Versi lama **tidak terhapus**; riwayat versi terlihat oleh reviewer |
| EVD-03 | P1 | Jenis bukti lain | Submit bukti link, screenshot, catatan | Semua jenis diterima dan tampil benar |
| EVD-04 | P1 | Bukti terkunci saat review | Saat bukti berstatus sedang direview, coba ubah | Bukti terkunci, tidak bisa diubah |
| EVD-05 | P2 | Nilai Hasil | Input nilai hasil terukur pada AP yang terkait KPI numerik | Nilai terkirim tapi **belum** masuk KPI Area sebelum review disetujui |
| REV-01 | P1 | Review — Setujui | Sebagai reviewer, buka item review → Setujui | Status berubah; **nilai hasil masuk KPI Area** setelah persetujuan; % gap Home terbarui |
| REV-02 | P1 | Review — Minta Revisi | Pilih Minta Revisi tanpa alasan → submit | Ditolak: **alasan wajib**. Dengan alasan → PIC mendapat notifikasi |
| REV-03 | P2 | Review — Catatan | Tambahkan catatan tanpa mengubah status | Catatan tersimpan dan terlihat kedua pihak |
| REV-04 | P2 | Perubahan nilai hasil | Ubah nilai hasil yang sudah ada (dengan alasan) | Nilai lama, nilai baru, alasan tercatat; masuk Activity Log |
| REV-05 | P2 | Nada review | Amati copy layar review | Bahasa membantu, tidak menghakimi |

---

## 12. Deadline Change Request (DCR)

Layar: `deadline-change-request`.

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| DCR-01 | P1 | Ajukan DCR | Dari AP terhambat → ajukan DCR; isi 4 field: deadline sekarang, deadline diminta, alasan, dampak jika tidak disetujui | Request terkirim; reviewer (permission `review_deadline_changes`) mendapat notifikasi |
| DCR-02 | P1 | Field wajib DCR | Kosongkan alasan/dampak → submit | Validasi menolak |
| DCR-03 | P1 | Reviewer setujui | Sebagai reviewer → Setujui | Deadline AP berubah; notifikasi + Activity Log tercipta |
| DCR-04 | P2 | Reviewer tolak | Tolak DCR | Deadline tidak berubah; pemohon dinotifikasi |
| DCR-05 | P2 | Minta revisi alasan | Pilih minta revisi alasan | Pemohon diminta memperbaiki alasan |
| DCR-06 | P2 | Staff bukan reviewer | Login staff biasa → buka DCR orang lain | Aksi persetujuan tidak tersedia |

---

## 13. Evaluation (EVAL)

Layar: `evaluation`.

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| EVAL-01 | P2 | Buka Evaluation | Akses layar Evaluation dari alur card | Data evaluasi periode tampil sesuai PRD §26 |
| EVAL-02 | P2 | Evaluation tanpa data | Buka pada periode tanpa data | Empty state, bukan error |

---

## 14. Inbox & Initiative Chat (INBOX / CHAT)

Layar: `(tabs)/inbox`, `inbox/[roomId]`. Inbox khusus Initiative Chat — bukan action queue, bukan notifications.

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| INBOX-01 | P1 | Struktur Inbox | Buka tab Inbox | Header lokal, search, filter **Semua / Belum dibaca**, list chat dengan preview pesan terakhir, unread badge (clamp "99+"), timestamp. Catatan: PRD §29 menyebut filter tambahan (Saya PIC, Review, Deadline) — jika tidak ada, catat sebagai gap [?] |
| INBOX-02 | P1 | Filter bekerja | Terapkan tiap filter bergantian | List tersaring benar per filter |
| INBOX-03 | P1 | Search chat (FTS V1) | Ketik nama Initiative → muncul di section Initiative. Ketik potongan isi pesan (min 2 karakter) → muncul di section Pesan (sub-group per room + snippet). Tap hit pesan → buka room dengan pesan tersorot (border amber). | Dua section terpisah; empty seragam "Tidak ada pesan yang cocok dengan pencarianmu"; user non-member room tidak mendapat pesan dari room itu; hint "Ketik minimal 2 karakter…" saat 1 char. |
| CHAT-01 | P1 | Kirim & terima pesan | Buka room → kirim pesan; login user lain → balas | Pesan muncul dua arah; unread dot di Inbox pihak lain |
| CHAT-02 | P1 | Chat terikat Initiative | Amati semua room | Setiap chat terikat satu Initiative; tidak ada chat lepas (PRD §44.20) |
| CHAT-03 | P1 | Reply context Action Plan | Dari Action Plan Detail → buka chat | Chat terbuka dengan **banner konteks reply** Action Plan; AP tidak membuat room terpisah (PRD §44.21) |
| CHAT-04 | P2 | Komponen room | Amati room chat | Topbar (back, avatar, judul, jumlah member, status), tombol anggota, tombol buka Initiative, date divider, bubble, reaction, seen-by, system event, composer |
| CHAT-05 | P2 | Bukti bukan via chat | Coba alur bukti | Bukti tetap dikirim melalui Action Plan, bukan sebagai pesan chat |

---

## 15. People, Ranking & Profile (PPL)

Layar: `people`, `people-ranking`, `people-profile/[id]`. Prinsip: ranking objektif tanpa mempermalukan user.

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| PPL-01 | P1 | Akses People via Menu | Menu → People | People terbuka (People di Menu, **bukan** bottom nav) |
| PPL-02 | P1 | Struktur People | Amati layar | Search, tabs (Ranking, Bulan ini, Quarter, Admin*), list ranking. Row: rank, avatar, nama, jabatan, achievement summary, score, tombol Lihat Profil |
| PPL-03 | P1 | Data yang disembunyikan | Amati list | List **tidak** menampilkan PIC, Reviewer, atau detail KPI Area |
| PPL-04 | P2 | Tab Admin sesuai permission | Bandingkan akun admin vs staff | Panel Admin hanya muncul untuk permission admin |
| PPL-05 | P2 | People Ranking sub-view | Menu → People Ranking | Ranking tampil sebagai sub-view, bukan bottom nav baru |
| PPL-06 | P1 | People Profile | Tap Lihat Profil | Header profil (nama, jabatan, tanggal bergabung, ranking) — tanpa banjir angka; accordion **Tugas** (Action Plan, Initiative, Strategy, KPI Area, Problem Statement); Kontribusi bulan ini; Rincian Score; Riwayat Score |
| PPL-07 | P1 | Visibilitas score (aturan D9) | Login staff → lihat score orang lain | Score sendiri selalu terlihat (periode aktif); score orang lain hanya dari **periode terakhir yang sudah ditutup**; atasan melihat bawahan langsung sesuai RLS |
| PPL-07b | P2 | Band score | Amati badge score berbagai nilai | ≥85 "On track" (hijau), 70–84 "Stabil" (netral), <70 "Perlu perhatian" (amber) — selalu warna + label |
| PPL-07c | P2 | Score null vs 0 | Bandingkan user tanpa score dan user ber-score 0 | Null → catatan "Skor menyusul" dan didorong ke bawah ranking; 0 → band perhatian (nol sungguhan) |
| PPL-07d | P3 | Sparkline tren | Amati profil dengan riwayat ≥2 periode | Sparkline 6 periode terakhir tampil benar |
| PPL-08 | P2 | Profil sendiri | Menu → tap kartu profil sendiri | Membuka People Profile milik sendiri |

---

## 16. Score & Manual Override (SCORE)

Layar: `manual-score-override`, `settings-score-formula`.

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| SCORE-01 | P1 | Score formula per level | Buka Score Formula (admin) | Formula terdefinisi per level (staff, management, c_level, ceo); total bobot metrik per level harus 100% (badge valid/invalid); versioning **Draft → Aktif → Arsip** — mengaktifkan versi baru menonaktifkan versi lama |
| SCORE-02 | P1 | Manual override — dua aktor | Dari People Profile → tombol "Override Skor" (hanya tampil bagi yang berhak, dan **bukan untuk diri sendiri**) → aktor 1 ajukan (alasan + nilai baru + periode) → aktor 2 (berbeda) menyetujui | Override hanya berlaku setelah **dua aktor** terlibat; satu aktor tidak bisa mengajukan sekaligus menyetujui sendiri |
| SCORE-02b | P1 | Override diri sendiri | Buka profil sendiri | Tombol Override Skor tidak tersedia |
| SCORE-03 | P1 | Override tanpa persetujuan | Ajukan override, jangan disetujui | Score belum berubah; catatan: score otomatis tidak langsung ter-recompute (§1.3.5) |
| SCORE-04 | P2 | Governance penalty | Picu pelanggaran governance pada user uji | Penalty mempengaruhi score sesuai aturan; tercatat di Governance Violation |
| SCORE-05 | P2 | Jejak audit | Setelah SCORE-02 | Activity Log mencatat pengaju, penyetuju, nilai lama/baru, alasan |

---

## 17. Menu, Settings Umum & Tema (MENU)

Layar: `(tabs)/menu` (= `settings`). Grup: Akses Cepat, Template, Pengaturan, Admin Lanjutan.

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| MENU-01 | P1 | Isi Menu | Buka tab Menu | Profil, toggle tema, Akses Cepat (People, People Ranking, Activity Log, Arsip, Cari), Template, Pengaturan, Admin Lanjutan, Logout (PRD §44.4) |
| MENU-02 | P1 | Gating permission | Bandingkan Menu akun staff vs ceo | Item ber-permission (Organisasi, User & Permission, Status & Prioritas, Notifications Rule, Score Formula, Governance Violation, Confidential Access) nonaktif/tersembunyi untuk staff, aktif untuk ceo |
| MENU-03 | P1 | Tema: Terang/Gelap/Sistem | Ganti tema ke tiap opsi | Seluruh app berganti tema konsisten; opsi Sistem mengikuti OS |
| MENU-04 | P2 | Collapse grup | Tap judul grup list | Grup collapse/expand; grid selalu terbuka |

---

## 18. Settings Admin (ADM)

Uji dengan akun ceo (atau akun dengan permission terkait). Untuk tiap layar, minimal: buka tanpa error, data tampil, perubahan tersimpan, dan **akses ditolak** untuk staff tanpa permission.

| ID | Prio | Layar | Fokus Uji |
|---|---|---|---|
| ADM-01 | P1 | Organisasi (`settings-org-structure`) | CRUD struktur organisasi/departemen/tim (permission `create_department`, `manage_teams`); tab/pane hasil refactor tampil benar |
| ADM-02 | P1 | User & Permission (`settings-permission-users`) | Lihat daftar user; toggle permission per user dengan **pemilih scope** (own/team/dept/org) dan **modal alasan wajib** saat grant/revoke; badge "default" untuk permission bawaan role; perubahan langsung mempengaruhi UI user terkait (mis. tombol create muncul/hilang) |
| ADM-03 | P1 | Minimum Breakdown Rule (`settings-mbr`) | Ubah aturan MBR → verifikasi efek kunci turunan di Workspace (INIT-02) |
| ADM-04 | P2 | Repeat Setting (`settings-repeat-rules`) | Kelola aturan repeat; efek ke pembuatan AP Repeat |
| ADM-05 | P2 | Card Completion Rule (`settings-card-completion-rule`) | Ubah aturan → verifikasi helper Card Completion di alur card |
| ADM-06 | P2 | Keterangan Card (`settings-card-guidance`) | Ubah teks panduan → tampil di form card terkait |
| ADM-07 | P2 | Status & Prioritas (`settings-status-priority`) | Kelola status/prioritas (permission `manage_settings`) |
| ADM-08 | P2 | Notifications Rule (`settings-notifications-rule`) | Ubah rule → verifikasi notifikasi yang tergenerate |
| ADM-09 | P1 | Score Formula (`settings-score-formula`) | Lihat SCORE-01 |
| ADM-10 | P1 | Governance Violation (`settings-governance-violation`) | Daftar pelanggaran tampil; detail dan penalty benar |
| ADM-11 | P2 | Confidential Access (`settings-confidential-access`) | Beri akses konfidensial sementara; card konfidensial tersembunyi dari user tanpa akses; akses **kedaluwarsa otomatis** (±1 jam) — uji sebelum & sesudah kedaluwarsa |
| ADM-12 | P2 | Goal Template Library (`settings-goal-templates`) | CRUD template Goal |
| ADM-13 | P2 | KPI Area Template (`settings-kpi-area-templates`) | CRUD template KPI Area; muncul di popup KPI-02 |
| ADM-14 | P1 | Activity Log (`settings-activity-log`) | Log tampil **default tidak intimidatif** (PRD §44.26); entri tercipta dari aksi EVD/REV/DCR/SCORE |
| ADM-15 | P2 | Arsip (`settings-archive`) | Card terarsip tampil; akses mengikuti permission (PRD §44.27) |
| ADM-16 | P1 | Tambah User (`settings-user-new`, via tombol di ADM-02) | Buat akun baru (nama, email, password sementara ≥8 karakter, role): user baru bisa login & profil otomatis tercipta dengan role benar; email duplikat ditolak dengan pesan jelas; pill role C-Level terkunci untuk admin non-CEO dan Edge Function menolak `role_level=c_level` dari non-CEO; user tanpa `manage_users_permissions` → AccessDenied; pembuatan tercatat di Activity Log (entity `user`, action `create`) |

---

## 19. Search (SRCH)

Layar: `search`.

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| SRCH-01 | P1 | Global search | Menu → Cari → ketik nama card/orang | Hasil lintas entity relevan |
| SRCH-02 | P1 | Search mengikuti permission | Login staff → cari card konfidensial/di luar akses | Tidak muncul di hasil (PRD §44.27) |
| SRCH-03 | P3 | Query tanpa hasil | Cari string acak | Empty state ramah |

---

## 20. Matriks Akses per Role (ROLE)

Verifikasi cepat siapa boleh apa. Uji tiap sel yang relevan; ✓ = tersedia, ✗ = tidak tersedia/ditolak.

| Aksi | staff | management | c_level | ceo |
|---|---|---|---|---|
| Buat Strategy | ✗ | ✓ | ✓ | ✓ |
| Buat Initiative | ✗ | ✓ | ✓ | ✓ |
| Buat Action Plan | ✗ | ✓ | ✓ | ✓ |
| Review DCR | ✗ | ✓ | ✓ | ✓ |
| Kelola Organisasi (dept/team) | ✗ | ✓ | ✓ | ✓ |
| User & Permission | ✗ | ✗* | ✗* | ✓ |
| Score Formula / Governance / Confidential | ✗ | ✗* | ✗* | ✓ |
| Submit bukti (sebagai PIC) | ✓ | ✓ | ✓ | ✓ |
| Lihat People & Ranking | ✓ | ✓ | ✓ | ✓ |

\* kecuali diberi permission individual lewat User & Permission — uji juga jalur override ini (ROLE-EXT).

| ID | Prio | Skenario |
|---|---|---|
| ROLE-01 | P1 | Jalankan matriks di atas untuk keempat role |
| ROLE-02 | P1 | Beri staff satu permission tambahan via ADM-02 → aksi terkait langsung tersedia tanpa re-login (atau setelah refresh yang wajar) |
| ROLE-03 | P2 | Cabut permission default dari management → aksi terkait hilang |

---

## 21. Dark Mode & Konsistensi Tema (THEME)

Konteks: branch berjalan `fix/darkmode-a11y-consistency`; amandemen owner 2026-07-03 — aturan a11y DESIGN §4 **menang** atas Workspace lock; surface terang yang "terkunci" harus theme-aware di dark mode.

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| THEME-01 | P1 | Sapuan dark mode semua layar | Set tema Gelap → kunjungi SETIAP layar di dokumen ini | Tidak ada teks gelap di atas latar gelap, tidak ada blok putih menyilaukan yang tidak disengaja |
| THEME-02 | P1 | Surface Workspace terkunci | Buka Workspace (card tree) dalam dark mode | Surface yang di-lock terang di light mode ikut menyesuaikan dark (theme-aware), teks tetap kontras |
| THEME-03 | P1 | Tombol solid + teks putih | Periksa semua tombol primary di dark & light | Latar `brand-dark` `#1564b3` (bukan `brand` `#208aef`) — kontras AA |
| THEME-04 | P2 | Placeholder & input | Periksa form (login, new card) di dark mode | Placeholder terbaca (warna disesuaikan), border input terlihat |
| THEME-05 | P2 | Mode Sistem | Set tema Sistem → ubah tema OS | App mengikuti perubahan OS tanpa restart |
| THEME-06 | P2 | Badge & status | Periksa ScoreBadge/status chip di dark mode | Pasangan warna tetap memenuhi kontras; label teks selalu ada |

---

## 22. Aksesibilitas (A11Y) — DESIGN.md §4 (mengikat)

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| A11Y-01 | P1 | Touch target ≥ 44×44 px | Ukur tombol, chip, ikon-only di layar utama (inspect di web preview) | Semua kontrol ≥44px atau punya `hitSlop`/padding setara; header memenuhi aturan 44/12 |
| A11Y-02 | P1 | Warna bukan satu-satunya sinyal | Periksa semua status, skor, badge | Selalu warna **+** label teks |
| A11Y-03 | P1 | Kontras solid+putih | Sama dengan THEME-03 | `brand-dark` untuk semua fill solid berlabel putih |
| A11Y-04 | P2 | Label screen reader | Aktifkan screen reader / inspect a11y tree | Kontrol punya `accessibilityRole`, `accessibilityLabel`, `accessibilityState` (busy/disabled) |
| A11Y-05 | P2 | Dynamic Type | Perbesar font sistem OS → buka layar utama | Layout tidak terpotong; kontainer teks tidak fixed-height |

---

## 23. Empty / Loading / Error State & Ketahanan (STATE)

| ID | Prio | Skenario | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| STATE-01 | P1 | Loading state | Buka layar berat dengan koneksi dilambatkan | Skeleton/spinner tampil; tidak ada layout jump ekstrem |
| STATE-02 | P1 | Error state + retry | Matikan Supabase lokal → buka layar data | ErrorState ramah dengan aksi coba lagi; tidak crash/white screen |
| STATE-03 | P1 | Empty state | Akun/periode tanpa data di tiap tab utama | Empty state sesuai PRD §40 (ramah, ada arah tindakan) |
| STATE-04 | P2 | Kehilangan koneksi di tengah aksi | Putuskan koneksi saat submit bukti/pesan | Error jelas; data tidak double-submit saat retry |
| STATE-05 | P2 | Gambar/file gagal muat | Bukti file dengan URL rusak | Placeholder/error item, bukan crash |
| STATE-06 | P3 | Input ekstrem | Nama card 200+ karakter, emoji, angka negatif pada target | Validasi/pemotongan wajar; layout tidak pecah |

---

## 24. Checklist Regression Cepat (smoke test)

Untuk verifikasi cepat setelah perubahan besar (±15 menit):

1. [ ] AUTH-01, AUTH-07 — login & logout
2. [ ] NAV-01 — bottom nav 5 tab
3. [ ] HOME-01, HOME-03 — Home + % gap KPI
4. [ ] WS-02, WS-04, WS-05 — periode aktif, archive dim, card tree
5. [ ] KPI-04, KPI-06 — validasi breakdown 100%
6. [ ] INIT-02 — kunci MBR
7. [ ] AP-02 — repeat menghasilkan instance
8. [ ] EVD-02, REV-01 — bukti versioning, approve → nilai masuk KPI
9. [ ] CHAT-01, CHAT-03 — chat dua arah + reply context AP
10. [ ] PPL-02, PPL-06 — People list + profil
11. [ ] MENU-02 — gating permission menu
12. [ ] THEME-01 — sapuan dark mode singkat (Home, Workspace, Menu)

---

## 25. Pemetaan ke Acceptance Criteria PRD §44

| Kriteria PRD §44 | Kasus uji |
|---|---|
| 1. Mobile-first 390px | Semua modul (viewport uji), WS-07 |
| 2. Bottom nav final | NAV-01 |
| 3. Header global konsisten | NAV-03 |
| 4. Menu sebagai hub | MENU-01 |
| 5. Card tree Detail + panah | WS-05 |
| 6. Pola UI Perf = Dev | WS-01, WS-06 |
| 7–8. Periode default & pilihan | WS-02, WS-03, WS-08 |
| 9. Periode lewat redup | WS-04, AP-06 |
| 10–11. Goal tahunan, KPI ikut Goal | GOAL-01, KPI-03 |
| 12. Breakdown total 100% | KPI-04, KPI-05, KPI-06 |
| 13. KPI manual default + template popup | KPI-01, KPI-02 |
| 14. Validasi saat Aktifkan Card | KPI-09 |
| 15. MBR kunci + popup | INIT-02, ADM-03 |
| 16–17. One Time & Repeat + Instance | AP-01, AP-02, AP-03 |
| 18. Bukti versioning | EVD-02 |
| 19. Nilai hasil setelah review | EVD-05, REV-01 |
| 20–21. Chat Initiative + reply context | CHAT-02, CHAT-03 |
| 22–23. Notif bukan chat; Inbox bukan queue | NOTIF-01, INBOX-01 |
| 24. People objektif | PPL-02, PPL-03 |
| 25. Admin ikut permission | MENU-02, ADM-*, ROLE-* |
| 26. Activity Log tidak intimidatif | ADM-14 |
| 27. Search & Archive ikut permission | SRCH-02, ADM-15 |
| 28. Tidak ada fitur terlarang | NAV-05 |
