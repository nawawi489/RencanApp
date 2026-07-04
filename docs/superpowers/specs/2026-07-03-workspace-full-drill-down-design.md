# Workspace Full Drill-Down Design

Date: 2026-07-03
Project: `d:\Projects\RencanApp`
Status: Approved for design, pending spec review
Primary area: `mobile/src/app/(app)/(tabs)/workspace`

## Goal

Mengganti pola nested tree inline pada area `Workspace` menjadi pola full drill-down untuk jalur `Performance` dan `Development`.

Target perubahan:

- Menghilangkan overflow horizontal dan kepadatan visual pada nested card mobile
- Menurunkan biaya render dengan hanya me-mount level aktif
- Menyederhanakan pengembangan level lanjutan dengan fondasi screen generik
- Mempertahankan navigasi yang jelas, deep-linkable, dan mudah dites

## Problem Statement

Implementasi saat ini memusatkan hampir seluruh UI `Workspace` di `workspace-screen.tsx`, dengan nested card bertingkat yang memakai expand/collapse lokal.

Masalah utama:

- Tree bertingkat mendorong card level dalam terlalu ke kanan pada layar mobile
- Area teks makin sempit pada level 4-5, sehingga judul cepat terpotong
- `ScrollView` + `.map()` bertingkat membuat seluruh subtree tetap mounted
- Query child dan progress dapat bertambah cepat ketika banyak cabang dibuka
- Kompleksitas pengembangan tinggi karena satu screen memegang banyak level, perilaku, dan variasi domain

Masalah ini bukan hanya isu visual, tetapi juga isu performa render, maintainability, dan kecepatan pengembangan.

## Non-Goals

Desain ini tidak bertujuan untuk:

- Mengubah area di luar `Workspace` dan turunannya
- Mendesain ulang model data domain `Goal`, `KPI Area`, `Strategy`, `Initiative`, `Action Plan`, `Development Area`, atau `Problem Statement`
- Memindahkan aksi item-spesifik menjadi CTA utama tunggal tanpa menu item
- Mengubah logika bisnis detail screen yang sudah ada, kecuali jika dibutuhkan untuk kontrak route baru

## User Decisions Already Locked

Keputusan berikut sudah disetujui selama brainstorming:

- Pola navigasi yang dipilih adalah full drill-down, bukan tree inline atau hybrid tree
- Cakupan berlaku untuk `Performance` dan `Development`
- Pola aksi adalah hybrid: CTA utama di header/surface atas level aktif, aksi item-spesifik tetap lewat menu `...`
- Fondasi yang dipilih adalah shell generik per level dengan config, bukan mempertahankan satu screen besar dengan state navigasi internal

## Approaches Considered

Tiga pendekatan sempat dibandingkan:

1. Screen terpisah per level dengan implementasi spesifik
2. Shell generik per level berbasis config
3. Satu screen besar dengan state mesin navigasi internal

Recommended: shell generik per level berbasis config.

Alasan:

- Menyelesaikan masalah UI, performa, dan development sekaligus
- Menghindari duplikasi besar antara jalur `Performance` dan `Development`
- Mempermudah penambahan level, perubahan copy, dan pengujian per route
- Tetap cocok dengan nested stack `workspace` yang sudah ada di Expo Router

## Scope

Jalur `Performance` yang terdampak:

- `Goal list`
- `KPI Area list per Goal`
- `Strategy list per KPI Area`
- `Initiative list per Strategy`
- `Action Plan list per Initiative`

Jalur `Development` yang terdampak:

- `Development Area list`
- `Problem Statement list per Development Area`
- `Initiative list per Problem Statement`
- `Action Plan list per Initiative`

Hub `Workspace` tetap menjadi pintu masuk utama untuk memilih `Performance` atau `Development`.

## Current-State Constraints

Constraint kode dan produk yang harus dihormati:

- `Workspace` sudah memakai nested stack Expo Router dengan `initialRouteName: 'index'`
- `AppHeader` saat ini sudah memegang affordance back untuk `performance` dan `development`
- Data fetch child saat ini lazy dan dipicu oleh state `expanded`
- Area `Workspace` punya token visual dan aturan aksesibilitas khusus yang mengikat di `DESIGN.md`

Selain itu, ada drift sadar terhadap spec tree inline yang sekarang berlaku di implementasi `Workspace`. Desain ini secara eksplisit mengganti pola tree inline tersebut pada area `Workspace` saja.

## Information Architecture

Arsitektur navigasi baru:

- `Workspace hub`
- `Performance` entry screen
- `Goal detail-list screen`
- `KPI Area detail-list screen`
- `Strategy detail-list screen`
- `Initiative detail-list screen`
- `Development` entry screen
- `Development Area detail-list screen`
- `Problem Statement detail-list screen`
- `Initiative detail-list screen`

Prinsipnya: satu screen hanya menampilkan satu koleksi item aktif pada satu level.

Setiap tap card mendorong user ke level berikutnya. Back behavior mengikuti stack normal, dengan fallback aman ke route induk `Workspace` bila diperlukan.

## Route Strategy

Routes dibuat eksplisit per level, bukan state internal satu screen.

Contoh bentuk route:

- `/workspace/performance`
- `/workspace/performance/goals/[goalId]/kpi-areas`
- `/workspace/performance/kpi-areas/[kpiAreaId]/strategies`
- `/workspace/performance/strategies/[strategyId]/initiatives`
- `/workspace/performance/initiatives/[initiativeId]/action-plans`
- `/workspace/development`
- `/workspace/development/areas/[developmentAreaId]/problem-statements`
- `/workspace/development/problem-statements/[problemStatementId]/initiatives`
- `/workspace/development/initiatives/[initiativeId]/action-plans`

Nama route final boleh sedikit disederhanakan saat implementasi, tetapi bentuknya harus tetap:

- eksplisit
- deep-linkable
- memiliki parent context yang jelas
- tidak membawa object besar di param

## Screen Model

Setiap level memakai fondasi `WorkspaceLevelScreen`.

Isi screen standar:

1. `AppHeader`
2. surface periode aktif bila relevan
3. `ParentContextCard` untuk menampilkan konteks induk
4. section header + CTA utama level aktif
5. `FlatList` berisi item level aktif
6. state lokal: loading, empty, error

Hal yang dihapus dari model lama:

- connector tree visual
- indent bertingkat
- expand/collapse antar level
- subtree nested di dalam card parent

## Reusable Components

Komponen baru yang direkomendasikan:

- `WorkspaceLevelScreen`
- `WorkspaceEntityCard`
- `ParentContextCard`
- `WorkspaceLevelHeader`
- `WorkspaceLevelEmptyState`

Tanggung jawab komponen:

- `WorkspaceLevelScreen` mengatur chrome, context, list container, dan state screen
- `WorkspaceEntityCard` menampilkan satu item level aktif dan aksi row minimal
- `ParentContextCard` menjaga orientasi pengguna terhadap parent aktif
- `WorkspaceLevelHeader` memegang judul level, jumlah item, dan CTA utama
- `WorkspaceLevelEmptyState` memberi copy kosong yang spesifik per level

Komponen visual tidak boleh query data langsung. Pengambilan data terjadi di screen level atau hook level.

## Config-Driven Levels

Perilaku per level dikendalikan config, bukan bercabang liar di JSX besar.

Setiap definisi level minimal memuat:

- `kind`
- `title`
- `ctaLabel`
- `query hook`
- `formatter meta`
- `parent entity type`
- `next route builder`
- `empty-state copy`
- `detail route builder` bila item bisa dibuka ke detail domain

Pendekatan ini memungkinkan `Performance` dan `Development` berbagi shell yang sama walau tipe item berbeda.

## Card UX

`WorkspaceEntityCard` mengikuti prinsip ringkas dan mobile-first:

- `kind pill`
- status badge
- judul maksimal 2 baris
- meta singkat yang benar-benar membantu
- progress orb kecil atau ringkas
- menu `...`
- area tekan jelas untuk masuk ke level berikutnya atau ke detail yang relevan

CTA utama untuk menambah child tidak ditaruh di setiap card. CTA tersebut berada di header level aktif.

Aksi yang tetap berada pada item:

- buka menu `...`
- buka detail domain item bila dibutuhkan

## Parent Context UX

Setiap screen child menampilkan konteks parent aktif di atas list.

Isi minimal `ParentContextCard`:

- kind parent
- judul parent
- status parent
- ringkasan singkat seperti jumlah child atau progress parent bila tersedia

Tujuan utamanya adalah orientasi, bukan reproduksi card parent penuh. Card ini harus ringkas, stabil, dan tidak mengundang nested layout kembali.

## Data Strategy

Data fetch berubah dari lazy subtree menjadi fetch per level aktif.

Prinsip data:

- Satu screen hanya fetch koleksi item aktif dan data parent yang dibutuhkan untuk konteks
- Query child tidak lagi dipicu oleh `expanded`
- Progress item diambil pada level aktif saja, bukan untuk seluruh subtree yang terbuka
- Param route hanya membawa identifier dan, bila perlu, label singkat yang aman untuk UX skeleton

Hook yang ada di `use-workspace.ts` dapat dipakai ulang bila kontraknya cocok, tetapi trigger `enabled` berbasis expand/collapse tidak lagi menjadi fondasi utama untuk navigasi layar.

## Performance Strategy

Perubahan performa yang diinginkan:

- Ganti `ScrollView` bertingkat ke `FlatList` per screen
- Hilangkan subtree mounted yang tidak sedang dilihat user
- Kurangi render ulang besar akibat state `expanded` pada banyak row
- Kurangi ledakan query ketika banyak cabang dibuka bersamaan

Tambahan guard implementasi:

- gunakan `keyExtractor` stabil
- pertimbangkan memo pada `WorkspaceEntityCard` bila profiling menunjukkan manfaat nyata
- hindari membuat formatter dan callback baru di setiap item tanpa kebutuhan

## Header And Back Behavior

`AppHeader` tetap menjadi fondasi back behavior `Workspace`.

Namun, logika route `Workspace` perlu digeneralisasi:

- bukan hanya mengenali `performance` dan `development`
- tetapi seluruh sub-route `workspace/*`

Aturan UX:

- root tab `Workspace` tidak menampilkan back button
- seluruh sub-route level drill-down menampilkan back affordance yang konsisten
- fallback defensif ke route induk tetap tersedia saat stack tidak bisa kembali

## Error Handling

State error harus lokal per level.

Implikasinya:

- gagal load `Strategy list` tidak boleh merusak seluruh pengalaman `Performance`
- `ParentContextCard` tetap tampil selama data parent tersedia
- user mendapat retry yang jelas pada level aktif

Jika parent tidak valid atau tidak ditemukan, screen harus menampilkan error state yang menjelaskan konteks rusak dan menyediakan jalan kembali.

## Accessibility

Desain baru harus tetap mematuhi `DESIGN.md §4`.

Aturan yang paling relevan:

- touch target minimum 44px
- warna bukan satu-satunya sinyal status
- CTA solid memakai `brand-dark`
- layout aman saat teks membesar
- label screen reader jelas untuk back, CTA, menu aksi, dan progres

Penghilangan indent dalam justru membantu dynamic type karena lebar teks yang tersedia menjadi lebih besar.

## Migration Plan

Migrasi dilakukan bertahap, bukan big-bang delete.

Urutan yang direkomendasikan:

1. Tambah fondasi route level baru
2. Tambah shell dan komponen generik
3. Migrasikan jalur `Performance`
4. Migrasikan jalur `Development`
5. Revisi `AppHeader` untuk semua sub-route `Workspace`
6. Hapus tree inline lama dan komponen bantu yang tidak terpakai
7. Rapikan test dan copy yang masih merujuk expand/collapse

Pendekatan ini menurunkan risiko karena route dan komponen baru bisa diverifikasi sebelum implementasi lama dibersihkan.

## Testing Strategy

Fokus test bergeser dari expand/collapse ke navigasi drill-down.

Coverage minimum yang direkomendasikan:

- route entry `Performance` dan `Development`
- tap item mendorong ke route child yang benar
- back button bekerja di seluruh sub-route `Workspace`
- `ParentContextCard` tampil sesuai parent aktif
- CTA utama level aktif tampil dengan label yang benar
- menu `...` item tetap tersedia
- empty state, loading state, dan error state per level
- deep-link ke sub-route level tetap memiliki affordance kembali yang benar

Test lama yang sangat terikat pada tree inline perlu diperbarui atau dihapus bila tidak relevan lagi.

## File Impact

Area yang kemungkinan besar terdampak:

- `mobile/src/screens/workspace-screen.tsx`
- `mobile/src/components/app-header.tsx`
- `mobile/src/app/(app)/(tabs)/workspace/_layout.tsx`
- route baru di bawah `mobile/src/app/(app)/(tabs)/workspace/`
- test `Workspace` di `mobile/src/app/(app)/(tabs)/__tests__/`
- hook `mobile/src/hooks/use-workspace.ts` bila perlu kontrak query yang lebih cocok untuk screen-level fetch

File final implementasi boleh berubah, tetapi batas tanggung jawab harus bergerak menjauh dari satu screen besar yang memegang semua level.

## Risks

Risiko utama:

- kontrak route param menjadi tidak konsisten antar level
- duplicate logic bila shell generik tidak benar-benar dipakai bersama
- regressi back behavior pada sub-route `Workspace`
- sisa copy atau test lama masih mengasumsikan tree inline
- drift terhadap spec tree inline yang sebelumnya dikunci untuk `Workspace`

Mitigasi:

- pakai builder route terpusat
- definisikan config level di satu tempat
- uji sub-route `Workspace` secara eksplisit
- migrasikan bertahap dan hapus kode lama hanya setelah coverage dasar aman
- dokumentasikan dengan jelas bahwa pola UX `Workspace` berubah dari tree inline ke drill-down

## Explicit Spec Drift

Desain ini secara sadar mengganti keputusan UX `Workspace` sebelumnya:

- dari nested tree inline menjadi daftar per level
- dari expand/collapse menjadi navigasi push antar-screen
- dari aksi tambah child di card menjadi CTA utama di header level

Drift ini disengaja karena tujuan perubahan adalah menyelesaikan masalah UI/UX, screen performance, dan kemudahan development yang tidak lagi cocok ditangani oleh tree inline.

## Success Criteria

Perubahan dianggap berhasil bila:

- tidak ada lagi overflow horizontal akibat nested card di `Workspace`
- setiap screen `Workspace` hanya merender satu level daftar aktif
- alur `Performance` dan `Development` bisa dinavigasi penuh via push/back
- affordance back tetap jelas pada seluruh sub-route `Workspace`
- development level baru menjadi lebih sederhana karena berbasis shell + config
- test `Workspace` lebih fokus pada navigasi dan state screen, bukan expand/collapse subtree

## Open Questions

Tidak ada keputusan desain besar yang masih terbuka.

Detail nama route, nama file, dan bentuk helper kecil boleh diputuskan saat implementation plan, selama tidak melanggar prinsip utama di dokumen ini.
