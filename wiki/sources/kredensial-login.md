---
type: source
tags: [testing, credentials, dev, seed, local, source]
updated: 2026-08-02
sources: 1
---

# Source · Kredensial Login Dev (Nyantuy Group)

> [!warning] Riwayat status halaman ini — baca sebelum pakai
> 2026-07-30: ditemukan 6 akun `@rencan.local` **hilang** dari DB lokal (hanya 3 fixture `@fixtures.local` tersisa), ditandai stale. 2026-08-02: 6 akun `@rencan.local` **dipulihkan** (non-destruktif, lihat §"Cara akun 6-role dipulihkan") saat menyiapkan skenario E2E — kini **kedua set coexist**. Jangan asumsikan status di sini masih berlaku tanpa verifikasi ulang; DB lokal bisa di-reseed kapan saja oleh proses lain (contract test, `supabase db reset`, dll).

## Akun aktif saat ini (verifikasi 2026-08-02)

Password universal `rencan123` untuk **semua** akun di bawah. Semuanya `is_active=true`, `pw_ok=true`.

### Set A — 3 fixture contract-test (jangan dipakai untuk skenario E2E multi-role)

| Email | Full Name | Role | Org | Kegunaan |
|---|---|---|---|---|
| `ceo@fixtures.local` | CEO Fixture | CEO | Contract Fixtures Org | Bypass total permission, skenario umum |
| `dcr.ceo@fixtures.local` | DCR CEO | CEO | DCR-05 Fixtures Org | Skenario DB Contract Regression (dupe CEO kedua) |
| `dcr.reviewer@fixtures.local` | DCR Reviewer | Staff | DCR-05 Fixtures Org | Skenario DB Contract Regression sisi reviewer/Staff |

`DCR` = kemungkinan singkatan **DB Contract Regression** (fixture untuk `mobile/src/**/*db-contract*` atau test kolokasi Sprint 9 S9-* — belum diverifikasi ke source test file, tandai `[?]`). Ketiganya **di org terpisah satu sama lain** — tak bisa saling berinteraksi (chat, review, DCR) dalam satu skenario.

### Set B — 6 akun `@rencan.local`, satu org **Nyantuy Group** (dipulihkan 2026-08-02)

| Email | Role Template | Full Name | Jabatan | Team |
|---|---|---|---|---|
| `ceo@rencan.local` | CEO / Super Admin | Citra Wibawa | CEO | — |
| `cmo@rencan.local` | C-Level | Bayu Pratama | Chief Marketing Officer | — |
| `mgr.sales@rencan.local` | Management | Dewi Anggraini | Sales Manager | Tim Sales (lead) |
| `mgr.ops@rencan.local` | Management | Eko Saputro | Operations Manager | Tim Ops (lead) |
| `staff.sales@rencan.local` | Staff | Fajar Nugroho | Sales Executive | Tim Sales (member) |
| `staff.finance@rencan.local` | Staff | Gita Maharani | Finance Staff | Tim Ops (member)* |

\*Catatan seed: `staff.finance` saat ini masih tergabung di Tim Ops, bukan tim finance khusus. Cukup untuk skenario role Staff, tapi kalau butuh pemisahan lintas-departemen yang rapi, seed perlu disesuaikan.

Ini set yang **satu org, saling berinteraksi** — cocok untuk skenario E2E multi-role (goal→penyelesaian tugas, review, DCR, chat, override skor). Lihat §"Peta Akun ↔ Skenario Uji" di bawah — kini kembali berlaku.

### Cara verifikasi ulang

```bash
docker exec supabase_db_supabase psql -U postgres -d postgres -c \
  "SELECT p.email, p.full_name, rt.level AS role, o.name AS org, p.is_active, \
          (u.encrypted_password = crypt('rencan123', u.encrypted_password)) AS pw_ok \
   FROM public.profiles p \
   LEFT JOIN public.role_templates rt ON rt.id = p.role_template_id \
   LEFT JOIN public.organizations o ON o.id = p.organization_id \
   JOIN auth.users u ON u.id = p.id \
   ORDER BY o.name, rt.level DESC, p.email;"
```

## Cara akun 6-role dipulihkan (2026-08-02) — gotcha UUID, non-destruktif

`supabase/seed_dummy.sql` memakai UUID **deterministik** `11111111-1111-1111-1111-00000000000{1..6}` untuk 6 akun `@rencan.local`. Menjalankan seed ini apa adanya di DB yang sudah berisi fixture contract-test **gagal senyap** untuk `ceo` (`…0001`) dan `mgr.sales` (`…0003`) — `insert … on conflict (id) do nothing` men-skip keduanya karena UUID itu sudah dipakai `dcr.ceo@fixtures.local` / `dcr.reviewer@fixtures.local`. Hasilnya cuma 4/6 akun terbuat, dan dua role kunci (CEO + satu Manager) hilang tanpa pesan error apa pun.

Perbaikan (tanpa mengganggu fixture contract-test — `DELETE auth.users` diblokir sengaja oleh auto-mode classifier, jadi jalur destruktif memang tak dipilih):

1. Insert `ceo@rencan.local` & `mgr.sales@rencan.local` di UUID **baru** (`1111aaaa-1111-1111-1111-0000000000c1` / `…-00c3`) — trigger `handle_new_user` otomatis bikin profil (role default `staff`, org dari `raw_app_meta_data.organization_id`).
2. Re-run `seed_dummy.sql` (idempoten) — melengkapi role `ceo`/`management` by-email.
3. Repoint ownership card seed (`goals.pic_id`, `development_areas.pic_id`, `initiatives.pic_id`, `action_plans.pic_id`+`created_by`, `teams.lead_id`, `team_members.profile_id`) dari UUID lama (`…0001`/`…0003`, kini milik fixture) ke UUID baru.

**Pelajaran durable:** kredensial dev seed BUKAN stabil selamanya — reseed test-infra bisa mengganti/menghilangkan akun tanpa mengubah dokumentasi manapun, dan collision UUID deterministik bisa membuat seed idempoten gagal **senyap** (bukan error, cuma skip). Sebelum pakai kredensial dari wiki/memory untuk aksi yang bisa gagal diam-diam (login, skenario multi-role), verifikasi read-only ke DB dulu (query di atas) — jangan asumsikan "terakhir diverifikasi" masih berlaku.

## Peta Akun ↔ Skenario Uji (Set B, kini berlaku lagi)

Merujuk `docs/manual-testing.md` + `docs/e2e-scenario-matrix-goal-to-completion.md` (rantai E2E penuh, dijalankan & diverifikasi 2026-08-02 — lihat entry terkait di `wiki/log.md`).

- **CEO (Citra)** — bypass total ([[permission-model]]): tutup ADM-01..15, ROLE-01 baris `ceo`, MENU-02 baseline all-enabled, buat & aktivasi Goal/KPI Area, tutup periode, override skor single-actor (D10 — **bukan** dua-aktor, lihat catatan di [[permission-model]]).
- **C-Level (Bayu)** — permission default C-Level (create_initiative/action_plan, manage_teams, review_deadline_changes). Tutup ROLE-01 baris `c_level`.
- **Manager Sales (Dewi)** — reviewer AP staff Sales → REV-01..05, DCR-01/03/04/05/06, NOTIF-03/04. Chat pair dengan Fajar → CHAT-01..03, INBOX-01. Bikin Initiative/AP Sales → INIT-01, AP-01/02. Tutup ROLE-01 baris `management`. **Jadi PIC Goal "Naikkan Omset Q3 2026"** (repoint manual 2026-08-02) — jalur `is_goal_pic` utk tombol "+ Strategi" tanpa grant `create_kpi_area` eksplisit.
- **Manager Ops (Eko)** — cross-check RLS lintas-team (tidak boleh review AP Sales tanpa scope).
- **Staff Sales (Fajar)** — PIC AP Sales → EVD-01..05, AP-03 (submit bukti + tarik nilai KPI, lihat [[execution-loop]] dan [[evidence-kinds]]), DCR-01/02 (ajukan), INBOX/CHAT sisi PIC, dampak SCORE-04 (governance penalty). Rank #1 People Ranking Q3 2026 di data uji (skor override 90).
- **Staff Finance (Gita)** — PPL-07 aturan D9 (Fajar mencoba lihat skor Gita lintas periode terbuka vs tertutup), ADM-11 Confidential Access (akses konfidensial sementara ke satu card Sales; uji sebelum & sesudah kedaluwarsa ±1 jam — lihat [[audit-governance]]), SRCH-02 (RLS silent-filter → list kosong, bukan error 403).

### Reset Password

UI reset tidak berfungsi karena mail server lokal tidak dikirim keluar. Jalankan langsung via SQL (ganti pola `LIKE` sesuai domain akun):

```sql
UPDATE auth.users
SET encrypted_password = crypt('rencan123', gen_salt('bf'))
WHERE email LIKE '%@rencan.local';  -- atau '%@fixtures.local'
```

```bash
docker exec supabase_db_supabase psql -U postgres -d postgres -c "<sql di atas>"
```

### Catatan Historis

- Kredensial `@rencan.local` dipakai owner untuk memverifikasi post-login pada investigasi [[log|THEME-01]] (2026-07-05) dan menutup ADM/ROLE/SCORE case Blocked di `docs/manual-testing.md`.
- Sinkron dengan seed [[database-blueprint]] tenant Nyantuy Group, role_templates (`ceo`, `c_level`, `management`, `staff`), dan team memberships (Tim Sales & Tim Ops).
- `docs/kredensial-login.md` (source repo, bukan halaman wiki ini) **masih belum diperbaiki** — tetap menyebut 6 akun sebagai daftar utama tanpa catatan riwayat hilang/pulih. Di luar scope perbaikan wiki (bukan file `wiki/`), tapi layak disinkronkan bila ada sesi berikutnya yang menyentuh dokumen itu.
