---
type: entity
tags: [database, schema, supabase, postgres]
updated: 2026-06-22
sources: 1
---

# Database Blueprint

53 core tables Postgres ([[tech-stack|Supabase]]) untuk [[overview|EMS V1.8.1]]. Diawali `auth.users` — konvensi schema Supabase. Otorisasi ditegakkan via [[permission-model|RLS]], audit via tabel append-only.

> **Status implementasi (2026-06-24):** 19 tabel live. Fase 0 — `organizations`, `role_templates`, `profiles`, `permissions`, `user_permissions`, `settings`, `login_logs`. Fase 1 — `initiatives` (datar, induk strategis menyusul Fase 4), `action_plans`, `action_plan_submissions`, `action_plan_result_values`, `evidence_files`, `reviews`, `card_completion_rules`, `card_guidance_contents`, `activity_logs`, `governance_violations`. Fase 2 — `action_plan_repeat_rules`, `action_plan_instances` (migrasi `0007`; + kolom `organizations.timezone`, `governance_violations.severity`, `action_plan_submissions.action_plan_instance_id`; job pg_cron mark-overdue & backfill). Sisa tabel menyusul per [[overview|build plan]] Fase 3–8.

## Kelompok tabel

- **Identitas & org:** `auth.users`, `profiles`, `organizations`, `departments`, `positions`, `teams`, `team_members`.
- **Permission:** `role_templates`, `permissions`, `user_permissions`, `confidential_access_rules`.
- **Template:** `goal_templates`, `kpi_area_templates`.
- **Card Performance:** `goals`, `kpi_areas`, `strategies`, `initiatives`.
- **Card Development:** `development_areas`, `problem_statements`.
- **Action Plan & eksekusi:** `action_plans`, `action_plan_repeat_rules`, `action_plan_instances`, `action_plan_result_values`, `action_plan_submissions`, `evidence_files`, `reviews`.
- **Kolaborasi:** `comments`, `mentions`, `notifications`, `chat_rooms`, `chat_room_members`, `chat_messages`, `chat_message_reads`, `video_briefs`, `brief_understanding_records`.
- **Lifecycle:** `deadline_change_requests`, `deadline_change_logs`, `cancellations`, `evaluations`.
- **Audit & governance:** `activity_logs`, `governance_violations`, `period_snapshots`, `login_logs`.
- **Aturan & settings:** `minimum_breakdown_rules`, `card_completion_rules`, `card_guidance_contents`, `settings`.
- **Score:** `score_categories`, `score_formula_templates`, `score_formula_versions`, `score_formula_assignments`, `user_score_results`, `ranking_snapshots`.

## Dibuang dari V1.8.1 (jangan dibuat)

`area_goals`, tabel `kpis` di bawah area_goals, `routine_action_plan_templates`, `routine_generated_instances`, `routine_checklist_items`, `routine_contribution_links`, `routine_effectiveness_rules`, `checklist_routine`, `watchers`, dan semua planning weight field. Lihat [[scope-guardrails]].

## Relationship Rules

1. Goal memiliki banyak KPI Area; KPI Area wajib di bawah Goal.
2. Strategy wajib dari KPI Area; Initiative Performance wajib dari Strategy.
3. Development Area punya banyak Problem Statement; Initiative Development wajib dari Problem Statement.
4. Action Plan wajib dari Initiative; Repeat menghasilkan Instance; Instance wajib di bawah Action Plan.
5. Chat room otomatis dibuat untuk tiap Initiative.
6. PIC card induk otomatis akses seluruh turunan; Reviewer otomatis akses card yang direview.
7. Card guidance content terkait `card_type`.

## Extensions & indeks pendukung fitur

- **`extensions.pg_trgm`** (migrasi 0044) — trigram GIN untuk pencarian isi pesan chat. Install di skema `extensions` (konvensi Supabase). Dipakai RPC `public.search_chat_messages` via `extensions.gin_trgm_ops` + `extensions.similarity`.
- **`idx_chat_messages_body_trgm`** — GIN `body extensions.gin_trgm_ops` pada `public.chat_messages`; mendukung ILIKE partial murah.
- **`idx_chat_messages_org_room_created`** — composite `(organization_id, chat_room_id, created_at desc)` pada `public.chat_messages`; push-down org sebelum operator matching + cursor keyset.

Berkaitan dengan: [[tech-stack]], [[permission-model]], [[score-formula]], [[audit-governance]].
