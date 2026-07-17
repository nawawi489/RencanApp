# Spec — Push Notification (jembatan `emit_notification` → device)

> Status: FINAL (siap TDD). Platform: Expo SDK 56 / RN 0.85. Migrasi terakhir repo: `0047` (nomor final direkonsiliasi saat land).
> Prinsip pengikat: **push adalah transport side-effect zero-bobot governance** yang menumpang choke point tunggal `emit_notification`. Audiens push == `notifications.recipient_id`; semua invarian (skip-self, dedupe, RLS recipient-only, access-gating) diwarisi otomatis.

---

## 1. Problem & Goals

### Problem
RencanApp punya sistem notifikasi in-app lengkap: `emit_notification()` (SECURITY DEFINER, `0008_fase3_collab.sql:243-256`) adalah satu titik-tulis kanonik ke `public.notifications`, dibaca client via `listNotifications()` dan ditampilkan di Inbox/Home. Namun notif ini **hanya sampai saat app dibuka** (polling on-focus + refresh manual, keputusan sengaja Fase 3). Saat app **background/tertutup**, user tidak menerima sinyal apa pun untuk kejadian menuntut tindakan tepat waktu (review diperlukan, deadline lewat, mention). Loop eksekusi (PRD §28) melemah.

Gap teknis dikonfirmasi riset kode:
- Tak ada device-side: `expo-notifications` belum dipasang; `app.json` tanpa plugin push.
- Tak ada token registry (`push_tokens`/`device_token` = 0 hit).
- Tak ada fan-out server: **DB tidak punya HTTP egress** — `pg_net`/`net.http`/`vault` tidak di-enable; **semua cron eksisting hanya SQL in-DB** (`$$select public.fn()$$`, terverifikasi 0007/0008/0043). Hanya `pg_cron` + `pg_trgm` yang aktif.
- Tak ada penanda kirim: `notifications` hanya punya `is_read`/`read_at` + `resolved_at`/`resolution` (0040).

### Goals
1. Jembatani notif in-app yang ada ke push device saat background/tertutup, **tanpa jalur notif kedua** — push dipicu dari titik yang sama (`emit_notification` / baris `public.notifications`) agar audiens & guard terwarisi.
2. Registrasi & lifecycle token per-user aman (RPC-only 2-lapis, revoke saat logout/keluar org).
3. Fan-out server-authoritative (Edge Function drainer, `SERVICE_ROLE`, log JSON tanpa PII).
4. Mekanisme generik lintas-tipe dalam batas taksonomi `notifications_type_check` (push-worthiness ortogonal terhadap `type`).
5. Deep-link reuse kontrak `(entity_type, entity_id)` (FR-N-07) + re-check RLS saat dibuka.

### Success Metrics (definisi keberhasilan produk)
- **Opt-in izin push** ≥ target (mis. 60%) user aktif dalam 14 hari pasca-rilis.
- **Delivery success rate** (ticket ok / delivery attempt) ≥ 95% untuk token non-revoked.
- **Waktu emit→first-view** notif actionable (review_request/deadline) turun signifikan vs baseline in-app-only (proxy: rasio push-tapped-before-next-app-open-organik).
- **Zero regresi**: 0 kebocoran lintas-tenant; jest suite hijau.

---

## 2. Non-Goals
- Bukan kanal broadcast/feed/announcement (per-recipient targeted, tolak scope-guardrails §88).
- Bukan menambah tipe notif arbitrer (taksonomi terkunci; push-worthy = config).
- Bukan memindahkan otoritas tulis ke client (fan-out selalu server-side).
- Bukan mengubah append-only `notifications` (state push di tabel terpisah).
- **Bukan trigger AFTER INSERT push dalam transaksi** `emit_notification` (kegagalan push tak boleh me-rollback notif/RPC governance). Fan-out **decoupled** (poll-based outbox).
- Bukan mengganti Expo Notifications (FCM/APNs = revisi tech-stack, bukan keputusan baru).
- **Fase 1 bukan mention/comment** (didesk Fase 2 — deep-link chat belum ada).
- **Fase 1 bukan quiet-hours/rate-limit/opt-out per-user** (didesk Fase 3; rate-limit sudah properti `emit_notification`).
- Bukan aksi cepat governance dari push (navigasi saja; aksi lewat RPC ber-guard).

---

## 3. Fasing (koreksi grill: pilih jalur tercepat ke nilai)

| Fase | Scope | Alasan |
|---|---|---|
| **1 (pilot, spec ini)** | Push tipe eksekusi/review yang **deep-link-nya SUDAH berfungsi**: `review_request`, `approved`, `rejected`, `deadline_reminder`, `repeat_due`, `instance_missed` (→ `action_plan`/`action_plan_instance`, ditangani `openRow` 234-241). _Catatan: `revision_requested` adalah `NotificationResolution` (kolom resolution), bukan `NotificationType` tersendiri — semantik "perlu revisi" di-cover oleh tipe `rejected` + resolution._ | Mengapalkan nilai push tanpa prasyarat fitur baru |
| **2 (fast-follow)** | `mention` + `comment` (chat) | Menyeret prasyarat: `openRow` **tidak** punya cabang `chat_message` (tap = no-op, terverifikasi); baris notif tak simpan `room_id`; butuh resolusi `chat_message→room` + rute `/inbox/[roomId]` + rekonsiliasi `openRow`/`openAction` |
| **3 (fast-follow)** | Quiet-hours + rate-limit push org-level | Belum terbukti butuh; butuh **kolom timezone per-org** (tidak ada — cron hardcode UTC, `org_today()` hanya DATE) |

> **Koreksi kontradiksi C-1**: kolom "Deadline reminder, review request, repeat due" di `tech-stack.md` adalah ilustrasi *alasan singkat*, bukan daftar prioritas terperingkat; PRD §28 mencantumkan Mention setara. Menempatkan mention di Fase 2 didasari **biaya deep-link**, bukan bobot governance — jalur tercepat ke nilai memilih tipe yang deep-link-nya sudah bekerja.

---

## 4. User Stories (ID `US-PN`)

- **US-PN-1** Daftarkan device saat login → menerima push saat app tertutup.
- **US-PN-2** Cabut token saat logout/keluar org → tak ada kebocoran lintas-tenant.
- **US-PN-3 (PIC)** Push hasil review (`approved`/`rejected`/`revision_requested`) → tahu lanjut/perbaiki.
- **US-PN-4 (PIC)** Push `deadline_reminder`/`repeat_due`/`instance_missed` → tak lewatkan komitmen (menghormati dedupe cron).
- **US-PN-6 (Reviewer)** Push `review_request` → antrean review tak menumpuk.
- **US-PN-9** Tap push membuka tujuan benar & **tunduk re-check RLS**.
- **US-PN-10** Cold start dari push (app tertutup) mendarat di tujuan pasca session-restore.
- **US-PN-11** Payload tidak membocorkan data confidential ke lock-screen.
- **[Fase 2] US-PN-5** Push mention di chat.
- **[Fase 3] US-PN-8 (CEO/Admin)** Atur tipe push-worthy & quiet-hours org-level.

---

## 5. Functional Requirements (prefix `FR-PN`; **[GOV]** = invarian mengikat)

### A. Registrasi & lifecycle token
- **FR-PN-01 [GOV]** Tabel baru `public.push_tokens` (`id, organization_id, user_id, expo_token, platform, device_id?, created_at, updated_at, revoked_at?`). RLS enabled + policy SELECT own-row eksplisit; **INSERT/UPDATE/DELETE di-revoke** dari `authenticated`/`anon` (tidak hanya bergantung `rls_auto_enable`).
- **FR-PN-02 [GOV]** `register_push_token(p_expo_token, p_platform, p_device_id?)` SECURITY DEFINER `set search_path=''`, upsert by `unique(expo_token)`, set `revoked_at=null`. Client tak pernah INSERT langsung.
- **FR-PN-03** Registrasi dipicu `SIGNED_IN` di `providers/auth-provider.tsx` (setelah sesi valid + izin OS).
- **FR-PN-04** Minta izin OS; penolakan → app tetap penuh, tak ada token, tak diulang paksa tiap fokus.
- **FR-PN-05 [GOV]** `SIGNED_OUT`/keluar org → `unregister_push_token` set `revoked_at` **sebelum** `queryClient.clear()`; best-effort, kegagalan di-log tak menggantung logout.
- **FR-PN-06** Receipt `DeviceNotRegistered` → drainer set `revoked_at` (SERVICE_ROLE).
- **FR-PN-06b [GOV]** Anti-hijack: `register_push_token` untuk token yang saat ini dimiliki user lain (`revoked_at IS NULL`) **wajib di-audit** (`write_activity`) + tunduk rate-limit sebelum transfer kepemilikan (server tak bisa buktikan possession). Owner: reject vs transfer+audit (default: transfer+audit).

### B. Fan-out (transport, **decoupled**)
- **FR-PN-07 [GOV]** Fan-out bersumber dari baris `public.notifications` (poll), **bukan** disuntik per call-site → ~16 call-site tercakup; skip-self + dedupe terwarisi.
- **FR-PN-08 [GOV] [koreksi]** DB tak punya HTTP egress & cron hanya SQL in-DB. Pengiriman terjadi di **Edge Function drainer** (`verify_jwt=false`, dijalankan scheduler/SERVICE_ROLE), **bukan** `net.http` dari plpgsql. Mekanisme invokasi drainer (pg_net+pg_cron `net.http_post` **atau** scheduler eksternal) **ditetapkan eksplisit & disetujui owner** — OQ1. Premis "outbox tanpa extension" **SALAH** dan dikoreksi di sini.
- **FR-PN-08b [GOV]** **Isolasi kegagalan (blocker utama)**: fan-out **decoupled** — TIDAK ada trigger AFTER INSERT dalam transaksi tulis. Drainer **poll**: `select n from notifications n where is_push_worthy(n.type) and not exists(select 1 from push_deliveries d where d.notification_id=n.id) and n.created_at > now()-interval '1 hour'`. Ini menjamin kegagalan push tak pernah me-rollback INSERT `notifications` maupun RPC governance pemanggil. (Bila trigger dipakai demi latency, **wajib** dibungkus `BEGIN/EXCEPTION WHEN OTHERS`.)
- **FR-PN-09 [GOV]** Drainer (SERVICE_ROLE, bypass RLS) **wajib** filter token: `organization_id = notifications.organization_id AND user_id = notifications.recipient_id AND revoked_at IS NULL`. Tutup celah lintas-org kelas 0039. Tak pernah query lintas-recipient.
- **FR-PN-10 [GOV]** State pengiriman di **`push_deliveries` terpisah** (`unique(notification_id, push_token_id)`), bukan UPDATE `notifications`. Satu baris → maks satu push per token; ulang hanya untuk retryable error.
- **FR-PN-11** Suppress notif yang sudah `resolved_at`/`is_read` saat drainer evaluasi (OQ6, default: skip).

### C. Seleksi tipe & noise
- **FR-PN-12 [GOV]** Whitelist push-worthy **ortogonal** terhadap `type` (tak ubah CHECK). Whitelist Fase 1 = 7 tipe eksekusi/review. Disimpan org-level via `upsert_settings` key `notification_rule_push_types` (prefix sudah di-whitelist, `0014:843`).
- **FR-PN-12b** **Default hari-0**: bila key belum diset admin, `is_push_worthy` **fail-closed** ke whitelist Fase 1 terkode (bukan fail-open semua tipe).
- **FR-PN-13 [GOV]** Rate-limit/dedupe/skip-self adalah properti `emit_notification`. Push menumpang; **tak ada** kebijakan noise kedua khusus push di Fase 1.
- **[Fase 3] FR-PN-14** Quiet-hours = Notifications Rule org-level (`notification_rule_push_quiet_hours`, gated `manage_settings`), butuh kolom timezone per-org. **Wajib**: tak pernah men-drop tipe governance-critical (`review_request`/`deadline_change_*`) — hanya tunda-berbatas atau exempt; tak pernah menahan baris notif in-app.
- **FR-PN-15 [GOV]** Bukan broadcast (per-recipient targeted).

### D. Deep-link
- **FR-PN-16** Payload data: `{ notification_id, type, entity_type, entity_id }`. Resolve tujuan dari `(entity_type, entity_id)` via `entity-routes.ts` (reuse FR-N-07).
- **FR-PN-17** Handler `addNotificationResponseReceivedListener` (root `_layout.tsx`): map payload → `Href` (scheme `ems`), tangani cold-start (`getLastNotificationResponseAsync`) & warm; setelah nav invalidate `['notifications']`.
- **FR-PN-19 [GOV]** Re-check RLS saat entity dibuka (`can_access_action_plan`/`is_chat_member`); hak berubah → tolak; entity hilang → fallback "Item tidak lagi tersedia". Deep-link bukan bypass.
- **FR-PN-20 [GOV]** Aksi governance tetap lewat RPC ber-guard (anti-self-approval).
- **[Fase 2] FR-PN-18** Tutup gap `chat_message → room_id` + cabang `/inbox/[roomId]` di push handler & `openRow` (rekonsiliasi dengan `openAction`).

### E. Payload & privasi
- **FR-PN-21 [GOV]** Payload minimal (title ringkas + refs); konten sensitif di-fetch in-app pasca-auth. Logging drainer JSON + `requestId` + redaksi token/PII.
- **FR-PN-22 [GOV]** Entity confidential / sensitivitas indeterminate → title/body generik (**fail-closed**).

### F. Konsistensi client
- **FR-PN-23** Invalidate `['notifications']` + `useUnreadCount` saat push diterima foreground / dibuka via tap.
- **FR-PN-23b** Foreground: `setNotificationHandler` menekan banner ganda (in-app sudah tampil).
- **FR-PN-24 [GOV]** Transport push **nol-bobot** governance/skor; bukan approval. Config push via `upsert_settings` **selalu** ter-log key-only (`write_activity('settings', null, 'setting_updated', {key})`, `0014:862`) — lihat AC-GOV-4.
- **FR-PN-25** `expo-notifications` ditambah ke `app.json` plugins pada **versi eksak** kompatibel SDK 56; Android notification channel dibuat; platform = Expo push service.

---

## 6. Data Contracts (usulan; migrasi `0048+`, rekonsiliasi saat land)

### `public.push_tokens`
```sql
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_token text not null,
  platform text not null check (platform in ('ios','android')),
  device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists uq_push_tokens_expo on public.push_tokens(expo_token);
create index if not exists idx_push_tokens_recipient on public.push_tokens(user_id) where revoked_at is null;

alter table public.push_tokens enable row level security;
create policy "push_tokens_select" on public.push_tokens for select to authenticated
  using (organization_id = public.current_user_org() and user_id = auth.uid());
revoke insert, update, delete on public.push_tokens from authenticated, anon;
```

### `register_push_token` / `unregister_push_token`
Upsert by `expo_token`; **anti-hijack**: bila baris existing dimiliki user lain non-revoked, `write_activity` audit transfer + rate-limit (FR-PN-06b). `unregister` set `revoked_at`. Keduanya `revoke execute ... from public, anon; grant ... to authenticated`.

### `public.push_deliveries` (outbox, jaga `notifications` murni)
```sql
create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  push_token_id uuid not null references public.push_tokens(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','sent','failed','receipt_ok','receipt_error')),
  provider_ticket_id text, provider_receipt_id text, error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists uq_push_deliveries_once on public.push_deliveries(notification_id, push_token_id);
alter table public.push_deliveries enable row level security;
-- TANPA policy apa pun untuk client → hanya SERVICE_ROLE.
revoke select, insert, update, delete on public.push_deliveries from authenticated, anon;
```

### `is_push_worthy(type)` — fail-closed default
Baca `notification_rule_push_types` dari `settings`; bila absent → whitelist Fase 1 terkode.

### Edge Function `push-fanout` (drainer)
Pola `create-user` tapi `verify_jwt=false` (`config.toml`). Poll `push_deliveries pending` / baris notif belum-terkirim (FR-PN-08b), POST Expo, tulis status. Pass kedua: rekonsiliasi receipt + prune token. Filter token wajib org+recipient (FR-PN-09).

### Dampak RLS ringkas
| Objek | Perubahan | RLS |
|---|---|---|
| `push_tokens` | tabel baru | SELECT own-row; tulis di-revoke → RPC only |
| `push_deliveries` | tabel baru | tanpa policy client; SERVICE_ROLE only |
| `notifications` | **tak diubah** | SELECT recipient+org tetap; drainer baca via SERVICE_ROLE dibatasi recipient |
| `settings` | +key `notification_rule_push_*` | whitelist prefix sudah ada; gated `manage_settings`; **selalu** audit key-only |
| Edge `push-fanout` | baru | `verify_jwt=false`, SERVICE_ROLE |

---

## 7. Copy Payload (draft produk — OQ8 finalisasi)
| Tipe | Title | Body (ringkas) |
|---|---|---|
| `review_request` | "Perlu direview" | "Ada bukti menunggu review Anda." |
| `approved` | "Disetujui" | "Pengajuan Anda disetujui." |
| `rejected` / `revision_requested` | "Perlu revisi" | "Reviewer meminta perbaikan." |
| `deadline_reminder` | "Deadline mendekat" | "Tugas Anda mendekati tenggat." |
| `repeat_due` | "Tugas rutin hari ini" | "Ada tugas rutin due hari ini." |
| `instance_missed` | "Tugas terlewat" | "Sebuah tugas rutin terlewat." |
| **confidential / indeterminate** | "Pembaruan baru" | "Ada pembaruan yang perlu ditinjau." (fail-closed) |

---

## 8. Acceptance Criteria (Given/When/Then)
Lihat daftar lengkap ber-ID (`AC-REG-*`, `AC-FAN-*`, `AC-TYPE-*`, `AC-LINK-*`, `AC-AUTH-*`, `AC-RULE-*`, `AC-GOV-*`, `AC-CLIENT-*`) di field `acceptance_criteria` struktur output. Highlight blocker:
- **AC-FAN-4** kegagalan push tak me-rollback INSERT notif/RPC governance (decoupled).
- **AC-FAN-6** isolasi lintas-tenant (uji negatif org-A→token org-B).
- **AC-REG-4** anti-hijack token milik user lain (audit+rate-limit).
- **AC-AUTH-2/3** fail-closed confidential + isolasi recipient di SERVICE_ROLE.
- **AC-GOV-4** koreksi audit: `upsert_settings` selalu log key-only.

---

## 9. Edge Cases (ID `EE-PUSH`)
Izin ditolak (graceful, no retry-loop), device tak eligible (simulator → no-op senyap), token stale (upsert bukan akumulasi), logout tanpa revoke → hijack risk (revoke di `signOut` sebelum `clear`), recipient tanpa token (skip senyap), Expo transient 5xx (retry idempoten via outbox), `DeviceNotRegistered` (prune), entity hilang/akses dicabut (fallback ramah), `entity_type` null (fallback tab Notifikasi), cold vs warm start (keduanya idempoten), sesi tak aktif saat tap (login→lanjut bila berhak). **Semua kegagalan → logger seam JSON (bukan `console.log`), bukan `activity_log`/`governance_violation`.**

---

## 10. Open Questions — RESOLVED (owner 2026-07-13)

| OQ | Keputusan | Konsekuensi implementasi |
|---|---|---|
| **OQ1** invokasi drainer | ✅ **pg_net + pg_cron** | Migrasi enable extension `pg_net`; `pg_cron` job `net.http_post` ke URL Edge Function `push-fanout` dgn header SERVICE_ROLE. **Prasyarat**: sign-off egress DB (baru untuk repo ini). |
| **OQ2** anti-hijack token | ✅ **Transfer + audit + rate-limit** | `register_push_token` untuk `expo_token` non-revoked milik user lain → `write_activity` audit transfer + tunduk rate-limit, lalu pindah kepemilikan (bukan reject). |
| **OQ3** audit config push | ✅ **Key-only** | `upsert_settings` untuk `notification_rule_push_*` log key saja (`write_activity('settings', null, 'setting_updated', {key})`), konsisten `notification_rule_*` lain. Bukan grade §A.3. |
| **OQ6** supresi resolved/read | ✅ **Skip** (rekomendasi diadopsi) | Drainer skip push bila `resolved_at`/`is_read` sudah terisi saat evaluasi. |
| **OQ7** OS badge | ✅ **Set badge saat push diterima** (rekomendasi diadopsi) | `setBadgeCountAsync` dari `useUnreadCount`; sinkron penuh = fast-follow. |
| **OQ8** copy payload | ✅ **Pakai draft §7** sbg baseline | Produk boleh revisi teks sebelum rilis; struktur (fail-closed generik) terkunci. |
| **OQ4** deep-link mention | ⏸ **Deferred Fase 2** | Diputuskan saat memulai Fase 2 (resolusi `chat_message→room` di drainer vs denormalisasi kolom). |
| **OQ5** quiet-hours + timezone | ⏸ **Deferred Fase 3** | Butuh kolom timezone per-org (belum ada); model org-level Notifications Rule. |

**Status land Fase 1: TIDAK ADA blocker keputusan tersisa.** Prasyarat teknis: sign-off enable `pg_net` (OQ1).

---

## 11. Handoff ke TDD
Umpan `tdd_handoff.feature` + `paths` ke workflow `tdd-plan`. Urutan RGR yang disarankan:
1. **DB contract** (psql via docker): `push_tokens` RLS+revoke, `register/unregister` (idempoten, anti-hijack audit), `push_deliveries` isolasi, `is_push_worthy` fail-closed.
2. **Isolasi kegagalan** (AC-FAN-4): paksa jalur push error → assert notif in-app + RPC governance tetap commit.
3. **Isolasi lintas-tenant** (AC-FAN-6): uji negatif org-A→token org-B.
4. **Drainer** (seam mock Expo Push API — **wajib didefinisikan**; test unit fan-out/receipt/prune tanpa jaringan nyata).
5. **Client** (jest + RNTL): auth-provider register/unregister, handler deep-link (openRow/openAction, cold-start, fallback, re-check RLS), foreground suppress+invalidate.

> Prasyarat land RESOLVED (owner 2026-07-13): OQ1 = pg_net+pg_cron, OQ2 = transfer+audit+rate-limit, OQ3 = key-only audit, OQ6/OQ7/OQ8 = rekomendasi diadopsi. Sisa prasyarat teknis: sign-off enable extension `pg_net`. Fase 2 (mention deep-link) & Fase 3 (quiet-hours) di luar TDD ini.