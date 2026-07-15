---
type: concept
tags: [execution, evidence, review, audit]
updated: 2026-06-22
sources: 1
---

# Execution Loop — Bukti, Nilai Hasil, Review

Loop yang mengubah [[action-plan|Action Plan]] dari "ditugaskan" menjadi "selesai & terbukti". Inti filosofi [[overview|EMS]]: eksekusi harus punya bukti, hasil, dan review — bukan sekadar klaim selesai.

## Bukti (§30)

Membuktikan pekerjaan dilakukan. Jenis: File, Foto, Screenshot, PDF, Link Google Drive, Link dokumen, Catatan teks, Rekap laporan. Jika diwajibkan, Action Plan tidak bisa submit tanpa bukti.

## Nilai Hasil (§31)

Melaporkan output terukur. Tipe: Number, Currency, Percentage, Boolean, Text, Option, Link. Contoh: Daily Finance Closing → "Selisih kas = Rp0".

> **Bukti vs Nilai Hasil:** Bukti menjawab *apakah pekerjaan dilakukan?* Nilai Hasil menjawab *apa hasilnya?* (sejalan dengan beda Progress vs Capaian di [[action-plan]]).

## Review (§33)

Validasi hasil oleh **Reviewer** (Action Plan wajib punya Reviewer). Approve/reject. Tanpa approval, Action Plan tidak bisa Selesai. **PIC tidak boleh approve pekerjaannya sendiri** ([[permission-model]]). Reject wajib alasan → status **Revisi Diperlukan** → PIC submit ulang versi baru.

## Submission Versioning (§34)

Tiap submit = submission version baru; submission lama tidak hilang. Menyimpan: submitted by/at, note, Bukti, Nilai Hasil, version number, review status/reason, reviewed by/at.

## Evidence Locking (§35)

Bukti yang sudah disubmit **terkunci** — PIC tidak bisa hapus/ganti diam-diam. Revisi = bukti versi baru. Reviewer bisa lihat semua versi. Mekanisme ini menjamin [[audit-governance|audit trail]] tidak rusak; ditegakkan via RLS + Storage ([[tech-stack]]).

Berkaitan dengan: [[action-plan]], [[permission-model]], [[audit-governance]], [[tech-stack]].
