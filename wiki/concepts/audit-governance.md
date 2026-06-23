---
type: concept
tags: [audit, governance, append-only, compliance]
updated: 2026-06-22
sources: 1
---

# Audit & Governance

Dua tabel **append-only** yang menjamin akuntabilitas [[overview|EMS]]. Tidak bisa diedit/dihapus dari UI; **hard delete tidak dipakai untuk governance entities**. Ditegakkan di [[tech-stack|Postgres]] via trigger + pencabutan hak UPDATE/DELETE.

## Activity Log (§73)

Mencatat tiap peristiwa penting, antara lain: card dibuat/diedit/diaktifkan/selesai/diarsipkan; PIC/Reviewer diganti; bukti & nilai hasil dikirim; review approve/reject; deadline change (request/approved/rejected); instance dibuat/terlewat; MBR & Card Completion Rule diubah; Keterangan Card diubah; permission diubah; card gagal aktif karena validasi; user coba akses tanpa permission; Score Formula diubah/diaktifkan.

## Governance Violation (§74)

Mencatat pelanggaran aturan sistem, mis.: coba aktifkan card belum lengkap; coba lanjut turunan saat [[minimum-breakdown-rule|MBR]] belum terpenuhi; coba approve sendiri; coba ubah bukti tersubmit ([[execution-loop#Evidence Locking|evidence locking]]); ubah permission tanpa izin; lewat deadline Repeat; terlalu sering ubah deadline; arsip tanpa izin; lihat Workspace tanpa akses; ubah Score Formula tanpa izin.

**Severity:** Low, Medium, High, Critical.

## Mengapa append-only

Model [[permission-model]] mengizinkan PIC induk *melihat* banyak data, tapi integritas bukti & riwayat tidak boleh dirusak siapa pun. Audit append-only adalah penjamin terakhir: setiap upaya melanggar tercatat, bukan terhapus. Muncul di [[surfaces#Notifications|Notifications]] (governance warning) dan memengaruhi Governance Discipline di [[score-formula]].

Berkaitan dengan: [[permission-model]], [[execution-loop]], [[minimum-breakdown-rule]], [[score-formula]], [[tech-stack]].
