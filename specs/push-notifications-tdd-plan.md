# Rencana TDD Push Notifications — RencanApp

> **Status**: FINAL (post-critic adjudication 2026-07-13). 8 concern + 8 missing cases diadjudikasi → 40 test cases.
> **Spec**: `specs/push-notifications.md` (Fase 1 only).

## Ringkasan Fitur

Push Notifications menjembatani notifikasi in-app yang sudah ada (`emit_notification` RPC) ke device push saat app background/tertutup. Fase 1 mencakup 7 tipe eksekusi/review yang deep-link-nya sudah berfungsi: `review_request`, `approved`, `rejected`, `revision_requested`, `deadline_reminder`, `repeat_due`, `instance_missed`. Arsitektur: token registry via RPC (bukan INSERT langsung), Edge Function drainer decoupled (poll-based outbox), deep-link reuse kontrak `(entity_type, entity_id)`.

## File Test

| # | File Test | Layer | Jumlah Case |
|---|-----------|-------|-------------|
| 1 | `mobile/src/lib/__tests__/push-notifications.test.ts` | Data | 11 |
| 2 | `mobile/src/hooks/__tests__/use-push-notifications.test.tsx` | Hooks | 20 |
| 3 | `mobile/src/app/(app)/(tabs)/__tests__/notifications-push.test.tsx` | UI | 4 |
| 4 | `mobile/src/providers/__tests__/auth-push-integration.test.tsx` | Integration | 5 |
| | **Total** | | **40** |

## File Produksi (akan dibuat/dimodifikasi)

| File | Aksi | Deskripsi |
|------|------|-----------|
| `mobile/src/lib/push-notifications.ts` | **Baru** | Data layer: PUSH_WORTHY_TYPES, isPushWorthy, getPushCopy, registerPushToken, unregisterPushToken |
| `mobile/src/hooks/use-push-notifications.ts` | **Baru** | Hooks: usePushRegistration (termasuk permission), usePushHandler |
| `mobile/src/lib/push-route-resolver.ts` | **Baru** (refactor step 8) | Pure function resolveNotificationRoute |
| `mobile/src/app/(app)/(tabs)/notifications.tsx` | **Modifikasi** | Tambah push permission banner |
| `mobile/src/providers/auth-provider.tsx` | **Modifikasi** | Panggil unregisterPushToken saat signOut |

---

## Urutan Langkah Red-Green-Refactor

### Blok A: Data Layer (Pure + Supabase RPC)

#### Step 1 — RED: Tulis 11 test data layer

**File**: `mobile/src/lib/__tests__/push-notifications.test.ts`

Test cases:
1. `PUSH_WORTHY_TYPES` berisi tepat 7 tipe Fase 1 (termasuk `revision_requested`)
2. Setiap elemen `PUSH_WORTHY_TYPES` valid terhadap `NOTIFICATION_TYPES`
3. `isPushWorthy` returns true untuk 7 tipe whitelisted
4. `isPushWorthy` returns false untuk tipe non-whitelisted (comment, mention, governance_warning, deadline_change_*)
5. `getPushCopy` mengembalikan title/body per spec §7 untuk setiap push-worthy type
6. `getPushCopy` mengembalikan copy generik fail-closed untuk tipe unknown/non-push-worthy
7. `registerPushToken` memanggil RPC `register_push_token` dengan `{p_expo_token, p_platform, p_device_id}`
8. `registerPushToken` meneruskan `null` untuk `p_device_id` saat deviceId dihilangkan
9. `registerPushToken` propagasi error Supabase
10. `unregisterPushToken` memanggil RPC `unregister_push_token` dengan `{p_expo_token}`
11. `unregisterPushToken` propagasi error Supabase

**Semua GAGAL**: MODULE_NOT_FOUND (modul belum ada).

#### Step 2 — GREEN: Implementasi data layer

**File**: `mobile/src/lib/push-notifications.ts`

Implementasi:
- `PUSH_WORTHY_TYPES` constant (array 7 tipe, `as const`)
- `isPushWorthy(type: string): boolean` — cek membership di PUSH_WORTHY_TYPES
- `getPushCopy(type: string): {title: string; body: string}` — lookup map per spec §7, fallback `{title:'Pembaruan baru', body:'Ada pembaruan yang perlu ditinjau.'}`
- `registerPushToken(expoToken, platform, deviceId?)` — `supabase.rpc('register_push_token', {...})`
- `unregisterPushToken(expoToken)` — `supabase.rpc('unregister_push_token', {...})`

**Semua 11 test HIJAU.**

#### Step 3 — REFACTOR: Tighten types & naming

- Verifikasi cross-import NOTIFICATION_TYPES dari `./notifications`
- Pastikan naming convention konsisten (camelCase functions, UPPER_SNAKE constants)
- `npm test` + `tsc --noEmit` nol regresi

---

### Blok B: Hooks — usePushRegistration

#### Step 4 — RED: Tulis 10 test usePushRegistration

**File**: `mobile/src/hooks/__tests__/use-push-notifications.test.tsx`

> **Prasyarat**: `npx expo install expo-notifications` sebelum step ini (C2 adjudication).

Test cases:
1. [PN-REG-1] `register()` saat izin granted: token diperoleh + `registerPushToken` dipanggil
2. [PN-REG-2] `register()` saat izin denied: token TIDAK diperoleh, tanpa error
3. [PN-REG-3] `registerPushToken` gagal: error di-log (`reportError`) bukan di-throw (best-effort)
4. [PN-REG-4] `unregister()` memanggil `unregisterPushToken` dengan token
5. [PN-REG-5] `unregister()` gagal: error di-log bukan di-throw (best-effort)
6. [PN-REG-6] `permissionStatus` diekspos dari `getPermissionsAsync` saat mount
7. [PN-REG-7] `register()` dengan `deviceId` opsional diteruskan ke `registerPushToken`
8. **[PN-REG-8]** `register()` passes `projectId` ke `getExpoPushTokenAsync({ projectId })` (M3)
9. **[PN-REG-9]** `permissionStatus` updates dari 'undetermined' ke 'granted' setelah `register()` berhasil (M6)
10. **[PN-REG-10]** `Platform.OS === 'android'` → `setNotificationChannelAsync('default', {...})` dipanggil saat mount (M8)

**Semua GAGAL**: MODULE_NOT_FOUND.

**Mock setup** (adjudikasi C1, C4, C8):

```typescript
// Platform.OS — gunakan Object.defineProperty, BUKAN jest.mock seluruh modul (C1)
import { Platform } from 'react-native';
Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });

// expo-notifications
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...a) => mockGetPermissionsAsync(...a),
  requestPermissionsAsync: (...a) => mockRequestPermissionsAsync(...a),
  getExpoPushTokenAsync: (...a) => mockGetExpoPushTokenAsync(...a),
  setNotificationHandler: (...a) => mockSetNotificationHandler(...a),
  setNotificationChannelAsync: (...a) => mockSetNotificationChannelAsync(...a),
  addNotificationReceivedListener: (...a) => mockAddNotificationReceivedListener(...a),
  addNotificationResponseReceivedListener: (...a) => mockAddNotificationResponseReceivedListener(...a),
  getLastNotificationResponseAsync: (...a) => mockGetLastNotificationResponseAsync(...a),
  AndroidImportance: { MAX: 5 },
}));

// expo-router — sertakan useFocusEffect (C4)
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: jest.fn(cb => cb()),
}));

// QueryClient wrapper — pakai makeWrapper() pattern (C8)
function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}
```

#### Step 5 — GREEN: Implementasi usePushRegistration

**File**: `mobile/src/hooks/use-push-notifications.ts`

Implementasi hook `usePushRegistration()`:
- `useState` untuk `permissionStatus`, `token`
- `useEffect` mount: `getPermissionsAsync()` → set `permissionStatus`; Android → `setNotificationChannelAsync('default', { name: 'Default', importance: AndroidImportance.MAX })`
- `register(deviceId?)`: `requestPermissionsAsync()` → jika granted: `getExpoPushTokenAsync({ projectId })` → `registerPushToken(token, Platform.OS, deviceId)` → set `permissionStatus('granted')` → set `token`. Dibungkus try/catch → `reportError`
- `unregister()`: `unregisterPushToken(token)`. Dibungkus try/catch → `reportError`
- Return `{ permissionStatus, token, register, unregister }`

> **C3 resolved**: TIDAK ada `usePushPermission` terpisah — permission management ada di `usePushRegistration` satu hook.

**Semua 10 test HIJAU.**

---

### Blok C: Hooks — usePushHandler

#### Step 6 — RED: Tulis 10 test usePushHandler

**File**: `mobile/src/hooks/__tests__/use-push-notifications.test.tsx` (tambahan)

Test cases:
1. [PN-HDL-1] mount memanggil `setNotificationHandler` dengan `shouldShowAlert=false`
2. [PN-HDL-2] foreground receipt → invalidate `['notifications']` (via spy `qc.invalidateQueries`)
3. [PN-HDL-3] tap `entity_type=action_plan` → `router.push('/action-plan/{id}')`
4. [PN-HDL-4] tap `entity_type=action_plan_instance` → `router.push('/action-plan/instance/{id}')`
5. [PN-HDL-5] tap → invalidate `['notifications']`
6. [PN-HDL-6] `entity_type` null/unknown → tidak crash, tidak navigate (fallback)
7. [PN-HDL-7] session null → tap TIDAK navigate
8. [PN-HDL-8] unmount melepas semua listener
9. [PN-HDL-9] cold start `getLastNotificationResponseAsync` → navigate saat mount (session valid)
10. **[PN-HDL-10]** cold start + session null saat mount → response di-queue, navigate saat session tersedia (M7)

**Semua GAGAL**: usePushHandler belum ada.

#### Step 7 — GREEN: Implementasi usePushHandler

**File**: `mobile/src/hooks/use-push-notifications.ts`

Implementasi hook `usePushHandler(session)`:
- `useRef` untuk pending cold-start response
- `useEffect` (dep: session):
  - `setNotificationHandler({handleNotification: async()=>({shouldShowAlert:false, shouldPlaySound:false, shouldSetBadge:false})})`
  - `addNotificationReceivedListener` → `queryClient.invalidateQueries({queryKey:['notifications']})`
  - `addNotificationResponseReceivedListener` → extract payload → guard session null → resolve route → `router.push(route)` → invalidate
  - `getLastNotificationResponseAsync` → jika session null: simpan ke ref; jika session valid: routing langsung
  - Cleanup: remove kedua listener
- `useEffect` (dep: session) kedua: jika session tersedia + pending ref → process + clear ref

**Semua 10 test HIJAU.**

#### Step 8 — REFACTOR: Ekstrak route resolver + tests (M4)

**File baru**: `mobile/src/lib/push-route-resolver.ts`
**File test baru**: `mobile/src/lib/__tests__/push-route-resolver.test.ts`

Ekstrak `resolveNotificationRoute(entityType, entityId): string | null` ke pure function:
- `action_plan` → `/(app)/action-plan/${entityId}`
- `action_plan_instance` → `/(app)/action-plan/instance/${entityId}` (special case, bukan di ENTITY_ROUTE_SEGMENT)
- Entity lain (`goal`, `kpi_area`, `initiative`, dst) → lookup `ENTITY_ROUTE_SEGMENT[entityType]` → `/(app)/${segment}/${entityId}`
- `null`/unknown → return `null`

**4 test cases** (pure function — tanpa mock):
1. `resolveNotificationRoute('action_plan', 'uuid-1')` → correct path
2. `resolveNotificationRoute('action_plan_instance', 'uuid-2')` → correct path
3. `resolveNotificationRoute('goal', 'uuid-3')` → correct path via ENTITY_ROUTE_SEGMENT
4. `resolveNotificationRoute(null, 'uuid-4')` → `null`; `resolveNotificationRoute('unknown_type', 'uuid-5')` → `null`

> Catatan: 4 test ini BUKAN bagian dari 40 total — ini test refactor yang ditambahkan di step refactor. Namun WAJIB hijau sebelum lanjut.

**usePushHandler** import `resolveNotificationRoute` menggantikan inline logic. Nol regresi pada 10 test PN-HDL-*.

Logger: gunakan `reportError` dari `@/lib/errors`, **bukan** `console.log` (per global rules).

---

### Blok D: UI — Push Permission Banner

#### Step 9 — RED: Tulis 4 test UI

**File**: `mobile/src/app/(app)/(tabs)/__tests__/notifications-push.test.tsx`

Test cases:
1. Banner muncul saat permission status `undetermined`
2. CTA 'Aktifkan' memanggil `register()` tepat 1x
3. Denied state: guidance text 'Buka pengaturan perangkat' ditampilkan
4. 'Buka Pengaturan' memanggil `Linking.openSettings`

**Semua GAGAL**: NotificationsScreen belum merender banner.

**Mock setup** (adjudikasi C6):

```typescript
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

// Mock hooks — sertakan SEMUA yang dikonsumsi NotificationsScreen (C6)
jest.mock('@/hooks/use-push-notifications', () => ({
  usePushRegistration: () => mockUsePushRegistration(),
}));
jest.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => mockUseNotifications(),
  useUnreadCount: () => mockUseUnreadCount(),
  useNotificationActions: () => mockUseNotificationActions(),
}));
jest.mock('@/providers/theme-provider', () => ({
  useThemePreference: () => ({ theme: 'light' }),
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));
jest.mock('expo-linking', () => ({
  openSettings: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: jest.fn(cb => cb()),
}));
```

#### Step 10 — GREEN: Implementasi push permission banner

**File**: `mobile/src/app/(app)/(tabs)/notifications.tsx`

Modifikasi NotificationsScreen:
- Import `usePushRegistration` dari `@/hooks/use-push-notifications`
- Render banner di atas SectionList:
  - `undetermined`: teks "Aktifkan notifikasi push agar tidak terlewat" + tombol "Aktifkan" → `register()`
  - `denied`: teks "Notifikasi dinonaktifkan" + tombol "Buka Pengaturan" → `Linking.openSettings()`
  - `granted`: sembunyikan banner

> **C3 resolved**: UI consume `usePushRegistration` (bukan `usePushPermission` terpisah).

**Semua 4 test HIJAU.**

#### Step 11 — REFACTOR: Ekstrak komponen + validasi akhir

- Ekstrak `PushPermissionBanner` ke komponen terpisah jika > 30 baris
- Validasi DESIGN.md compliance (spacing, a11y touch target ≥ 44px, warna brand-dark pada solid+teks putih)
- Full suite: `npm test` + `tsc --noEmit` + `npm run lint`
- Konfirmasi seluruh 40 test hijau tanpa regresi

---

### Blok E: Integration — auth-provider signOut (M2)

#### Step 12 — RED: Tulis 5 test auth-push integration

**File**: `mobile/src/providers/__tests__/auth-push-integration.test.tsx`

Test cases:
1. [PN-AUTH-1] `signOut` memanggil `unregisterPushToken` SEBELUM `queryClient.clear()`
2. [PN-AUTH-2] `unregisterPushToken` gagal → signOut tetap berhasil (best-effort, di-log)
3. [PN-AUTH-3] `signOut` tanpa token tersimpan → `unregisterPushToken` TIDAK dipanggil
4. [PN-AUTH-4] Session switch (user lain login) → token lama di-unregister sebelum register baru
5. [PN-AUTH-5] `signOut` urutan: unregister → supabase.auth.signOut → queryClient.clear

**Semua GAGAL**: auth-provider belum memanggil push functions.

#### Step 13 — GREEN: Modifikasi auth-provider

**File**: `mobile/src/providers/auth-provider.tsx`

- Import `unregisterPushToken` dari `@/lib/push-notifications`
- Di `signOut()`: ambil token dari state/ref → `await unregisterPushToken(token).catch(reportError)` → lanjut signOut biasa
- Token disimpan di ref setelah `usePushRegistration().register()` sukses

**Semua 5 test HIJAU.**

#### Step 14 — Final validation

- Full suite: `npm test` + `tsc --noEmit` + `npm run lint`
- Seluruh **40 test hijau** tanpa regresi
- Review checklist: FR-PN-01 s/d FR-PN-25 ter-cover oleh test

---

## Strategi Mocking

### Layer Data (`push-notifications.test.ts`)

```typescript
// Mock supabase — pola identik notifications.test.ts
const mockRpc = jest.fn();
jest.mock('../supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));
```

Pure functions (PUSH_WORTHY_TYPES, isPushWorthy, getPushCopy) **tidak perlu mock** — test langsung input/output.

### Layer Hooks (`use-push-notifications.test.tsx`)

Lihat mock setup di Step 4. Key points:
- **Platform.OS**: `Object.defineProperty`, BUKAN `jest.mock` seluruh modul (C1 fix)
- **expo-notifications**: mock semua API termasuk `setNotificationChannelAsync` + `AndroidImportance` (M8)
- **expo-router**: sertakan `useFocusEffect` (C4 fix)
- **QueryClient**: `makeWrapper()` pattern yang return `{ qc, wrapper }` (C8 fix)

### Layer UI (`notifications-push.test.tsx`)

Lihat mock setup di Step 9. Key points:
- Mock SEMUA hooks yang dikonsumsi NotificationsScreen (C6 fix)
- `usePushRegistration` (bukan `usePushPermission` — C3 resolved)

---

## Risiko

1. **Mock drift expo-notifications**: Paket belum terinstall; API mock bisa diverge dari API riil SDK 56. Mitigasi: `npx expo install expo-notifications` di awal Blok B; review `getExpoPushTokenAsync({ projectId })` signature.
2. **database.types.ts belum ada push_tokens**: Hand-define types sementara, ganti setelah migrasi + regen.
3. **Platform.OS mock fragility**: Adjudikasi C1 memperbaiki ke `Object.defineProperty` (lebih stabil), tapi path bisa berubah antar versi RN.
4. **entity-routes.ts belum punya action_plan_instance**: Handle eksplisit di `resolveNotificationRoute` sebelum lookup ENTITY_ROUTE_SEGMENT.
5. **NotificationsScreen complexity**: Refactor step 11 mengekstrak banner ke komponen terpisah.
6. **Cold start race condition**: PN-HDL-10 (M7) memverifikasi queue+replay; parent memanggil hook hanya setelah session valid.
7. **Nomor migrasi bentrok**: Rekonsiliasi saat land (sesuai spec).
8. **Logger seam**: Gunakan `reportError` dari `lib/errors.ts`, bukan `console.log` (global rules).

---

## Adjudikasi Temuan Critic (2026-07-13)

Critic verdict awal: **perlu-perbaikan**. 8 concern + 8 missing cases diadjudikasi:

### Concerns

| # | Temuan | Verdict | Aksi |
|---|--------|---------|------|
| C1 | Platform.OS mock seluruh-modul vs `Object.defineProperty` | **VALID** | Ganti ke `Object.defineProperty` per pola `theme-provider.test.tsx:23` |
| C2 | expo-notifications belum terinstall | **VALID, diterima** | Install di awal Blok B; projectId ditambah (M3) |
| C3 | `usePushPermission` vs `usePushRegistration` overlap | **VALID** | Hapus hook terpisah — merge ke `usePushRegistration` |
| C4 | Mock expo-router kurang `useFocusEffect` | **VALID** | Ditambah ke mock setup |
| C5 | PN-HDL-10 anti-invalidation test brittle | **VALID** | Hapus case — nilai rendah |
| C6 | UI test mock tidak lengkap | **VALID** | Tambah mock `useThemePreference`, `Ionicons`, dsb |
| C7 | Error propagation coupling | **DITERIMA** | Konsisten dgn pola existing |
| C8 | `useQueryClient` butuh `makeWrapper` pattern | **VALID** | Ditambah note eksplisit |

### Missing Cases

| # | Temuan | Verdict | Aksi |
|---|--------|---------|------|
| M1 | `usePushPermission` tanpa test | **DISSOLVED** oleh C3 |
| M2 | signOut + unregister tanpa test | **VALID** | +5 test di Blok E |
| M3 | projectId wajib di SDK 56 | **VALID** | +1 case PN-REG-8 |
| M4 | `resolveNotificationRoute` tanpa test | **VALID** | +4 test di step 8 refactor |
| M5 | entity_type coverage | **COVERED** oleh M4 |
| M6 | permissionStatus update post-register | **VALID** | +1 case PN-REG-9 |
| M7 | Cold start + session null | **VALID** | +1 case PN-HDL-10 (replace C5) |
| M8 | Android notification channel | **VALID** | +1 case PN-REG-10 |

**Verdict akhir post-adjudikasi: SIAP** (40 test cases, 14 steps, 5 file produksi).
