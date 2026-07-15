---
type: entity
tags: [workspace, structure, core]
updated: 2026-07-11
sources: 1
---

# Workspace

[[overview|EMS]] punya dua workspace dengan hierarki [[card-model|card]] berbeda. Workspace adalah konteks tempat card hidup.

## Performance Workspace

Target bisnis & hasil. Hierarki V1.8.3:
`Goal → Strategy → Initiative → Action Plan → Task`

- **Goal** = arah besar. **Strategy** = area hasil yang harus bergerak (dulu "KPI Area"). **Initiative** = cara utama / pendekatan Q-focused (dulu "Strategy"). **Action Plan** = program eksekusi (dulu "Initiative"). **Task** = pekerjaan konkret (dulu "Action Plan").
- Strategy langsung di bawah Goal. **Tidak ada Area Goal, tidak ada KPI child table** (dibuang dari scope, lihat [[scope-guardrails]]).

## Development Workspace

Membangun mesin perusahaan. Hierarki V1.8.3:
`Development Area → Problem Statement / Development Goal → Action Plan → Task`

- Untuk: System, People, Organization, Technology, Infrastructure, Brand, Governance Development.
- Berbasis problem/perbaikan, tidak wajib mengikuti pola Strategy.
- Per **RWT-01 A**: Development chain ikut bergeser (Initiative → Action Plan, Action Plan → Task) agar nomenklatur konsisten dgn Performance.

## Rename V1.8.3 (kontext historis)

Rename bottom-up bergeser satu tingkat per [`specs/rename-workspace-terminology.md`](../../specs/rename-workspace-terminology.md). Row historis (Activity Log, Notifications, Governance Violations) menyimpan literal lama (`'kpi_area'`, `'strategy'`, `'initiative'`, `'action_plan'`) — read-side render pakai helper `public.map_legacy_entity_type(text)` (RWT-07 A).

## Visibilitas

Workflow user hanya menampilkan card yang relevan dengannya (PIC / Reviewer / turunan miliknya) — lihat [[permission-model]]. Staff tidak melihat card divisi lain by default.

Berkaitan dengan: [[card-model]], [[permission-model]], [[surfaces]].
