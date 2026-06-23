# Rencana TDD — Fase 2: Action Plan Repeat (Mobile Data/Hooks/UI)

> Cakupan: lapisan **mobile** (data layer `repeat.ts`, hook `use-repeat-instances.ts`, UI `new.tsx`/`[id].tsx`). RPC/RLS/migrasi 0007 adalah kontrak server, **tidak** diuji di sini (di-mock). Spec: `specs/fase-2-action-plan-repeat.md` §5.5/§5.8/§7.

## 1. Ringkasan Fitur
Action Plan Repeat mengubah `repeat_setting` jadi fungsional: rule berulang (daily/weekly/monthly/custom) meng-generate **instance** terjadwal dengan deadline tz-aware, status `missed` ditetapkan job sistem, dan metrik **Repeat Compliance** (on-time/expected) read-only. Deliverable: Daily Finance Closing 1–30 Juni 2026 → 30 instance, 2 missed, compliance 28/30.

Enum status instance (`assigned/in_progress/submitted/done/revision/missed/archived`) BERBEDA dari parent `action_plans` (punya `missed`), sehingga butuh `INSTANCE_STATUS_LABEL`/`INSTANCE_STATUS_TONE` terpisah di `repeat.ts`.

## 2. Daftar File Test
| Layer | File test | Jumlah case |
|---|---|---|
| Data | `mobile/src/lib/__tests__/repeat.test.ts` | 14 |
| Hooks | `mobile/src/hooks/__tests__/use-repeat-instances.test.tsx` | 7 |
| UI | `mobile/src/app/(app)/action-plan/__tests__/repeat-ui.test.tsx` | 9 |

File implementasi yang disentuh: `mobile/src/lib/repeat.ts` (baru), `mobile/src/hooks/use-repeat-instances.ts` (baru), `mobile/src/app/(app)/action-plan/new.tsx` & `[id].tsx` (modifikasi), `mobile/package.json` (config jest), opsional `submit.tsx`.

## 3. Urutan Langkah Red → Green → Refactor

0. **GREEN/SETUP** — `package.json`: tambah `moduleNameMapper { "^@/(.*)$": "<rootDir>/src/$1" }` di blok jest. Verifikasi `npm test` (cards.test.ts) tetap hijau. *(Wajib lebih dulu — suite hooks/UI memakai `@/`.)*
1. **RED** — Tulis 14 case `repeat.test.ts` (mock `../supabase`). Merah: `../repeat` belum ada.
2. **GREEN** — Buat `repeat.ts`: type + `INSTANCE_STATUS_LABEL`/`INSTANCE_STATUS_TONE` + 6 pemanggil tipis (RPC + query builder). 14 hijau.
3. **RED** — Tulis 7 case `use-repeat-instances.test.tsx` (mock `@/lib/repeat`, `@/hooks/use-profile`; wrapper QueryClientProvider). Merah.
4. **GREEN** — Buat `use-repeat-instances.ts`: `useRepeatInstances` (dua useQuery + `compliancePercent` + `refresh`) & `useInstanceActions` (canStart/canSubmit/canReview/isSelfApproval). 7 hijau.
5. **RED** — Tulis 9 case `repeat-ui.test.tsx` (mock cards/repeat/use-profile/expo-router). Merah.
6. **GREEN** — Modifikasi `new.tsx` (toggle Repeat + field bersyarat + grace conditional), lalu `[id].tsx` (daftar instance + badge + compliance + '—' + missed-hide-submit + cabang one_time). 9 hijau. Jalankan SELURUH `npm test`.
7. **REFACTOR** — Ekstrak `InstanceRow`/`RepeatRuleForm`, DRY `compliancePercent`, hapus cast `as never` setelah `database.types.ts` diregenerasi. Semua tetap hijau.
8. **(Opsional)** RED→GREEN `submit.tsx` per-instance (`submitInstance` + `instanceId` param).

## 4. Strategi Mocking (ringkas)
- **Data**: `jest.mock('../supabase', () => ({ supabase: { rpc, from, auth } }))` di top-file. RPC → `jest.fn().mockResolvedValue({data,error})`; query → builder chainable berjenjang (`from->select->eq->order`/`single`). Tanpa native, tanpa provider.
- **Hooks**: mock **data layer** (`@/lib/repeat`) + `@/hooks/use-profile`; bungkus `QueryClientProvider` (retry:false); `renderHook` + `waitFor`; `jest.spyOn(qc,'invalidateQueries')` untuk refresh.
- **UI**: `render()` + QueryClientProvider; mock `@/lib/cards`, `@/lib/repeat`, `@/hooks/use-profile`, `expo-router` (`useLocalSearchParams`/`useRouter`/`useFocusEffect`), `@/components/user-picker`; pakai `findBy*` untuk data async; pastikan hook compliance `enabled: repeat_setting==='repeat'` agar `not.toHaveBeenCalled()` pada one_time terpenuhi.

## 5. Risiko Utama
1. **Alias `@/` di jest** belum dipetakan (kritis) — Langkah 0 wajib.
2. **`database.types.ts`** belum punya tabel baru — pakai cast sementara, regen setelah migrasi 0007.
3. **Kontrak argumen RPC `p_*`** harus persis spec §5.5 (toHaveBeenCalledWith ketat).
4. **Builder query chainable** harus cocok dengan rantai implementasi.
5. **useFocusEffect / expo-router** perlu di-mock benar.
6. **NativeWind v5 preview + react-native-css** bisa butuh `transformIgnorePatterns`.
7. **enabled-flag compliance** menentukan lulusnya `not.toHaveBeenCalled()` one_time.
8. **Pembulatan `compliancePercent`** harus `Math.round(...)+'%'` = `'93%'`.