---
type: entity
tags: [score, performance, formula]
updated: 2026-06-22
sources: 1
---

# Score Formula

Mesin penilaian performa user di [[surfaces#People|People]]. Kontras penting: planning card **tanpa bobot**, tetapi **Score Formula punya bobot**. Dapat dicustom dari [[surfaces#Settings|Settings]].

## Aturan inti

- **Total bobot aktif wajib 100%** — jika bukan 100%, formula tidak bisa diaktifkan.
- **Versioning wajib** — score periode tertutup tidak boleh berubah diam-diam; score historis tetap memakai formula periode tersebut.
- "KPI Area Achievement" dalam score = kategori penilaian performa, **bukan** bobot planning card.

## Default formula per level

| Level | Kategori (bobot) |
|---|---|
| **Staff** | Action Plan Completion 20%, Repeat Compliance 20%, Result Achievement 15%, On-Time Rate 15%, Review Pass Rate 10%, Development Contribution 10%, Governance Discipline 10%. |
| **Management** | KPI Area Achievement 25%, Performance Goal Contribution 15%, Strategy Completion 15%, Initiative Completion 10%, Development Contribution 10%, Team Repeat Compliance 10%, Team Result Achievement 5%, Review Speed & Quality 5%, Governance Discipline 5%. |
| **C-Level** | Goal Achievement 30%, KPI Area Achievement 30%, Development Contribution 15%, Strategic Initiative Achievement 15%, Cross-functional Execution 5%, Governance Discipline 5%. |
| **CEO** | Company Goal Achievement 35%, Profit/Growth 20%, Strategic Portfolio Health 15%, Organization Development Score 15%, Leadership Team Health 10%, Governance Discipline 5%. |

## Manual Override

Bukan default; hanya user berwenang. Wajib simpan auto-calculated score, manual adjusted score, reason, changed/approved by, timestamp, + entri [[audit-governance#Activity Log|Activity Log]]. **Tidak boleh menghapus hasil perhitungan otomatis.**

Berkaitan dengan: [[action-plan]], [[surfaces]], [[audit-governance]], [[database-blueprint]].
