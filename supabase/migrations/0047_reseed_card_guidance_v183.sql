-- =====================================================================
-- 0047_reseed_card_guidance_v183.sql
-- =====================================================================
-- RWT-12 follow-up: align card_guidance_contents with the V1.8.3 hierarchy
-- and rewrite the default (org-NULL) title/body to the new Indonesian copy.
--
-- Why this is needed (not cosmetic): the mobile client's CARD_TYPES now
-- reads/writes guidance keyed by NEW card_type values
-- ('goal','strategy','initiative','action_plan','task'). The seed rows
-- still carried OLD card_type values with SHIFTED meaning, so a request for
-- `strategy` (new level 1) would return the old level-2 "Strategy" content.
--
-- Depends on: 0045 + 0046 (tables/functions renamed).
--
-- IDEMPOTENT DESIGN (safe to re-run, e.g. during a rollback drill):
--   S1. Org-specific rows (organization_id NOT NULL): shift card_type
--       bottom-up ONLY when a legacy `kpi_area` marker row still exists for
--       that org (proves pre-shift state). This guard makes the stateful
--       shift re-run-safe. (No org-specific rows exist at authoring time;
--       this is future-proofing.)
--   S2. Default rows (organization_id IS NULL): DELETE + re-INSERT the 7
--       canonical rows. Delete-then-insert is fully idempotent and avoids
--       the double-shift hazard of a stateful UPDATE.
--
-- Content voice follows PRD §7.8 (tenang, praktis, tidak mengintimidasi)
-- and mirrors mobile/src/lib/glossary.ts. SME may refine per topic later.
-- =====================================================================

BEGIN;

-- =====================================================================
-- S1. Org-specific rows: guarded bottom-up card_type shift (idempotent).
-- Only fires per-org when that org still has a legacy 'kpi_area' row.
-- =====================================================================

DO $$
DECLARE
  v_org uuid;
BEGIN
  FOR v_org IN
    SELECT DISTINCT organization_id
    FROM public.card_guidance_contents
    WHERE organization_id IS NOT NULL
      AND card_type = 'kpi_area'
  LOOP
    UPDATE public.card_guidance_contents SET card_type = 'task'        WHERE organization_id = v_org AND card_type = 'action_plan';
    UPDATE public.card_guidance_contents SET card_type = 'action_plan' WHERE organization_id = v_org AND card_type = 'initiative';
    UPDATE public.card_guidance_contents SET card_type = 'initiative'  WHERE organization_id = v_org AND card_type = 'strategy';
    UPDATE public.card_guidance_contents SET card_type = 'strategy'    WHERE organization_id = v_org AND card_type = 'kpi_area';
  END LOOP;
END $$;

-- =====================================================================
-- S2. Default (org-NULL) rows: DELETE + re-INSERT (idempotent).
-- =====================================================================

DELETE FROM public.card_guidance_contents
WHERE organization_id IS NULL
  AND card_type IN (
    'goal', 'kpi_area', 'strategy', 'initiative', 'action_plan', 'task',
    'development_area', 'problem_statement'
  );

INSERT INTO public.card_guidance_contents (organization_id, card_type, title, body)
VALUES
  (NULL, 'goal',              'Goal — Arah besar yang ingin dicapai',
   'Goal adalah tujuan strategis tingkat atas. Wajib punya PIC/Owner dan periode, lalu dipecah menjadi Strategi. Goal tidak bisa diaktifkan sebelum punya minimal 1 Strategi.'),
  (NULL, 'strategy',          'Strategi — Area hasil yang harus bergerak',
   'Strategi menetapkan Target yang menjadi ukuran keberhasilan Goal. Tidak ada bobot atau satuan wajib. Pecah Strategi menjadi Inisiatif.'),
  (NULL, 'initiative',        'Inisiatif — Cara mencapai Strategi',
   'Inisiatif adalah card berpikir utama. Tidak boleh dangkal: wajib mengisi Alasan, Risiko Utama, dan Alternatif sebelum diaktifkan. Inisiatif dipecah menjadi Rencana Aksi.'),
  (NULL, 'action_plan',       'Rencana Aksi — Program eksekusi',
   'Rencana Aksi adalah program konkret untuk menjalankan Inisiatif. Punya Target Hasil dan otomatis mendapat ruang Diskusi Rencana Aksi. Pecah Rencana Aksi menjadi Tugas.'),
  (NULL, 'task',              'Tugas — Siapa melakukan apa dan kapan',
   'Tugas adalah unit eksekusi paling konkret. Wajib punya PIC, Reviewer, Deadline, dan Definition of Done. Bisa one-time atau Repeat (menghasilkan instance terjadwal), lalu dibuktikan dan direview.'),
  (NULL, 'development_area',  'Development Area — Area pengembangan mesin perusahaan',
   'Development Area adalah bidang pembangunan organisasi (sistem, orang, proses) — bukan target performa. Diisi Problem Statement yang dipecah menjadi Rencana Aksi dan Tugas.'),
  (NULL, 'problem_statement', 'Problem Statement — Masalah yang ingin diselesaikan',
   'Problem Statement (atau Development Goal) menjelaskan masalah atau perbaikan yang dituju — fokus pada apa yang perlu diperbaiki, bukan keluhan. Ditangani melalui Rencana Aksi.');

COMMIT;
