# specs/ — arsip planning historis

Semua file di folder ini adalah **spec + TDD plan + handoff untuk fitur yang sudah landed**. Bukan pekerjaan aktif. Disimpan sebagai jangkar sejarah karena banyak header migration SQL merujuk ke sini sebagai sumber spec.

## Cara pakai

- **Mencari status/urutan/tanggal keputusan** → baca [`wiki/log.md`](../wiki/log.md) (timeline autoritatif).
- **Mencari rujukan cepat per fitur** → [`wiki/index.md`](../wiki/index.md).
- **Mencari alasan sebuah kolom / RPC / RLS ada** → cek header komentar file `supabase/migrations/00NN_*.sql`; biasanya menunjuk balik ke file spec di sini.
- **Menulis spec baru** → **jangan** taruh di sini. Gunakan skill `/sdd-plan` (output ke lokasi barunya, atau letakkan langsung di `wiki/concepts/` jika ringkas). Folder ini beku.

## Pemetaan spec → migration landed

| Spec | Migration | Fitur |
|---|---|---|
| `fase-2-*` | `0007_fase2_repeat.sql` | Action Plan Repeat |
| `fase-3-*` (+ `fase-3-resolusi-blocker.md`) | `0008_fase3_collab.sql` | Home + Notifications + Inbox |
| `fase-4-*` | `0010_fase4_performance_workspace.sql` | Performance Workspace |
| `fase-7-*` | `0013_fase7_people_score.sql` | People & Score |
| `fase-8-*` | `0014_fase8_governance_admin.sql` | Governance & Admin |
| `permission-settings*` | `0017_permission_settings.sql` | Permission Settings |
| `inbox-chat-ui*` | `0018_fr_data1_inbox_preview.sql` | Inbox chat UI (UI-S-IN1/IN2) |
| `action-plan-submit-upload*` | `0019_fase_exec_ap5_ap6.sql` | Submit + upload evidence |
| `score-formula-editor*` | `0020_fase_sf1_score_formula_editor.sql` | Score formula editor |

> Jika sebuah addendum (mis. `fase-3-resolusi-blocker.md`) bentrok dengan spec induknya, addendum menang — sudah dicatat di header spec masing-masing.
