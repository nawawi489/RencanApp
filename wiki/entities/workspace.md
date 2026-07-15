---
type: entity
tags: [workspace, structure, core]
updated: 2026-06-22
sources: 1
---

# Workspace

[[overview|EMS]] punya dua workspace dengan hierarki [[card-model|card]] berbeda. Workspace adalah konteks tempat card hidup.

## Performance Workspace

Target bisnis & hasil. Hierarki:
`Goal → KPI Area → Strategy → Initiative → Action Plan`

- **Goal** = arah besar. **KPI Area** = area hasil yang harus bergerak. **Strategy** = cara utama. **Initiative** = program eksekusi. **Action Plan** = pekerjaan konkret.
- KPI Area langsung di bawah Goal. **Tidak ada Area Goal, tidak ada KPI child table** (dibuang dari scope, lihat [[scope-guardrails]]).

## Development Workspace

Membangun mesin perusahaan. Hierarki:
`Development Area → Problem Statement / Development Goal → Initiative → Action Plan`

- Untuk: System, People, Organization, Technology, Infrastructure, Brand, Governance Development.
- Berbasis problem/perbaikan, tidak wajib mengikuti pola KPI Area.

## Visibilitas

Workflow user hanya menampilkan card yang relevan dengannya (PIC / Reviewer / turunan miliknya) — lihat [[permission-model]]. Staff tidak melihat card divisi lain by default.

Berkaitan dengan: [[card-model]], [[permission-model]], [[surfaces]].
