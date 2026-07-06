---
type: source
tags: [testing, credentials, dev, seed, local, source]
updated: 2026-07-06
sources: 1
---

# Source · Kredensial Login Dev (Nyantuy Group)

Ringkasan `docs/kredensial-login.md`. Daftar 6 akun uji pada Supabase lokal (`http://localhost:54321`) dengan password universal `rencan123`, semuanya sudah `is_active=true`, email terkonfirmasi, dan terhubung ke tenant tunggal **Nyantuy Group**. Verifikasi terakhir: **2026-07-06**.

> [!warning] **Lingkungan lokal saja.** Password `rencan123` dan domain `@rencan.local` khusus seed dev. Jangan pakai di staging/produksi.

## Ringkasan Akun

| Email | Role Template | Full Name | Jabatan | Team |
|---|---|---|---|---|
| `ceo@rencan.local` | CEO / Super Admin | Citra Wibawa | CEO | — |
| `cmo@rencan.local` | C-Level | Bayu Pratama | Chief Marketing Officer | — |
| `mgr.sales@rencan.local` | Management | Dewi Anggraini | Sales Manager | Tim Sales (lead) |
| `mgr.ops@rencan.local` | Management | Eko Saputro | Operations Manager | Tim Ops (lead) |
| `staff.sales@rencan.local` | Staff | Fajar Nugroho | Sales Executive | Tim Sales (member) |
| `staff.finance@rencan.local` | Staff | Gita Maharani | Finance Staff | Tim Ops (member)* |

\*Catatan seed: `staff.finance` saat ini masih tergabung di Tim Ops, bukan tim finance khusus. Cukup untuk skenario role Staff, tapi kalau butuh pemisahan lintas-departemen yang rapi, seed perlu disesuaikan.

## Peta Akun ↔ Skenario Uji

Merujuk `docs/manual-testing.md` — daftar case yang sebelumnya Blocked karena tidak ada akun.

- **CEO** — bypass total ([[permission-model]]): tutup ADM-01..15, ROLE-01 baris `ceo`, MENU-02 baseline all-enabled, aktor kedua SCORE-02.
- **C-Level (Bayu)** — permission default C-Level (create_initiative/action_plan/strategy/department, manage_teams, review_deadline_changes). Tutup ROLE-01 baris `c_level`; alternatif aktor kedua SCORE-02.
- **Manager Sales (Dewi)** — reviewer AP staff Sales → REV-01..05, DCR-01/03/04/05/06, NOTIF-03/04. Chat pair dengan Fajar → CHAT-01..03, INBOX-01. Pengaju/penyetuju SCORE-02. Bikin Strategy/Initiative/AP Sales → STR-01, INIT-01, AP-01/02. Tutup ROLE-01 baris `management`.
- **Manager Ops (Eko)** — aktor kedua SCORE-02 dengan Dewi (memenuhi aturan "aktor 1 ≠ aktor 2"), SCORE-02b (Override diri sendiri tetap hilang untuk manager lain), cross-check RLS lintas-team (tidak boleh review AP Sales tanpa scope).
- **Staff Sales (Fajar)** — PIC AP Sales → EVD-01..05, AP-03 (submit bukti + tarik nilai KPI, lihat [[execution-loop]] dan [[evidence-kinds]]), DCR-01/02 (ajukan), INBOX/CHAT sisi PIC, dampak SCORE-04 (governance penalty).
- **Staff Finance (Gita)** — PPL-07 aturan D9 (Fajar mencoba lihat skor Gita lintas periode terbuka vs tertutup), ADM-11 Confidential Access (akses konfidensial sementara ke satu card Sales; uji sebelum & sesudah kedaluwarsa ±1 jam — lihat [[audit-governance]]), SRCH-02 (RLS silent-filter → list kosong, bukan error 403).

## Cara Verifikasi Ulang

```bash
docker exec supabase_db_supabase psql -U postgres -d postgres -c \
  "SELECT p.email, p.full_name, p.position_title, rt.name AS role, p.is_active \
   FROM public.profiles p \
   LEFT JOIN public.role_templates rt ON rt.id = p.role_template_id \
   ORDER BY p.email;"
```

```bash
docker exec supabase_db_supabase psql -U postgres -d postgres -c \
  "SELECT email, (encrypted_password = crypt('rencan123', encrypted_password)) AS pw_ok \
   FROM auth.users ORDER BY email;"
```

## Reset Password

UI reset tidak berfungsi karena mail server lokal tidak dikirim keluar. Jalankan langsung via SQL:

```sql
UPDATE auth.users
SET encrypted_password = crypt('rencan123', gen_salt('bf'))
WHERE email LIKE '%@rencan.local';
```

```bash
docker exec supabase_db_supabase psql -U postgres -d postgres -c "<sql di atas>"
```

## Catatan Historis

- Kredensial ini dipakai owner untuk memverifikasi post-login pada investigasi [[log|THEME-01]] (2026-07-05) dan menutup ADM/ROLE/SCORE case Blocked di `docs/manual-testing.md`.
- Sinkron dengan seed [[database-blueprint]] tenant Nyantuy Group, role_templates (`ceo`, `c_level`, `management`, `staff`), dan team memberships (Tim Sales & Tim Ops).
