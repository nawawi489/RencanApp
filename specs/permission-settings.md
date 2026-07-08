# Spec Final — permission-settings (#35 "User & Permission")

Status: siap-eksekusi (exit ke `tdd-plan`). Target migrasi: **0017** (berikutnya setelah `0016_security_hardening.sql`; terverifikasi belum ada 0017+). Semua klaim kode di bawah sudah diverifikasi terhadap repo pada 2026-06-26.

---

## 1. Problem & Goals

### Problem
Sejak Fase 0 (`0001`), Rencanapp punya seluruh *storage* hak akses: tabel `public.user_permissions(user_id, permission_id, granted bool default true, unique(user_id,permission_id))` (`0001:41`), tabel `permissions` dengan 17 key ter-seed (`0001:199-216`), helper baca `public.has_permission(p_key)` (final `0016:35-58`), dan cermin klien `useProfile().can()` (`use-profile.ts:87-92`).

Yang **tidak ada**, terverifikasi:
1. **Tidak ada RPC grant/revoke `user_permissions`.** Pencarian `0001`–`0016` nihil. Satu-satunya jalan ubah hak akses hari ini = SQL mentah → melanggar invarian "tulis-via-RPC" + tanpa audit.
2. **Tidak ada layar admin.** `settings.tsx` belum punya route #35.
3. **RLS menutup read admin.** `user_permissions_select_self` (`0001:162`) hanya izinkan baca baris sendiri.
4. **`user_permissions` adalah satu-satunya write table tanpa `revoke insert,update,delete from authenticated,anon`** — setiap tabel Fase 8 punya revoke ini (`0014:372-382`), `user_permissions` tidak. Ini surface eskalasi paling sensitif justru paling tidak terkunci.

### Goals
- **G1.** Layar admin mobile #35 untuk lihat & ubah hak akses anggota org via toggle (mockup `ui/ux/35-permission-settings.png`, token `DESIGN.md`).
- **G2.** RPC tulis aman (0017): `SECURITY DEFINER set search_path=''`, `revoke execute from public,anon`, tulis-via-RPC baca-via-RLS/RPC.
- **G3.** Gate jelas: CEO + pemegang `manage_users_permissions` (key sudah ada `0001:208` — JANGAN seed key baru/`manage_permissions`).
- **G4.** Anti-eskalasi di server: cegah self-change, privilege-escalation, lintas-org, rantai eskalasi gate key.
- **G5.** Audit append-only setiap perubahan + jejak setiap percobaan ilegal (PRD §73.20/§73.22/§74.5).
- **G6.** Reason wajib (<=500 char).
- **G7.** Read admin se-org via RPC ber-gate (bukan RLS transparan).

---

## 2. Non-Goals
NG1 tidak menambah kategori permission/granularitas baru. NG2 section "Scope & Authority" **disembunyikan** V1.8.1 (model coarse-grained, `user_permissions` tanpa kolom scope `0001:41-48`; menampilkan kontrol non-fungsional = security theater). NG3 ROLE_DEFAULTS immutable. NG4 deny-of-default tidak didukung (`has_permission 0016:49-53` abaikan `granted=false`). NG5 tanpa approval flow. NG6 tanpa user-management (onboarding/undang/nonaktif) — bagian "User" read-only. NG7 tidak membangun layar Activity Log/Governance baru (tapi WAJIB tambah ACTION_LABEL). NG8 RPC tidak menerima scope.

---

## 3. User Stories (ringkas)
- **US-1** Admin buka Settings → entri "User & Permission" aktif hanya jika `can('manage_users_permissions')`.
- **US-2** Admin lihat anggota org + status tiap key (granted / default-locked / off).
- **US-3** Admin grant key ke user lain + reason → RPC → audit → refetch.
- **US-4** Admin revoke key custom (destruktif: konfirmasi + reason).
- **US-5** Sistem menolak self-change (grant DAN revoke) + jejak.
- **US-6** Sistem menolak non-admin / lintas-org / rantai eskalasi + jejak.

> [!warning] Catatan peran: "Manager/PIC/Reviewer" bukan role level. Gate ditentukan oleh **key** `manage_users_permissions`, bukan oleh level role.

---

## 4. Functional Requirements

### A. Akses & navigasi
- **FR-1** Gate masuk layar via `can('manage_users_permissions')` (CEO selalu true). Gate UI presentasi; server penegak akhir.
- **FR-2** Entri SECTIONS di `settings.tsx` → route `/settings-permission-users`, `permission:'manage_users_permissions'` (pola existing `settings.tsx:112`).

### B. Read model
- **FR-3** Daftar anggota org dari `profiles` (RLS org-wide) + role level.
- **FR-4** Detail per user via RPC `list_user_permissions_admin` → `{key,label,granted,is_default}`. `is_default` dihitung server dari konstanta default role (identik `has_permission 0016:44-47`).
- **FR-5** Label key dari `permissions.label` (single source, hindari drift).
- **FR-6** Read admin via **RPC ber-gate** (SECURITY DEFINER), BUKAN RLS transparan. Policy `user_permissions_select_self` lama tetap berlaku untuk non-admin (self-only).

### C. Mutasi (single setter RPC — FROZEN)
- **FR-7** RPC tunggal `public.set_user_permission(p_target_user_id uuid, p_permission_key text, p_granted boolean, p_reason text)`. (Keputusan: satu setter, bukan dua RPC — cocok toggle UI, satu signature data-layer.)
- **FR-8** Urutan validasi (setiap gagal → `raise exception`, rollback):
  1. **Gate** `has_permission('manage_users_permissions')` — paling awal (cegah kebocoran info, FR-12).
  2. **Self-target** `p_target_user_id = auth.uid()` → tolak untuk grant DAN revoke (fail-safe, anti-lockout).
  3. **Reason** `coalesce(trim(p_reason),'')<>''` dan `length(trim(p_reason))<=500`.
  4. **Key valid** ada di `permissions`.
  5. **Target** ada, `is_active`, `organization_id = current_user_org()`.
  6. **Target bukan CEO** (FR-11b).
  7. **Gate key delegation**: jika `p_permission_key='manage_users_permissions'` dan `p_granted=true` → hanya CEO (cegah rantai eskalasi).
  8. **Revoke default role** → tolak ("ubah role untuk mencabutnya").
  9. **Anti-lockout** admin terakhir (FR-11c).
- **FR-9 (grant)** `insert ... values(target, perm_id, true) on conflict (user_id,permission_id) do update set granted=true`. Idempoten; tetap menulis 1 activity_logs (re-grant ber-reason = event disengaja).
- **FR-10 (revoke)** `DELETE from user_permissions where user_id & permission_id`; `if not found → raise`. (Keputusan: DELETE, bukan `granted=false` — karena `has_permission` abaikan `granted=false` sehingga keduanya ekuivalen efektif; DELETE lebih bersih, jejak tetap di activity_logs.)
- **FR-11 (anti-eskalasi)**
  - **11a** Hanya CEO/holder gate boleh memanggil; C-Level/Management TIDAK punya gate by default.
  - **11b** Target CEO tidak boleh diubah (write inert via short-circuit, tapi tetap mutasi state/audit → diblokir).
  - **11c** Tidak boleh cabut pemegang `manage_users_permissions` terakhir di org (longgar bila ada CEO aktif — lihat OQ-3).

### D. Audit & governance (append-only)
- **FR-12** Setiap sukses memanggil `write_activity('user_permission', target_user_id, action, detail)` (signature 4-param `0005:248`). `action = 'user_permission_granted' | 'user_permission_revoked'`. `detail = {target_user_id, permission_key, granted, previous_granted, reason}`.
- **FR-13 (percobaan ilegal — PRD §73.22/§74.5, MENGIKAT)** Percobaan ubah-permission-tanpa-izin / self / eskalasi WAJIB meninggalkan jejak yang **survive rollback**.
  > [!warning] Terverifikasi: pola `insert governance_violations; raise` dalam satu transaksi (`0014:594-601`, `0014:846-848`) **ter-rollback** — baris violation TIDAK persist (semantik PG). Header `0014:16-17` sendiri keliru menggambarkan perilakunya. Jadi mekanisme harus benar-benar di luar transaksi gagal. Mekanisme konkret = **OQ-1 (bloker)**; namun *kewajiban melacak* bersifat mengikat (bukan opsional/OQ).

### E. Klien & cache
- **FR-14** Setelah RPC sukses, invalidate `['current-profile', session.user.id]` bila menyentuh aktor + refetch daftar permission target.
- **FR-15** `ROLE_DEFAULTS` (`use-profile.ts:72-76`) WAJIB tetap identik dengan default `has_permission` (`0016:44-47`) dan dengan ekspresi `is_default`. Tambah test anti-drift 3-arah.

### F. UX governance
- **FR-16** Revoke = aksi destruktif → modal konfirmasi danger + reason wajib sebelum RPC.
- **FR-17** Section "Scope & Authority" DISEMBUNYIKAN (NG2).
- **FR-18** ACTION_LABEL Indonesia baru di `settings-activity-log.tsx` (terverifikasi belum ada → fallback raw string).

---

## 5. Data Contracts

### 5.1 DDL
Tidak ada tabel/kolom baru. Wajib:
```sql
revoke insert, update, delete on public.user_permissions from authenticated, anon;
```
(gap terverifikasi; semua tabel Fase 8 punya ini, `user_permissions` tidak.)

### 5.2 RPC mutasi (single setter)
```sql
create or replace function public.set_user_permission(
  p_target_user_id uuid, p_permission_key text, p_granted boolean, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_perm_id uuid; v_target_level text; v_prev boolean;
begin
  -- 1. GATE (paling awal — FR-8.1, AC-29)
  if not public.has_permission('manage_users_permissions') then
    perform public.log_permission_attempt('permission_change_unauthorized', p_target_user_id, p_permission_key); -- survive-rollback (OQ-1)
    raise exception 'Anda tidak berwenang mengelola hak akses pengguna.';
  end if;
  -- 2. SELF diblokir grant+revoke
  if p_target_user_id = auth.uid() then
    perform public.log_permission_attempt('permission_self_change', p_target_user_id, p_permission_key);
    raise exception 'Anda tidak dapat mengubah hak akses Anda sendiri.';
  end if;
  -- 3. reason
  if coalesce(trim(p_reason),'') = '' then raise exception 'Alasan perubahan hak akses wajib diisi.'; end if;
  if length(trim(p_reason)) > 500 then raise exception 'Alasan terlalu panjang (maks 500 karakter).'; end if;
  -- 4. key valid
  select id into v_perm_id from public.permissions where key = p_permission_key;
  if v_perm_id is null then raise exception 'Kunci hak akses tidak valid.'; end if;
  -- 5. target ada/aktif/org-sama + 6. bukan CEO
  v_org := public.current_user_org();
  select rt.level into v_target_level
  from public.profiles p join public.role_templates rt on rt.id = p.role_template_id
  where p.id = p_target_user_id and p.organization_id = v_org and p.is_active;
  if v_target_level is null then raise exception 'Pengguna tidak ditemukan atau tidak aktif.'; end if;
  if v_target_level = 'ceo' then raise exception 'Hak akses CEO tidak dapat diubah.'; end if;
  -- 7. delegation gate key → hanya CEO
  if p_permission_key = 'manage_users_permissions' and p_granted
     and coalesce(public.user_role_level() = 'ceo', false) = false then
    raise exception 'Hanya CEO yang dapat memberikan hak Kelola User & Permission.';
  end if;
  select granted into v_prev from public.user_permissions where user_id = p_target_user_id and permission_id = v_perm_id;
  if p_granted then
    insert into public.user_permissions (user_id, permission_id, granted)
    values (p_target_user_id, v_perm_id, true)
    on conflict (user_id, permission_id) do update set granted = true;
    perform public.write_activity('user_permission', p_target_user_id, 'user_permission_granted',
      jsonb_build_object('target_user_id', p_target_user_id, 'permission_key', p_permission_key,
                         'granted', true, 'previous_granted', coalesce(v_prev,false), 'reason', trim(p_reason)));
  else
    -- 8. revoke default role ditolak
    if v_target_level in ('c_level','management') and p_permission_key in
       ('create_initiative','create_action_plan','create_strategy','manage_teams','review_deadline_changes')
    then raise exception 'Hak akses ini melekat pada role; ubah role untuk mencabutnya.'; end if;
    -- 9. anti-lockout (jika revoke gate key dari pemegang terakhir & tidak ada CEO aktif) — lihat OQ-3
    delete from public.user_permissions where user_id = p_target_user_id and permission_id = v_perm_id;
    if not found then raise exception 'Hak akses ini tidak diberikan secara kustom; tidak ada yang dapat dicabut.'; end if;
    perform public.write_activity('user_permission', p_target_user_id, 'user_permission_revoked',
      jsonb_build_object('target_user_id', p_target_user_id, 'permission_key', p_permission_key,
                         'granted', false, 'previous_granted', coalesce(v_prev,false), 'reason', trim(p_reason)));
  end if;
end; $$;
revoke execute on function public.set_user_permission(uuid, text, boolean, text) from public, anon;
```
> `log_permission_attempt(...)` = helper jejak survive-rollback; implementasi konkret tergantung **OQ-1**. Jika OQ-1 memilih pola "return error bukan throw", kontrak RPC berubah dari void-throw ke return-status — diputuskan sebelum TDD.

### 5.3 RPC read
```sql
create or replace function public.list_user_permissions_admin(p_target_user_id uuid)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_level text;
begin
  if not public.has_permission('manage_users_permissions') then
    raise exception 'Anda tidak berwenang melihat hak akses pengguna.';
  end if;
  v_org := public.current_user_org();
  select rt.level into v_level from public.profiles p join public.role_templates rt on rt.id=p.role_template_id
  where p.id = p_target_user_id and p.organization_id = v_org;
  if v_level is null then raise exception 'Pengguna tidak ditemukan di organisasi ini.'; end if;
  return query
  select jsonb_build_object('key', pm.key, 'label', pm.label,
    'granted', (v_level='ceo')
               or (v_level in ('c_level','management') and pm.key in
                   ('create_initiative','create_action_plan','create_strategy','manage_teams','review_deadline_changes'))
               or coalesce(up.granted,false),
    'is_default', (v_level='ceo')
               or (v_level in ('c_level','management') and pm.key in
                   ('create_initiative','create_action_plan','create_strategy','manage_teams','review_deadline_changes')))
  from public.permissions pm
  left join public.user_permissions up on up.permission_id = pm.id and up.user_id = p_target_user_id
  order by pm.key;
end; $$;
revoke execute on function public.list_user_permissions_admin(uuid) from public, anon;
```

### 5.4 Tipe TypeScript (`mobile/src/lib/permissions-admin.ts`)
```ts
export type AdminPermissionRow = { key: string; label: string; granted: boolean; is_default: boolean };
export type SetPermissionInput = { targetUserId: string; permissionKey: string; granted: boolean; reason: string };

export async function setUserPermission(i: SetPermissionInput): Promise<void> {
  const { error } = await supabase.rpc('set_user_permission', {
    p_target_user_id: i.targetUserId, p_permission_key: i.permissionKey, p_granted: i.granted, p_reason: i.reason });
  if (error) throw error;
}
export async function listUserPermissionsAdmin(targetUserId: string): Promise<AdminPermissionRow[]> {
  const { data, error } = await supabase.rpc('list_user_permissions_admin', { p_target_user_id: targetUserId });
  if (error) throw error;
  return (data ?? []) as unknown as AdminPermissionRow[];
}
```

### 5.5 Dampak RLS
- `user_permissions`: `user_permissions_select_self` (0001) tetap; **tidak** ada policy admin-read (read admin lewat RPC ber-gate). Tambah `revoke insert,update,delete ... from authenticated,anon`.
- `activity_logs`/`governance_violations`: tanpa perubahan RLS.

### 5.6 ACTION_LABEL (`settings-activity-log.tsx`)
Tambah: `'user_permission_granted':'Hak Akses Diberikan'`, `'user_permission_revoked':'Hak Akses Dicabut'`.

---

## 6. Acceptance Criteria
Lihat daftar AC-1 … AC-38 (Given/When/Then) pada bidang `acceptance_criteria` output ini. Sorotan mengikat:
- AC-3/AC-22/AC-29: gate-dulu + percobaan ilegal terlacak (PRD §73.22/§74.5).
- AC-5/AC-6: self diblokir grant+revoke.
- AC-8/AC-19/AC-20: rantai eskalasi, CEO-target, anti-lockout.
- AC-15/AC-17: revoke=DELETE; default role tak bisa dicabut.
- AC-26/AC-27: revoke table privilege + revoke execute (WAJIB).
- AC-35: ACTION_LABEL Indonesia.

---

## 7. Edge Cases & Error Paths
- **Permission-denied:** non-admin buka layar → AccessDenied; panggil RPC → gate raise + jejak (AC-3/22). Tulis langsung `user_permissions` → ditolak privilege (AC-26).
- **Self-target / lintas-org / CEO-target / gate-delegation / anti-lockout:** raise per FR-8 + jejak untuk kategori eskalasi.
- **Validasi:** key invalid, reason kosong/>500, target nonaktif → raise.
- **Revoke no-op / default role:** raise pesan jelas (AC-16/17).
- **Race:** `on conflict` (grant) & DELETE idempoten; hasil akhir konsisten.
- **Empty states:** "Belum ada pengguna lain untuk dikelola." tanpa tombol onboarding (NG6). Semua key selalu tampil (grid penuh, off + badge default).
- **Loading:** skeleton untuk profil & daftar; tombol Simpan disabled saat mutasi pending; optimistic rollback saat error.
- **Network/sesi:** `if(error) throw` → UI tampil error.message; sesi hilang → auth-provider redirect.

---

## 8. Open Questions
Lihat bidang `open_questions`. Bloker TDD: **OQ-1** (mekanisme jejak survive-rollback → menentukan kontrak RPC throw vs return). Lainnya keputusan owner (revoke-self, anti-lockout w/CEO, delegation, CEO-target, deny-default, terminologi reason, scope section, notifikasi, severity People Score).

---

## 9. Handoff ke TDD
**Deliverable 0017 (urut):**
1. `set_user_permission(uuid,text,boolean,text)` + `revoke execute from public,anon`.
2. `list_user_permissions_admin(uuid)` + `revoke execute from public,anon`.
3. `revoke insert,update,delete on public.user_permissions from authenticated,anon` (WAJIB).
4. Mekanisme jejak percobaan ilegal (per OQ-1) — survive rollback.
5. Tidak ada tabel/kolom/seed key baru.
6. Regenerate `database.types.ts`; buat `permissions-admin.ts`; layar `settings-permission-users.tsx`; entri SECTIONS `settings.tsx`; ACTION_LABEL `settings-activity-log.tsx`.

**Urutan red-green disarankan:** (1) DB contract: gate/self/validasi/org/CEO/delegation/anti-lockout raise; (2) grant upsert+audit; (3) revoke DELETE+audit+default-role-block; (4) table+function privilege; (5) jejak percobaan persist; (6) list_user_permissions_admin gate+org+is_default; (7) anti-drift 3-arah default list; (8) data-layer; (9) komponen layar + ACTION_LABEL + a11y + konfirmasi destruktif + optimistic rollback.

**FROZEN (jangan ubah tanpa owner):** single setter; revoke=DELETE; self diblokir simetris; gate key hanya CEO; CEO tak boleh jadi target; scope section disembunyikan; deny-of-default tidak didukung; reason wajib <=500.