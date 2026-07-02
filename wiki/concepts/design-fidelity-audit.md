---
type: concept
tags: [design, ui, fidelity, prototype]
updated: 2026-06-29
sources: 0
---

# Design Fidelity Audit

Perbandingan design aplikasi `mobile/` terhadap 47 layar prototype tim desain di `ui/design-prototype/` (render dari `design.html` @430px), dikalibrasi ke `DESIGN.md`. Melengkapi [[ui-prototype-gap]] (backlog ber-ID per layar) dengan penilaian fidelity menyeluruh.

## Verdict

**7.5/10.** Bahasa visual prototype terangkat baik di layar detail, People, dan Workspace. Dimensi terlemah review desain awal (interaction states) sudah ditutup lewat komponen fondasi (`EmptyState v2`, `Skeleton`, `ErrorState`). Gap terbesar adalah Home dan dua keputusan token yang masih menggantung.

## Scorecard 7 dimensi

| Dimensi | Nilai | Catatan |
|---|---|---|
| Fondasi design system / fidelity token | 7/10 | `DESIGN.md` mengikat, tapi brand hue + Inter belum final → bukan 1:1 |
| Hirarki visual | 7/10 → 8/10 | Layar detail tajam; Home dulu menumpuk, kini kartu kaya |
| Cakupan interaction state | 9/10 | Kemenangan terbesar — komponen fondasi dipasang lintas-layar |
| Fidelity per-layar | 7/10 → 8/10 | Mayoritas tinggi; Home outlier kini diperbaiki |
| Information architecture / nav | 8/10 | 5-tab konsisten; tab ke-5 = Menu (lihat [[surfaces]]) |
| Aksesibilitas | 9/10 | `DESIGN.md` §4 mengikat, kontras AA terhitung, touch ≥44px |
| Risiko AI-slop | 8/10 | Utility design disengaja, bukan template generic |

## Layar dengan fidelity tinggi

- **Action Plan detail** — `ProgressOrb` + `MetaGrid` 2×2 + section collapsible + `GuidanceChecklist` cocok dengan prototype flagship.
- **People ranking/profile** — `ScoreLegend` + `ScoreBadge` + `Avatar` deterministik; menutup gap "warna skor tanpa makna". Lihat [[score-formula]].
- **Workspace hub** — orb % + 3-stat + "Masuk →" cocok dengan prototype.
- **Login** — logo, wordmark dua-warna, tagline, gradient, toggle mata.

## Gap yang sudah ditutup (2026-06-29)

- **Home "Fokus Hari Ini"** — `TaskRow` kini badge tipe (AP/RP) + `ProgressBar` + % + status + deadline/PIC. Progress dari heuristik status (`computeActionPlanProgress`), bukan angka palsu.
- **Home kartu prioritas ke-3 + Snapshot Tim** — kartu "Gap KPI Area" + section "Snapshot Tim" memakai sinyal andal `listKpiNeedsAttention()` (KPI Area aktif tanpa progres approved). State-based, tanpa migrasi, tanpa parsing target.
- **Header** — search ikon-only → pill berlabel "Cari" (afordans eksplisit; mobile tanpa hover).
- **Login** — "Lupa password?" fungsional (`resetPasswordForEmail`).

## Keputusan owner yang masih terbuka

1. **Brand hue** — kode `#208aef` vs prototype `#1877f2`. `DESIGN.md` §11 default = pertahankan `#208aef`. Selama belum final, "match prototype" punya plafon.
2. **Font Inter** — belum dimuat (`global.css` fallback `system-ui`). Memuat Inter (mis. `@expo-google-fonts/inter`) match prototype 1:1 tapi menambah dependensi + gating render.
3. **Model auth** — prototype = akun dibuat admin (ada "Hubungi Admin", tanpa self-signup); implementasi punya toggle "Daftar". PRD V1.8.2 = admin-created. Perlu putusan: pertahankan self-signup atau admin-only.

## KPI gap: "% gap" presisi (migrasi 0032, override PRD §18)

Awalnya `kpi_areas.target` teks bebas dan PRD §18 melarang Satuan ("UI terasa seperti spreadsheet"), jadi "% gap" prototype tak bisa dihitung tanpa parsing teks. **Owner meng-override §18 (2026-06-29)**: ditambah `target_numeric` + `target_unit` **opsional** (migrasi 0032). KPI bertarget numerik kini menampilkan "% capaian vs target" presisi ("65% / kurang 1.060 customer") di Home + detail; KPI kualitatif tetap pakai target teks + sinyal "belum ada progres". % = approved `numeric_total` (VIEW `kpi_area_current_values`) ÷ `target_numeric`, via `lib/kpi-gap.ts`. PRD §18 diperbarui agar truth konsisten. Lihat [[card-model]].
