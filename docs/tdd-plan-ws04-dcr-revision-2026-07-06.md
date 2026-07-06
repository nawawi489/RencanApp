# Rencana TDD — WS-4 / DCR-05 "Minta Revisi" pada Deadline Change Request

Status: siap-eksekusi · Basis: `docs/spec-ws04-dcr-revision-2026-07-06.md` (FR-1..FR-25, AC-1..AC-36) · Owner-locked D1-D5 + resolusi OQ-8/OQ-9 (§8.1) · Tanggal: 2026-07-06

---

## 1. Ringkasan Fitur

Melengkapi kontrak governance PRD §25: reviewer punya **tiga** aksi atas Deadline Change Request (DCR) sebuah Action Plan — **Setujui**, **Tolak**, **Minta Revisi**. Saat ini hanya Setujui & Tolak yang terbangun, dan tombol Tolak memakai `reason:'Ditolak'` hardcode yang merusak jejak audit.

Owner-locked:
- **D1** status baru `revision_requested` pada `deadline_change_requests.status`.
- **D2** pengaju merevisi request yang **SAMA** (RPC `resubmit_deadline_change_request` 3-param), bukan buat baru.
- **D3** perluas partial unique index `dcr_one_pending_per_entity` ke `status IN ('pending','revision_requested')`.
- **D4** alasan **WAJIB** saat "Minta Revisi".
- **D5** perbaiki bug hardcode `reason='Ditolak'` → alasan asli reviewer.

Resolusi binding (§8.1):
- **OQ-8** guard di `review_deadline_change`: tolak `approved`/`revision_requested` bila `action_plans.status` terminal (`archived`/`cancelled`/`done`).
- **OQ-9** resubmit re-fetch `action_plans.deadline` **aktual** (bukan `old_deadline` snapshot) + `org_today` untuk validasi.

---

## 2. Status Blocker (diperiksa live sesi ini)

| Blocker handoff | Status | Bukti |
|---|---|---|
| Nama CHECK constraint tak diketahui (risiko DROP no-op) | ✅ RESOLVED | `deadline_change_requests_status_check`, `deadline_change_logs_action_check`, `notifications_type_check` (bernama), index `dcr_one_pending_per_entity WHERE status='pending'` — didump via `docker exec supabase_db_supabase psql` |
| Supabase lokal mati → DB test tak bisa jalan | ✅ USANG — stack HIDUP | `docker ps` menampilkan `supabase_db_supabase` + seluruh stack aktif → migrasi 0038 & contract test BISA dieksekusi sekarang |

Kedua blocker eksekusi sudah bersih. DB layer tidak perlu ditunda.

---

## 3. Kode Aktual (terverifikasi)

- `mobile/src/lib/governance-admin.ts`: `DCR_STATUS_LABEL` (24-28) hanya pending/approved/rejected; `reviewDeadlineChange` (70-81) tipe `'approved'|'rejected'`; **tidak ada** `resubmitDeadlineChangeRequest`.
- `mobile/src/hooks/use-governance-admin.ts`: `reviewM` tipe decision di **2 lokasi** (45 & 54); `isPending` = OR 2 mutation (56); **tidak ada** `resubmitM`.
- `mobile/src/app/(app)/deadline-change-request.tsx`: 2 tombol (Setujui/Tolak); **`reason:'Ditolak'` hardcode di 120**; onPress reviewer **tanpa** guard `if(isPending)return`; tidak merujuk `revision_reason`.
- `supabase/migrations/0014_...sql`: status CHECK (165) & action CHECK (179) inline unnamed; index (172-173) `WHERE status='pending'`; `notifications_type_check` (96-100) tanpa `deadline_change_revision_requested`; `review_deadline_change` whitelist (584) tolak selain approved/rejected. OQ-8/OQ-9 guard tidak ada.

---

## 4. Daftar File Test

| Layer | File | Status | Bisa hijau tanpa DB? |
|---|---|---|---|
| Data | `mobile/src/lib/__tests__/governance-admin.test.ts` | extend (ada) | ✅ ya |
| Hooks | `mobile/src/hooks/__tests__/use-governance-admin.test.tsx` | extend (ada) | ✅ ya (+ type-check) |
| UI | `mobile/src/app/(app)/__tests__/fase8-lifecycle-screens.test.tsx` | extend (ada) | ✅ ya (+ type-check) |
| DB contract | `supabase/tests/0038_dcr05_minta_revisi_contract.sql` | baru | ⚠️ butuh DB (SUDAH HIDUP) |

---

## 5. Urutan Langkah Red → Green → Refactor

1. **RED (pra-migrasi)** — dump nama constraint/index aktual via psql (SELESAI; hasil di §2).
2. **RED** data layer — `governance-admin.test.ts`: DCR-DL-1/4/5/6. `npm test` + `npm run type-check` merah.
3. **GREEN** data layer — `governance-admin.ts`: `DCR_STATUS_LABEL.revision_requested`, `type DcrDecision`, perluas `reviewDeadlineChange`, tambah `resubmitDeadlineChangeRequest`.
4. **RED** data layer (tipe) — DCR-DL-2/3 (decision='revision_requested' + default reason ''). Verifikasi type-check hijau.
5. **RED** hooks — `use-governance-admin.test.tsx`: reviewRequest revision (call+invalidate+error), resubmitRequest call, resubmit invalidation prefix, isPending OR resubmit.
6. **GREEN** hooks — `use-governance-admin.ts`: import resubmit, ubah tipe reviewM 2 lokasi ke DcrDecision, tambah resubmitM + resubmitRequest, isPending OR 3.
7. **RED** UI — `fase8-lifecycle-screens.test.tsx`: AC-26..AC-33 (tombol ke-3, alasan wajib Minta Revisi & Tolak, hapus 'Ditolak', badge 'Perlu Revisi', form revisi pengaju, resubmit≠create, reviewer diam saat revision, anti double-submit).
8. **GREEN** UI — `deadline-change-request.tsx`: STATUS_TONE.revision_requested, tombol Minta Revisi, input alasan Tolak asli, guard isPending, form revisi inline pengaju + revision_reason read-only. Baca `DESIGN.md §4` dulu.
9. **GREEN** DB migrasi — `0038_dcr05_minta_revisi.sql` (ALTER DDL semua dulu → RPC). status/action/index/notif CHECK + revision_reason + review branch (+OQ-8) + resubmit RPC (+OQ-9 re-fetch). Apply via psql.
10. **RED→GREEN** DB contract — `0038_..._contract.sql` (pola fase8: DO + set_config jwt + user transient + ROLLBACK_OK). Blok A-F. Jalankan per-DO.
11. **REFACTOR** — regen `database.types.ts` (revision_reason; kosmetik), rapikan state input per-request, sinkron DESIGN.md.
12. **REFACTOR (verifikasi akhir)** — `npm test` + `npm run type-check` + seluruh blok contract 0038 keluar `ROLLBACK_OK`.

---

## 6. Strategi Mocking (per layer)

- **Data layer**: `jest.mock('../supabase', () => ({ supabase: { from: mockFrom, rpc: mockRpc } }))`. Happy `{data:null,error:null}`; error `{error:{message}}` → `rejects.toEqual`. Label map tanpa mock. Tidak perlu auth/native (RPC menegakkan server-side).
- **Hooks**: `jest.mock('@/lib/governance-admin')` (bukan supabase) + `QueryClient` nyata + wrapper `createElement(QueryClientProvider,{client:qc})`. Invalidation via `jest.spyOn(qc,'invalidateQueries')`. Mutation dalam `await act`. isPending via `mockImplementation(()=>new Promise(()=>{}))` + `waitFor`. **Type-check adalah gate merah untuk kontrak decision:'revision_requested'.**
- **UI**: mock `@/lib/supabase`, `@/hooks/use-profile` (profile+can), `@/hooks/use-governance-admin` (createRequest/reviewRequest/**resubmitRequest**/isPending), `expo-router` (Stack.Screen/useRouter/useLocalSearchParams). Override return per-test. Interaksi `fireEvent.changeText/press`, query `findByText/queryByText/getByLabelText/getByDisplayValue`.
- **DB contract**: pola `fase8_governance_admin_contract.sql` — `DO $$...$$` per-blok, `set_config('request.jwt.claims',...)` untuk auth.uid(), user transient `insert into auth.users`, assert exception via `exception when others then if sqlerrm like '%...%'`, akhiri `raise 'ROLLBACK_OK: ...'`. Jalankan `docker exec supabase_db_supabase psql -f` atau MCP execute_sql per-DO.

---

## 7. Risiko Utama

1. **Nama constraint (RESOLVED)** — pakai `deadline_change_requests_status_check` / `deadline_change_logs_action_check` persis; salah nama → DROP no-op + constraint duplikat bentrok.
2. **Supabase lokal HIDUP** (kontra handoff) — DB layer tidak perlu ditunda.
3. **Atomicity 0038** — semua ALTER CHECK sebelum RPC; terbalik → 23514 rollback.
4. **OQ-9 kontradiksi internal spec** — ikuti §8.1 (re-fetch `action_plans.deadline`), bukan blok kode §5.3 (snapshot `old_deadline`).
5. **OQ-8 tak ada di §5.2** — wajib tambah guard terminal untuk approved & revision_requested.
6. **Type-check ≠ runtime** — banyak test merah HANYA di `npm run type-check`; wajib jalankan tiap fase.
7. **State input alasan per-request** — scope ke `request.id`, jangan single useState (bocor antar-baris).
8. **Regresi 44 test existing** — perluasan union additive, tapi `npm test` penuh wajib.
9. **isPending:false hardcoded** di factory mock UI existing — refactor jadi var mutable untuk AC-33.
10. **activity/notif type resubmit** — verifikasi `deadline_change_resubmitted` (write_activity) diterima constraint sebelum menulis RPC (belum diverifikasi sesi ini).

---

## 8. Gate Exit (AGENTS.md)

Dari `mobile/`: `npm test` hijau + `npm run type-check` 0 error. Dari root: seluruh blok `0038_..._contract.sql` keluar `ROLLBACK_OK`. Baca `DESIGN.md §4` sebelum menyentuh UI (touch target ≥44px, solid+putih = `brand-dark #1564b3`).