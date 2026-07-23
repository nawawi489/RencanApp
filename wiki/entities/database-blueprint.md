---
type: entity
tags: [database, schema, supabase, postgres]
updated: 2026-06-22
sources: 1
---

# Database Blueprint

53 core tables Postgres ([[tech-stack|Supabase]]) untuk [[overview|EMS V1.8.3]]. Diawali `auth.users` — konvensi schema Supabase. Otorisasi ditegakkan via [[permission-model|RLS]], audit via tabel append-only.

> **Status implementasi (2026-06-24):** 19 tabel live. Fase 0 — `organizations`, `role_templates`, `profiles`, `permissions`, `user_permissions`, `settings`, `login_logs`. Fase 1 — `initiatives` (datar, induk strategis menyusul Fase 4), `action_plans`, `action_plan_submissions`, `action_plan_result_values`, `evidence_files`, `reviews`, `card_completion_rules`, `card_guidance_contents`, `activity_logs`, `governance_violations`. Fase 2 — `action_plan_repeat_rules`, `action_plan_instances` (migrasi `0007`; + kolom `organizations.timezone`, `governance_violations.severity`, `action_plan_submissions.action_plan_instance_id`; job pg_cron mark-overdue & backfill). Sisa tabel menyusul per [[overview|build plan]] Fase 3–8.

## Kelompok tabel (V1.8.3, post rename bottom-up)

- **Identitas & org:** `auth.users`, `profiles`, `organizations`, `departments`, `positions`, `teams`, `team_members`.
- **Permission:** `role_templates`, `permissions`, `user_permissions`, `confidential_access_rules`.
- **Template:** `goal_templates`, `strategy_templates` *(dulu `kpi_area_templates`)*.
- **Card Performance:** `goals`, `strategies` *(dulu `kpi_areas`)*, `initiatives` *(dulu `strategies`)*, `action_plans` *(dulu `initiatives`)*.
- **Card Development:** `development_areas`, `problem_statements`.
- **Task & eksekusi:** `tasks` *(dulu `action_plans`)*, `task_repeat_rules`, `task_instances`, `task_result_values`, `task_submissions`, `evidence_files`, `reviews`.
- **Kolaborasi:** `comments`, `mentions`, `notifications`, `chat_rooms`, `chat_room_members`, `chat_messages`, `chat_message_reads`, `video_briefs`, `brief_understanding_records`.
- **Lifecycle:** `deadline_change_requests`, `deadline_change_logs`, `cancellations`, `evaluations`.
- **Audit & governance:** `activity_logs`, `governance_violations`, `period_snapshots`, `login_logs`.
- **Aturan & settings:** `minimum_breakdown_rules`, `card_completion_rules`, `card_guidance_contents`, `settings`.
- **Score:** `score_categories`, `score_formula_templates`, `score_formula_versions`, `score_formula_assignments`, `user_score_results`, `ranking_snapshots`.

## Dibuang dari V1.8.1 (jangan dibuat)

`area_goals`, tabel `kpis` di bawah area_goals, `routine_action_plan_templates`, `routine_generated_instances`, `routine_checklist_items`, `routine_contribution_links`, `routine_effectiveness_rules`, `checklist_routine`, `watchers`, dan semua planning weight field. Lihat [[scope-guardrails]].

## Relationship Rules (V1.8.3)

1. Goal memiliki banyak Strategy; Strategy wajib di bawah Goal.
2. Initiative wajib dari Strategy; Action Plan Performance wajib dari Initiative.
3. Development Area punya banyak Problem Statement; Action Plan Development wajib dari Problem Statement.
4. Task wajib dari Action Plan; Repeat menghasilkan Task Instance; Instance wajib di bawah Task.
5. Chat room ("Diskusi Rencana Aksi") otomatis dibuat untuk tiap Action Plan (per RWT-04 A — chat surface tetap di level 3 struktural, tabel `action_plans` pasca-rename).
6. PIC card induk otomatis akses seluruh turunan; Reviewer otomatis akses card yang direview.
7. Card guidance content terkait `card_type`.

## V1.8.3 rename kolom FK (bottom-up)

| Tabel | Kolom lama | Kolom baru |
|---|---|---|
| `task_instances`, `task_repeat_rules`, `task_submissions`, `reviews` | `action_plan_id` | `task_id` |
| `tasks`, `chat_rooms`, `evaluations`, `video_briefs` | `initiative_id` | `action_plan_id` |
| `action_plans` | `strategy_id` | `initiative_id` |
| `initiatives`, `strategy_target_breakdowns`, `task_result_values` | `kpi_area_id` | `strategy_id` |

Kolom `goal_id`, `problem_statement_id`, `pic_id`, `reviewer_id`, `submission_id`, `repeat_rule_id` TETAP.
## Extensions & indeks pendukung fitur

- **`extensions.pg_trgm`** (migrasi 0044) — trigram GIN untuk pencarian isi pesan chat. Install di skema `extensions` (konvensi Supabase). Dipakai RPC `public.search_chat_messages` via `extensions.gin_trgm_ops` + `extensions.similarity`.
- **`idx_chat_messages_body_trgm`** — GIN `body extensions.gin_trgm_ops` pada `public.chat_messages`; mendukung ILIKE partial murah.
- **`idx_chat_messages_org_room_created`** — composite `(organization_id, chat_room_id, created_at desc)` pada `public.chat_messages`; push-down org sebelum operator matching + cursor keyset.

## RPC pencarian

Dua RPC search hidup berdampingan **dengan sengaja**. Keduanya `SECURITY DEFINER` + `search_path=''`, artinya **RLS tabel tidak berlaku di dalam badan keduanya** — otorisasi ditulis tangan per cabang, dan tidak ada jaring pengaman kedua.

| RPC | Dipakai | Cakupan | Catatan |
|---|---|---|---|
| `public.search_cards` (0046:2113) | layar **Arsip** (`settings-archive.tsx`), queryKey `['cards_search']` | 7 tipe card, `SETOF jsonb` | **Punya bug pola LIKE tanpa escaping** (0046:2120): `%` dan `_` yang diketik user menjadi wildcard sungguhan. |
| `public.search_global` (0085) | layar **Search** (`search.tsx`), queryKey `['search_global']` | 9 dari 14 scope §38 + grouping + paging keyset per grup | Escaping benar (`ilike … escape '\'`); cabang `chat` **mendelegasikan** ke `search_chat_messages`, tidak menyalinnya. |

> [!warning] Jangan "merapikan" `search_cards`
> Bug escaping-nya **sengaja dipertahankan** di BL-10 PR-1 (NG-6): layar Arsip berbagi RPC + queryKey dengannya, dan mengubahnya di PR yang sama akan mencampur dua permukaan yang perlu diverifikasi terpisah. Perbedaan perilaku itu dikunci contract test `0085-DB-73` — memperbaiki `search_cards` akan **memerahkan** test itu sampai keputusannya dicabut secara sadar. Konsolidasi kedua permukaan adalah backlog tersendiri.

`search_global` memakai `stable` (bukan `volatile`) sebagai **penegak mekanis** nol-emisi audit: Search tidak menulis apa pun, termasuk `activity_logs`. Melonggarkannya demi kemudahan akan membuka kanal enumerasi lewat log.

Berkaitan dengan: [[tech-stack]], [[permission-model]], [[score-formula]], [[audit-governance]].
