-- =====================================================================
-- 0048_hotfix_task_instance_id.sql
-- =====================================================================
-- Hotfix untuk F1 miss: kolom `action_plan_instance_id` di tabel
-- `task_submissions` tidak ikut rename bottom-up (dilewatkan sed pattern
-- karena identifier `action_plan_instance` bukan bagian dari `action_plans`
-- maupun `action_plan_instances` — compound name yang unik).
--
-- Post-F1 mobile client mengekspektasi `task_instance_id` (sed renamed),
-- tapi DB masih `action_plan_instance_id`. Ini merusak PostgREST embed
-- `task_submissions!task_submissions_task_instance_id_fkey` di
-- `mobile/src/lib/repeat.ts` dan runtime query di layar Task Instance detail.
--
-- Fix idempotent: skip kalau kolom baru sudah ada.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'task_submissions'
      AND column_name = 'action_plan_instance_id'
  ) THEN
    ALTER TABLE public.task_submissions RENAME COLUMN action_plan_instance_id TO task_instance_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'action_plan_submissions_action_plan_instance_id_fkey'
  ) THEN
    ALTER TABLE public.task_submissions
      RENAME CONSTRAINT action_plan_submissions_action_plan_instance_id_fkey
      TO task_submissions_task_instance_id_fkey;
  END IF;
END $$;

COMMIT;
