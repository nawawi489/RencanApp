---
type: concept
tags: [workspace, ui, tdd, orb, progress, wsa-15, ac-22, v1.82]
updated: 2026-07-03
sources: 1
---

# Workspace Progress Orb — TDD Plan (WSA-15 / AC 22)

> [!done] Status: **IMPLEMENTED 2026-07-03** — migration 0037 (lokal), `useCardProgress`, `TreeOrbCell` di 7 row. 91 suite/843 tes pass, verified live. Lihat `wiki/log.md`.

Rencana TDD untuk item lock terbesar yang tersisa dari [[workspace-lock-sprint-plan]]: progress orb 50px di kolom kanan tiap card tree Workspace (spec §6.4–6.8 & §10). Disusun via orkestrasi multi-agent `tdd-plan`. **Verdict critic: `perlu-perbaikan`** — ada keputusan produk/arsitektur yang harus dikunci owner sebelum tahap green.

## Ringkasan fitur

Setiap card tree menampilkan orb 50px: angka `%` + label bawah (**"Capaian"** untuk Goal/KPI Area, **"Progress"** untuk lainnya) + warna via `treeOrbColor` (≥70 `#14845c` good, ≥35 `#b76b00` risk, <35 `#c93434` bad). Prinsip **no misleading numbers**: id tanpa data → orb tidak dirender, kolom kanan tampil `—`.

## Arsitektur terpilih

**RPC server rollup** `workspace_card_progress(p_card_ids uuid[]) RETURNS TABLE(card_id uuid, progress int)`, **SECURITY INVOKER** (hormati RLS induk+anak, `SET search_path = ''`). Alasan: hitung capaian induk = agregasi status anak; tree lazy-fetch → menghitung di klien per row collapsed = N+1. Action Plan (leaf) dihitung klien via `computeActionPlanProgress` (status/compliance). Definisi capaian **wajib identik** `mobile/src/lib/progress.ts` (satu sumber kebenaran, sama dgn header detail UI-G-001).

## Sudah ada (tidak dibuat ulang)
- `TreeProgressOrb({value,label})` + `treeOrbColor` di `mobile/src/components/ui.tsx`.
- `ratioDoneOfChildren`, `ratioActiveOfChildren`, `computeActionPlanProgress`, `childrenSublabel` di `progress.ts`.
- 7 row komponen di `workspace.tsx` — kolom kanan sudah dikosongkan.

## File test
| Layer | File | Isi |
|---|---|---|
| data | `mobile/src/lib/__tests__/workspace-progress.test.ts` | `treeOrbLabel` (3) + `listWorkspaceCardProgress` (6) |
| hooks | `mobile/src/hooks/__tests__/use-workspace-progress.test.tsx` | `useCardProgress` + invalidasi activate |
| ui | `mobile/src/app/(app)/(tabs)/__tests__/workspace-progress-orb.test.tsx` | 7 row orb + label + warna + null-fallback |

## Urutan red → green → refactor
1. RED `treeOrbLabel` (util murni) → 2. GREEN peta terpusat (default `'Progress'`).
3. RED `listWorkspaceCardProgress` (mock `../supabase` rpc) → 4. GREEN di `cards.ts` + modul tipis `workspace-progress.ts` (`fetchCardProgress`).
5. RED migration RPC (kontrak nama/arg dikunci test data) → 6. GREEN isi RPC INVOKER + apply via supabase MCP + regen `database.types.ts`.
7. RED `useCardProgress` + invalidasi → 8. GREEN hook (queryKey `['workspace_card_progress', sortedIds]`, `enabled: ids.length>0`, `progressOf`) + `invalidateQueries` di semua `activate`.
9. RED UI 7 row (salin harness `workspace.test.tsx` + mock `useCardProgress`) → 10. GREEN wiring `TreeProgressOrb`; induk `progressOf(id)`, AP `computeActionPlanProgress`; null → `—`.
11. REFACTOR ekstrak `<TreeOrbCell/>`; `npm test` penuh (~90 suite, cek W08 `countOpacityHalf` tak regres).
12. REFACTOR komentar saling-tunjuk progress.ts ↔ migration; verifikasi lazy + invalidasi.

## ✅ Keputusan owner (2026-07-03) — dikunci

1. **Rumus induk = `% anak LANGSUNG berstatus done`** (`ratioDoneOfChildren`, identik header detail; non-rekursif). Leaf Action Plan tetap `computeActionPlanProgress`. Label "Capaian" (Goal/KPI) & "Progress" (lain) berbagi rumus %done; "Progress" induk ≠ heuristik AP (didokumentasikan).
2. **SECURITY INVOKER** — capaian = fungsi anak yang **terlihat** oleh pemanggil (terima variasi antar-peran demi aman lintas-org).
3. **Induk tanpa anak → `0%`** (bukan `—`), konsisten header detail. `—` hanya saat query error/undefined.
4. AP repeat: fetch compliance atau fallback `—` (jangan 0%). Invalidasi progress di semua mutation status (activate/submit/approve/archive). Migration `0037+`. Agregasi anak langsung saja.

## ⚠️ Keputusan terbuka (critic — blokir sebelum green) [RESOLVED di atas]

1. **Definisi angka per card induk (INTI).** Codebase kini punya 3 definisi capaian yang hidup: Goal detail pakai `ratioActive` (Progress) + `ratioDone` (Capaian); KPI Area detail pakai `ratioDoneOfChildren(strategies)`; Home pakai `target_numeric` gap. Leaf AP orb pakai `computeActionPlanProgress` (submitted=80) sedangkan rollup induk `ratioDoneOfChildren` (submitted=0 done) → Initiative bisa tampil 0% padahal satu-satunya anak AP = 80%. Harus dipilih satu definisi per label, konsisten header detail. **Rekomendasi:** semua induk = `%done anak LANGSUNG` (bukan rekursif), label "Capaian" (Goal/KPI) & "Progress" (lain) berbagi rumus %done; leaf AP tetap `computeActionPlanProgress`. Dokumentasikan bahwa "Progress" induk = %anak-selesai, beda makna dgn AP heuristik.
2. **Semantik visibilitas RLS.** INVOKER → capaian dihitung hanya atas anak yang lolos RLS pemanggil → angka bisa beda antar peran untuk card yang sama. Objektif (semua anak) butuh DEFINER dgn filter org hati-hati. **Rekomendasi:** INVOKER (aman dari kebocoran lintas-org); terima "capaian = fungsi anak yang terlihat" + dokumentasikan.
3. **Null vs 0.** Induk tanpa anak non-archived: `ratioDoneOfChildren` = 0 (row ADA). Plan bilang null→`—`. Header detail tampil orb 0 + sublabel "Belum ada turunan". **Rekomendasi:** samakan dgn header detail — tampil `0%` (bukan `—`) saat anak kosong; `—` hanya saat query error/undefined.
4. **Action Plan repeat.** `compliancePercent` BUKAN kolom ter-fetch di `ActionPlanWithPeople` → AP repeat bisa jatuh ke 0% menyesatkan. **Rekomendasi:** fetch compliance untuk AP repeat, atau fallback `—` (jangan 0%).
5. **Invalidasi eksekusi.** Capaian induk berubah saat status AP berubah lewat submit/approve (layar review) & archive — bukan hanya `activate`. Semua mutation itu harus `invalidateQueries(['workspace_card_progress'])`.
6. **Migration numbering.** Migrasi terakhir aktual = `0036_fix_grant_public_tables.sql` → file baru harus `0037+` (bukan 0033).
7. **Agregasi ANAK LANGSUNG saja** (konsisten header detail, mis. dev-area = `ratioDoneOfChildren(problemStatements)`), tidak rekursif.
8. **Regresi & boundary:** orb tak boleh menambah `opacity:0.5` (di luar `PastDim`, W08); test warna harus single-orb (isolasi) karena `UNSAFE_getAllByType(Circle)` ambigu saat banyak orb; boundary treeOrbColor 34/35/69/70/100; regen `database.types.ts` terkontrol + tsc.
