# Rencana TDD — permission-settings (#35 "User & Permission")

Status: siap-eksekusi. Spec final `specs/permission-settings.md` (terverifikasi 2026-06-26). Migrasi target **0017** (setelah `0016_security_hardening.sql`). Resolusi **OQ-1 (owner 2026-06-26)**: RPC kontrak **THROW returns void**; helper `log_permission_attempt` **TIDAK dibangun di V1** (logging survive-rollback ditunda — accepted limitation, sama seperti keterbatasan teknis Fase 7). AC path-gagal hanya mengunci: exception Indonesia yang tepat fires + tidak ada perubahan state. Audit row hanya pada SUCCESS (`write_activity`).

## 1. Ringkasan fitur
Layar admin mobile #35 untuk melihat & mengubah hak akses anggota org via toggle, dengan:
- RPC tulis tunggal `set_user_permission(p_target_user_id uuid, p_permission_key text, p_granted boolean, p_reason text) returns void` (FROZEN).
- RPC baca ber-gate `list_user_permissions_admin(p_target_user_id uuid) returns setof jsonb {key,label,granted,is_default}`.
- Keamanan server: `SECURITY DEFINER set search_path=''`, `revoke execute from public,anon`, `revoke insert,update,delete on public.user_permissions from authenticated,anon` (gap terverifikasi — WAJIB).
- Anti-eskalasi: self diblok grant+revoke simetris; CEO tak boleh jadi target; delegation gate key hanya CEO; default-role tak bisa dicabut; revoke=DELETE; reason wajib ≤500.
- Klien: lib `permissions-admin.ts` + hook `use-permissions-admin.ts`; layar `settings-permission-users.tsx`; entri SECTIONS `settings.tsx`; ACTION_LABEL Indonesia `settings-activity-log.tsx`; test anti-drift 3-arah ROLE_DEFAULTS vs has_permission vs is_default.

## 2. Daftar file test
| Layer | File test | Cases |
|---|---|---|
| DB contract | `supabase/tests/0017_permission_settings_contract.sql` | TestA–TestN (gate/self/validasi/org/CEO/delegation/default-role/no-op + grant/revoke/audit + list gate/is_default + privilege table & execute) |
| Data layer | `mobile/src/lib/__tests__/permissions-admin.test.ts` | 8 (marshalling snake_case, void, propagasi error, passthrough rows, `data ?? []`) |
| Hooks | `mobile/src/hooks/__tests__/use-permissions-admin.test.tsx` | P-H1–P-H10 (query+enabled, mutasi, invalidation kondisional FR-14, error, isPending) |
| Screen | `mobile/src/app/(app)/__tests__/settings-permission-users.test.tsx` | P-UI-01–P-UI-16 (gate, grid+badge, modal grant/revoke, validasi reason, rollback, a11y) |
| Integrasi | `mobile/src/app/(app)/__tests__/fase8-settings-screens.test.tsx` | P-UI-17–P-UI-20 (SECTIONS gate+push, ACTION_LABEL) |
| Anti-drift | `mobile/src/hooks/__tests__/use-profile.test.tsx` | K6 (ROLE_DEFAULTS vs can() vs is_default) |

## 3. Urutan langkah red → green → refactor
Server-first (DB contract sebagai RED layer invarian governance), lalu data → hooks → screen → integrasi → anti-drift.

1. **RED** — Contract SQL path-gagal TestA–TestH (gate, self, reason, key, target/org/aktif, CEO-target, delegation, revoke default-role, revoke no-op) + verifikasi state unchanged.
2. **RED** — Contract SQL path-sukses + read + privilege TestI–TestN (grant upsert+audit, idempoten, revoke DELETE+audit, list gate+is_default, table privilege ditolak, execute revoked).
3. **GREEN** — `supabase/migrations/0017_permission_settings.sql` (kedua RPC + revoke privilege) → apply via MCP → TestA–TestN hijau. **Tanpa `log_permission_attempt`.**
4. **GREEN** — Regenerate `mobile/src/lib/database.types.ts` (signature RPC baru) via MCP.
5. **RED** — `permissions-admin.test.ts` (8 cases).
6. **GREEN** — `mobile/src/lib/permissions-admin.ts`.
7. **RED** — `use-permissions-admin.test.tsx` (P-H1–P-H10).
8. **GREEN** — `mobile/src/hooks/use-permissions-admin.ts`.
9. **RED** — `settings-permission-users.test.tsx` (P-UI-01–P-UI-16).
10. **GREEN** — `mobile/src/app/(app)/settings-permission-users.tsx`.
11. **RED** — tambah P-UI-17–P-UI-20 ke `fase8-settings-screens.test.tsx`.
12. **GREEN** — aktifkan SECTIONS di `settings.tsx` + ACTION_LABEL di `settings-activity-log.tsx`.
13. **RED** — anti-drift K6 di `use-profile.test.tsx`.
14. **REFACTOR** — ekstrak `MGR_DEFAULT_KEYS` ke `mobile/src/lib/permission-defaults.ts`, konsumsi di use-profile.ts + test.
15. **REFACTOR** — pass akhir: `npm test` penuh hijau (no regresi), seluruh contract ROLLBACK_OK, audit DESIGN.md §4 (touch ≥44px, brand-dark, warna≠satu-satunya sinyal).

## 4. Strategi mocking (ringkas)
- **SQL contract**: integrasi nyata via MCP `execute_sql`; `set_config('request.jwt.claims', ...)` untuk `auth.uid()`; user transient `gen_random_uuid()` + insert `auth.users`/`profiles`; assertion gagal via `begin perform ...; raise 'FAIL'; exception when others then if sqlerrm like '%frasa%' ...`; akhiri `raise 'ROLLBACK_OK'`. UUID dev: org `4b07a19f-...`, ceo `ca8c1471-...`.
- **Data layer**: `jest.mock('../supabase')` dengan `mockRpc` sebelum import; sukses `{data,error:null}`, error `{data:null,error:{message}}` + `.rejects.toEqual(...)`.
- **Hooks**: mock `@/lib/permissions-admin` + `@/providers/auth-provider`; `QueryClientProvider` wrapper (retry:false); `jest.spyOn(qc,'invalidateQueries')`; `act()`/`waitFor` untuk async; isPending via promise tertahan.
- **Screen**: pola `fase8-settings-screens.test.tsx` — mock supabase/use-profile(can)/use-permissions-admin/auth-provider/expo-router; modal **in-tree berlabel** (bukan `Alert` native) agar `getByLabelText('Konfirmasi'/'Batal'/'Cabut')` + char counter dapat di-assert; toggle `accessibilityRole='switch'` + `accessibilityState.checked`.

## 5. Risiko utama
- **OQ-1**: jangan menyalin `perform log_permission_attempt(...)` dari template spec §5.2 — helper itu ditunda; RPC cukup `raise exception`. Salin mentah = migrasi gagal.
- **Anti-drift 3-arah**: 6 key default tersebar di ROLE_DEFAULTS (`use-profile.ts:72-76`), has_permission (`0016:44-47`), dan is_default (`0017` §5.3) — wajib satu test K6 yang menjepit ketiganya.
- **Modal in-tree vs Alert**: test RNTL meng-assert label modal & counter → gunakan modal in-tree, bukan `Alert`.
- **Sumber daftar anggota org (FR-3)**: tetapkan hook members konkret sebelum green screen.
- **Privilege revoke (AC-26/27)**: mudah terlupa — jepit dengan TestM/TestN (INSERT langsung ditolak, execute revoked).
- **Regenerate types**: tanpa langkah 4, `supabase.rpc('set_user_permission'|'list_user_permissions_admin')` tak type-safe.

## 6. Deliverable 0017 (urut handoff spec §9)
1. `set_user_permission` + `revoke execute from public,anon`.
2. `list_user_permissions_admin` + `revoke execute from public,anon`.
3. `revoke insert,update,delete on public.user_permissions from authenticated,anon`.
4. Regenerate `database.types.ts`.
5. `mobile/src/lib/permissions-admin.ts` + `mobile/src/hooks/use-permissions-admin.ts`.
6. `mobile/src/app/(app)/settings-permission-users.tsx`.
7. Entri SECTIONS `settings.tsx` (`href:/settings-permission-users`, `permission:manage_users_permissions`).
8. ACTION_LABEL Indonesia `settings-activity-log.tsx` (`user_permission_granted`/`revoked`).
9. Test anti-drift 3-arah.
