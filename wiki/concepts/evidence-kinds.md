---
type: concept
tags: [evidence, action-plan, submission, constraint, fase1]
updated: 2026-06-26
sources: 1
---

# Evidence Kinds

Allowed values for `evidence_files.kind`, enforced by the `evidence_files_kind_check`
CHECK constraint and emitted as-is by the `submit_action_plan` / `submit_action_plan_instance`
RPCs. A submission carrying a `kind` outside this whitelist fails with SQLSTATE `23514`.

## Whitelist (since migration 0015)

| kind           | Use for                                                        |
|----------------|----------------------------------------------------------------|
| `file`         | Generic uploaded file (storage object)                         |
| `photo`        | Image capture / photo upload                                   |
| `screenshot`   | Screen capture                                                 |
| `pdf`          | PDF document                                                   |
| `link_gdrive`  | Google Drive link                                              |
| `link_doc`     | Google Docs / document link                                    |
| `link_generic` | **Any other external link** (Notion, Figma, dashboard, …)      |
| `text_note`    | Inline text note                                               |
| `report`       | Structured report artifact                                     |

## Rules for the mobile UI

- Never send a bare `kind="link"` — it is **not** whitelisted and will be rejected `23514`.
  Map Google Drive → `link_gdrive`, Google Docs → `link_doc`, everything else → `link_generic`.
- `link_generic` was added in migration `0015_qa_followup_fixes` (QA finding **F-1**) so new
  link sources do not require a DDL change. Adding a *new* dedicated kind still requires a
  migration that extends `evidence_files_kind_check`.

See [[action-plan-submission]] for the submission flow and [[card-engine]] for the loop.
