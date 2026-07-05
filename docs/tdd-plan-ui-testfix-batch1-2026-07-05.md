# Rencana TDD — Bug Fix UI Batch 1

Fitur: **AUTH-02b** (client-side password min-length) + **CFG-01** (Supabase local web preview fix).
Spec sumber: `docs/spec-ui-testfix-2026-07-05.md` (FR-AUTH02.1–5, FR-CFG01.1–4).
Runner: `jest-expo` + `@testing-library/react-native` (240/240 hijau — tidak boleh regres).
Prinsip: RED → GREEN → REFACTOR, satu commit per fase agar bisa direview granular.

## Asumsi kunci (OQ resolved di batch ini)

- **OQ-3 (threshold + nama konstanta):** threshold `>= 6` (mengikuti pesan Supabase existing `login.tsx:19` dan spec FR-AUTH02.1). Konstanta baru: `AUTH_COPY.passwordTooShort = 'Kata sandi minimal 6 karakter.'`, dihosting di file dedicated `mobile/src/lib/auth-copy.ts` (mengikuti preseden `workspace-copy.ts`).
- **OQ-10 (target platform CFG-01):** helper `resolveSupabaseUrl(platform)` menangani semua target kanonik Expo — `web` (rewrite ke `localhost`), `ios` (pertahankan `127.0.0.1`/`localhost`), `android` (rewrite alias lokal → `10.0.2.2` untuk emulator). Web adalah target primer bug ini; iOS/Android di-lock via test agar tidak regres.
- **`.env` (dev only, not committed):** ubah `EXPO_PUBLIC_SUPABASE_URL` ke `http://localhost:54321` (host asli, native cross-platform di-normalize oleh helper). Guard `env.ts` tetap throw bila kosong.

## File yang tersentuh

Produksi:
- `mobile/src/app/(auth)/login.tsx` — tambah guard `password.length < 6` sebelum `signInWithPassword`.
- `mobile/src/lib/auth-copy.ts` — **BARU**, hosting `AUTH_COPY`.
- `mobile/src/lib/supabase.ts` — tambah helper `resolveSupabaseUrl(platform)` + gunakan hasilnya di `createClient`.
- `mobile/src/lib/env.ts` — tidak berubah perilaku, hanya assert eksisting guard via test.
- `mobile/.env` — ganti `127.0.0.1` → `localhost`.
- `mobile/.env.example` — dokumentasi host per-platform + catatan native rewrite otomatis oleh helper.

Test:
- `mobile/src/app/(auth)/__tests__/login.test.tsx` — **BARU** (AUTH-02b, 8 kasus).
- `mobile/src/lib/__tests__/supabase-url.test.ts` — **BARU** (CFG-01 helper, 5 kasus).
- `mobile/src/lib/__tests__/env.test.ts` — **BARU** (CFG-01 guard, 2 kasus).

## Strategi mocking per layer

### Layer data (`supabase-url.test.ts`)

Helper `resolveSupabaseUrl(platform: 'web' | 'ios' | 'android' | string): string` adalah **fungsi murni**. Tidak perlu mock `../supabase` (tidak memanggil `createClient`). Kontrak:

```ts
import { resolveSupabaseUrl } from '../supabase-url'; // atau '../supabase' bila diletakkan di sana
```

Karena helper membaca `env.supabaseUrl`, dan `env.ts` membaca `process.env.EXPO_PUBLIC_*` di top-level, pola test:

```ts
describe('resolveSupabaseUrl', () => {
  const OLD = process.env;
  beforeEach(() => { jest.resetModules(); process.env = { ...OLD }; });
  afterAll(() => { process.env = OLD; });

  it('web: 127.0.0.1 → localhost', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-test';
    jest.isolateModules(() => {
      const { resolveSupabaseUrl } = require('../supabase-url');
      expect(resolveSupabaseUrl('web')).toBe('http://localhost:54321');
    });
  });
});
```

Prinsip: **helper menerima raw URL sebagai parameter kedua opsional** (default membaca `env.supabaseUrl`). Signature: `resolveSupabaseUrl(platform, rawUrl?)` — memudahkan test tanpa isolateModules pada kasus non-guard.

### Layer data (`env.test.ts`)

Pattern `jest.isolateModules` + `process.env` manipulation:

```ts
it('throws when URL empty', () => {
  const OLD = process.env;
  process.env = { ...OLD, EXPO_PUBLIC_SUPABASE_URL: '', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon' };
  expect(() => jest.isolateModules(() => require('../env'))).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
  process.env = OLD;
});
```

Tidak mock apapun — env.ts pure module, throw saat load.

### Layer UI (`login.test.tsx`)

Ikuti pola `cards.test.ts`: mock `../../../lib/supabase` di top-level sebelum import komponen.

```ts
const mockSignIn = jest.fn();
const mockReset = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a: unknown[]) => mockSignIn(...a),
      resetPasswordForEmail: (...a: unknown[]) => mockReset(...a),
    },
  },
}));

// Provider theme — minimal stub, hindari SafeArea/native dep
jest.mock('@/providers/theme-provider', () => ({
  useThemePreference: () => ({ effective: 'light' }),
}));

// LinearGradient sering menyusahkan di jest-expo — stub jadi View passthrough
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: ({ children, ...p }: any) => <View {...p}>{children}</View> };
});

// Ionicons stub agar tidak load font
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
```

`beforeEach(() => { mockSignIn.mockReset(); mockReset.mockReset(); })`. Untuk kasus success, `mockSignIn.mockResolvedValue({ error: null })`.

Render + interaksi:
```ts
const { getByPlaceholderText, getByText, getByRole, queryByRole } = render(<LoginScreen />);
fireEvent.changeText(getByPlaceholderText('Email perusahaan'), 'a@b.co');
fireEvent.changeText(getByPlaceholderText('Kata sandi'), '123');
fireEvent.press(getByText('Masuk'));
```

A11y assertion via `getByRole('alert')` — feedback banner sudah punya `accessibilityRole="alert"`.

## Urutan langkah red → green → refactor

### Fase A — Bug CFG-01 GUARD (safety net, tidak mengubah kode)

Rasional: kunci perilaku env guard SEBELUM sentuh `supabase.ts` supaya refactor tidak diam-diam melemahkan guard.

1. **RED-A1** — tulis `mobile/src/lib/__tests__/env.test.ts` dengan 2 kasus (URL kosong throw, ANON kosong throw). Test hijau otomatis karena guard sudah ada — ini regression net, bukan red sungguhan. Commit sebagai "test(env): lock guard behavior [AC-CFG01-3]".

### Fase B — Bug CFG-01 helper URL

2. **RED-B1** — tulis `mobile/src/lib/__tests__/supabase-url.test.ts` dengan 5 kasus:
   - `resolveSupabaseUrl('web')` dengan env `http://127.0.0.1:54321` → `http://localhost:54321` [AC-CFG01-1].
   - `resolveSupabaseUrl('ios')` dengan env `http://127.0.0.1:54321` → `http://127.0.0.1:54321` (tidak di-rewrite untuk simulator iOS) [AC-CFG01-2].
   - `resolveSupabaseUrl('android')` dengan env `http://localhost:54321` → `http://10.0.2.2:54321` [AC-CFG01-2].
   - `resolveSupabaseUrl('web')` dengan env `https://staging.supabase.co` → unchanged (non-local host tidak dimutasi).
   - `resolveSupabaseUrl('web')` idempotent dengan env `http://localhost:54321`.

   Test gagal: `resolveSupabaseUrl` belum diekspor.

3. **GREEN-B1** — implementasi helper di `mobile/src/lib/supabase.ts` (atau file baru `supabase-url.ts` — pilih **inline** di `supabase.ts` untuk minim file, karena helper tightly coupled ke createClient):

   ```ts
   export function resolveSupabaseUrl(platform: string, raw: string = env.supabaseUrl): string {
     let u: URL;
     try { u = new URL(raw); } catch { return raw; }
     const isLocalAlias = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
     if (!isLocalAlias) return raw;
     if (platform === 'web') u.hostname = 'localhost';
     else if (platform === 'android') u.hostname = '10.0.2.2';
     else if (platform === 'ios') u.hostname = '127.0.0.1';
     // strip trailing slash
     return u.toString().replace(/\/$/, '');
   }
   ```

   Ubah `createClient(env.supabaseUrl, ...)` → `createClient(resolveSupabaseUrl(Platform.OS), ...)` (import `Platform` dari `react-native`). Jalankan `npm test` → hijau. Commit: "fix(cfg-01): resolveSupabaseUrl per platform [AC-CFG01-1..2]".

4. **REFACTOR-B1** — update `mobile/.env` (dev): `EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321`. Update `mobile/.env.example` dengan blok komentar per platform:

   ```
   # Web dev (localhost:8081): host reachable dari browser origin
   EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
   # Helper resolveSupabaseUrl() akan menormalkan otomatis:
   #   iOS sim   → 127.0.0.1
   #   Android emu → 10.0.2.2
   EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx
   ```

   Commit: "docs(env): document per-platform host resolution [AC-CFG01-5]".

### Fase C — Bug AUTH-02b copy constant (foundation)

5. **RED-C1** — tulis `mobile/src/app/(auth)/__tests__/login.test.tsx` dengan 8 kasus AC-AUTH02-1..5 + regression. Semua kasus impor `AUTH_COPY` dari `@/lib/auth-copy` → import gagal (module belum ada). Test merah semua.

6. **GREEN-C1a** — buat `mobile/src/lib/auth-copy.ts`:

   ```ts
   // Copy UI khusus jalur autentikasi (login.tsx, reset). Terkunci agar test merujuk konstanta,
   // bukan literal. Pola sama dengan workspace-copy.ts.
   export const AUTH_COPY = {
     passwordTooShort: 'Kata sandi minimal 6 karakter.',
   } as const;
   ```

   Test import kini resolve; kasus AC-AUTH02-3 (empty fields precedence) sudah hijau karena guard email kosong existing. Kasus password-length masih gagal (guard belum ada).

7. **GREEN-C1b** — patch `mobile/src/app/(auth)/login.tsx`:

   ```ts
   import { AUTH_COPY } from '@/lib/auth-copy';
   // ...
   async function submit() {
     setFeedback(null);
     if (!email.trim() || !password) {
       setFeedback({ kind: 'error', message: 'Email dan kata sandi wajib diisi.' });
       return;
     }
     if (password.length < 6) {
       setFeedback({ kind: 'error', message: AUTH_COPY.passwordTooShort });
       return;
     }
     setLoading(true);
     // ... existing ...
   }
   ```

   **Kritis:** guard `password.length` — password **tidak** di-trim; email tetap `email.trim()`. Jalankan `npm test` → 8 kasus hijau, 240+ existing tetap hijau. Commit: "fix(auth-02b): guard password length < 6 client-side [AC-AUTH02-1..5]".

8. **REFACTOR-C1** — pertimbangkan translate error `'password should be at least'` (line 19) untuk pakai `AUTH_COPY.passwordTooShort` juga — konsolidasi copy. Update test regression `AC-AUTH02-6` (bila mau menegakkan konsistensi). Optional — hanya bila tidak menambah radius. Commit terpisah bila dilakukan.

### Fase D — Verifikasi & smoke

9. **VERIFY** — jalankan `npm test` + `npm run type-check`. Pastikan 240 → 240+15 hijau, tsc clean.
10. **SMOKE CFG-01** [AC-CFG01-4] — jalankan `npm run web`, buka `localhost:8081`, cek DevTools Network: request ke `localhost:54321/auth/v1/*` sukses (bukan `127.0.0.1`, tanpa `Failed to fetch`/`ERR_ABORTED`). Ini QA manual, catat di `docs/testing-report-2026-07-05-ui.md`.

## Urutan commit yang aman

Dari kecil ke besar radius:

1. `test(env): lock guard behavior [AC-CFG01-3]` (Fase A).
2. `test(supabase-url): red for resolveSupabaseUrl [AC-CFG01-1..2]` (RED-B1).
3. `fix(cfg-01): resolveSupabaseUrl per platform [AC-CFG01-1..2]` (GREEN-B1).
4. `docs(env): document per-platform host + change dev .env [AC-CFG01-5]` (REFACTOR-B1).
5. `test(auth): red for password min-length + AUTH_COPY [AC-AUTH02-1..5]` (RED-C1).
6. `feat(auth-copy): introduce AUTH_COPY constant module` (GREEN-C1a).
7. `fix(auth-02b): guard password length < 6 client-side [AC-AUTH02-1..5]` (GREEN-C1b).
8. (Optional) `refactor(auth): consolidate password-length copy via AUTH_COPY` (REFACTOR-C1).

## Risiko & mitigasi

- **NativeWind `react-native-css/components`** — `login.tsx` mengimpor `Pressable/Text/TextInput/View` dari `react-native-css/components`, bukan `react-native`. RNTL query (`getByPlaceholderText`, `getByRole`) harus tetap jalan karena preset `jest-expo` sudah menangani. Bila gagal, tambah mock: `jest.mock('react-native-css/components', () => require('react-native'))`.
- **`LinearGradient` + `Ionicons`** butuh mock stub agar tidak memicu native module error saat `render`.
- **Provider `useThemePreference`** — mock ke `{ effective: 'light' }` supaya tidak butuh context wrapper.
- **URL constructor di JSC Hermes lama** — sudah di-polyfill (`react-native-url-polyfill/auto` di `supabase.ts`). Untuk jest, node global URL sudah cukup.
- **`process.env` sharing di jest** — pakai `jest.isolateModules` untuk test env.ts + supabase-url agar tidak polusi antar test file.
- **Regresi `native` (iOS/Android)** — helper `resolveSupabaseUrl` sudah locked via test cabang `ios` + `android`. Perubahan `.env` dari `127.0.0.1` ke `localhost` di dev tidak masalah karena helper me-rewrite balik untuk iOS.
- **Refactor scope creep** — jangan sentuh `resetPassword`, `contactAdmin`, atau translate error map di GREEN-C1b; simpan untuk REFACTOR-C1 optional.
- **Test password '      ' (6 spasi)** — memastikan implementasi tidak trim password. Bila developer sengaja/tak sengaja menulis `password.trim().length`, test AC-AUTH02-4 langsung menangkap.
- **Console.log leak** — test AC-AUTH02-5 side pasang spy pada `console.log/error` untuk memastikan password tidak tercatat. Sensitif terhadap library pihak ketiga yang log — bila false-positive muncul dari Supabase mock, restrict scope spy ke saat submit terpanggil.

## Definisi selesai

- [ ] `npm test` hijau (240 + 15 kasus baru minimum).
- [ ] `npm run type-check` clean.
- [ ] `npm run lint` clean.
- [ ] Manual smoke `npm run web` — console bersih, login berhasil (atau gagal dengan pesan Indonesia yang benar).
- [ ] `.env` lokal ter-update, `.env.example` mendokumentasikan per-platform.
- [ ] 8 commit terurut sesuai daftar di atas.
