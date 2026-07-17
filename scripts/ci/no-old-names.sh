#!/usr/bin/env bash
# no-old-names.sh — CI guard preventing regressions after the V1.8.3
# Workspace Performance rename (specs/rename-workspace-terminology.md).
#
# Fails when banned pre-rename identifiers reappear in code, tests, or the
# runtime schema of the mobile/ + supabase/ tree.
#
# Allowlist rules:
#   1. Migrations older than the rename (0000_..0044_*) preserve their
#      historical text — they document past DDL and MUST NOT be rewritten.
#   2. The rename migration itself (0045..0046) intentionally references old
#      names in comments/rename statements.
#   3. Historical spec pages under specs/ that document earlier phases
#      (fase-*-spec.md, fase-*-tdd-plan.md, prd-vs-*, etc.) preserve their
#      point-in-time text — the rename introduces a NEW spec file, it does
#      not rewrite old ones.
#   4. Wiki source pages (wiki/sources/*) mirror external documents verbatim.
#   5. Frozen function/param names per RWT-05 A + pg_cron continuity
#      (compute_action_plan_completion, generate_action_plan_instances,
#      mark_overdue_instances, and p_action_plan_id params).
#   6. `action_plans` and `action_plan` as CURRENT identifiers (level 3
#      table + entity_type literal after rename) are permitted; the guard
#      targets *legacy* identifiers only.
#
# Usage: bash scripts/ci/no-old-names.sh
# Exit 0 = clean, exit 1 = regression detected.

set -euo pipefail

# Banned legacy identifiers (each must NOT appear in scanned files).
# Order matters only cosmetically — every pattern is checked independently.
LEGACY_PATTERNS=(
  'kpi_area_id'
  'kpi_areas'
  'kpi_area_templates'
  'kpi_area_target_breakdowns'
  'kpi_area_current_values'
  'action_plan_instances'
  'action_plan_submissions'
  'action_plan_result_values'
  'action_plan_repeat_rules'
  'KpiArea'
)

# Paths intentionally excluded (see rules 1..4 above).
# Everything else in mobile/, supabase/, wiki/, DESIGN.md, PRD.md is scanned.
EXCLUDES=(
  # Historical migrations (0000..0044). The rename migration is 0045; earlier
  # migrations MUST keep their historical DDL text.
  'supabase/migrations/0000_'
  'supabase/migrations/0001_'
  'supabase/migrations/0002_'
  'supabase/migrations/0003_'
  'supabase/migrations/0004_'
  'supabase/migrations/0005_'
  'supabase/migrations/0006_'
  'supabase/migrations/0007_'
  'supabase/migrations/0008_'
  'supabase/migrations/0009_'
  'supabase/migrations/001'
  'supabase/migrations/002'
  'supabase/migrations/003'
  'supabase/migrations/004'
  # Rename migrations themselves (comment their target/legacy names).
  'supabase/migrations/0045_'
  'supabase/migrations/0046_'
  # Historical / point-in-time specs.
  'specs/fase-'
  'specs/action-plan-submit-upload'
  'specs/prd-vs-'
  # Rename spec + prd-mapping intentionally reference legacy names.
  'specs/rename-workspace-terminology'
  # Chat attachments spec documents structural guardrails referencing
  # historical table names (action_plan_submissions) as boundary markers.
  'specs/inbox-chat-attachments'
  # Rollback plan intentionally references legacy names (revert direction).
  'specs/rollback-plan.md'
  # 0045R migration reverts to legacy names.
  'supabase/migrations/0045R_'
  # 0059 comments document the pre-rename table name `kpi_area_templates`
  # (renamed to `strategy_templates` in 0045) for historical context.
  'supabase/migrations/0059_'
  # 0061_fix_strategy_current_values comments reference the original view name
  # `kpi_area_current_values` to explain the security_invoker regression from 0045.
  'supabase/migrations/0061_fix_strategy_current_values'
  # Historical SQL contract tests (fase-N_*_contract.sql, 00NN_*_contract.sql).
  # These document DDL against the schema of their time and are not rewritten.
  'supabase/tests/'
  # database-blueprint entity has a "V1.8.3 rename kolom FK" mapping section
  # that documents the before/after intentionally.
  'wiki/entities/database-blueprint.md'
  # action-plan entity documents the rename + references the FROZEN pg_cron
  # function name generate_action_plan_instances (per RWT-05 A + §7.7).
  'wiki/entities/action-plan.md'
  # Historical fase-plan wiki concepts.
  'wiki/concepts/fase5-tdd-plan'
  'wiki/concepts/fase6-'
  'wiki/concepts/fase7-'
  'wiki/concepts/fase8-'
  'wiki/concepts/bugfix-'
  'wiki/concepts/prototype-prd-conformance'
  'wiki/concepts/design-fidelity-audit'
  'wiki/concepts/workspace-lock-audit'
  'wiki/concepts/ui-prototype-gap'
  # Scope guardrails concept documents structural separation from legacy tables.
  'wiki/concepts/scope-guardrails'
  # Source mirrors of external docs.
  'wiki/sources/'
  # Historical QA/test reports document schema at their time-of-run.
  'wiki/test-reports/'
  # PRD historical section quotes.
  'PRD.md'
  # Log is append-only history.
  'wiki/log.md'
  # Generated Supabase types (regenerated whenever schema changes; may
  # contain historical enum values via `entity_type` unions — these are
  # data literals, not identifiers).
  'mobile/src/lib/database.types.ts'
  # Guard script itself lists the patterns literally.
  'scripts/ci/no-old-names.sh'
  # node_modules and build output.
  'node_modules/'
  '.next/'
  '.expo/'
  'dist/'
  'build/'
  '.git/'
)

# Roots to scan.
ROOTS=(
  'mobile/src'
  'supabase/migrations'
  'supabase/tests'
  'wiki'
  'specs'
  'DESIGN.md'
)

# Build ripgrep glob-exclude args.
RG_EXCLUDES=()
for e in "${EXCLUDES[@]}"; do
  RG_EXCLUDES+=(--glob "!$e*")
done

failed=0
for pat in "${LEGACY_PATTERNS[@]}"; do
  # ripgrep with word-boundary approximation. Fixed-string search + -w gives
  # us word boundaries for identifiers (they must be surrounded by non-word
  # characters, e.g. quotes, dots, semicolons, whitespace).
  if command -v rg >/dev/null 2>&1; then
    if hits=$(rg -F -w "$pat" "${RG_EXCLUDES[@]}" "${ROOTS[@]}" 2>/dev/null); then
      echo "REGRESSION: legacy identifier '$pat' found:" >&2
      echo "$hits" | head -20 >&2
      failed=$((failed + 1))
    fi
  else
    # Fallback: grep -rw. Slower and doesn't respect all excludes cleanly but
    # ripgrep is standard in CI images.
    if hits=$(grep -rwn "$pat" "${ROOTS[@]}" 2>/dev/null | grep -vE "$(IFS='|'; echo "${EXCLUDES[*]}")" 2>/dev/null); then
      if [ -n "$hits" ]; then
        echo "REGRESSION: legacy identifier '$pat' found:" >&2
        echo "$hits" | head -20 >&2
        failed=$((failed + 1))
      fi
    fi
  fi
done

if [ "$failed" -gt 0 ]; then
  echo "" >&2
  echo "no-old-names.sh: $failed legacy identifier(s) leaked into scanned tree." >&2
  echo "If a hit is legitimate (documenting the historical rename), add its path prefix" >&2
  echo "to the EXCLUDES array in scripts/ci/no-old-names.sh with a comment explaining why." >&2
  exit 1
fi

echo "no-old-names.sh: clean ($(echo "${LEGACY_PATTERNS[@]}" | wc -w) patterns × $(echo "${ROOTS[@]}" | wc -w) roots)."
