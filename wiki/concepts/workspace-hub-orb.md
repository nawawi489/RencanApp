---
type: concept
tags: [workspace, ui, hub-card, lobby]
updated: 2026-07-29
sources: 0
---

# Hub-card lobby: chip status, bukan orb capaian

Lobby tab Workspace ([[surfaces]]) menampilkan dua **hub-card** (Performance & Development). Setiap hub-card di lobby **TIDAK menampilkan capaian numerik**. Alih-alih orb progress bulat, hub-card memakai **chip status ringkas** yang menghitung distribusi Goal/Area berstatus `active`.

## Format chip

`{activeCount}/{parentCount} {parentStatLabel} aktif`

- Performance: `2/2 Goal aktif`
- Development: `1/2 Area aktif`
- Empty state (`parentCount === 0`): `Belum ada Goal` / `Belum ada Area` — hindari `0/0` yang canggung.

Chip mewarisi identitas ruang (`kickerBg`/`kickerText` per space) — Performance biru `#e8f2ff`+`#145ebc`, Development teal `#e6fffb`+`#0f766e`. Token sudah lulus AA di kicker pill; tidak ada token warna baru dibuat (aturan wajib [[DESIGN]]).

Chip statis (bukan interaksi), pakai `accessibilityRole="text"` + `accessibilityLabel="{activeCount} dari {parentCount} {parent} aktif"` biar screen reader terbaca natural (bukan "N garis miring M").

## Kenapa bukan orb

Sebelum 2026-07-29 hub-card memakai `ProgressOrb size={72}` yang nilainya `round(activeCount / parentCount × 100)` — persen "kepadatan aktivitas", **BUKAN** capaian target. Sementara **orb per-card di dalam tree** ([[workspace-card-progress]]) memakai RPC `workspace_card_progress` yang benar-benar mengukur capaian children.

Dua orb visual identik (bulat, angka besar, ring warna) di layar yang sama, semantik beda — konsisten menipu user. Kejadian nyata: user membaca orb hub bernilai 100 padahal semua Goal turunan capaiannya 0%.

Diskusi opsi (keputusan owner):

- **Opsi 1 (dipilih)** — ganti simbol: orb → chip. Lobby tidak butuh capaian granular; distribusi status cukup untuk memutuskan "masuk ruang mana".
- Opsi 2 ditolak — patch label saja ("Aktif" ganti nama orb). Simbol bulat tetap terbaca progress, label tak menyelamatkan.
- Opsi 3 ditolak — samakan semantik ke RPC `workspace_card_progress` di hub. Menambah query mahal untuk lobby yang harus ringan; juga mengekspor bug per-tenant orb tree ke lobby.

## Batas ruang lingkup

- **Hanya hub-card lobby**. Orb per-card di dalam tree pane (Goal/Strategi/Inisiatif/Rencana Aksi/Tugas) **tidak diubah** — itu memang capaian benar via RPC. Lihat [[workspace-card-progress]].
- Progress-line 3px di bawah hub-card (yang dulu ikut orb %) juga dihapus — tanpa orb, garis itu redundan.

## Lokasi kode

- `mobile/src/components/workspace-hub-card.tsx` — komponen hub-card.
- `mobile/src/lib/workspace-hub-stats.ts` — `derivePerformanceHubStats` / `deriveDevelopmentHubStats` (field `orbPercent` di-retire; `parentCount`/`childCount`/`activeCount` dipertahankan).
- `mobile/src/components/__tests__/workspace-hub-card.test.tsx` — regresi chip + a11y.
- `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx` — `[UI-N-002·6]` empty state chip.
