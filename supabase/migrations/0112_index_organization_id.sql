-- 0112 — Index organization_id (S3-5). Sprint 3.
--
-- 24 tabel punya `organization_id` sebagai predikat RLS tapi tak terindeks di
-- kolom itu. Karena predikat RLS dievaluasi per baris, tiap pembacaan
-- org-scoped berbiaya sebanding data SELURUH tenant → seq-scan meledak begitu
-- data satu org besar. Indeks B-tree biasa cukup: kardinalitas rendah tapi
-- tetap selektif kalau ada >2 org (dan CEO fixture punya 3 org).
--
-- CATATAN ROLLOUT: file ini pakai `create index` biasa (bukan `concurrently`).
-- Alasan: CI runner (fresh DB, tabel kosong) + MCP apply_migration
-- transaction-wrapped tidak kompatibel dengan `create index concurrently`.
-- Untuk PRODUCTION apply (Sprint 5 runbook S5-3), gunakan versi manual:
--   `create index concurrently if not exists ix_{table}_organization_id
--    on public.{table} (organization_id);`
-- di luar transaction — cegah AccessExclusiveLock pada tabel produksi.
-- Sebagai catatan aman: staging pada apply time tabelnya kecil (<1000 baris),
-- jadi lock < 100ms — tidak masalah.
--
-- Naming convention: `ix_{table}_organization_id` konsisten dgn 0096 dan
-- indeks lain di skema.

create index if not exists ix_brief_understanding_records_organization_id
  on public.brief_understanding_records (organization_id);
create index if not exists ix_cancellations_organization_id
  on public.cancellations (organization_id);
create index if not exists ix_chat_message_reactions_organization_id
  on public.chat_message_reactions (organization_id);
create index if not exists ix_chat_rooms_organization_id
  on public.chat_rooms (organization_id);
create index if not exists ix_comments_organization_id
  on public.comments (organization_id);
create index if not exists ix_confidential_access_rules_organization_id
  on public.confidential_access_rules (organization_id);
create index if not exists ix_deadline_change_logs_organization_id
  on public.deadline_change_logs (organization_id);
create index if not exists ix_deadline_change_requests_organization_id
  on public.deadline_change_requests (organization_id);
create index if not exists ix_development_areas_organization_id
  on public.development_areas (organization_id);
create index if not exists ix_evaluations_organization_id
  on public.evaluations (organization_id);
create index if not exists ix_governance_violations_organization_id
  on public.governance_violations (organization_id);
create index if not exists ix_notifications_organization_id
  on public.notifications (organization_id);
create index if not exists ix_profiles_organization_id
  on public.profiles (organization_id);
create index if not exists ix_push_tokens_organization_id
  on public.push_tokens (organization_id);
create index if not exists ix_ranking_snapshots_organization_id
  on public.ranking_snapshots (organization_id);
create index if not exists ix_role_templates_organization_id
  on public.role_templates (organization_id);
create index if not exists ix_score_formula_templates_organization_id
  on public.score_formula_templates (organization_id);
create index if not exists ix_strategies_organization_id
  on public.strategies (organization_id);
create index if not exists ix_strategy_target_breakdowns_organization_id
  on public.strategy_target_breakdowns (organization_id);
create index if not exists ix_task_instances_organization_id
  on public.task_instances (organization_id);
create index if not exists ix_task_repeat_rules_organization_id
  on public.task_repeat_rules (organization_id);
create index if not exists ix_team_members_organization_id
  on public.team_members (organization_id);
create index if not exists ix_user_score_results_organization_id
  on public.user_score_results (organization_id);
create index if not exists ix_video_briefs_organization_id
  on public.video_briefs (organization_id);
