# Spec — WS-4 / DCR-05: Aksi Reviewer "Minta Revisi" pada Deadline Change Request

Status: siap-TDD · Selaras PRD **V1.8.2** (root) · Basis kode terverifikasi: `mobile/src/app/(app)/deadline-change-request.tsx`, `mobile/src/lib/governance-admin.ts`, `mobile/src/hooks/use-governance-admin.ts`, `supabase/migrations/0014_fase8_governance_admin.sql`, `mobile/src/lib/database.types.ts`. Owner-locked **D1–D5**.

---

## 1. Problem & Goals

### 1.1 Problem
PRD §25 menetapkan **tiga** aksi reviewer atas Deadline Change Request (DCR) sebuah Action Plan: **Setujui**, **Tolak**, **Minta revisi alasan**. Implementasi saat ini hanya membangun Setujui & Tolak. Akibatnya:

1. **PRD §25 belum lengkap.** Reviewer tidak punya jalur "kembalikan untuk diperbaiki"; satu-satunya jalan saat usulan kurang tepat adalah menolak permanen, memaksa pengaju membuat request baru dari nol.
2. **Bug laten hardcode alasan penolakan.** `deadline-change-request.tsx:120` memanggil `reviewRequest` dengan `reason: 'Ditolak'` hardcode. RPC menyimpannya ke `rejection_reason`, `deadline_change_logs`, `activity_logs`, dan notifikasi (0014:622-631) — nilai konstanta merusak jejak audit governance (Owner D5).

Gap teknis terverifikasi terhadap 0014:
- `deadline_change_requests.status` CHECK = `('pending','approved','rejected')` (0014:165) — inline **tanpa nama** eksplisit.
- RPC `review_deadline_change` menolak `p_decision` selain `'approved'|'rejected'` (0014:584).
- Index parsial `dcr_one_pending_per_entity` hanya `WHERE status='pending'` (0014:172-173).
- `deadline_change_logs.action` CHECK = `('submitted','approved','rejected','cancelled')` (0014:179) — inline tanpa nama.
- `notifications_type_check` (bernama eksplisit, 0014:96-100) tidak memuat `deadline_change_revision_requested`. **Terverifikasi hanya didefinisikan di 0014** — tidak ada migrasi 0015–0037 yang me-redefine → aman untuk copy+append.
- Tidak ada RPC resubmit; `reviewDeadlineChange` bertipe `'approved'|'rejected'`; `DCR_STATUS_LABEL` tidak punya `revision_requested`.
- `database.types.ts` mengetik `deadline_change_requests.status` sebagai **`string`** (bukan union literal) — regen TIDAK memberi enforcement type-safety.

### 1.2 Goals
1. Aksi reviewer **"Minta Revisi"** (PRD §25) dengan status baru `revision_requested` (D1) dan **alasan WAJIB** (D4).
2. **Loop revisi tanpa request baru**: pengaju merevisi request yang **SAMA** (edit `reason`/`new_deadline`) lalu resubmit → status kembali `'pending'` (D2), via RPC baru `resubmit_deadline_change_request` (requestor-only).
3. **Cegah request ganda per AP** selama siklus revisi: perluas index parsial ke `WHERE status IN ('pending','revision_requested')` (D3).
4. **Perbaiki bug hardcode `'Ditolak'`** (D5): UI Tolak menampung alasan asli reviewer.
5. **Pertahankan seluruh invarian governance**: RLS SELECT-only + write via RPC `SECURITY DEFINER`, anti-self-approval, advisory lock, append-only, backend-mandatory (PRD §41).

### 1.3 Nilai
Melengkapi kontrak governance §25 (reviewer punya jalur "perbaiki"), konsisten dengan **loop review** §24.3, memulihkan integritas jejak audit (menghapus hardcode `'Ditolak'`), tanpa menambah utang scope (hanya deadline Action Plan).

---

## 2. Non-Goals

1. **BUKAN storage-versioning ala `action_plan_submissions`.** Resubmit meng-UPDATE baris request yang sama (D2), tidak menambah baris/kolom `version_number`. Riwayat lintas putaran dilacak lewat `deadline_change_logs` (append-only).
2. **Tidak memperluas DCR ke entitas selain Action Plan.** `entity_type` tetap `'action_plan'` (0014:156). Repeat Instance & Level Induk di luar scope (OQ-5).
3. **Tidak menyentuh evidence locking / submission bukti.**
4. **Tidak melonggarkan invarian governance** — hanya memperluas ke jalur `revision_requested`.
5. **Tidak menambah status DCR selain `revision_requested`.**
6. **Tidak mewajibkan alasan untuk `approved`** — hanya `rejected` (existing) & `revision_requested` (baru).
7. **Tidak menambah aksi "Catatan" §24.3** — §25 hanya tiga aksi; "Catatan" bukan gap.
8. **Tidak mengubah permission menjadi per-baris/ber-scope.**
9. **Tidak menambah guard baru untuk approve saat AP terminal** (OQ-8).

> [!important] Koreksi framing (grill must-fix)
> DCR meniru **LOOP review** §24.3 (Minta Revisi → pengaju perbaiki → resubmit → review ulang) tetapi **SENGAJA BERBEDA** dari **storage-versioning** §E.5 (yang membuat versi baru tiap submit). DCR meng-UPDATE baris yang sama (D2). Frasa "cermin submission versioning" TIDAK dipakai — yang benar: "meniru loop review-nya, bukan versioning-nya". Ini berlaku untuk seluruh dokumen.

---

## 3. User Stories

Model peran: governance DCR berbasis **permission `review_deadline_changes`, bukan role/jabatan**. Peran fungsional: **Pengaju/PIC** (`requestor_id`) dan **Reviewer** (pemegang permission, non-requestor, dijaga `dcr_requestor_ne_approver` + cek RPC anti-self). CEO vs Manager TIDAK dibedakan di jalur DCR (OQ-6).

- **US-1 (baseline)** — PIC ajukan perubahan deadline → `pending` (existing; hanya terdampak index D3).
- **US-2 (inti)** — Reviewer pilih "Minta Revisi" + alasan wajib → `revision_requested`; deadline AP tidak berubah; anti-self dipertahankan.
- **US-3 (bugfix D5)** — Reviewer Tolak dengan alasan penolakan **asli** (bukan `'Ditolak'`).
- **US-4** — Pengaju melihat status "Perlu Revisi" + alasan reviewer; tahu request masih hidup.
- **US-5 (D2)** — Pengaju edit `reason`/`new_deadline` pada request SAMA lalu "Kirim Revisi" → `pending`.
- **US-6 (D3)** — Sistem memblokir request kedua per AP selama `pending` ATAU `revision_requested`.
- **US-7** — Reviewer review ulang hasil resubmit (loop tertutup, append-only chain).

---

## 4. Functional Requirements

Prioritas: **MUST** wajib exit · **SHOULD** disarankan · **MUST NOT** larangan invarian.

### A. Aksi "Minta Revisi"
- **FR-1 (MUST)** Reviewer dapat mengambil salah satu dari **tiga** keputusan atas DCR `pending`: `approved`, `rejected`, `revision_requested`.
- **FR-2 (MUST)** "Minta Revisi" mengubah `pending → revision_requested`; deadline AP **tidak** berubah.
- **FR-3 (MUST · alasan-wajib)** Alasan **wajib** saat `revision_requested` (RPC raise bila kosong/whitespace).
- **FR-4 (MUST)** `review_deadline_change` memperluas whitelist ke `('approved','rejected','revision_requested')`. Branch `revision_requested`: set `status='revision_requested'`, **`approver_id=auth.uid()`**, `responded_at=now()`, `revision_reason=trim(p_reason)`; log `revision_requested`; activity; notif ke requestor.

> [!note] Resolusi kontradiksi FR-4 vs draft data-contract (grill governance must-fix)
> Branch `revision_requested` **SET `approver_id`** (bukan null). Alasan: (a) jejak akuntabilitas siapa reviewer yang minta revisi terekam di baris; (b) RLS `dcr_select` (0014:316-320) memberi visibilitas via `approver_id = auth.uid()` sehingga reviewer tetap melihat request meski permission dicabut kemudian. `approver_id` di-clear saat resubmit (FR-6). Constraint `dcr_requestor_ne_approver` terpenuhi (reviewer ≠ requestor).

### B. Resubmit pengaju
- **FR-5 (MUST)** Pengaju dapat edit `reason`/`new_deadline` pada request SAMA lalu resubmit. **MUST NOT** membuat baris request baru.
- **FR-6 (MUST)** Resubmit via RPC baru **`resubmit_deadline_change_request(p_request_id, p_new_deadline, p_reason)`** (3 param, dikunci sesuai D2 — lihat catatan scope). Atomik: update `reason`/`new_deadline` → `status='pending'` → clear `approver_id=NULL`, `responded_at=NULL`, `revision_reason=NULL` → log `resubmitted` (dengan payload bermakna) → notif ke reviewer.
- **FR-7 (MUST · requestor-only)** Tolak bila `auth.uid() <> requestor_id` (termasuk pemegang `manage_others_cards` — strictly requestor-only, OQ).
- **FR-8 (MUST · status-gate)** Tolak bila `status <> 'revision_requested'`; `SELECT ... FOR UPDATE`.
- **FR-9 (MUST · validasi server)** Validasi ulang di **server**: `p_new_deadline > v_req.old_deadline` (snapshot tersimpan, bukan input) **dan** `>= org_today(org)` **dan** `reason` non-kosong (cermin `create_deadline_change_request` 0014:551-557). PRD §41 backend-mandatory.

> [!important] Keputusan scope RPC resubmit (grill produk+eng must-fix)
> Signature **dikunci ke 3 param** `(p_request_id, p_new_deadline, p_reason)` sesuai owner D2 ("edit reason/new_deadline"). Perluasan ke `p_impact`/`p_evidence_note` **TIDAK** ditulis sebagai default DDL — tetap **open question murni** (OQ-2). Semua bagian dokumen merujuk signature 3-param yang sama.

### C. Blokir request ganda
- **FR-10 (MUST · satu-aktif)** Satu DCR aktif per AP: perluas index `dcr_one_pending_per_entity` ke `WHERE status IN ('pending','revision_requested')` (DROP+RECREATE — predicate tak bisa di-ALTER in-place).
- **FR-11 (MUST)** Konsekuensi: `create_deadline_change_request` untuk AP yang punya request aktif gagal via unique violation.

### D. Cleanup D5
- **FR-12 (MUST)** UI "Tolak" **MUST NOT** kirim `reason` hardcode; sediakan input alasan asli. Hapus literal `reason: 'Ditolak'` (0014-UI:120).
- **FR-13 (MUST)** Alasan input reviewer masuk `rejection_reason` + log `rejected.note` (perilaku RPC sudah benar; hanya asal `p_reason` berubah).

### E. Notifikasi
- **FR-14 (MUST)** `notifications_type_check` menambah `'deadline_change_revision_requested'` (array final = **superset** array 0014 + nilai baru).
- **FR-15 (MUST)** Emisi: Minta Revisi → `deadline_change_revision_requested` ke pengaju; Resubmit → `deadline_change_requested` (reuse; OQ-3) ke reviewer (`action_plans.reviewer_id`); `approved`/`rejected` seperti existing.

### F. Audit append-only
- **FR-16 (MUST)** `deadline_change_logs.action` CHECK menambah `'revision_requested'` & `'resubmitted'`.
- **FR-17 (MUST · append-only)** Trigger `dcl_no_delete`/`dcr_no_delete` dipertahankan; rantai `submitted → revision_requested → resubmitted → approved/rejected`.
- **FR-18 (MUST — dinaikkan dari SHOULD, grill must-fix)** Log `revision_requested` merekam `note`=alasan; log `resubmitted` merekam **payload bermakna** (`new_deadline` + `reason` baru) di `note`/detail. Karena UPDATE in-place menimpa `reason`/`new_deadline` lama, log adalah **satu-satunya** jejak nilai antar-putaran — maka log wajib lengkap agar Goal "integritas audit dipulihkan" tercapai untuk siklus multi-revisi.

### G. Anti-self & permission
- **FR-19 (MUST · anti-self)** Anti-self berlaku untuk **semua** decision termasuk `revision_requested`: bila `requestor_id = auth.uid()` → insert `governance_violations` (severity critical) lalu raise. Cek berada sebelum percabangan decision (0014:594-600).
- **FR-20 (MUST · permission)** `review_deadline_changes` tetap gatekeeper untuk ketiga keputusan; tidak ada scope per-row.

> [!note] Urutan gate anti-self vs permission (grill eng+governance must-fix)
> Urutan existing dipertahankan: status guard (590) → permission (591) → anti-self (594). Konsekuensi: requestor yang **tidak** memegang `review_deadline_changes` ditolak oleh permission wall lebih dulu dan `governance_violations` **tidak** tercatat. AC-11 karenanya berlaku saat requestor **juga** pemegang permission. Menaikkan anti-self di atas permission adalah OQ (tidak diubah tanpa keputusan owner).

### H. Data layer & UI
- **FR-21 (MUST)** `DcrDecision = 'approved'|'rejected'|'revision_requested'`; `reviewDeadlineChange` diperluas; `resubmitDeadlineChangeRequest({requestId,newDeadline,reason})` baru; `DCR_STATUS_LABEL.revision_requested='Perlu Revisi'`.
- **FR-22 (MUST · type)** Tipe `decision` di `useDeadlineChangeActions` diperbarui di **KEDUA** lokasi `reviewM` (mutationFn arg ~45 & return fn ~54) + callsite UI. `resubmitM` ditambah; `isPending` = OR 3 mutation; invalidation prefix `['deadline_change_requests']`.

> [!note] `database.types.ts` (grill eng must-fix)
> `status` di-generate sebagai `string` (database.types.ts:33) — regen **TIDAK** mengubah tipe & bukan sumber type-safety. Type-safety berasal dari union `DcrDecision` hand-authored. Regen types **opsional/kosmetik**, bukan prasyarat AC.

- **FR-23 (MUST · a11y)** UI tombol ke-3 "Minta Revisi" (saat `canReview && status='pending' && !isSelf`) + input alasan wajib untuk Minta Revisi & Tolak. Solid+teks putih = `brand-dark` `#1564b3`; touch target ≥44px (DESIGN.md §4). `STATUS_TONE.revision_requested='warn'`.
- **FR-24 (MUST)** Untuk pengaju saat `revision_requested & isSelf`: form revisi inline (edit `new_deadline`/`reason`, prefill) + tombol "Kirim Revisi" → `resubmitDeadlineChangeRequest`; alasan revisi reviewer (`revision_reason`) tampil read-only sebagai konteks.
- **FR-25 (MUST · anti double-submit)** Aksi Setujui/Minta-Revisi/Tolak mengecek `if(isPending)return` sebelum memanggil `reviewRequest` (sejajar `handleSubmit:35`).

---

## 5. Data Contracts

Invarian dipertahankan: write via RPC `SECURITY DEFINER set search_path=''`, anti-self, advisory lock, append-only, RLS SELECT-only.

### 5.1 Migration `supabase/migrations/0038_dcr05_minta_revisi.sql`
Migrasi tunggal (0037 = terakhir). **Urutan intra-file: semua ALTER DDL SEBELUM REPLACE/CREATE RPC** (agar RPC yang menulis enum baru tidak gagal 23514).

> [!warning] Pra-migrasi WAJIB (grill eng+governance must-fix — blocker)
> Constraint `status` (0014:165) & `action` (0014:179) **inline tanpa nama** → Postgres auto-generate. Verifikasi nama aktual via `docker exec supabase_db_supabase psql` → `\d deadline_change_requests` & `\d deadline_change_logs` sebelum menulis `drop constraint if exists`. Jika nama salah, `drop if exists` diam-diam no-op lalu `add constraint` membuat constraint kedua yang bentrok. `notifications_type_check` **sudah bernama eksplisit** (0014:96) → aman.

1. **status CHECK** → `('pending','revision_requested','approved','rejected')`.
2. **action CHECK** → `(...,'revision_requested','resubmitted')`.
3. **ADD COLUMN** `revision_reason text` (nullable) pada `deadline_change_requests`.

> [!important] Kolom `revision_reason` (grill produk+governance must-fix)
> Alasan Minta Revisi disimpan di **kolom baru `revision_reason`** (BUKAN reuse `rejection_reason` yang bermakna "ditolak permanen" — menyesatkan secara semantik & audit). Ini memungkinkan `listDeadlineChangeRequests` (yang `select('*')`, tidak join log) mengambil alasan untuk ditampilkan inline ke pengaju (FR-24). Alasan **juga** ditulis ke `deadline_change_logs.note` (append-only chain). `revision_reason` di-clear saat resubmit.

4. **DROP+RECREATE index** `dcr_one_pending_per_entity` predicate `WHERE status IN ('pending','revision_requested')`.
5. **notifications_type_check** = array 0014 (9 tipe + 3 DCR) + `'deadline_change_revision_requested'` (superset).
6. **`create or replace review_deadline_change`** (signature tetap → revoke existing berlaku): whitelist 3 decision; branch `revision_requested` (§5.2); alasan wajib untuk `rejected`+`revision_requested`; anti-self+lock+permission dipertahankan.
7. **`create resubmit_deadline_change_request`** (§5.3); `revoke execute ... from public, anon`.

### 5.2 RPC `review_deadline_change` — branch baru
```
-- (dalam whitelist: p_decision in ('approved','rejected','revision_requested'))
-- alasan wajib: if p_decision in ('rejected','revision_requested') and trim(p_reason)='' then raise
elsif p_decision = 'revision_requested' then
  update public.deadline_change_requests
    set status='revision_requested', approver_id=auth.uid(),
        responded_at=now(), revision_reason=trim(p_reason)
    where id = p_request_id;
  insert into public.deadline_change_logs(organization_id,request_id,action,actor_id,note)
    values (v_req.organization_id, p_request_id, 'revision_requested', auth.uid(), trim(p_reason));
  perform public.write_activity('action_plan', v_req.entity_id, 'deadline_change_revision_requested',
    jsonb_build_object('request_id', p_request_id, 'reason', trim(p_reason)));
  perform public.emit_notification(v_req.organization_id, v_req.requestor_id, auth.uid(),
    'deadline_change_revision_requested', 'action_plan', v_req.entity_id,
    'Perubahan Deadline Perlu Revisi', 'Reviewer meminta revisi pada permintaan Anda.');
  -- action_plans.deadline TIDAK diubah
```
Branch `approved`/`rejected` tidak berubah (0014:606-632).

### 5.3 RPC `resubmit_deadline_change_request` (baru, 3 param)
```
create or replace function public.resubmit_deadline_change_request(
  p_request_id uuid, p_new_deadline date, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_req public.deadline_change_requests; v_reviewer uuid;
begin
  select * into v_req from public.deadline_change_requests where id = p_request_id for update;
  if not found then raise exception 'Permintaan tidak ditemukan.'; end if;
  if v_req.requestor_id <> auth.uid() then
    raise exception 'Hanya pengaju yang dapat mengirim ulang permintaan.'; end if;
  if v_req.status <> 'revision_requested' then
    raise exception 'Permintaan ini tidak dalam status perlu revisi.'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Alasan wajib diisi.'; end if;
  if p_new_deadline <= v_req.old_deadline then
    raise exception 'Tanggal baru tidak boleh lebih awal dari deadline saat ini.'; end if;
  if p_new_deadline < public.org_today(v_req.organization_id) then
    raise exception 'Tanggal baru tidak boleh di masa lalu.'; end if;
  update public.deadline_change_requests
    set status='pending', new_deadline=p_new_deadline, reason=trim(p_reason),
        approver_id=null, responded_at=null, revision_reason=null
    where id = p_request_id;
  insert into public.deadline_change_logs(organization_id,request_id,action,actor_id,note)
    values (v_req.organization_id, p_request_id, 'resubmitted', auth.uid(),
      'new_deadline='||p_new_deadline::text||'; reason='||trim(p_reason));  -- payload bermakna (FR-18)
  perform public.write_activity('action_plan', v_req.entity_id, 'deadline_change_resubmitted',
    jsonb_build_object('request_id', p_request_id, 'new_deadline', p_new_deadline, 'reason', trim(p_reason)));
  select reviewer_id into v_reviewer from public.action_plans where id = v_req.entity_id;
  perform public.emit_notification(v_req.organization_id, v_reviewer, auth.uid(),
    'deadline_change_requested', 'action_plan', v_req.entity_id,
    'Permintaan Perubahan Deadline (Revisi)', 'Permintaan perubahan deadline direvisi dan menunggu review.');
end; $$;
revoke execute on function public.resubmit_deadline_change_request(uuid, date, text) from public, anon;
```
Immutability: hanya `new_deadline/reason/status/approver_id/responded_at/revision_reason` disentuh; `entity_id/entity_type/requestor_id/organization_id` tidak diubah (AC-20).

### 5.4 Data layer `governance-admin.ts`
```ts
export const DCR_STATUS_LABEL: Record<string,string> = {
  pending:'Menunggu Review', revision_requested:'Perlu Revisi',
  approved:'Disetujui', rejected:'Ditolak',
};
export type DcrDecision = 'approved' | 'rejected' | 'revision_requested';
export async function reviewDeadlineChange(requestId:string, decision:DcrDecision, reason?:string) { /* rpc review_deadline_change */ }
export type ResubmitDeadlineChange = { requestId:string; newDeadline:string; reason:string };
export async function resubmitDeadlineChangeRequest(i:ResubmitDeadlineChange) {
  const { error } = await supabase.rpc('resubmit_deadline_change_request', {
    p_request_id:i.requestId, p_new_deadline:i.newDeadline, p_reason:i.reason });
  if (error) throw error;
}
```
`revision_reason` terbawa oleh `select('*')` di `listDeadlineChangeRequests` (regen types agar Row memuat kolom baru — kosmetik).

### 5.5 Hook `use-governance-admin.ts`
`reviewM` tipe `decision:DcrDecision` di **2 lokasi**; `resubmitM = useMutation({ mutationFn: resubmitDeadlineChangeRequest, onSuccess: () => qc.invalidateQueries({queryKey:['deadline_change_requests']}) })`; expose `resubmitRequest`; `isPending = createM.isPending||reviewM.isPending||resubmitM.isPending`.

### 5.6 Dampak RLS
Tidak ada policy baru. Semua write via RPC `SECURITY DEFINER`. `dcr_select`/`dcl_select` (0014:315-329) cukup — status baru tidak mengubah predicate; `approver_id` di-set pada `revision_requested` menjaga visibilitas reviewer (AC-34). Trigger append-only dipertahankan; resubmit = UPDATE (diizinkan), bukan DELETE.

---

## 6. Acceptance Criteria (Given/When/Then)

Lihat daftar lengkap AC-1..AC-36 pada field `acceptance_criteria`. Ringkas per lapisan:
- **Schema (AC-1..AC-7)**: status/action/notif CHECK menerima nilai baru & menolak yang tak sah; kolom `revision_reason`; index D3 blokir & regresi.
- **RPC review (AC-8..AC-14)**: minta-revisi set field + log + notif + deadline tak berubah; alasan wajib; anti-self semua decision; permission gate; decision invalid; status guard.
- **RPC resubmit (AC-15..AC-20)**: happy path UPDATE row sama + clear; status gate; requestor-only; validasi tanggal server terhadap `v_req.old_deadline`; advisory lock; immutability identitas.
- **Atomicity migrasi (AC-21)**: enum baru tersedia sebelum RPC memakainya → tidak rollback.
- **Data layer/Hook (AC-22..AC-25)**: union `DcrDecision`; resubmit fn; label; tipe hook 2 lokasi + `resubmitM`.
- **UI (AC-26..AC-33)**: tombol ke-3; alasan wajib Minta Revisi; Tolak alasan asli (hapus `'Ditolak'`); badge; form revisi pengaju; reviewer tidak beraksi saat revision; resubmit call; anti double-submit.
- **RLS/E2E (AC-34..AC-36)**: visibilitas reviewer via approver_id; siklus penuh append-only chain; blokir request kedua saat revisi.

---

## 7. Edge Cases & Error Paths

Prinsip: server RPC = penegak akhir (PRD §41); guard client hanya UX.

**Izin ditolak:** tanpa `review_deadline_changes` → raise (server) + tombol tidak dirender (client). Self-attempt (semua decision) → `governance_violations` + raise (dengan catatan urutan gate FR-19). Resubmit oleh non-requestor → raise (strictly requestor-only). Reviewer beraksi saat `revision_requested` → raise 'Permintaan sedang menunggu revisi pengaju.'

**Konflik status:** review saat status ≠ pending → 'Permintaan ini sudah diproses.' / pesan revisi spesifik. Resubmit saat status ≠ revision_requested → raise. Double-review & double-resubmit race → `SELECT..FOR UPDATE` (pemenang pertama; kedua kena status guard).

**Validasi:** alasan kosong Minta Revisi/Tolak → raise (server) + block (client). new_deadline ≤ old_deadline (snapshot) atau < org_today pada resubmit → raise (server) + validasi client dulu untuk feedback instan.

**Enum/atomicity:** insert log/notif dengan enum baru sebelum ALTER CHECK → 23514 → rollback. Migrasi WAJIB ALTER dulu, RPC belakangan (satu file).

**Empty/loading:** tampilkan indikator saat `isLoading`; error + retry saat `isError`; `isPending` mencakup 3 mutation; form revisi prefill dari request + tampilkan `revision_reason` read-only. Badge fallback aman (`?? r.status` / `?? 'neutral'`) tapi `DCR_STATUS_LABEL.revision_requested` & `STATUS_TONE.revision_requested` wajib untuk UX.

---

## 8. Open Questions

Lihat field `open_questions` (OQ-1..OQ-9): kunci aksi reviewer saat revision (OQ-1), field editable resubmit/impact-evidence (OQ-2), tipe notif resubmit (OQ-3), violation type self-revision (OQ-4), cakupan Instance (OQ-5), continuity reviewer (OQ-6), batas putaran revisi (OQ-7), approve saat AP terminal (OQ-8), old_deadline snapshot vs re-fetch (OQ-9).

### 8.1 Resolusi Owner (2026-07-06 — binding untuk TDD)

- **OQ-8 → DIBERESI IN-SCOPE.** Tambah guard di `review_deadline_change`: tolak `approved` (dan `revision_requested`) bila `action_plans.status` terminal (`archived`/`cancelled`/`done`) → raise exception, tidak update deadline. Tambah AC + branch RPC + DB contract test.
- **OQ-9 → RE-FETCH TERKINI.** RPC `resubmit_deadline_change_request` memvalidasi `p_new_deadline` terhadap `action_plans.deadline` **aktual** (re-fetch) + `org_today`, BUKAN `v_req.old_deadline` snapshot. Bila deadline AP telah berubah via jalur non-DCR, pakai nilai terkini sebagai pembanding. (Catatan: `old_deadline` di baris request tetap snapshot historis untuk audit; hanya validasi resubmit yang re-fetch.)
- **OQ-1/2/3/4/5/6/7 → TERIMA DEFAULT SPEC** apa adanya (tidak diubah): reviewer tak beraksi sampai resubmit (OQ-1); resubmit 3-param reason/new_deadline saja (OQ-2); notif resubmit reuse `deadline_change_requested` (OQ-3); violation reuse `deadline_change_self_approval` (OQ-4); DCR tetap `entity_type='action_plan'` (OQ-5); reviewer mana pun pemegang permission boleh lanjut (OQ-6); tanpa batas putaran revisi (OQ-7).

---

## 9. Handoff ke TDD

**Fitur:** WS-4/DCR-05 (aksi reviewer "Minta Revisi" + resubmit pengaju + bugfix hardcode Tolak). Owner-locked D1-D5.

**Blocker pra-migrasi:** `psql \d deadline_change_requests` & `\d deadline_change_logs` untuk nama constraint status/action aktual. Migration baru = **0038**.

**Isi 0038 (urutan: ALTER DDL → RPC):**
1. status CHECK +`revision_requested`
2. action CHECK +`revision_requested`,+`resubmitted`
3. ADD COLUMN `revision_reason text`
4. DROP+RECREATE index → `WHERE status in ('pending','revision_requested')`
5. `notifications_type_check` superset + `deadline_change_revision_requested`
6. REPLACE `review_deadline_change` (branch revision_requested §5.2)
7. CREATE `resubmit_deadline_change_request(uuid, date, text)` (§5.3, requestor-only, validasi server)

**Data layer/UI:** `DcrDecision`, `resubmitDeadlineChangeRequest`, `DCR_STATUS_LABEL.revision_requested`, tipe hook 2 lokasi + `resubmitM`, tombol Minta Revisi + field alasan, alasan asli Tolak (hapus `'Ditolak'`), `STATUS_TONE.revision_requested='warn'`, form revisi inline pengaju, guard anti-double-submit.

**Invarian TDD:** RLS+RPC (DB contract test pola RencanApp), anti-self, advisory lock, append-only. Jalankan `npm run type-check` & `npm test` sebelum selesai (AGENTS.md).

**Paths tersentuh:** `supabase/migrations/0038_dcr05_minta_revisi.sql`, `mobile/src/lib/governance-admin.ts`, `mobile/src/hooks/use-governance-admin.ts`, `mobile/src/app/(app)/deadline-change-request.tsx`, `mobile/src/lib/database.types.ts`, `mobile/src/components/ui`, DB contract tests, `mobile/src/lib/__tests__`, `mobile/src/hooks/__tests__`.