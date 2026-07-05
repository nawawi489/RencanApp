# Laporan Manual Testing UI — RencanApp

- Tanggal: 2026-07-05
- Penguji: AI assistant via browser preview
- Target: `http://localhost:8081/`
- Panduan acuan: `docs/manual-testing.md`
- Viewport terukur saat uji login: `375x667`
- Akun yang dipakai:
  - `ceo@rencan.local`
  - `staff.finance@rencan.local`
  - `mgr.sales@rencan.local`
  - `cmo@rencan.local`

## Ringkasan

Pengujian dilakukan langsung lewat interface web sesuai skenario di `manual-testing.md`, dengan fokus pada alur yang bisa diverifikasi dari instance yang sudah berjalan: autentikasi, navigasi utama, Home, Notifications, Workspace, Inbox/Chat, People, Menu, logout, dan gating permission dasar.

Hasil ringkas:

| Status | Jumlah |
|---|---:|
| Pass | 17 |
| Fail | 6 |
| Partial / Blocked | 10 |

## Temuan Utama

1. `WS-04` gagal: periode arsip masih mengizinkan aksi tambah.
   - Di `Workspace > Performance`, periode berhasil diubah ke `Januari 2026`.
   - Tombol `+ Goal` tetap aktif.
   - Menekan tombol itu benar-benar membuka `goal-wizard`.
   - Ini bertentangan dengan ekspektasi skenario: periode archive harus redup dan aksi tambah turunan nonaktif dengan penjelasan.

2. `AUTH-02b` gagal: validasi minimum password tidak menahan request.
   - Password `123` dikirim dan menghasilkan pesan `Email atau kata sandi salah.`
   - Skenario mengharapkan validasi client-side untuk password `< 6` karakter sebelum request.
   - **RESOLVED 2026-07-05** (commit `23041a7`): `login.tsx` sekarang menahan `password.length < 6` sebelum `signInWithPassword`, memakai konstanta `AUTH_COPY.passwordTooShort = 'Kata sandi minimal 6 karakter.'`. Test ulang manual di web preview (`localhost:8091`): banner alert menampilkan pesan itu, tidak ada POST baru ke `/auth/v1/token`. Test coverage: 11 kasus di `login.test.tsx` (AC-AUTH02-1..6 + critic regression). Ref: `docs/spec-ui-testfix-2026-07-05.md`.

3. `MENU-03` gagal: toggle tema `Gelap` tidak terapkan mode gelap.
   - Di Menu, klik opsi `Gelap`.
   - Tampilan tetap berada di mode terang; screenshot visual juga menunjukkan `Terang` yang aktif.

4. `PPL-02` dan `PPL-06` gagal: layar People dan Profile belum memenuhi struktur skenario.
   - `People` belum menampilkan tab `Ranking / Bulan ini / Quarter / Admin`.
   - `People Profile` masih sangat minimal; belum ada ranking, kontribusi bulan ini, rincian score, atau riwayat score.

5. Ada error console jaringan terhadap `127.0.0.1:54321`.
   - Terlihat `Failed to fetch` dan beberapa `net::ERR_ABORTED` ke endpoint Supabase lokal.
   - UI masih merender, tetapi ini indikasi konfigurasi backend/web session belum sepenuhnya bersih.
   - **RESOLVED 2026-07-05** (commit `d1fd7eb`): helper murni baru `resolveSupabaseUrl(Platform.OS, env.supabaseUrl)` di `mobile/src/lib/supabase-url.ts` menormalkan host per platform — web → `localhost`, iOS sim → `127.0.0.1`, Android emu → `10.0.2.2`, host non-local (staging/LAN/docker) TIDAK dimutasi. `mobile/.env` dan `.env.example` didokumentasi ulang. Test ulang manual di web preview: POST ke `localhost:54321/auth/v1/token` sukses (400 dari server, bukan network error). Test coverage: 13 kasus helper murni + 1 wiring integration + 3 env guard di `supabase-url.test.ts` / `supabase-wiring.test.ts` / `env.test.ts`.

## Hasil Per Kasus

| ID | Status | Akun | Catatan |
|---|---|---|---|
| AUTH-01 | Pass | CEO / Manager / C-Level / Staff | Login sukses terverifikasi pada empat role yang tersedia di dokumen: `ceo`, `mgr.sales`, `cmo`, `staff.finance`. |
| AUTH-02 | Pass | CEO | Submit kosong menampilkan `Email dan kata sandi wajib diisi.` |
| AUTH-02b | **Pass** (fixed 2026-07-05, commit `23041a7`) | CEO | Password pendek (`123`) sekarang ditahan client-side dengan pesan konstanta `Kata sandi minimal 6 karakter.`; boundary 6 karakter tetap lolos. |
| AUTH-02c | Pass | CEO | Toggle password mengubah label aksesibilitas dari `Sembunyikan kata sandi` ke `Tampilkan kata sandi`. |
| AUTH-02d | Pass | CEO | `Hubungi Admin` menampilkan info bahwa akun dibuat admin perusahaan. |
| AUTH-03 | Pass | CEO | Password salah menghasilkan copy Indonesia: `Email atau kata sandi salah.` |
| AUTH-04 | Pass | CEO | Reset tanpa email menampilkan `Isi email dulu untuk reset kata sandi.` |
| AUTH-05 | Pass | CEO | Reset dengan email menampilkan pesan netral, tidak membocorkan status email. |
| AUTH-06 | Partial | CEO | Persist sesi tidak diverifikasi secara meyakinkan; ada perilaku route/full navigation yang tidak konsisten selama sesi. |
| AUTH-07 | Pass | CEO | Logout dari Menu kembali ke Login. |
| AUTH-08 | Pass | Logout | Mengakses route app saat logout diarahkan ke Login. |
| NAV-01 | Pass | CEO/Staff | Bottom nav tepat 5 tab: `Home, Notif, Workspace, Inbox, Menu`. |
| NAV-02 | Pass | CEO | Perpindahan antar tab utama berjalan tanpa crash. |
| NAV-03 | Pass | CEO | Header brand `Rencanaapp` konsisten antar layar utama. |
| HOME-01 | Pass | Staff | Home memuat greeting, prioritas, KPI gap, dan tugas aktif. |
| HOME-02 | Partial | Staff | CTA majemuk pada kartu fokus tidak diuji penuh; yang terlihat di Home tetap cukup ringkas. |
| HOME-03 | Pass | CEO/Staff | KPI gap tampil presisi, mis. `kurang 120 customer`, `kurang 28 hari`. |
| HOME-05 | Pass | CEO | Empty state tugas tampil ramah untuk akun CEO yang tidak punya tugas aktif. |
| NOTIF-01 | Pass | CEO | Delapan tab notifikasi tampil: `Semua, Perlu Tindakan, Review, Deadline, Komentar, Terlewat, Repeat, Governance`. |
| NOTIF-01b | Partial | CEO | Perpindahan filter tidak bisa divalidasi tuntas karena tidak ada data notifikasi dan state terpilih tidak jelas dari snapshot. |
| NOTIF-06 | Pass | CEO | Empty state notifikasi tampil baik. |
| WS-01 | Pass | CEO | Hub Workspace menampilkan pintu `Performance` dan `Development` dengan statistik ringkas. |
| WS-02 | Pass | CEO | Panel periode aktif tampil: `Juli 2026` dengan tombol `Ubah`. |
| WS-03 | Pass | CEO | Selector periode bulan/quarter tampil dengan label `Arsip`, `Aktif`, `Akan datang`; pilihan `Januari 2026` berhasil diterapkan. |
| WS-04 | Fail | CEO | Setelah pilih periode arsip, tombol tambah masih aktif dan membuka `goal-wizard`. |
| WS-05 | Pass | CEO / Manager / C-Level / Staff | Tree Performance menampilkan affordance terpisah untuk detail dan expand. Pada surface yang diuji, `staff`, `manager`, dan `c-level` tidak menampilkan tombol `+ Goal`, sementara CEO menampilkannya. |
| INBOX-01 | Partial | CEO | Struktur dasar inbox ada, tetapi coverage belum penuh terhadap unread badge/timestamp/filter lanjutan. |
| CHAT-01 | Partial | CEO | Kirim pesan satu arah berhasil di room Initiative; balasan dua arah belum diuji. |
| PPL-01 | Pass | CEO | `People` bisa diakses dari Menu. |
| PPL-02 | Fail | CEO | Struktur layar People belum sesuai skenario ranking. |
| PPL-06 | Fail | CEO | Profil orang masih terlalu minimal dibanding kebutuhan skenario. |
| MENU-01 | Pass | CEO | Isi Menu untuk CEO lengkap sesuai kategori utama. |
| MENU-02 | Pass | Staff vs Management vs C-Level vs CEO | Perbedaan gating terlihat jelas: `staff` hanya menampilkan subset ringkas; `manager` dan `c-level` menampilkan `Organisasi` tetapi tetap tidak menampilkan `User & Permission`, `Status & Prioritas`, `Notifications Rule`, `Score Formula`, `Governance Violation`, `Confidential Access`; `ceo` menampilkan seluruh item admin. |
| MENU-03 | Fail | CEO | Toggle `Gelap` tidak mengubah app ke dark mode. |
| MENU-04 | Blocked | CEO | Collapse/expand grup tidak diuji spesifik. |
| THEME-01 | Blocked | CEO | Karena toggle `Gelap` gagal, sapuan dark mode lintas layar belum bisa diverifikasi valid. |
| ROLE-01 | Partial | Staff / Management / C-Level / CEO | Baseline role comparison sudah dijalankan pada empat akun untuk login, Menu, dan Workspace surface. Matriks aksi detail seperti create Strategy/Initiative/AP, review DCR, dan override permission masih butuh pass lanjutan. |

## Bukti Eksekusi

- Login page menampilkan validasi kosong, reset password, toggle password, dan pesan `Hubungi Admin`.
- Home CEO menampilkan KPI gap dan seluruh empty state.
- Home staff menampilkan KPI gap dan satu Action Plan aktif `Reminder Harian (Repeat)`.
- Login bergantian berhasil pada `staff.finance`, `mgr.sales`, `cmo`, dan `ceo`.
- Workspace Performance berhasil pindah ke `Januari 2026`, lalu `+ Goal` tetap aktif dan membuka `goal-wizard`.
- Di `Workspace > Performance`, surface `staff`, `manager`, dan `c-level` tidak menampilkan `+ Goal`, sementara CEO menampilkannya.
- Inbox room Initiative menerima pesan `uji manual 2026-07-05`.
- People dan People Profile berhasil dibuka, tetapi kontennya belum selengkap skenario.
- Menu menunjukkan gradasi permission yang jelas: `staff` < `manager/c-level` < `ceo`.

## Kasus yang Belum Ditutup

Kasus berikut tidak saya nyatakan fail karena butuh data/aksi tambahan di luar sesi ini:

- Seluruh alur CRUD Goal/KPI/Strategy/Initiative/AP yang lengkap
- Review bukti, DCR, repeat instance, score override, governance, confidential access
- Verifikasi role matrix penuh lintas 4 role untuk aksi detail, bukan sekadar visibility surface
- A11Y detail seperti touch target 44px, screen reader tree, dynamic type
- Dark mode lintas layar setelah bug toggle tema diperbaiki

## Rekomendasi

1. Perbaiki dulu `WS-04`, `AUTH-02b`, `MENU-03`, dan layar `People`.
2. Cek konfigurasi web app terhadap Supabase lokal karena console masih menunjukkan request abort ke `127.0.0.1:54321`.
3. Setelah itu lanjutkan batch test kedua untuk alur data-heavy: KPI breakdown, review bukti, DCR, repeat instance, dan score/ranking.
