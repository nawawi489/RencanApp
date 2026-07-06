# TODOS — Sinkronisasi kode `mobile/` ke PRD V1.8.2

Sumber kebenaran: `PRD.md` (V1.82). Sequencing + watch berasal dari review `/autoplan` 2026-06-27
(`~/.gstack/projects/nawawi489-RencanApp/feat-sf1-prd-reconciliation-plan-20260627.md`).
Backlog UI ber-ID lengkap: `wiki/concepts/ui-prototype-gap.md`. Aturan token UI: `DESIGN.md`.

Urutan keras (hindari throw-away): **S0 → S1 → S2 → S3 → S4**. Item Cat-3 non-nav/non-period boleh paralel.

---

## S0 — Nav fix: People tab → Menu tab (P0, kode kontradiksi PRD §7.1)

Bottom nav V1.8.2 §7.1 = `Home · Notif · Workspace · Inbox · Menu`. People masuk ke Menu (§31).
Kode sekarang masih People = tab 5. Hub `(app)/settings.tsx` sudah berbentuk Menu (profil + tema + 15 seksi admin + Keluar); tinggal tambah People & jadikan tab.

File-by-file:
- [ ] **Pindah** `mobile/src/app/(app)/(tabs)/people.tsx` → `mobile/src/app/(app)/people.tsx` (jadi stack route non-tab). Header lewat Stack options di `(app)/_layout.tsx` (cek pola screen lain). Konten FlatList People tetap; route internal `/people-ranking` & `/people-profile/[id]` tidak berubah.
- [ ] **Jadikan Menu tab 5:** promote hub `(app)/settings.tsx` jadi `(tabs)/menu.tsx` (title "Menu", icon `menu`/`grid`). Tambah 2 row di atas SECTIONS: `People` → `/people`, `People Ranking` → `/people-ranking`. Pertahankan profil header + ThemeSwitch + Keluar.
  - Keputusan struktur: Menu = hub atas; `/settings` boleh tetap ada sbg alias atau dilebur. Jika dilebur, sesuaikan test settings-link.
- [ ] **`(tabs)/_layout.tsx`:** ganti `<Tabs.Screen name="people" …>` → `name="menu"` (title "Menu", `menu-outline`). Hapus People dari bottom nav.
- [ ] **Test:** update `(app)/(tabs)/__tests__/*` yang assert tab People; update `settings-permission-link.test.tsx` / `settings-score-link.test.tsx` bila komponen/route settings berpindah. Tambah test: tab ke-5 = Menu, People reachable via `/people`.
- [ ] **Verifikasi:** `cd mobile && npx jest` hijau + `tsc` bersih.
- [ ] Update `wiki/log.md` (## update | S0 nav Menu) + centang UI-N-001 implementasi di `ui-prototype-gap.md`.

## S1 — Period Focus Engine (§7.6 / §7.7) — fondasi, gate S2

- [ ] Model periode aktif (Bulan default, Quarter rollup, Goal tahunan konteks). Komponen `PeriodSwitcher` (UI-G-010 / UI-S-W03): segmented Bulan/Quarter + list periode (Archive/Aktif/Quarter).
- [ ] Query Workspace/tree/detail difilter periode aktif. Card periode lewat: redup + tombol tambah dikunci + popup "Periode sudah lewat" (§7.7).
- [ ] Cek dampak ke RLS/visibility queries lintas layar card.

## S2 — KPI Area Target Breakdown + Σ=100% (§12) — butuh migrasi

- [ ] **Migrasi baru:** baris breakdown ber-key `kpi_area_id + period_type + period_key + contribution_pct`. **WAJIB baris pada KPI Area, BUKAN tabel kartu anak** (kalau kartu anak → melanggar §6 "KPI child table di bawah Area Goal"). Lihat callout di `wiki/concepts/scope-guardrails.md`.
- [ ] Enforce Σ=100% per Quarter dan per Bulan-dalam-Quarter (CHECK/trigger/RPC) + progress bar UI (§12.2). Edit kontribusi periode berjalan jika permission izinkan (§12).
- [ ] Audit perubahan breakdown via `activity_log` (event baru). 
- [ ] UI forms: UI-S-G01 (Target Tahunan goal), UI-S-K01 (Pecahan Target Q/M), UI-S-S01 (Kontribusi Q% strategy — pastikan = breakdown KPI Area, bukan bobot skor).

## S3 — Card Interaction Rule + dim past (§7.3 / §7.7) — sistemik

- [ ] Tiap tree-card: tombol `Detail` (masuk isi) vs panah (turunan) vs `...` (UI-G-009 RowActionsMenu) vs + (tambah turunan bila permission/rule). Tap area non-button tidak buka detail.

## S4 — Completeness popups (§7.4 / §7.5)

- [ ] Popup umum "Lengkapi data wajib…" saat klik Aktifkan bila field wajib kosong (rule backend MBR sudah ada).
- [ ] Popup arahan saat klik + turunan bila MBR belum terpenuhi ("KPI Area ini baru punya 2 dari 3 Strategy…").
- [ ] Kelengkapan Card/Perencanaan: rule backend tetap; panel besar TIDAK selalu tampil (signal persisten murah di Home/header tetap boleh — keputusan owner "keep signal + popup").

---

## Cat-3 — penguatan UI fitur PRD (paralel-safe, sudah ter-ID di `ui-prototype-gap.md`)

Rujuk ID di backlog; jangan double-track di sini:
UI-S-OR1 (Org/Posisi/Tim/Garis-lapor/Role Template), UI-S-GV1 (Governance "Selesaikan"+resolution),
UI-S-AL1 (Activity Log timeline+filter — semua event), UI-S-AR1 (Archive restore+metadata),
UI-S-PRM1 (Scope pill permission), UI-S-KT1 (KPI Template per tipe Goal), UI-S-AP7 (Repeat compliance detail),
UI-G-005 (Search lengkap semua tipe). Score Formula: UI-S-SF1 ✅; sisa SF2 (role chips) + versioning/effective-date/audit.

---

## QA 2026-07-07 — temuan /qa (deferred)

Laporan lengkap: `.gstack/qa-reports/qa-report-localhost-8081-2026-07-07.md`. 7 bug sudah difix di branch `chore/rntl-a11y-tsc-cleanup` (ISSUE-002/003/004/006/007/008/011).

- [x] **ISSUE-005 (medium, UX) — Notifikasi actionable basi.** *Selesai 2026-07-07 via migration 0040 + patch client `notifications.ts`/`notifications.tsx`.* Kolom `resolved_at`/`resolution` di `public.notifications`; RPC pemutus (`review_deadline_change`, `resubmit_deadline_change_request`, `review_action_plan_submission`, `review_action_plan_instance_submission`) memanggil helper `resolve_notifications`; migration menjalankan backfill idempoten sekali. Client: tab **Perlu Tindakan** menyaring `resolved_at IS NULL`; kartu resolved menampilkan Badge hasil (Disetujui / Ditolak / Perlu Revisi) dan CTA turun ke "Lihat Detail". Sekalian tambahan: 4 tipe DCR dimasukkan ke union `NotificationType` (sebelumnya silent-render tanpa label). Verifikasi: `0040_notification_resolution_contract.sql` 8/8 (Block A–H) + jest `notifications.test.ts` 17/17 + `notifications.test.tsx` 12/12 + tsc bersih.
