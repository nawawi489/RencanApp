# Claude Code Prompt - Patch Workspace Rencanaapp V1.82

Tugas kamu adalah memperbaiki hanya area Workspace agar 1:1 dengan prototype final Rencanaapp.

Source of truth wajib:

1. `outputs/WORKSPACE_UI_LOCK_SPEC_V1.82.md`
2. `PRD.md` (V1.82 — di root repo)
3. Prototype visual final: `outputs/ems-mobile-ui/index.html`

Scope patch:

1. Workspace Overview.
2. Performance Workspace.
3. Development Workspace.
4. Workspace tree card component.
5. Period switcher.
6. Detail vs panah turunan behavior.
7. Guarded create child behavior.
8. Archived period/card visual.
9. Workspace-related active nav behavior.

Do not touch:

1. Home.
2. Notifications.
3. Inbox.
4. People.
5. Menu.
6. Login.
7. Score settings.
8. Permission settings.
9. Any backend contract unless needed for UI data shape.

Hard rules:

1. Bottom nav must remain: Home, Notif, Workspace, Inbox, Menu.
2. People must stay inside Menu, not bottom nav.
3. Workspace Overview must only show Performance and Development cards.
4. Do not add `+ Workspace`.
5. Do not add Workspace shortcut inside Menu.
6. Workspace cards must have visible `Masuk` button.
7. Performance card title: `Target Kinerja`.
8. Development card title: `Pembangunan Sistem`.
9. Performance flow line: `Goal → KPI Area → Strategy → Initiative → Action Plan`.
10. Development flow line: `Development Area → Problem Statement → Initiative → Action Plan`.
11. Flow line must be plain text, not bold, not long description.
12. Performance and Development overview cards must have `?` help icon at top right.
13. Workspace tree default collapsed.
14. `Detail` opens card detail.
15. Arrow opens child/turunan cards only.
16. Clicking card body must not open detail.
17. If card body is clicked, show toast: `Untuk membuka isi Card, gunakan tombol Detail di dalam Card.`
18. `...` opens secondary action sheet.
19. Create child buttons stay inside tree card action row.
20. Guarded create buttons must show warning toast, not open form.
21. Past-period cards must be visually dimmed and cannot create child cards.
22. Card detail pages must not show full child tree.
23. Do not show Kelengkapan Card or Kelengkapan Perencanaan as large always-visible panels inside Workspace.
24. No table, no kanban, no feed, no long filter chips.

Visual target:

1. Mobile-first 390 px.
2. Card radius 8 px.
3. Workspace overview card min height around 172 px.
4. Tree card uses 3 columns: content, progress orb, arrow.
5. Action Plan card uses 2 columns: content and progress orb.
6. Progress must be circular orb, not horizontal bar.
7. Workspace category pills must use letter badge:
   - Goal: G, blue.
   - KPI Area: K, amber.
   - Strategy: S, violet.
   - Initiative: I, green.
   - Action Plan: AP, blue.
   - Development Area: D, teal.
   - Problem Statement: P, orange/red.
8. Button row order:
   - Performance: Kembali, + Goal, Edit.
   - Development: Kembali, + Development Area, Edit.
9. Back button design must be identical in Performance and Development.
10. Period switcher must be compact/collapsed by default.

Acceptance test:

After patch, verify at 390 px mobile viewport:

1. Workspace overview looks like the prototype.
2. Performance and Development cards are balanced height.
3. User can clearly see `Masuk`.
4. Period switcher is compact.
5. Tree is collapsed by default.
6. Clicking arrow expands child cards.
7. Clicking Detail opens detail.
8. Clicking card body does not open detail.
9. Guarded create button shows warning.
10. No horizontal overflow.
11. No duplicate or extra workspace features appear.

Output requirement:

1. Explain only changed files.
2. Mention any intentional divergence from the spec. If there is no divergence, say `Workspace sudah mengikuti UI Lock Spec V1.82`.
