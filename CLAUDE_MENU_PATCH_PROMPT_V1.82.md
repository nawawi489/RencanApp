# Claude Code Prompt - Patch Menu Rencanaapp V1.82

Tugas kamu adalah memperbaiki hanya area Menu agar 1:1 dengan prototype final Rencanaapp.

Source of truth wajib:

1. `MENU_UI_LOCK_SPEC_V1.82.md`
2. `PRD.md`
3. Prototype visual final: `design.html`

Scope patch:

1. Menu screen.
2. Menu local header.
3. Menu profile card.
4. Akses Cepat grid.
5. Template accordion.
6. Bantuan accordion.
7. Pengaturan accordion.
8. Admin Lanjutan accordion.
9. Logout button.
10. Icon alignment in Menu.
11. Active bottom nav behavior for Menu subpages.

Do not touch:

1. Home.
2. Notifications.
3. Workspace.
4. Inbox.
5. Login.
6. People UI except ensuring People is reachable from Menu.
7. Backend/API.

Hard rules:

1. Bottom nav must remain: Home, Notif, Workspace, Inbox, Menu.
2. People must be inside Menu.
3. Workspace must not be inside Menu.
4. Menu must not include Home, Inbox, Notifications, Action Plan Hari Ini, Kirim Bukti, Input Hasil, Cari Card, or Profil Saya shortcut.
5. Profile card is the only profile shortcut.
6. Akses Cepat must contain exactly: People, Log Aktivitas, Archive.
7. Template accordion must contain: Goal Template, KPI Area Template.
8. Bantuan accordion must contain: Pusat Bantuan, Support.
9. Pengaturan accordion must contain: Organisasi, Repeat Setting, Score Formula, Permission Settings, Minimum Breakdown Rule.
10. Admin Lanjutan accordion must contain: Governance, Confidential, Override Score.
11. Admin Lanjutan must be permission-based.
12. Accordions are collapsed by default.
13. Logout text must be `Keluar`.
14. Do not use `Logout`.
15. Do not add duplicate local search icon in Menu.
16. Local Menu header only has title `Menu` and one settings icon.

Visual target:

1. Mobile-first 390 px.
2. Menu title 28 px.
3. Profile card directly below header.
4. Menu grid 2 columns.
5. Menu card min height 112 px.
6. Menu card radius 8 px.
7. Menu icon frame 40 x 40 px.
8. SVG icon 22 x 22 px.
9. SVG must be perfectly centered using absolute center or equivalent.
10. Text icons like `?`, `CS`, and `R` must also be perfectly centered.
11. Category heading size must be consistent:
   - Akses Cepat.
   - Template.
   - Bantuan.
   - Pengaturan.
   - Admin Lanjutan.
12. Logout button is full width, grey, 48 px min height.

Acceptance test:

After patch, verify at 390 px mobile viewport:

1. No duplicate search icon in Menu.
2. People card exists in Akses Cepat.
3. Workspace card does not exist in Menu.
4. Akses Cepat shows exactly 3 fitur.
5. Icons do not shift from their frames.
6. Pusat Bantuan, Support, and Repeat Setting icons are centered.
7. Category headings use the same size/weight.
8. Admin Lanjutan is minimized/accordion.
9. Logout button says Keluar.
10. Bottom nav Menu is active on Menu and all Menu subpages.
11. No horizontal overflow.

Output requirement:

1. Explain only changed files.
2. Mention any intentional divergence from the spec.
3. If there is no divergence, say `Menu sudah mengikuti UI Lock Spec V1.82`.
