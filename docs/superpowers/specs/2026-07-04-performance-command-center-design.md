# Performance Command Center Design

Date: 2026-07-04
Project: `d:\Projects\RencanApp`
Status: Approved for design, pending spec review
Primary references: `mobile/src/screens/workspace-screen.tsx`, `mobile/src/components/ui.tsx`, `mobile/src/lib/workspace-copy.ts`, `DESIGN.md`

## Goal

Mengubah layar `Performance` dari pola tree list panjang menjadi pola `Command Center` yang lebih ringkas, lebih cepat dipindai, dan lebih cocok untuk monitoring serta prioritisasi harian.

Fokus desain ini bukan mengganti domain model atau memutus hierarki. Fokus utamanya adalah mengganti cara hierarki disajikan di layar utama:

- dari daftar bertingkat yang terus memanjang
- menjadi dashboard operasional berbasis `goal card`

Hasil yang dituju:

- pengguna bisa menangkap kondisi utama layar dalam 2-3 detik
- rasa “halaman terlalu panjang” berkurang signifikan
- level bawah tidak hilang, tetapi dibuka secara progresif
- kartu utama menjadi lebih actionable
- layar terasa seperti pusat kendali eksekusi, bukan sekadar viewer tree

## Problem Statement

Layar `Performance` saat ini menampilkan hirarki `Goal → KPI Area → Strategy → Initiative → Action Plan` sebagai daftar nested card yang panjang. Pola ini menjaga struktur data, tetapi menciptakan beberapa masalah pada mobile:

- pengguna harus scroll jauh untuk memahami kondisi global
- semua level tampil dengan bobot visual yang terlalu mirip
- prioritas dan risiko tidak cepat terlihat
- aksi penting bercampur dengan kepadatan struktur
- layar terasa seperti daftar dokumen, bukan dashboard pengambilan keputusan

Masalah paling penting yang ingin diselesaikan adalah panjang layar yang berlebihan. Namun akar masalahnya bukan hanya jumlah item. Akar masalahnya adalah semua kedalaman hierarki dibuka terlalu dini di layar utama.

## Non-Goals

Desain ini tidak mencoba:

- mengubah struktur domain `Goal`, `KPI Area`, `Strategy`, `Initiative`, atau `Action Plan`
- mengubah route detail yang sudah ada
- memindahkan pengalaman utama menjadi drill-down penuh multi-screen
- mengubah permission, gating, atau aturan backend
- mendesain ulang seluruh tab `Workspace`
- menciptakan visual yang terlalu marketing atau dekoratif

## Keputusan User Yang Sudah Terkunci

Keputusan berikut sudah eksplisit dikunci lewat diskusi:

- variasi layout boleh bergerak cukup jauh dari layout sekarang
- tujuan utama redesign adalah mengurangi rasa “terlalu panjang”
- arah layout yang dipilih adalah `Command Center`
- layar tetap harus terasa utilitarian, cepat dibaca, dan operasional
- detail level bawah harus tersedia, tetapi tidak langsung memenuhi halaman utama

## Pendekatan Yang Dipertimbangkan

Tiga arah sempat dieksplor:

1. `Command Center`
2. `Split Navigator`
3. `Strategic Storyline`

Pendekatan terpilih: `Command Center`.

Alasan:

- paling efektif mengurangi scroll dan rasa panjang
- paling cocok untuk monitoring rutin dan prioritisasi cepat
- tetap mempertahankan struktur produk yang sudah ada
- paling dekat dengan kebutuhan utilitarian RencanApp
- bisa berkembang ke warning mode dan deep dive tanpa mengubah model dasar layar

## Prinsip Desain

`Command Center` harus mengikuti prinsip berikut:

- **Scan first**: kondisi utama layar harus terbaca sebelum pengguna mulai menjelajah detail
- **Goal-first hierarchy**: unit visual utama di layar utama adalah `Goal`, bukan seluruh level tree sekaligus
- **Progressive disclosure**: detail level bawah muncul saat dibutuhkan, bukan langsung ditampilkan semua
- **Decision-oriented**: metrik, status, dan CTA harus membantu pengguna menentukan fokus berikutnya
- **Calm utility**: tampilan tetap rapi, tenang, dan profesional; bukan dashboard yang bising

## Struktur Layar

Layar dibagi menjadi 3 lapisan utama:

1. `Summary band`
2. `Goal card list`
3. `Progressive detail / deep dive`

Urutannya penting. Pengguna harus selalu memahami konteks global dulu, baru masuk ke fokus per goal, lalu bila perlu membuka kedalaman.

## 1. Summary Band

Bagian atas layar berfungsi sebagai lapisan scan, bukan tempat meletakkan terlalu banyak konten.

Anatominya:

- baris kontrol periode aktif + tombol `Ubah`
- band metrik ringkas maksimal 3 item
- chip filter cepat opsional seperti `Semua`, `Perlu fokus`, `On track`

Contoh metrik yang layak tampil:

- `Goal aktif`
- `Perlu perhatian`
- `Action Plan tertunda`

Aturan:

- seluruh isi summary band harus terbaca tanpa scroll
- maksimal 3 metrik agar header tidak terasa berat
- metrik harus actionable, bukan statistik dekoratif
- bila ada kondisi risiko penting, satu metrik bisa naik menjadi sinyal dominan

## 2. Goal Card Sebagai Unit Utama

Di layar utama, level yang tampil dominan hanyalah `Goal`.

Semua level bawah tetap ada di model informasi, tetapi tidak lagi ditampilkan setara sebagai nested list panjang. Tujuannya adalah memadatkan halaman utama menjadi kumpulan unit yang lebih cepat dipindai.

## Anatomi Goal Card

Setiap `goal card` memakai anatomi berikut:

1. **Baris atas**
   - label konteks kecil untuk periode atau kategori
   - status pill di kanan: `On track`, `Perlu fokus`, atau `Kritis`

2. **Area judul**
   - judul goal sebagai fokus utama
   - maksimal 2 baris

3. **Ringkasan kondisi**
   - satu kalimat ringkas yang menjelaskan kondisi terkini
   - contoh: `2 KPI Area tertinggal dari target`

4. **Area progress**
   - progress bar horizontal utama
   - angka progress tetap tampil eksplisit, misalnya `78%`

5. **Meta ringkas**
   - jumlah `KPI Area`
   - jumlah `Strategy`
   - jumlah `Initiative`
   - blocker bila relevan

6. **Action row**
   - aksi utama: `Masuk Goal`
   - aksi sekunder kontekstual: `Quick scan`, `Lihat blocker`, atau `Review turunan`

## Aturan Visual Goal Card

- kartu harus terasa besar cukup untuk dibaca nyaman, tetapi tetap kompak
- judul dan progress menjadi fokus utama
- meta harus sekunder secara ukuran dan warna
- border kiri atau aksen kategori tetap boleh dipakai sebagai penguat hierarki
- tombol utama memakai `brand-dark` sesuai aturan kontras di `DESIGN.md`
- tombol sekunder memakai gaya ghost atau soft
- jangan memenuhi satu kartu dengan terlalu banyak badge warna-warni

## 3. Progressive Disclosure

Masalah panjang layar diselesaikan dengan menahan detail level bawah sampai benar-benar dibutuhkan.

Perilaku dasarnya:

- default layar hanya menampilkan daftar `goal card`
- `Quick scan` membuka ringkasan turunan singkat pada konteks yang sama
- `Masuk Goal` membawa pengguna ke halaman detail penuh
- informasi bawah tidak langsung ditumpuk di halaman utama

Tujuannya:

- layar utama tetap pendek dan bersih
- kedalaman informasi tetap tersedia
- transisi dari scan ke investigasi terasa natural

## State Perilaku Layar

Supaya layout tidak hanya bagus di satu kondisi, desain ini mengunci 3 state utama:

1. `Default`
2. `Warning`
3. `Deep Dive`

### Default

Dipakai saat mayoritas goal berjalan normal.

Ciri:

- summary band tampil netral
- goal card diurutkan berdasarkan prioritas operasional ringan
- CTA sekunder cenderung `Quick scan`
- warna warning tidak mendominasi layar

Tujuan:

- membuat pengalaman terasa tenang
- mendukung monitoring harian cepat

### Warning

Dipakai saat ada blocker, progress menurun, atau item tertunda signifikan.

Ciri:

- satu metrik di summary band menjadi sinyal utama
- goal bermasalah naik ke urutan atas
- status dan progress memakai aksen warning yang lebih terlihat
- CTA sekunder berubah ke tindakan yang lebih tajam, seperti `Lihat blocker`

Tujuan:

- pengguna langsung tahu area yang harus diprioritaskan
- keputusan fokus bisa diambil tanpa membaca seluruh halaman

### Deep Dive

Dipakai saat pengguna ingin memperdalam satu goal tanpa langsung berpindah penuh ke halaman detail.

Ciri:

- satu `goal card` terbuka menjadi panel yang lebih kaya
- panel menampilkan ringkasan KPI paling riskan, strategy paling aktif, dan action plan yang relevan
- goal lain tetap ada tetapi bobot visualnya diturunkan
- bentuk yang direkomendasikan adalah `inline expand`, bukan sheet terpisah, agar konteks daftar tetap terjaga

Tujuan:

- memberi kedalaman tanpa memutus konteks
- menjaga ritme `scan → fokus → masuk detail bila perlu`

## Aturan Perpindahan Antar-state

- layar masuk pada state `Default`
- data risiko yang signifikan menggeser presentasi ke `Warning`
- `Deep Dive` hanya aktif saat pengguna memilih satu goal
- keluar dari `Deep Dive` harus instan dan mempertahankan posisi scroll

## Informasi Yang Ditahan Dari Layar Utama

Informasi berikut tidak perlu selalu tampil di halaman utama:

- daftar lengkap semua `KPI Area`
- seluruh `Strategy`
- seluruh `Initiative`
- seluruh `Action Plan`
- detail narasi panjang

Informasi ini hanya muncul saat pengguna:

- membuka `Quick scan`
- berpindah ke detail goal
- atau mengaktifkan mode fokus tertentu

## Perilaku CTA

### Masuk Goal

- aksi utama pada kartu
- membawa ke halaman detail goal penuh
- dipakai untuk eksplor serius dan pekerjaan lanjutan

### Quick Scan

- aksi sekunder default pada goal yang sehat
- menampilkan ringkasan cepat pada konteks layar yang sama
- isi maksimal: KPI paling riskan, strategy aktif, dan action plan tertunda yang paling penting
- tidak boleh berubah menjadi mini-page penuh

### Lihat Blocker

- aksi sekunder untuk goal yang punya isu nyata
- langsung menyorot hambatan utama
- diprioritaskan pada state `Warning`

## Prioritas Visual

Saat layar dipindai dari atas ke bawah, urutan prioritas visual harus terasa seperti ini:

1. kondisi global layar
2. goal yang paling penting atau paling bermasalah
3. progres per goal
4. aksi utama
5. meta pendukung

Jika meta, badge, atau struktur bawah mulai lebih menonjol daripada prioritas ini, berarti desain telah melebar dari tujuan awal.

## Dampak Ke Arsitektur UI

Implementasi ini adalah perubahan anatomi presentasi, bukan perubahan arsitektur data.

Hal yang kemungkinan berubah:

- struktur header pada layar `Performance`
- komponen kartu utama untuk daftar goal
- pola expand atau preview singkat dalam konteks layar
- urutan visual item berdasarkan state operasional

Hal yang tidak berubah:

- route detail
- model data
- permission dan gating
- semantics domain setiap level

## Dampak Ke File

File yang paling mungkin terdampak:

- `mobile/src/screens/workspace-screen.tsx`
- `mobile/src/components/ui.tsx`
- `mobile/src/lib/workspace-copy.ts`

File test yang kemungkinan ikut berubah:

- `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx`
- test komponen baru untuk `goal card`, summary band, dan deep dive behavior bila diekstrak

## Strategi Implementasi Yang Disarankan

Urutan implementasi yang disarankan:

1. rapikan `summary band`
2. bentuk `goal card` sebagai unit utama
3. pindahkan detail bawah ke pola progressive disclosure
4. terapkan state `Warning`
5. tambahkan perilaku `Deep Dive`
6. baru setelah itu rapikan copy, spacing, dan test

Urutan ini menjaga agar struktur paling penting selesai dulu sebelum masuk ke polish.

## Risiko

- jika summary band terlalu padat, layar kembali terasa berat di bagian atas
- jika `goal card` terlalu informatif, kita hanya memindahkan kepadatan dari tree ke kartu
- jika `Quick scan` terlalu kaya, pengguna kehilangan pembeda antara layar utama dan halaman detail
- jika `Warning` terlalu agresif secara warna, karakter tenang aplikasi akan hilang

## Testing Strategy

Testing perlu memverifikasi:

1. **Scanability**
   - kondisi global terbaca tanpa scroll
   - jumlah metrik di header tetap terkendali
   - goal prioritas tampil lebih dulu

2. **Behavior**
   - `Masuk Goal` tetap menuju route yang benar
   - `Quick scan` dan `Lihat blocker` menampilkan konteks yang benar
   - `Deep Dive` dapat dibuka dan ditutup tanpa kehilangan posisi

3. **Accessibility**
   - semua kontrol tetap memenuhi target sentuh minimum
   - warna warning tidak menjadi satu-satunya sinyal
   - kontras tombol utama tetap memakai `brand-dark`

## Final Recommendation

Lanjutkan redesign layar `Performance` ke pola `Command Center`, dengan `summary band` ringkas di atas, daftar `goal card` sebagai unit visual utama, dan detail level bawah yang dibuka secara progresif melalui `Quick scan`, `Warning`, dan `Deep Dive`.

Inti desain ini adalah memindahkan halaman dari pola “lihat seluruh tree” menjadi pola “scan cepat, temukan fokus, lalu masuk lebih dalam saat perlu”.
