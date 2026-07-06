# Laporan Manual Testing UI — RencanApp

- Tanggal: 2026-07-06
- Penguji: AI assistant via browser preview
- Acuan skenario: `docs/manual-testing.md`
- Kredensial: `docs/kredensial-login.md`
- Target uji: `http://localhost:8081`
- Catatan lingkungan:
  - Pengujian dilakukan lewat web preview aktif.
  - Layout yang tampil adalah layout mobile web (bottom nav 5 tab terlihat), tetapi viewport tidak saya kunci manual ke 390 px dari tool browser.
  - Kesimpulan saya ambil dari route aktif, elemen interaktif yang terlihat, dan teks layar yang relevan. Kasus yang butuh multi-session paralel, perubahan OS, background job, upload file, atau setup data tambahan saya tandai `Blocked`.

## Ringkasan

| Status | Jumlah |
|---|---:|
| Pass | 27 |
| Partial | 3 |
| Fail | 0 |
| Blocked | 40+ |

Kesimpulan saat sesi ini: alur inti yang terlihat dari UI aktif berjalan baik. Login, logout, route guard, bottom navigation, Home, Notifications, Workspace, Inbox/Chat, People, People Profile, theme toggle, dan gating permission dasar bisa diverifikasi langsung. Belum ada bug baru yang muncul pada surface yang diuji.

Catatan: setelah ringkasan awal ini, saya menambahkan **Addendum Batch Kedua** yang memuat hasil multi-aktor dan satu temuan bug baru pada flow repeat instance.

## Akun yang dipakai

- `ceo@rencan.local`
- `staff.sales@rencan.local`
- `mgr.sales@rencan.local`
- `cmo@rencan.local`

## Hasil Per Kasus

| ID | Status | Akun | Catatan |
|---|---|---|---|
| AUTH-01 | Pass | CEO, Staff, Manager, C-Level | Login berhasil untuk keempat role seed. |
| AUTH-02 | Pass | CEO | Submit kosong menampilkan `Email dan kata sandi wajib diisi.` |
| AUTH-02b | Pass | CEO | Password pendek `123` ditahan client-side dengan pesan `Kata sandi minimal 6 karakter.` |
| AUTH-02c | Pass | CEO | Tombol mata mengubah label dari `Tampilkan kata sandi` menjadi `Sembunyikan kata sandi`. |
| AUTH-02d | Pass | CEO | `Hubungi Admin` menampilkan info bahwa akun dibuat administrator perusahaan. |
| AUTH-03 | Pass | CEO | Password salah menampilkan copy Indonesia: `Email atau kata sandi salah.` |
| AUTH-04 | Pass | CEO | Reset tanpa email menampilkan `Isi email dulu untuk reset kata sandi.` |
| AUTH-05 | Pass | CEO | Reset dengan email menampilkan pesan netral, tidak membocorkan status email. |
| AUTH-06 | Pass | CEO | Setelah reload route `/`, sesi tetap aktif dan kembali ke Home. |
| AUTH-07 | Pass | CEO, Staff, Manager, C-Level | Logout dari Menu kembali ke `/login`. |
| AUTH-08 | Pass | Logout | Akses langsung ke `/workspace` saat logout otomatis diarahkan ke `/login`. |
| NAV-01 | Pass | CEO, Staff | Bottom nav tepat 5 tab: `Home`, `Notif`, `Workspace`, `Inbox`, `Menu`. |
| NAV-02 | Pass | CEO, Staff | Pindah antar tab utama berjalan tanpa crash. |
| NAV-03 | Pass | CEO | Header/subtitle layar utama konsisten: Home, Notifications, Workspace, Menu. |
| HOME-01 | Pass | CEO, Staff | Home memuat greeting, prioritas, snapshot KPI, dan section tugas. Pada staff ada data tugas aktif dan repeat. |
| HOME-02 | Pass | Staff | Card tugas di Home bertindak sebagai CTA tunggal ke detail, tidak ada deretan aksi besar. |
| HOME-03 | Pass | CEO, Staff | KPI gap tampil presisi, mis. `kurang 120 customer`, `kurang 350.000 rupiah`. |
| HOME-05 | Pass | CEO, Staff | Empty state dan state berisi sama-sama tampil wajar: CEO kosong, Staff berisi AP aktif/repeat. |
| HOME-06 | Pass | CEO, Staff | Pada surface yang diuji tidak terlihat feed sosial, shortcut nav duplikat, atau fitur terlarang. |
| NOTIF-01 | Pass | CEO | Ada 8 tab: `Semua`, `Perlu Tindakan`, `Review`, `Deadline`, `Komentar`, `Terlewat`, `Repeat`, `Governance`. |
| NOTIF-03 | Pass | CEO | Seed notifikasi review muncul dengan konteks reviewer yang benar, termasuk CTA `Review Sekarang`. |
| NOTIF-04 | Pass | CEO | Jenis notifikasi lain juga muncul: mention komentar, deadline, terlewat, repeat, governance. |
| WS-01 | Pass | CEO, Staff | Workspace hub menampilkan pintu `Performance` dan `Development` dengan statistik ringkas. |
| WS-02 | Pass | CEO | Panel periode aktif tampil, termasuk label periode dan tombol `Ubah`. |
| WS-03 | Pass | CEO | Modal pemilih periode menampilkan segmented `Bulan/Quarter` dan status `Arsip`, `Aktif`, `Akan datang`. |
| WS-04 | Pass | CEO | Saat fokus di `Januari 2026`, tombol header tampil sebagai `+ Goal (periode arsip — nonaktif)` dan klik tidak membuka form baru. |
| WS-05 | Pass | CEO, Staff | Tree Performance memakai affordance terpisah untuk `Detail` dan expand/collapse. |
| WS-07 | Pass | CEO, Staff | Card tree tetap kompak dan terbaca pada layout mobile web yang aktif. |
| WS-09 | Pass | CEO, Staff | Progress/orb dan status tekstual tampil konsisten; `0%` dan state kosong bisa dibedakan di surface yang diuji. |
| INBOX-01 | Pass | CEO | Inbox menampilkan search, filter `Semua/Belum dibaca`, preview pesan terakhir, dan list room. |
| CHAT-01 | Pass | CEO, Manager, Staff | Batch pertama menutup kirim satu arah; batch kedua menutup dua arah memakai session terpisah `localhost` vs `127.0.0.1`. Detail ada di addendum. |
| CHAT-02 | Pass | CEO | Room yang diuji terikat ke Initiative, bukan chat bebas. |
| CHAT-05 | Pass | CEO | Banner room menegaskan chat bukan jalur formal bukti/review. |
| PPL-01 | Pass | CEO | People bisa dibuka dari Menu. |
| PPL-02 | Pass | CEO | People menampilkan tabs `Bulan ini`, `Quarter`, `Ranking`, `Admin`, search, dan daftar anggota. |
| PPL-03 | Pass | CEO | List People tidak membocorkan PIC/Reviewer/detail KPI; hanya identitas dan ringkasan yang relevan. |
| PPL-06 | Pass | CEO | People Profile Fajar memuat identitas, status, score band, breakdown metrik, dan detail people. |
| MENU-01 | Pass | CEO, Staff, Manager | Menu menampilkan profil, quick access, tampilan, dan logout. |
| MENU-02 | Pass | CEO, Staff, Manager | Gating permission terlihat: CEO punya surface admin lengkap; Staff jauh lebih terbatas; Manager berada di tengah. |
| MENU-03 | Pass | CEO | Toggle `Gelap` mengaktifkan class `dark` pada dokumen dan surface utama berubah ke palet gelap. |
| ROLE-01 | Partial | CEO, Staff, Manager, C-Level | Verifikasi dasar berhasil: semua role bisa login; Staff tidak melihat affordance create di Performance; CEO melihat affordance create; Manager/C-Level berhasil login, tetapi matriks aksi penuh belum ditutup. |

## Observasi Penting

1. Data seed untuk CEO cukup kaya untuk menutup beberapa skenario notif tanpa perlu setup tambahan.
2. Data seed untuk `staff.sales` berguna untuk menutup skenario Home yang berisi tugas aktif, repeat due today, dan overdue repeat.
3. People dan People Profile pada build saat ini sudah jauh lebih lengkap daripada laporan UI lama yang ada di repo.
4. Browser snapshot pada React Native Web kadang masih memuat elemen route sebelumnya di tree aksesibilitas. Karena itu saya hanya menganggap kasus `Pass` bila route aktif, elemen terlihat, dan teks utama layar saling konsisten.
5. Batch kedua berhasil dijalankan dengan dua origin berbeda: `http://localhost:8081` dan `http://127.0.0.1:8081`. Ini memisahkan storage sesi browser sehingga role `manager` dan `staff` bisa aktif bersamaan untuk uji dua aktor.

## Addendum Batch Kedua — 2026-07-06

| ID | Status | Akun | Catatan |
|---|---|---|---|
| CHAT-01 | Pass | Manager (`localhost`) + Staff (`127.0.0.1`) | Dua arah berhasil. `staff.sales` mengirim `Siap, saya kirim revisi visual sore ini.` lalu `mgr.sales` membalas `Baik, saya tunggu lalu kita review di thread ini.` pada room yang sama: `Diskusi Launch Program Referral`. Kedua pesan tampil di kedua sisi. |
| PPL-05 | Partial | Staff | Route `people-ranking` terbuka dan menampilkan guidance `Ranking belum tersedia` / `Papan peringkat muncul setelah administrator menutup periode skoring.` Ini menutup sisi "sub-view ada", tetapi belum menutup kondisi setelah periode benar-benar ditutup. |
| PPL-07 | Partial | Staff | Build ini mengonfirmasi rule D9 untuk kondisi **belum ada periode tertutup**: ranking tidak ditampilkan dan diganti guidance note. Verifikasi setelah periode tertutup masih belum bisa dilakukan karena belum ditemukan surface close-period yang discoverable di UI. |
| AP-03 | Fail | Staff, Manager | Dari Home `staff.sales`, item repeat `Checkout Harian (Repeat)` yang seharusnya mengarah ke detail instance justru membuka route `action-plan/cccccccc-cccc-cccc-cccc-000000000002` milik parent Action Plan. Di detail itu juga muncul kontradiksi: `Repeat Compliance 2/4 (50%)` tetapi section `Instance Terjadwal` menulis `Belum ada instance`. Ini menunjukkan detail instance/repeat belum terhubung konsisten. |
| MENU-01 / ADM surface | Partial | CEO | Sebagai CEO, grup `Pengaturan` dan `Admin Lanjutan` berhasil dibuka dan menampilkan item `Organisasi`, `Repeat Setting`, `Score Formula`, `Permission Settings`, `Minimum Breakdown Rule`, `Card Completion Rule`, `Keterangan Card`, `Status & Prioritas`, `Notifications Rule`, `Governance`, `Confidential`, dan `Override Score`. Namun belum ada item penutupan periode yang discoverable dari Menu/Settings ini. |

## Addendum Batch Ketiga — 2026-07-06

| ID | Status | Akun | Catatan |
|---|---|---|---|
| DCR-01 | Pass | Staff (`127.0.0.1`) | Dari AP `Desain Landing Page Referral`, `staff.sales` berhasil membuka form DCR dan mengirim perubahan deadline dari `2026-07-15` ke `2026-07-20` dengan alasan `Butuh tambahan waktu untuk finalisasi integrasi form dan QA lintas device.` serta dampak `Landing page referral berisiko mundur dan kampanye Q3 ikut tertunda.` Request tercatat di riwayat permintaan. |
| DCR-02 | Pass | Staff (`127.0.0.1`) | Saat field `Alasan` dibiarkan kosong, form menolak submit dengan validasi client-side. Setelah field wajib diisi, request baru bisa dikirim. |
| DCR-03 | Pass | Manager (`localhost`) + Staff (`127.0.0.1`) | `mgr.sales` login sebagai reviewer yang benar, membuka item review dari Home, lalu menyetujui request. Setelah approval, detail AP di sisi `staff.sales` berubah dan menampilkan `DEADLINE 2026-07-20`. |
| REV-01 | Pass | Manager (`localhost`) + Staff (`127.0.0.1`) | Submission one-time AP `Desain Landing Page Referral` akhirnya bisa direview penuh setelah sesi `localhost` dipastikan memakai akun reviewer `mgr.sales` (sebelumnya sempat tersisa sesi CEO, sehingga panel review tidak muncul). Reviewer menekan `Setujui (Selesai)`; status berubah dari `Menunggu Review` menjadi `Selesai`, progress menjadi `100`, dan kedua sisi (`manager` + `staff`) menampilkan riwayat `Versi 1` berstatus `Disetujui` lengkap dengan jejak `Direview oleh Dewi Anggraini`. |
| MENU-01 / ADM surface | Partial | CEO (`localhost`) | Pass admin dilanjutkan ke layar `Score Formula`. Surface ini menampilkan `Periode aktif` (`Q3 2026 · 2026-07-01 – 2026-09-30`) dan editor formula per role, tetapi tetap tidak menyediakan CTA `buka/tutup periode`. Pencarian cepat di source juga menemukan RPC backend `close_period_snapshot`, namun belum terlihat route UI admin yang mengekspos aksi close period. |

## Addendum Batch Keempat — 2026-07-06

| ID | Status | Akun | Catatan |
|---|---|---|---|
| DCR-04 | Pass | Staff (`127.0.0.1`) + Manager (`localhost`) | Staff mengirim request kedua `2026-07-20 → 2026-07-25` dengan alasan `Butuh buffer tambahan untuk finalisasi konten, pengecekan analytics, dan sign-off marketing.`. Reviewer `mgr.sales` menekan `Tolak`; status request berubah menjadi `Ditolak` setelah refresh di kedua sisi. Detail AP tetap menunjukkan `DEADLINE 2026-07-20`, jadi penolakan tidak mengubah deadline. |
| DCR-05 | Fail | Manager (`localhost`) | Di UI reviewer hanya ada dua aksi pada request pending: `Setujui` dan `Tolak`. Tidak ada affordance `minta revisi alasan` atau field untuk mengembalikan request ke pemohon dalam state revisi. Artinya skenario `DCR-05` belum bisa dijalankan dari build ini. |
| AP-03 | Fail | Staff (`127.0.0.1`) + Manager (`localhost`) | Temuan repeat/instance bertambah kuat. Dari Home `staff.sales`, CTA `Repeat hari ini` tetap membuka parent route `action-plan/cccccccc-cccc-cccc-cccc-000000000002`, bukan `action-plan/instance/[id]`. Dari Notifications manager, CTA `Review Sekarang` untuk `Review Submission Baru` juga mengarah ke parent AP yang sama, bukan ke instance yang perlu direview. Saat instance dibuka langsung via URL seed `action-plan/instance/eeeeeeee-eeee-eeee-eeee-000000000002` atau `...000000000003`, web preview hanya merender judul `Instance` tanpa detail/jaringan fetch instance, sehingga layar instance praktis tidak bisa dipakai untuk manual testing repeat flow di web. |

## Addendum Batch Kelima — 2026-07-06

| ID | Status | Akun | Catatan |
|---|---|---|---|
| DCR-06 | Pass | `staff.finance` (`localhost`) | Setelah login sebagai staff non-reviewer `staff.finance@rencan.local`, layar `deadline-change-request?actionPlanId=cccccccc-cccc-cccc-cccc-000000000001&oldDeadline=2026-07-20` hanya menampilkan form pengajuan dengan tombol `Kirim Permintaan`. Tidak ada tombol `Setujui`/`Tolak`, dan riwayat request milik `staff.sales` juga tidak terekspos. Ini menutup syarat bahwa staff biasa tidak mendapat aksi persetujuan pada DCR orang lain. |

## Addendum Batch Keenam — 2026-07-06

| ID | Status | Akun | Catatan |
|---|---|---|---|
| ADM-14 | Pass | CEO (`127.0.0.1`) + `staff.finance` (`localhost`) | Sebagai CEO, layar `settings-activity-log` terbuka tanpa error dan menampilkan `30 entri (append-only — tidak dapat diubah atau dihapus)`. Entri terbaru merekam aksi batch uji ini, termasuk `Perubahan Deadline Ditolak`, `Pengajuan Perubahan Deadline`, `Perubahan Deadline Disetujui`, `submit`, dan `review_approve`, dengan timestamp dan entity type yang konsisten. Copy layar tetap netral dan tidak intimidatif. Sebagai `staff.finance`, route yang sama menampilkan `Anda tidak memiliki akses` dengan pesan `Activity Log hanya untuk pemegang izin Lihat Activity Log.` |

## Addendum Batch Ketujuh — 2026-07-06

| ID | Status | Akun | Catatan |
|---|---|---|---|
| ADM-01 | Pass | CEO (`127.0.0.1`) + `staff.finance` (`localhost`) | Layar `settings-org-structure` terbuka tanpa error dan seluruh tab inti terverifikasi. **Departemen**: CEO melihat data seed (`Finance`, `Operations`, `Sales & Marketing`) dan berhasil menambah `QA Testing 2026-07-06` (langsung muncul di daftar). **Posisi**: CEO berhasil menambah `QA Lead 2026-07-06` (langsung muncul di daftar). **Tim**: CEO berhasil menambah `Squad QA 2026-07-06` (langsung muncul di daftar). **Role**: CEO berhasil menambah Role Template `QA Role 2026-07-06` (level `Management`) dan item muncul di daftar. Pada sisi `staff.finance`, setiap tab menampilkan `Anda tidak memiliki akses` dengan pesan izin yang spesifik: `create_department` (Departemen), `manage_positions` (Posisi), `manage_teams` (Tim), dan `manage_settings` (Role). |

## Kasus Yang Belum Ditutup

Kasus berikut belum saya eksekusi tuntas pada sesi ini dan tetap berstatus `Blocked`:

- `AUTH-09`
- `NAV-04`, `NAV-05`
- `HOME-04`, `HOME-07`
- `NOTIF-01b`, `NOTIF-02`, `NOTIF-02b`, `NOTIF-05`, `NOTIF-06`
- `WS-06`, `WS-08`, `WS-10`, `WS-11`, `WS-12`, `WS-13`
- Semua alur CRUD berat: `GOAL-*`, `KPI-*`, `STR-*`, `INIT-*`, dan mayoritas `AP-*`
- Mayoritas alur bukti/review/DCR: seluruh `EVD-*` dan `REV-02..05`
- `EVAL-*`
- `INBOX-02`, `INBOX-03`, `CHAT-03`, `CHAT-04`
- `PPL-04`, sebagian `PPL-05`, lanjutan `PPL-07*`, `PPL-08`
- `SCORE-*`
- `MENU-04`
- Mayoritas `ADM-*` selain `ADM-14` dan `ADM-01`
- `SRCH-*`
- `ROLE-02`, `ROLE-03`
- `THEME-05`, `THEME-06`
- `A11Y-*`
- `STATE-*`

Alasan utama `Blocked`:

- Butuh dua aktor aktif dalam saat bersamaan
- Butuh upload file atau picker device
- Butuh background job / repeat instance generation
- Butuh penutupan periode admin atau perubahan permission
- Butuh pengukuran OS-level / accessibility-level

## Status Tindak Lanjut

1. Sesi dua browser terpisah sudah dijalankan dengan strategi `localhost` vs `127.0.0.1`; chat dua arah `manager ↔ staff` berhasil ditutup.
2. Batch ketiga menutup approval reviewer one-time submission (`REV-01`) dan approval DCR (`DCR-01..03`) secara end-to-end.
3. Batch keempat menutup `DCR-04`, tetapi juga mengonfirmasi gap fungsional `DCR-05` dan memperkuat bug repeat-instance `AP-03` dari dua surface nyata: Home dan Notifications.
4. Batch kelima menutup `DCR-06`: staff lintas-user tidak melihat aksi approval pada DCR orang lain.
5. Batch keenam menutup `ADM-14`: CEO bisa melihat jejak activity log terbaru dari flow DCR/review, sementara staff tanpa izin ditolak.
6. Batch ketujuh menutup `ADM-01`: tab `Departemen`, `Posisi`, `Tim`, dan `Role` lolos (CEO bisa create; staff tanpa izin ditolak per-tab).
7. Verifikasi penuh `PPL-07*` masih blocked sampai ada cara menutup periode dari UI admin, atau ada data seed dengan periode yang sudah resmi ditutup.
8. Pass admin settings sudah meluas sampai `Score Formula`, `Activity Log`, dan `Organisasi`, tetapi sampai titik ini belum ditemukan surface UI untuk `close period`; CRUD mendalam per layar admin masih perlu sesi lanjutan.
