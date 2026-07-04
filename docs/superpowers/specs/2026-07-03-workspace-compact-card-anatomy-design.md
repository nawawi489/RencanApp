# Workspace Compact Card Anatomy Design

Date: 2026-07-03
Project: `d:\Projects\RencanApp`
Status: Approved for design, pending spec review
Primary references: `mobile/src/screens/workspace-screen.tsx`, `mobile/src/components/ui.tsx`, `mobile/src/components/workspace-kind-pill.tsx`

## Goal

Mengubah nested card Workspace pada mobile menjadi versi compact seperti referensi pengguna, sehingga setiap level tetap bertingkat tetapi jauh lebih hemat ruang horizontal dan lebih mudah dipindai.

Fokus desain ini bukan sekadar mengurangi indent atau mengecilkan orb. Fokus utamanya adalah mengganti anatomi card tree menjadi pola compact yang konsisten untuk `Performance` dan `Development`.

Hasil yang dituju:

- Nested tree tetap satu layar
- Card level dalam tetap terbaca tanpa terdorong terlalu jauh ke kanan
- Isi card diringkas agar informasi utama lebih cepat dipahami
- Action row diseragamkan ke pola ringkas
- Progress orb dan affordance expand/collapse pindah ke anatomi yang lebih hemat ruang

## Status dan Supersession

Dokumen ini menggantikan arah desain pada [2026-07-03-workspace-tree-mobile-optimization-design.md](file:///d:/Projects/RencanApp/docs/superpowers/specs/2026-07-03-workspace-tree-mobile-optimization-design.md) untuk pekerjaan UI tree Workspace.

Dokumen lama tetap berguna sebagai catatan eksplorasi awal, tetapi sumber kebenaran desain terbaru untuk Workspace tree compact adalah dokumen ini.

## Problem Statement

Tree Workspace saat ini punya dua masalah besar di mobile:

- nested card terlalu “mundur” ke kanan saat level bertambah
- anatomi card terlalu tinggi dan terlalu lebar untuk dipakai berulang sampai level terdalam

Masalah ini bukan hanya soal indent. Penyebabnya adalah kombinasi beberapa hal:

- header card terlalu menyebar
- progress orb memakan ruang yang mahal
- action row memakai affordance teks yang panjang
- isi card tidak dipadatkan berdasarkan prioritas visual
- child card tetap memakai anatomi hampir sama dengan parent, padahal konteks layar makin sempit

Akibatnya, tree terasa berat, ritme visual tidak efisien, dan level dalam kehilangan ruang baca.

## Non-Goals

Desain ini tidak mencoba:

- mengganti tree menjadi drill-down navigation
- memindahkan child ke screen baru
- mengubah data model, hook, permission, MBR, atau past-period rule
- mengubah route detail yang sudah ada
- mendesain ulang hub card `Performance` dan `Development`
- membuat visual card berbeda antara `Performance` dan `Development` selain warna/label kategori

## Keputusan User yang Sudah Terkunci

Keputusan berikut sudah eksplisit disetujui:

- Berlaku untuk `Performance` dan `Development`
- Yang diubah bukan hanya nesting/layout, tetapi juga isi card dan action row
- Gaya target mengikuti contoh compact card anatomy yang dikirim user
- Tree tetap inline di satu screen

## Pendekatan yang Dipilih

Tiga pendekatan sempat dipertimbangkan:

1. Compact visual only
2. Compact card anatomy
3. Hybrid compact by depth

Pendekatan terpilih: `Compact card anatomy`.

Alasan:

- paling dekat dengan referensi yang diminta user
- paling efektif menghemat ruang tanpa mengubah model navigasi
- memberi ritme visual yang konsisten dari level atas sampai level bawah
- masih bisa dikerjakan di struktur tree sekarang tanpa rewrite besar

## Prinsip Visual

Compact di sini tidak berarti “semua dikecilkan”. Compact berarti setiap bagian card diberi prioritas visual yang ketat:

- identitas card harus cepat terbaca
- judul card menjadi fokus utama
- meta ringkas memberi konteks secukupnya
- aksi utama tetap terlihat tanpa memenuhi satu baris
- child tetap terasa bagian dari parent, tetapi tidak memakan terlalu banyak lebar

Prinsip dasarnya:

- hierarchy dibaca dari ritme tumpukan, border kiri kategori, dan connector tipis
- bukan dari margin kiri besar

## Anatomi Card Baru

Setiap card tree memakai anatomi visual baru berikut:

1. **Baris identitas**
   - `kind pill` kategori di kiri
   - `period pill` ringkas di sebelahnya
   - area ini harus hemat tinggi dan tidak mendominasi card

2. **Area metrik dan affordance kanan atas**
   - progress orb compact di kanan atas
   - chevron expand/collapse berada dekat orb, menjadi affordance utama subtree
   - chevron tidak lagi bergantung pada teks panjang seperti `Lihat Strategy` atau `Tutup`

3. **Judul utama**
   - judul menjadi elemen paling dominan dalam card
   - targetnya tetap nyaman dibaca sampai 2 baris

4. **Meta ringkas**
   - isi card direduksi menjadi 1-2 baris konteks singkat
   - formatnya ringkas seperti contoh: status periode, target vs aktual, risiko, gap, atau kebutuhan breakdown
   - bukan blok detail panjang

5. **Action row**
   - selalu memakai pola tiga aksi utama:
     - `Detail`
     - `...`
     - `+ Child`
   - urutannya konsisten
   - styling compact namun tetap lolos target sentuh

## Layout Tree

Tree tetap bersarang, tetapi child card tidak lagi “masuk jauh” ke kanan.

Aturan layout:

- indent tiap level kecil dan stabil
- child card hampir selebar parent
- connector pendek dan tipis
- border kiri kategori tetap menjadi penanda jenis card
- parent dan child terasa seperti kartu yang bertumpuk, bukan kartu yang berpindah kolom

Tujuan utamanya:

- level 4-5 masih punya ruang cukup untuk judul dan tombol
- struktur tetap terlihat, tetapi tidak mengorbankan lebar baca

## Header Card

Header card harus mengikuti ritme baru:

- `kind pill` tetap dipakai
- `period pill` menjadi pill kecil terpisah, tidak bercampur ke meta panjang
- badge status lama tidak menjadi elemen dominan di baris atas
- jika status atau kondisi periode perlu tetap terlihat, tampilkan dalam bentuk meta ringkas yang lebih hemat ruang

Implikasi penting:

- header tidak lagi diisi terlalu banyak elemen yang berebut horizontal space
- identitas card menjadi lebih cepat dipindai

## Progress Orb dan Chevron

Pada desain compact, orb tidak lagi diperlakukan sebagai blok terpisah yang berat.

Aturan:

- orb menjadi compact by default untuk tree cards
- persentase tetap dipertahankan
- label `Capaian` / `Progress` tetap ada, tetapi ritmenya lebih rapat
- chevron berada di cluster kanan atas bersama orb
- expand/collapse tidak lagi memakai teks panjang sebagai affordance utama

Efek yang diinginkan:

- area kanan lebih padat dan fungsional
- title mendapatkan lebih banyak ruang horizontal

## Isi Card per Jenis

Meski anatomi card diseragamkan, isi meta tetap mengikuti domain tiap jenis card.

Contoh arah konten:

- `Goal`
  - periode aktif
  - target ringkas
  - aktual ringkas
  - risiko atau state penting bila ada

- `KPI Area`
  - aktual vs target
  - gap
  - kebutuhan child berikutnya, misalnya `Butuh 1 Strategy`

- `Strategy`
  - kontribusi ringkas
  - risiko singkat
  - kebutuhan turunan berikutnya bila relevan

- `Initiative`
  - progress ringkas
  - konteks eksekusi singkat

- `Action Plan`
  - status/progress ringkas
  - informasi paling penting untuk eksekusi

- `Development Area` dan `Problem Statement`
  - memakai pola ringkas yang setara, disesuaikan dengan istilah domain Development

Aturan utamanya:

- meta harus ringkas
- detail lengkap tetap hidup di screen detail, bukan di tree card

## Action Row

Action row harus mengikuti pola referensi user secara eksplisit.

Aturan:

- tombol pertama: `Detail`
- tombol kedua: `...`
- tombol ketiga: `+ Child`
- teks child menyesuaikan konteks:
  - `+ KPI Area`
  - `+ Strategy`
  - `+ Initiative`
  - `+ Plan`
  - `+ Problem Statement`

Perubahan penting dari desain lama:

- expand/collapse tidak lagi menjadi kontrol teks utama di action row
- action row didedikasikan untuk aksi nyata, bukan toggle yang memakan banyak ruang
- toggle subtree dipindah ke chevron kanan atas

## Expand/Collapse

Perilaku expand/collapse tetap dipertahankan, tetapi affordance-nya berubah.

Aturan:

- tap chevron membuka/menutup child subtree
- status expanded harus tetap mudah dibaca secara visual
- aksesibilitas harus tetap menyertakan label dan state expanded
- perilaku lazy fetch existing tetap dipakai

Tree tidak berubah menjadi accordion terpisah; hanya affordance visual dan letak kontrolnya yang berubah.

## Konsistensi Performance dan Development

Compact anatomy ini berlaku untuk kedua pane:

- `Performance`
  - Goal
  - KPI Area
  - Strategy
  - Initiative
  - Action Plan

- `Development`
  - Development Area
  - Problem Statement
  - Initiative
  - Action Plan

Perbedaan antar-pane hanya:

- warna kategori
- label jenis card
- isi meta berdasarkan domain
- label tombol add child

Ritme visual dan anatominya harus sama.

## Yang Tidak Berubah

Hal-hal berikut tidak berubah dalam desain ini:

- data fetching model
- route detail dan route create
- permission gating
- MBR guard
- past-period lock
- action semantics `Detail`, `...`, dan create child
- tree tetap satu layar

Dengan kata lain, ini adalah redesign anatomi UI tree card, bukan redesign alur produk.

## Dampak ke File

File utama yang kemungkinan besar akan berubah:

- `mobile/src/screens/workspace-screen.tsx`
- `mobile/src/components/ui.tsx`
- `mobile/src/components/workspace-kind-pill.tsx`
- `mobile/src/lib/workspace-copy.ts`

Kemungkinan test yang perlu ikut berubah:

- `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx`
- `mobile/src/components/__tests__/tree-progress-orb.test.tsx`
- test baru untuk compact chevron/action anatomy bila helper diekstrak

## Strategi Implementasi

Urutan implementasi yang disarankan:

1. definisikan anatomi compact card root + child
2. pindahkan affordance expand/collapse ke cluster kanan atas
3. ubah action row ke pola `Detail` / `...` / `+ Child`
4. ringkas isi meta per card type
5. samakan ritme visual `Performance` dan `Development`
6. baru setelah itu rapikan optimasi render/query yang diperlukan

Urutan ini penting karena bentuk card baru adalah fondasi. Optimasi kecil seperti ukuran orb atau gap tombol sebaiknya mengikuti anatomi baru, bukan sebaliknya.

## Risiko

- Ada spec drift yang sengaja diambil terhadap lock visual Workspace sebelumnya
- Memindahkan expand/collapse ke chevron berisiko jika a11y label tidak dijaga
- Meta yang terlalu ringkas bisa kehilangan konteks bila tidak dipilih dengan disiplin
- Jika root dan child tidak memakai anatomi yang benar-benar konsisten, tree akan terasa campur aduk

## Testing Strategy

Testing perlu memverifikasi dua hal:

1. **Visual structure**
   - chevron berada di cluster kanan atas
   - action row mengikuti pola tiga tombol
   - card level dalam tetap muat di mobile width

2. **Behavioral parity**
   - expand/collapse tetap bekerja
   - add button tetap menghormati permission, MBR, dan past-period state
   - detail navigation tetap sama
   - lazy fetch tidak rusak

Manual QA wajib mencakup:

- Goal → KPI Area → Strategy → Initiative → Action Plan pada lebar mobile
- Development Area → Problem Statement → Initiative → Action Plan pada lebar mobile
- state expanded/collapsed
- disabled state pada tombol add

## Final Recommendation

Lanjutkan dengan redesign `Workspace tree` ke pola `compact card anatomy` untuk `Performance` dan `Development`, dengan nested card yang tetap inline tetapi hampir selebar parent, header yang diringkas, orb + chevron di kanan atas, meta 1-2 baris, dan action row yang konsisten ke pola `Detail`, `...`, dan `+ Child`.
