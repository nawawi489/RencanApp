---
type: concept
tags: [score, ranking, fase-7, periode, ui, ng-2]
updated: 2026-07-20
sources: 3
---

# Buka Periode — jalan masuk UI untuk `open_period_snapshot`

Menutup NG-2 dari [[score-ranking-finalization-bridge]]. Jembatan finalisasi
menyelesaikan setengah siklus (hitung skor → kunci peringkat); potongan ini
menyelesaikan setengah lainnya (buat periode yang akan dinilai).

## Masalah

`open_period_snapshot(text, date, date)` hidup di DB sejak migrasi `0013` tetapi
tidak punya satu pun pemanggil UI. Konsekuensinya: organisasi yang tidak punya
periode hasil seed SQL atau instance legacy **tidak bisa memasuki fitur
Score/Ranking sama sekali**. Empty-state di `settings-score-formula.tsx` bahkan
sengaja ditulis untuk tidak menjanjikan aksi yang tidak ada.

## Keputusan

Tombol "Buka Periode" di empty-state `settings-score-formula.tsx`, membuka
`OpenPeriodModal` dua langkah. Nol migrasi, nol perubahan signature RPC — yang
hilang murni kabel klien.

### Mengapa dua langkah

Membuka periode praktis ireversibel, dari dua arah sekaligus:

- Trigger `BEFORE DELETE` menolak DELETE pada `period_snapshots` (`0013` K5),
  sehingga baris yang salah tidak bisa dibuang.
- Partial unique index `ux_period_snapshots_one_active_per_org` mengunci organisasi
  ke satu periode aktif, sehingga salah tanggal **memblokir** pembukaan periode
  yang benar sampai yang salah difinalisasi.

Salah ketik tanggal karena itu bukan gangguan kecil melainkan kebuntuan yang hanya
bisa diselesaikan dengan memfinalisasi periode palsu. Langkah 2 mengulang nama dan
rentang secara verbatim sebelum tombol aksi. Ini mencerminkan pola yang sudah dipakai
[[score-ranking-finalization-bridge]] untuk aksi ireversibel di sisi tutup.

### Validasi klien menutup lubang server

RPC tidak memvalidasi apa pun di luar izin dan guard satu-aktif:

| Aturan | Ditegakkan di | Catatan |
|---|---|---|
| Nama tidak kosong / bukan spasi | **Klien saja** | `period_name text not null` menerima `''` dan `'   '` |
| `period_end >= period_start` | CHECK `period_snapshots_period_order` | Periode 1 hari SAH — sengaja diizinkan UI |
| Satu periode aktif per org | Guard RPC + partial unique index | Race lolos guard muncul sebagai PG `23505` |
| Izin `manage_score_formula` | RPC + gate layar | Defense-in-depth |

Pesan constraint mentah tidak pernah sampai ke pengguna: `23505` dan `23514`
dipetakan ke copy Indonesia di modal.

## Batas yang TIDAK berubah

Immutability periode yang sudah ditutup tetap utuh — lihat
[[score-period-immutability]]. Tidak ada `reopen_period_snapshot`, dan menutup
periode tetap satu arah. Yang bertambah hanya jalan masuk ke periode **baru**,
yang justru membuat "koreksi di periode berikutnya" bisa dieksekusi pengguna
sendiri alih-alih menunggu seed SQL.

## Permukaan

| Lapis | Berkas |
|---|---|
| Data | `mobile/src/lib/people-score.ts` — `openPeriodSnapshot` (sudah ada sejak WS-5, tak berubah) |
| Hook | `mobile/src/hooks/use-people-score.ts` — `useOpenPeriod`, invalidate TEPAT `['active_period']` |
| UI | `mobile/src/components/open-period-modal.tsx` |
| Wiring | `mobile/src/app/(app)/settings-score-formula.tsx` — empty-state |

Tombol hanya muncul saat periode aktif **tidak ada** dan status periode diketahui.
Saat `isError`, tombol ditahan: menawarkan aksi ireversibel di atas status yang tak
diketahui berisiko membuka periode kedua yang lalu ditolak server.
