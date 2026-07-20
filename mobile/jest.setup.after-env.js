// Anggaran waktu tunggu async — global, bukan per-file.
//
// Suite ini me-render pohon React Native sungguhan; render pertama tiap file membayar
// cold transform `react-native-css` yang bisa >5 detik di mesin yang sibuk (CI runner,
// jest paralel 16 worker). Dua batas waktu berbeda pernah menggigit karenanya:
//
//   1. `testTimeout` jest (default 5000ms) — sudah "ditambal" via `jest.setTimeout(30000)`
//      yang disalin ke 45 dari 128 file test. 83 file sisanya tidak pernah kebagian, dan
//      itulah yang gagal acak (mis. finalize-period-modal [T-M-1]).
//   2. `asyncUtilTimeout` RNTL (default 1000ms) — dipakai `findBy*` / `waitFor`. TIDAK
//      terpengaruh `jest.setTimeout` sama sekali; itu knob yang berbeda. Inilah penyebab
//      repeat-ui [5] gagal dengan "Unable to find an element with text: 2026-06-01"
//      padahal query-nya benar dan datanya ada — mock sudah resolve, hanya belum ter-flush
//      ke tree saat 1000ms lewat.
//
// Keduanya bukan race logika: tidak ada assert yang menang/kalah balapan terhadap state.
// Yang kurang cuma anggaran waktu. Dinaikkan di satu tempat supaya file test baru ikut
// aman tanpa harus ingat menyalin `jest.setTimeout`.
//
// Trade-off yang diterima: test yang benar-benar menggantung kini butuh 20s untuk gagal,
// bukan 5s. Itu harga yang murah dibanding deploy staging yang di-skip diam-diam karena
// flake (lihat wiki/log.md untuk 5e85bd6).
const { configure } = require('@testing-library/react-native');

configure({ asyncUtilTimeout: 5000 });
