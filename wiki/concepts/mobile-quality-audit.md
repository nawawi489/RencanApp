---
type: concept
tags: [mobile, audit, quality, accessibility, performance, react-native-web]
updated: 2026-08-05
sources: 0
---

# Mobile Quality Audit (`$impeccable`) & Remediasi

Audit **kualitas teknis** `mobile/` lewat skill `$impeccable` (2026-08-05), berbeda axis dari [[design-fidelity-audit]] (app vs prototype desain) — di sini yang dinilai adalah kesehatan kode di 5 dimensi: **Accessibility, Performance, Appearance & Theming, Platform Conformance, Adaptivity**. Skor **11/20 (Acceptable) → 19/20 (Excellent)** setelah 11 PR remediasi.

## Scorecard (awal → akhir)

| Dimensi | Awal | Akhir |
|---|---|---|
| Accessibility | 3 | 4 |
| Performance | 3 | 4 |
| Appearance & Theming | 3 | 4 |
| Platform Conformance | **1** | **4** |
| Adaptivity | **1** | 3 |
| **Total** | **11/20** | **19/20** |

Platform Conformance naik paling tajam: awalnya "native shell membungkus layar berpola-web" (safe-area tak dipakai, back gesture Android mati, konfirmasi destruktif jadi tombol mati di web), kini app native yang dipercaya di tiap layar.

## Temuan akar: kelas prop-inert `react-native-web`

Temuan paling struktural. Beberapa prop/API React Native **diam-diam no-op di `react-native-web`** sementara `jest-expo` preset native lapor hijau — jadi bug hanya muncul di build web (`staging.rencanapp.com`) dan lolos tes. Tiga agen dimensi berbeda konvergen ke akar yang sama. Empat instans, semua kini tertutup:

| Instans | Efek di web | Ditutup |
|---|---|---|
| `Alert.alert` | `class Alert { static alert(){} }` kosong → callback konfirmasi tak jalan → tombol destruktif mati | PR #242 (seam `showAlert`) |
| `KeyboardAvoidingView` di luar `<Modal>` | KAV mem-pad layar tak-terlihat di belakang modal | PR #242 |
| `hitSlop` sbg touch-target | "visual 34px + hitSlop → 44px" tak pernah terjadi → target ≤36px | PR #250 (kotak 44px nyata) |
| `accessibilityViewIsModal` di `<View>` | overlay tak menjebak fokus | PR #252 (→ `<Modal>`) |

Tiga punya **guard test statik permanen** (`showAlert` lint, `no-hitslop-touch-target.guard`, guard emoji) supaya tak kambuh. Pelajaran mengikat: "hijau jest + merged" TIDAK membuktikan perilaku web — preset native meniru RN, bukan RNW; UI yang dikirim ke web butuh guard statik atau smoke check web-render.

## Pass remediasi (11 PR)

Tiap pass dijalankan di **sesi terpisah**, di-branch dari `origin/staging`, PR `--base staging` eksplisit, di-serialize untuk hindari konflik file:

- **P0 harden (#242)** — safe-area app-wide, 6 konfirmasi destruktif → `showAlert`, `predictiveBackGestureEnabled: true`, 2 KAV dipindah ke dalam `<Modal>`.
- **P1 optimize (#243)** — FlatList virtualisasi daftar anggota, kaskade focus-refetch (`useQuery` Proxy di dep array), skeleton thread-JS → native driver.
- **P1 adapt (#245)** — sumber kebenaran lebar + `max-w` di `screen.tsx` (dulu 0 logika responsif → kolom telepon full-bleed di 1440px web/iPad), grid width-derived, nav rail, KAV form, Button flex.
- **P2 document (#246)** — rekonsiliasi 4 kontradiksi-diri `DESIGN.md`; keputusan glyph seleksi = Ionicons `checkmark-circle`/`ellipse-outline`.
- **P1 animate (#247)** — `useReduceMotion()` → Skeleton + modal honor Reduce Motion OS.
- **P1 colorize (#248)** — ~45 emoji/glyph ikon → Ionicons (import per-family, warna theme-aware) + guard emoji.
- **P2/P3 layout+polish (#249)** — kontras (red-500→700, amber-600→700, dll.), fixed-height→minHeight (Dynamic Type), orb kompak 9→11px, MonthDaysPicker 44px.
- **harden-2 (#250)** — `hitSlop` (28 situs) → kotak 44px nyata (helper `touchTarget` + margin negatif), `RowActionsMenu` → `ActionSheetIOS`, metafora modal Cancel/Done + system back.
- **P2 cleanup (#252)** — 3 overlay permission → `<Modal>` (tutup instans inert-prop terakhir), ~42 hex Workspace → token bernama, archive N+1 → query batch, memoize context + `useChatActions`.
- **Log wiki (#253)** — entry `[[log]]` konsolidasi.

## Sisa terbuka (1, keputusan produk — bukan defect)

Kunci orientasi iPad `app.json` (`orientation: portrait`, tanpa `ios.requireFullScreen`) — satu-satunya penahan Adaptivity di 3. Untuk app utilitas-eksekusi, portrait-lock adalah pilihan sah. Owner memilih **berhenti di 19/20** (2026-08-05); `app.json` sengaja tak disentuh. Jalur ke 20/20 = dukungan landscape/tablet penuh (kerja desain nyata, bukan cleanup).

## Metodologi & pelajaran

- **Baseline**: audit WAJIB target `origin/staging`, bukan working tree `main` (yang saat itu tertinggal 292 commit). Audit pertama atas `main` menghasilkan ~40% temuan hantu (sudah diperbaiki di staging) — dikoreksi via re-verifikasi seluruh dimensi lawan worktree read-only. Verifikasi baseline sebelum percaya temuan apa pun.
- **Orkestrasi**: 5 agen dimensi paralel untuk temuan → handoff self-contained per pass (baseline discipline + `file:line` terverifikasi + template in-repo) → sesi terpisah per pass.
- Detail kronologis penuh: entry `[[log]]` 2026-08-05.

Lihat juga: [[design-fidelity-audit]] (audit desain vs prototype — axis berbeda), [[surfaces]], [[architecture]].
