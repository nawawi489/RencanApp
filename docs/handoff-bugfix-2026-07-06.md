# Handoff — Lanjutan Bugfix Plan 2026-07-06

Konteks untuk sesi berikutnya. Sumber kebenaran progres: [bugfix-plan-2026-07-06.md](bugfix-plan-2026-07-06.md) + memory `bugfix-2026-07-06-execution` & `ws4-dcr05-revision-shipped`.

Diverifikasi live terhadap git/PR/DB pada penutupan sesi (2026-07-06). **Verifikasi ulang keadaan sebelum mulai** — beberapa hal berubah antar-sesi paralel.

---

> [!done] UPDATE sesi lanjutan (2026-07-06)
> - **WS-4** — sudah MERGED via **PR #36** (bukan lewat #34; origin/main maju ke `1cd734e`). 50/50 unit + 7/7 contract terverifikasi. 6 kasus Critic wajib dikonfirmasi (RLS-after-resubmit & emit self-suppress = by-design; sisanya tercakup). Test-hardening tambahan **PR #37** (BlockH: index D3 inverse, 8/8).
> - **WS-3c** — SELESAI, **PR #38**. Root cause BUKAN "param loss" melainkan embed `action_plan_submissions` AMBIGU → 300 PGRST201 (ada FK balikan `current_submission_id`). Fix disambiguasi `INSTANCE_SELECT` + stabilkan `useFocusEffect`. Diverifikasi live web.
> - **WS-3b** — SELESAI, **PR #39**. Fungsi produksi sudah benar; akar murni SEED. Fix seed + kontrak regresi (RED-verified). Diverifikasi live (login Dewi).
> - **Sisa nyata: WS-5** (butuh keputusan owner) + tech-debt opsional. Detail terkini: memory `bugfix-2026-07-06-execution`.

---

## 1. Keadaan repo (verified)

**Sudah MERGED ke `main`:**
- PR #32 — Menu V1.82 rebuild (+manual test reports). ⇒ `menu.tsx` V1.82 kini DI MAIN.
- PR #33 — WS-2 archive child-button lock (BUG-02).
- PR #34 — WS-3a Home instance-routing + WS-3d error-vs-empty.
- PR #35 — WS-1 menu-crash investigation (no-fix, doc-only).

**Belum di-PR (perlu tindakan):**
- **WS-4 / DCR-05** sudah diimplementasi penuh di commit `deb73ea` pada branch `fix/ap03-repeat-instance-flow`, TAPI branch itu PR-nya (#34) sudah merge di commit lebih lama (`26b8904`). `deb73ea` + merge `5937697` duduk di branch tanpa PR terbuka. **WS-4 butuh PR baru ke main.**

**Working tree kotor (tidak terkait bugfix):** `wiki/index.md` & `wiki/log.md` (M), `wiki/sources/kredensial-login.md` (untracked) — kemungkinan sisa wiki ingest. Jangan ikut-commit ke PR WS-4.

**Environment:** Supabase lokal **JALAN** (11 container: `supabase_db_supabase` dkk). DDL lokal via `docker exec -i supabase_db_supabase psql -U postgres -d postgres`. Org UUID lokal `52b0ebe1-…b70`, CEO `11111111-…001` (lihat `wiki/sources/kredensial-login.md`; password universal `rencan123`).

---

## 2. WS-4 (DCR-05 "Minta Revisi") — SUDAH DIIMPLEMENTASI, tinggal verifikasi + PR

Commit `deb73ea` (12 file, +1371/−47): migrasi 0038, contract test, layer data/hook/UI, unit test. Detail file di memory `ws4-dcr05-revision-shipped`.

**Tindakan sesi berikutnya:**
1. `cd mobile && npm test && npm run type-check` — konfirmasi 50/50 unit hijau + 0 error baru (baseline 5 tsc error pra-ada tetap: workspace-screen `target_result`, workspace.test/tree-progress-orb/workspace-kind-pill RNTL API — BUKAN regresi).
2. Jalankan contract test: `docker exec -i supabase_db_supabase psql -U postgres -d postgres < supabase/tests/0038_dcr05_minta_revisi_contract.sql` — harap 7/7 `ROLLBACK_OK`.
3. **Cek apakah 12 kasus tambahan Critic tdd-plan sudah dilipat** (memory shipped tak konfirmasi eksplisit). Yang wajib ada:
   - RLS visibility hilang setelah resubmit clear `approver_id` (AC-34 versi "setelah resubmit").
   - `emit_notification` self-suppress bila `action_plans.reviewer_id` NULL / = requestor.
   - OQ-8 terminal-guard untuk branch **`revision_requested`** juga (bukan hanya approved).
   - Double-resubmit race (FOR UPDATE + status-gate).
   - Index D3 inverse: setelah approve/reject terminal → create baru boleh.
   - Verifikasi constraint activity-log menerima type `deadline_change_resubmitted`.
   Bila belum ada → tambahkan (RED→GREEN) sebelum PR.
4. **Buka PR baru** WS-4 → main. **Rekomendasi: cherry-pick `deb73ea` ke branch bersih** `feat/dcr-request-revision` dari `main` terkini (branch `fix/ap03` sudah tercampur history #34 + merge). Jangan bawa perubahan wiki.

Spec & rencana: [spec-ws04-dcr-revision-2026-07-06.md](spec-ws04-dcr-revision-2026-07-06.md), [tdd-plan-ws04-dcr-revision-2026-07-06.md](tdd-plan-ws04-dcr-revision-2026-07-06.md).

---

## 3. Bug yang BENAR-BELUM dikerjakan

### WS-3c — layar `action-plan/instance/[id]` blank di web (prasyarat AP-03 end-to-end)
- **Kini TAK terblokir** (Supabase lokal hidup). Sebelumnya butuh web preview + backend.
- Struktur layar benar; kegagalan di routing/param web (`useLocalSearchParams` kosong pada direct URL, atau layout `(app)` menahan render).
- Langkah: `npm run web` → login → buka direct URL `/action-plan/instance/{id}` → `preview_network`/console. Slice unit yang bukan-vacuous: `id===undefined` → graceful (bukan blank/crash) — lihat Critic #11 di [tdd-plan-2026-07-06.md](tdd-plan-2026-07-06.md).
- Catatan: WS-3a (routing dari Home) sudah fix & merged; tapi flow di device tetap putus sampai 3c beres.
- Branch saran: `fix/ap03c-instance-web-blank` dari main.

### WS-3b — notif "Review Sekarang" instance salah `entity_type` (server/seed)
- Mapping klien di [notifications.tsx](../mobile/src/app/(app)/(tabs)/notifications.tsx) sudah benar. Akar di trigger/function/seed pembuat notif `review_request` untuk submission instance → set `entity_type='action_plan'` (harus `'action_plan_instance'` + `entity_id=<instance_id>`).
- Langkah: investigasi migrations pembuat notif + data seed; ubah; DB contract test (pola `supabase/tests/`). Menyentuh `supabase/` → PR terpisah dari mobile.
- Branch saran: `fix/ap03b-notif-instance-entity`.

### WS-5 — surface UI close-period admin (pemblokir PPL-07, SCORE-*, PPL-05)
- Backend RPC `close_period_snapshot` sudah ada ([0013_fase7_people_score.sql](../supabase/migrations/0013_fase7_people_score.sql)); UI belum.
- **Butuh keputusan owner (spec-first `sdd-plan`):** (a) lokasi surface (kandidat: layar Score Formula yang sudah tampilkan periode aktif); (b) pemegang izin; (c) bentuk konfirmasi destruktif (penutupan periode final per D9).
- Jalur: `sdd-plan` → `tdd-plan` (pola sama WS-4).

---

## 4. Tech debt baseline (bukan regresi, tapi mengotori gate)

Ada di `main` sejak sebelum bugfix ini:
- **5 error `tsc`**: deprecated RNTL a11y API (`getByA11yLabel`/`findByA11yLabel`) di workspace.test.tsx & tree-progress-orb.test.tsx; tipe `TestInstance`; field `target_result` tak ada di `GoalWithKpiCount` ([workspace-screen.tsx](../mobile/src/screens/workspace-screen.tsx) ~baris 765).
- **~16 suite jest gagal load** karena API RNTL usang yang sama.
- **Cara aman verifikasi regresi:** bandingkan terhadap baseline (stash), bukan angka absolut. Layak jadi cleanup pass terpisah (upgrade pola RNTL query + perbaiki tipe `target_result`).

---

## 5. Urutan yang disarankan sesi berikutnya

1. **Tutup WS-4**: verifikasi test (unit + contract) → lipat kasus Critic yang kurang → cherry-pick ke branch bersih → PR ke main.
2. **WS-3c** (kini unblocked, dampak tinggi): reproduksi web + fix param/gate → tutup flow AP-03 end-to-end.
3. **WS-3b** (DB/seed, PR terpisah).
4. **WS-5**: `sdd-plan` (butuh keputusan owner dulu) → `tdd-plan` → eksekusi.
5. (Opsional) **Tech-debt cleanup**: RNTL query API + `target_result` agar `tsc`/jest gate bersih.

---

## 6. Pola kerja yang terbukti di sesi ini (untuk konsistensi)

- Orkestrasi multi-agent: `sdd-plan` (spec) → `tdd-plan` (rencana) → eksekusi TDD manual.
- Selalu **verifikasi RED nyata** sebelum GREEN — hindari test vacuous (pelajaran WS-1 & WS-3d: baca root cause dulu; sinyal aritmatika bisa keliru).
- Test screen react-native-css: bungkus `render` & `fireEvent.press` dalam `act()` (update style `active:` async → cegah "overlapping act" bocor antar-test).
- Migrasi: verifikasi nama constraint aktual via `psql \d` sebelum `drop/add` (nama bisa auto-generate). Untuk DCR sudah terverifikasi bernama eksplisit.
- Branch per-WS; jangan bawa perubahan wiki/kredensial ke PR fitur.
