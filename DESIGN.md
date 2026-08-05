# Rencanapp — Design System & Tokens

Sumber kebenaran token desain. Diekstrak dari prototype tim desain [`design.html`](design.html) dan diselaraskan dengan implementasi di [`mobile/`](mobile/) (NativeWind v5 / `react-native-css`, [`global.css`](mobile/src/global.css)).

**Cara pakai:** semua keputusan visual dikalibrasi ke dokumen ini. Token diekspresikan sebagai (1) nilai hex, (2) custom property `@theme` di `global.css`, dan (3) class NativeWind yang dipakai komponen. Saat menambah warna/spasi/komponen, daftarkan di sini dulu.

Render referensi: [`ui/ux/`](ui/ux/) (47 layar) + pola "10/10" di [`ui/ux/improved/`](ui/ux/improved/).

---

## 1. Brand

- **Nama:** Rencanapp · **Tagline:** "Rencanakan. Jalankan. Tuntaskan."
- **Aturan penamaan:** gunakan `Rencanapp` untuk semua surface produk yang terlihat user, copy UI, spec produk, dan artefak desain. Gunakan `RencanApp` hanya untuk identifier teknis seperti nama repo, path folder, atau referensi tooling yang memang sudah fixed.
- **Logo:** mark centang gradient biru→hijau. Gradien resmi:
  - Biru: `#092753` → `#1877f2` (`loginMarkBlue`)
  - Hijau: `#009f72` → `#6ccf43` (`loginMarkGreen`)
- **Karakter:** padat-tapi-tenang (app utilitas eksekusi), bukan marketing. Kartu rounded, shadow lembut, aksen biru, status berkode warna+teks.

---

## 2. Color tokens

### Neutrals (teks & permukaan)
| Token | Hex | NativeWind | Pakai |
|---|---|---|---|
| `text` | `#172033` | `text-black` / `dark:text-white` | Teks utama |
| `muted` | `#667085` | `text-neutral-500` | Teks sekunder, kicker |
| `line` | `#dde3eb` | `border-neutral-200` | Garis & border kartu |
| `surface` | `#ffffff` | `bg-white` / `dark:bg-black` | Permukaan kartu |
| `surface-soft` | `#f8fafc` | `bg-neutral-50` | Field/inset |
| `bg` | `#f3f5f8` | (latar layar) | Latar app |
| `placeholder` | `#6b7280` (terang) / `#9ca3af` (gelap) | — (`placeholderTextColor` prop) | Teks placeholder `TextInput` — RN tak menerima class untuk `placeholderTextColor`, jadi hex eksplisit; pilih via hook `usePlaceholderColor()` ([`ui.tsx`](mobile/src/components/ui.tsx)) / `useThemePreference().effective` — **JANGAN `useColorScheme()`** (§12). Arah kontras terikat §4: Sprint 6 **membalik** default lama agar lulus AA — terang `#6b7280` (4.83:1), gelap `#9ca3af` (7.15:1); jangan kembalikan `#9ca3af` ke mode terang (hanya 2.85:1). |

### Brand
| Token | Hex | `@theme` | Pakai |
|---|---|---|---|
| `brand` | `#208aef` | `--color-brand` | Aksen, ikon aktif, link, fill non-teks |
| `brand-dark` | `#1564b3` | `--color-brand-dark` | **Fill tombol solid + teks putih** (lihat §4 a11y) |
| `brand-light` | `#93c5fd` | `--color-brand-light` | Teks/ikon aksen di atas latar **gelap** (`dark:text-brand-light`). Wajib dipasangkan dengan `text-brand-dark` di terang. Sebelum Sprint 6, class ini terpakai tapi tokennya tidak terdaftar → jatuh diam-diam ke `#1564b3` (3.51:1 pada hitam, gagal AA). |
| `brand-soft` | `#e8f2ff` | — | Latar chip/badge info |

> Catatan rekonsiliasi: prototype memakai biru `#1877f2`; kode `mobile/` memakai `#208aef`. **Kanonik = `#208aef`** (sudah shipping di `global.css`) agar tanpa churn. Konfirmasi bila tim desain mau persis `#1877f2`.

### Status (semantik — selalu warna + label teks)
| Tone | Teks (AA) | Latar | NativeWind | Makna |
|---|---|---|---|---|
| `success` | `#15803d` | `#dcfce7` | `text-green-700` / `bg-green-100` | Disetujui, selesai, aman |
| `info` | `#1d4ed8` | `#e8f2ff` | `text-blue-700` / `bg-blue-100` | Netral/aktif |
| `warn` | `#b45309` | `#fef3c7` | `text-amber-700` / `bg-amber-100` | Menunggu, perlu perhatian |
| `danger` | `#b91c1c` | `#fef2f2` | `text-red-700` / `bg-red-50` | Kritis, revisi, gagal |
| `neutral` | `#667085` | `#f1f5f9` | `text-neutral-600` / `bg-neutral-100` | Default |

> Pasangan chip kanonik memakai shade **`-700` di atas `-100`** (semua lulus AA, lihat §4). Pasangan lembut prototype (mis. hijau `#14845c` di `#e7f7ef` = 4.23) **gagal AA untuk teks kecil** — hindari, atau gunakan varian gelapnya `#0f6b46` (6.02:1) sebagaimana dipakai pill Action Plan V1.8.3 (§ Workspace category).

Implementasi: `Badge` & `STATUS_TONE` di [`cards.ts`](mobile/src/lib/cards.ts), `ui.tsx`.

### Workspace category (letter-badge pill V1.8.3)

Warna kategori kartu Workspace mengikuti prototype final `outputs/ems-mobile-ui/index.html`. Nilai hex di bawah adalah kanonik untuk area Workspace dan dipakai inline (bukan class Tailwind) agar persis prototype — sumber tunggal di [`workspace-kind-pill.tsx`](mobile/src/components/workspace-kind-pill.tsx).

Per **RWT-03 (default B) — DECIDED 2026-07-11**: palet warna **terikat POSISI hierarki** (bukan nama). Rename V1.8.3 menggeser label + huruf; palet per level TETAP:

| Level | Kategori (V1.8.3) | Huruf | Teks | Latar | Border | Lingkaran |
|---|---|---|---|---|---|---|
| 0 | Goal | `G` | `#145ebc` | `#e8f2ff` | `#cce2ff` | `#1877f2` |
| 1 | **Strategy** (dulu KPI Area) | **`S`** | `#b76b00` | `#fff3d7` | `#ffe1a1` | `#b76b00` |
| 2 | **Initiative** (dulu Strategy) | **`I`** | `#6941c6` | `#f1ebff` | `#dfd1ff` | `#6941c6` |
| 3 | **Action Plan** (dulu Initiative) | **`AP`** | `#0f6b46` | `#e7f7ef` | `#c9ebda` | `#0f6b46` (font 8px) |
| 4 | **Task** (dulu Action Plan) | **`T`** | `#145ebc` | `#eef6ff` | `#cce2ff` | `#145ebc` |
| — | Development Area | `D` | `#0f766e` | `#e6fffb` | `#99f6e4` | `#0f766e` |
| — | Problem Statement | `P` | `#c2410c` | `#fff7ed` | `#fed7aa` | `#c2410c` |

Progress orb tree (§10): good `#0f6b46`, risk `#b76b00`, bad `#c93434`, line border `#d9e2ec`. Connector L-shape `#cfd8e5`.

> **Perubahan Sprint 6 (2026-07-28)**: hex teks & border-kiri card Action Plan bergeser `#14845c` → `#0f6b46` agar lulus AA pada pill kecil (`text-xs` / `fontSize:11`). `#14845c` pada `#e7f7ef` = 4.23:1 — gagal AA untuk teks di bawah 18px; `#0f6b46` pada `#e7f7ef` = 6.02:1 ✓. Ring SVG progress orb "good" **tetap** `#14845c` — komponen non-teks WCAG hanya butuh 3:1 (kontras vs latar kartu `bg-white`: 4.63:1 ✓).

### Workspace controls (theme-aware inline — tree, hub-card, period-switcher)

Kontrol Workspace memakai warna theme-aware di **inline `style`** (bukan className) karena
`react-native-css` tak mengkonsumsi utility `@theme`/NativeWind di prop `style`. Family yang
**dipakai ulang** diangkat ke token bernama di [`workspace-theme-tokens.ts`](mobile/src/lib/workspace-theme-tokens.ts)
(preseden `WORKSPACE_KIND_BORDER`), sehingga perubahan token cukup di satu tempat. Nilai di bawah
diekstrak persis dari inline lama — **refactor visual-identik**, bukan restyle.

| Token (JS) | Peran | Light | Dark |
|---|---|---|---|
| `TREE_ADD_BUTTON.border` | Tombol "+ turunan" (constructive teal) — border | `#99f6e4` | `#115e59` |
| `TREE_ADD_BUTTON.background` | idem — fill | `#ccfbf1` | `#134e4a` |
| `TREE_ADD_BUTTON.text` | idem — teks (teal-700 di teal-100 = 5.0:1 ✓ AA) | `#0f766e` | `#5eead4` |
| `TREE_TOGGLE_EXPANDED.border` | Chevron toggle saat expanded — border | `#bfdbfe` | `#3b82f6` |
| `TREE_TOGGLE_EXPANDED.background` | idem — fill | `#eff6ff` | `#172554` |
| `TREE_TOGGLE_EXPANDED.icon` | idem — ikon (aksen non-teks, 3:1) | `#2563eb` | `#bfdbfe` |
| `NEUTRAL_UTILITY.surface` | "⋯" + toggle collapsed — surface | `#f8fafc` | `#171717` |
| `NEUTRAL_UTILITY.border` | "⋯" + "+" dimmed — border | `#e2e8f0` | `#404040` |
| `WORKSPACE_SPACE.performance` | Identitas ruang Performance — `categoryBorder` `#1877f2`, `cta` `#1564b3` (brand-dark, §4 rule 1), tint light-only `hubBgLight` `#f8fbff` / `hubKickerBgLight` `#e8f2ff` / `hubKickerText` `#145ebc` / `pillBgLight` `#eef4fb` / `pillBorderLight` `#d9e3ef` | — | — |
| `WORKSPACE_SPACE.development` | Identitas ruang Development — `categoryBorder` `#0f766e`, `cta` `#0f766e` (4.8:1), tint light-only `hubBgLight` `#f7fffd` / `hubKickerBgLight` `#e6fffb` / `hubKickerText` `#0f766e` / `pillBgLight` `#eefaf8` / `pillBorderLight` `#cceee8` | — | — |

> Surface/border **netral gelap** (mis. `#0a0a0a`/`#262626` hub-card, `#171717`/`#404040` pill),
> teks netral (`#0f172a`/`#94a3b8`/`#64748b`), fill dark-mode Detail `#1d4ed8`, dan connector
> `#cfd8e5` tetap **inline one-off tersanksi** (dikomentari di sumber) — dipakai sekali per
> kontrol dengan shade berbeda, jadi tokenisasi malah akan menyeragamkan warna yang berbeda.

#### Rekonsiliasi a11y Workspace (owner 2026-07-03)

§4 a11y **mengikat** untuk semua kontrol Workspace — termasuk saat prototype/referensi memakai nilai light-only yang gagal AA. Di titik konflik, §4 menang. Doktrin (preseden [`workspace-hub-card.tsx`](mobile/src/components/workspace-hub-card.tsx), berlaku untuk semua kontrol Workspace):

1. **Fill solid + teks putih** (tombol `Detail`, `+ Goal`/primary header, `Ubah` periode) pakai **`brand-dark #1564b3`** (5.99:1) — bukan `#1877f2` (3.6:1, gagal AA). `#1877f2` tetap boleh sebagai **aksen non-teks** (border kiri kategori, progress line, tint chip).
2. **Surface & border netral terkunci** (⋯, `+ Turunan`, `Kembali`, `Edit`, panel periode) **theme-aware**: warna terang terkunci **hanya** berlaku di **light mode**; di **dark mode** ikut gelap (`useThemePreference().effective`) agar tak jadi "light island" dan teks anak tetap kontras AA.
3. **Tint kategori/aksen hue** (letter-badge pill §9, kicker hub-card) **dipertahankan** di kedua mode — teks gelap di atas tint tetap terbaca (bukan pelanggaran, memang by design).
4. **Touch target**: tombol header row Workspace tinggi **44px** (bukan 42) & radius **12** (token `rounded-xl`, bukan 8) agar patuh §4 rule 1 + §5.

---

## 3. Typography

- **Typeface:** Inter (fallback `system-ui, -apple-system, "Segoe UI", sans-serif`).
  > `mobile/` saat ini **belum memuat Inter** (`global.css` fallback ke `system-ui`). Memuat Inter via `expo-font` adalah langkah opsional untuk match prototype 1:1.
- **Weights:** 400 reguler · 600 semibold · 700/800 bold (judul).

| Peran | Size | Weight | NativeWind |
|---|---|---|---|
| Display (login) | 30 | 800 | `text-3xl font-extrabold` |
| Judul layar (H1) | 24 | 700 | `text-2xl font-bold` |
| Section (H2) | 20 | 700 | `text-xl font-bold` |
| Body | 15 | 400 | `text-base` |
| Body kecil | 13 | 400 | `text-sm` |
| Caption/kicker | 11–12 | 600 uppercase | `text-xs font-semibold uppercase` |

---

## 4. Aksesibilitas (mengikat)

**Kontras terverifikasi (WCAG, dihitung):**
| Pasangan | Rasio | AA |
|---|---|---|
| `text` `#172033` / putih | 16.27 | ✓ AAA |
| `muted` `#667085` / putih | 4.97 | ✓ |
| `muted` `#667085` / `bg` `#f3f5f8` | 4.55 | ✓ (tipis) |
| putih / `brand` `#208aef` | **3.53** | ✗ |
| putih / `brand-dark` `#1564b3` | 5.99 | ✓ |
| `brand-dark` `#1564b3` / putih | 5.99 | ✓ (chevron/ikon terang) |
| `brand-light` `#93c5fd` / hitam | 11.79 | ✓ AAA (chevron/ikon gelap) |
| placeholder `#6b7280` / putih | 4.83 | ✓ (Sprint 6: diperketat dari `#9ca3af` yg 2.85:1) |
| placeholder `#9ca3af` / hitam | 7.15 | ✓ |
| putih / `bg-black/25` pada gradient brand | ≥7:1 | ✓ (pill tanggal hero, Sprint 6) |
| Action Plan `#0f6b46` / `#e7f7ef` | 6.02 | ✓ (pill category, Sprint 6) |
| green-700 / green-100 | 4.57 | ✓ |
| amber-700 / amber-100 | 4.51 | ✓ |
| red-700 / red-50 | 5.91 | ✓ |

**Aturan:**
1. **Touch target ≥ 44×44px.** `Button` memakai `min-h-[44px]`. Chip/ikon-only beri padding atau `hitSlop`.
2. **Warna ≠ satu-satunya sinyal.** Status & skor selalu warna **+** label teks (lihat `ScoreBadge`).
3. **Solid + teks putih → pakai `brand-dark` `#1564b3`**, bukan `brand` `#208aef` (gagal AA pada teks normal). ✅ `Button` primary sudah `bg-brand-dark`.
4. **Label screen reader.** `accessibilityRole` + `accessibilityLabel` + `accessibilityState` (`busy`/`disabled`) di tiap kontrol. Sudah di `Button`, `Skeleton`, `ErrorState`, `Avatar`.
5. **Dynamic Type.** Layout harus selamat saat font sistem diperbesar (hindari tinggi fixed pada kontainer teks).
6. **Jangan sarangkan kontrol di dalam kontainer yang bisa ditekan.** `Pressable` RN default `accessible={true}`; di iOS itu meleburkan seluruh anaknya jadi **satu** elemen a11y, sehingga tombol/input di dalamnya berhenti bisa difokus VoiceOver dan aksinya tak terjangkau (aturan 4 gagal secara diam-diam — tetap bisa di-tap dengan jari, jadi lolos QA visual). Kontrol harus jadi **sibling** region pressable, bukan keturunannya. `SectionCard` menyediakan prop `actions` untuk ini; pola yang sama berlaku untuk kontainer pressable buatan sendiri.

---

## 5. Spacing & radius

**Spacing** (skala 4px, Tailwind): `1=4 · 2=8 · 3=12 · 4=16 · 5=20 · 6=24`. Padding layar `p-5` (20). Gap antar-section `gap-5`. Gap dalam kartu `gap-2`.

**Radius:**
| Token | px | NativeWind | Pakai |
|---|---|---|---|
| sm | 8 | `rounded-lg` | `Skeleton` (default `radius=8`), badge/tile ikon kecil |
| md | 12 | `rounded-xl` | Tombol, input, field |
| lg | 16 | `rounded-2xl` | Kartu, sheet standar |
| 3xl | 24 | `rounded-3xl` / `rounded-t-3xl` | Bottom sheet & kartu auth (login/reset-password) — **pengecualian tersanksi** |
| full | 999 | `rounded-full` | Chip, avatar, badge |

> Catatan pemetaan: di Tailwind, class polos `rounded` = **4px**, bukan 8px — 8px adalah `rounded-lg`. Dot/legenda kecil yang memang 4px (mis. `ScoreLegend` `h-3.5 w-3.5 rounded`) tetap pakai `rounded`. Bottom sheet (sumber tunggal [`bottom-sheet.tsx`](mobile/src/components/bottom-sheet.tsx) `DEFAULT_SHEET_CLASS`) dan kartu auth memakai `rounded-3xl` (24) — lebih besar dari `lg`; ini disengaja, bukan drift.

---

## 6. Elevation

- **Shadow kartu:** `0 12px 30px rgba(31,43,68,.08)` (prototype `--shadow`). Di RN halus dan opsional; default andalkan **border** (`border-neutral-200`) untuk pemisahan, shadow untuk elemen terangkat (FAB, sheet).
- Dark mode: ganti shadow dengan `dark:border-neutral-800`.

---

## 7. Component tokens

| Komponen | Token kunci | Lokasi |
|---|---|---|
| `Button` | `min-h-[44px] rounded-xl px-4 py-3`; variant primary/secondary/danger/success | [`ui.tsx`](mobile/src/components/ui.tsx) |
| `SectionCard` | `rounded-2xl border p-4 gap-2`. Kartu yang bisa ditekan: `onPress` + `accessibilityLabel` opsional. Kontrol sendiri (tombol/input) WAJIB lewat prop `actions`, bukan `children` — lihat §4 aturan 6 | `ui.tsx` |
| `SectionHeading` | Judul seksi in-screen (H2). `<Text>` `text-lg font-bold text-black dark:text-white` (§3 H2 dominan) yang **selalu** memasang `accessibilityRole='header'` supaya navigasi-heading TalkBack/VoiceOver bisa meloncati seksi. Prop `right` opsional (hitungan/aksi/`CardHelpTrigger`) → baris `justify-between`. **A11y mengikat (§4.4)**: setiap judul seksi WAJIB punya `accessibilityRole='header'`. Untuk judul yang **bukan** `text-lg` (kicker grup `text-xs`, judul kartu-form `text-sm`, judul halaman inline `text-2xl` di layar yang mem-bypass `Screen`), JANGAN paksa masuk primitif ini (mengubah ukuran) — tambahkan `accessibilityRole='header'` **inline** pada `<Text>` yang ada, ukuran dipertahankan. `Screen` sudah memberi `role='header'` pada judul layar-nya. | `ui.tsx` |
| `Badge`/chip | `rounded-full px-2.5 py-1 text-xs font-semibold`; tone §2 | `ui.tsx` |
| `LabeledInput` | `rounded-xl border px-4 py-3`; `*` wajib merah. **S7-3**: prop `error?: string \| null` → border merah (`border-red-500 dark:border-red-400`) + `<Text accessibilityRole='alert' accessibilityLiveRegion='polite'>` inline `text-sm font-semibold text-red-700 dark:text-red-400`; `aria-invalid={true}` di TextInput; `accessibilityLabel` merangkum pesan sehingga pembaca layar mengumumkannya saat field di-focus. Border merah **BUKAN** satu-satunya sinyal (§4 rule 2) — teks error di bawah + accessibilityLabel yang membawa pesan adalah pembawa makna utama. **S7-4**: prop `secureTextEntry` + `secureRevealable` (default true saat secure aktif) → wrapper `flex-row` + tombol reveal `min-h-[44px] min-w-[44px]` (§4.1), ikon `eye-outline`/`eye-off-outline` (Ionicons 20px, warna via `usePlaceholderColor` hex per tema), `accessibilityLabel` state-eksplisit `"Sembunyikan kata sandi"`/`"Tampilkan kata sandi"` (§4 warna ≠ satu-satunya sinyal). Preseden pola reveal: `login.tsx`. Prop `autoComplete` diperluas untuk `new-password`/`current-password`/`email`/`one-time-code`/dsb. | `ui.tsx` |
| `OptionPicker` | Pemilih satu opsi dari daftar pendek (Departemen, dsb.) — sepupu `UserPicker` dengan sumber opsi dari pemanggil, bukan query `profiles`. **Trigger**: `min-h-[44px] flex-row items-center justify-between rounded-xl border border-neutral-300 px-4 py-3 dark:border-neutral-700` + karet Ionicons `chevron-down` (warna `muted` §10); nilai kosong pakai `text-neutral-400` (placeholder), terisi `text-black dark:text-white`. **Sheet**: `Modal` transparan `animationType='slide'`, panel `max-h-[70%] rounded-t-2xl bg-white p-5 dark:bg-neutral-900`, baris opsi `min-h-[44px] border-b border-neutral-100 py-3 dark:border-neutral-800`; opsi terpilih `font-semibold text-brand-dark dark:text-brand`. Baris "kosongkan" `text-red-600 dark:text-red-400` hanya dirender saat ada nilai. **A11y mengikat**: trigger `accessibilityRole='button'` + `accessibilityLabel='{label}: {nilai\|belum dipilih}'` (state ikut diumumkan, bukan hanya nama field); tiap opsi `accessibilityState={{ selected }}` + `accessibilityLabel` = label opsi — terpilih ditandai **bold + warna**, bukan warna saja (§4 rule 2). Daftar kosong → teks arahan (mis. "Belum ada Departemen aktif. Buat lebih dulu di tab Departemen."), bukan sheet hampa | `mobile/src/components/option-picker.tsx` |
| `EmptyState` v2 | ikon (ring 64px), tone neutral/success, meta chip, action | `ui.tsx` |
| `Skeleton` | shimmer opacity 0.5↔1; radius prop | `ui.tsx` |
| `ErrorState` | latar `red-50`, role `alert`, retry | `ui.tsx` |
| `ScoreBadge`/`ScoreLegend` | band §8 + label teks | `ui.tsx` + [`score.ts`](mobile/src/lib/score.ts) |
| `Avatar` | warna deterministik §8 + inisial | `ui.tsx` + [`avatar-color.ts`](mobile/src/lib/avatar-color.ts) |
| `ChatBubble` (UI-S-IN2) | me: `bg-brand-dark text-white self-end rounded-2xl rounded-br-md px-3 py-2 max-w-[80%]`; them: `bg-neutral-100 dark:bg-neutral-800 self-start rounded-2xl rounded-bl-md px-3 py-2 max-w-[80%]`; identitas `them` = Avatar 28px + nama (`text-xs font-semibold text-neutral-500`) di atas bubble pertama hari itu | `mobile/src/app/(app)/inbox/[roomId].tsx` |
| `DateDivider` (UI-S-IN2) | `flex-row items-center gap-2 my-3`; chip tengah `bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 rounded-full text-xs font-semibold text-neutral-600 dark:text-neutral-300`; garis tipis `flex-1 h-px bg-neutral-200 dark:bg-neutral-800` di kiri & kanan; label = tanggal device-tz (`'Hari ini' / 'Kemarin' / 'd MMM yyyy'`) | `mobile/src/app/(app)/inbox/[roomId].tsx` |
| `ContextBanner` (UI-S-IN3 governance) | `flex-row items-start gap-2 rounded-2xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40 p-3`; ikon Ionicons `information-circle-outline` (warna `info` §10), body teks `text-sm text-blue-800`, tombol "Tutup" `text-xs font-semibold text-blue-700`; state `dismissed` lokal (re-mount akan munculkan lagi — by design V1) | `mobile/src/app/(app)/inbox/[roomId].tsx` |
| `SendButton` (UI-S-IN4) | circular `w-11 h-11` (inline style `{width:44,height:44}` — Critic §8.4: NativeWind class tak selalu flatten di jest); `rounded-full bg-brand-dark items-center justify-center`; ikon paper-plane putih; `accessibilityRole='button'` + `accessibilityLabel='Kirim pesan'` + `accessibilityState={{disabled}}` eksplisit (a11y mengikat); disabled saat input kosong/whitespace/`isSending` → `opacity-40` | `mobile/src/app/(app)/inbox/[roomId].tsx` |
| `ReactionPill` (UI-S-IN3, PRD §30.6) | Pressable pill di bawah body bubble. **Ukuran**: inline style `{minWidth:44, minHeight:44}` numeric (WAJIB — pola `SendButton`; NativeWind class `min-w-11 min-h-11` tak deterministik di jest) + `rounded-full px-3 py-1.5 flex-row items-center gap-1`. **Unselected** (`reactedByMe=false`): `border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900`; isi = emoji `text-base` + count `text-xs font-semibold text-black dark:text-white`. **Selected** (`reactedByMe=true`): `bg-brand-dark border-2 border-brand-dark` (`brand-dark` = `#1564b3`, memenuhi §4 solid+teks putih AA); isi = child `<Text>✓</Text>` `text-white text-xs font-bold` **sebelum** emoji + count `text-white`. **Sinyal non-warna wajib (§4)**: dua sinyal beriringan — child `✓` inline + `border-2` (tebal 2× vs border-1 unselected); JANGAN mengandalkan warna saja. **A11y mengikat**: `accessibilityRole='button'` + `accessibilityState={{ selected: reactedByMe }}` + `accessibilityLabel` copy exact Bahasa Indonesia — `'Reaksi {emoji}, {count}, saya sudah bereaksi'` (selected) / `'Reaksi {emoji}, {count}, belum bereaksi'` (unselected). Copy ini mengikat test UI-16 di [tdd-plan §12.6](specs/inbox-chat-reactions-tdd-plan.md). **Guard tap**: handler `onPress` no-op saat `!currentUserId \|\| isTogglingReaction` (tidak ada disabled visual — spec V1 tanpa optimistic; feedback via alert inline saat error). **JANGAN pakai emoji ekspresif** (`❤️`/`🎉`) di whitelist V1 — invarian ack-only per [scope-guardrails "Pengecualian sempit"](wiki/concepts/scope-guardrails.md); seed V1 = `👍 ✅ 👀 🙏` | `mobile/src/app/(app)/inbox/[roomId].tsx` (sub-komponen inline, belum diimplementasi — spec [inbox-chat-reactions.md](specs/inbox-chat-reactions.md)) |
| `ReactionPillRow` (UI-S-IN3, PRD §30.6) | Container flex `flex-row flex-wrap gap-1.5 pt-1` **di dalam sel `ChatBubble`** (di bawah body text) — di dalam agar highlight border amber `search-highlight` tetap membungkus keduanya. **Return `null`** bila `reactions?.length` falsy — TANPA placeholder count-0 (mayoritas pesan 0 reaksi; hindari layout shift). **Urutan pill = konstanta client** `REACTION_EMOJI_ORDER = ['👍','✅','👀','🙏'] as const` (D13 [tdd-plan §12.7](specs/inbox-chat-reactions-tdd-plan.md)) — cermin `sort_order` seed `reaction_emojis`; emoji di luar konstanta di-append terurut codepoint. JANGAN andalkan urutan baris embed PostgREST (tak dijamin tanpa `order` eksplisit → flaky di kontrak nyata). Aggregator `reactions[] → Map<emoji, {count, reactedByMe}>` di-`useMemo` per pesan. **JANGAN dirender di skeleton path** (`isLoading:true`) — pill hanya di dalam `renderItem` FlatList, bukan di layer `SkeletonList`. **JANGAN dirender di error/empty state** — sama alasan | `mobile/src/app/(app)/inbox/[roomId].tsx` (sub-komponen inline, belum diimplementasi — [spec](specs/inbox-chat-reactions.md)) |
| `ReactionErrorAlert` (UI-S-IN3, PRD §30.6) | inline `<Text accessibilityRole="alert" className="text-xs text-red-700 dark:text-red-300 pt-1">{reactionError}</Text>` di dalam sel bubble, di bawah `ReactionPillRow` — **non-blocking** (bukan `Alert.alert` modal — spec §10 melarang). Muncul saat `toggle_chat_reaction` gagal (`reportError('Reaksi', e, 'Gagal memperbarui reaksi.')` + `setReactionError('Gagal memperbarui reaksi.')`). **Wajib clear** ke `null` di path sukses berikutnya (test UI-15) supaya alert tidak "macet". Baca & kirim pesan tetap jalan; hanya pill yang error di-rollback ke state server terakhir (V1 invalidation-only) | `mobile/src/app/(app)/inbox/[roomId].tsx` (belum diimplementasi — [spec](specs/inbox-chat-reactions.md)) |
| `ChatContextBanner` (FR-RC-4/6, PRD §30 komp 10) | Banner konteks Tugas di atas body bubble **dan** chip konteks di composer. **Bubble banner**: `flex-row items-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 px-3 py-2 mb-1`; ikon `link-outline` (Ionicons, 16px, `text-blue-700 dark:text-blue-300`); kicker `text-xs font-semibold text-blue-700 dark:text-blue-300` "Konteks Tugas"; label `text-xs text-blue-800 dark:text-blue-200` (snapshot `context_label`); chevron kanan `chevron-forward` 14px; keseluruhan = `Pressable` `min-h-[44px]` + `accessibilityRole='link'` + `accessibilityLabel='Buka Tugas {label}'`. **Composer chip**: `flex-row items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40 px-3 py-2 mx-3 mt-2`; label "Membalas Tugas: {nama}" `text-xs text-blue-800 dark:text-blue-200 flex-1`; tombol tutup `×` `min-w-[44px] min-h-[44px]` `accessibilityLabel='Lepas konteks'` (DESIGN §4 touch target ≥44dp). Chip auto-lepas setelah kirim sukses (D-4). **A11y mengikat**: prefiks teks "Konteks Tugas" wajib (§4 warna ≠ satu-satunya sinyal); touch target ≥44dp kedua elemen interaktif | `mobile/src/app/(app)/inbox/[roomId].tsx` |
| `ChatQuoteChip` (FR-RC-7, P1 fast-follow) | Kutipan reply-quote di composer + bubble. **Composer chip**: `flex-row items-center gap-2 border-l-2 border-brand-dark bg-neutral-50 dark:bg-neutral-900 rounded-r-xl px-3 py-2 mx-3 mt-2`; author `text-xs font-semibold text-brand-dark` + potongan body `text-xs text-neutral-600 dark:text-neutral-400` (≤80 char, ellipsis); tombol tutup `×` `min-w-[44px] min-h-[44px]`. **Bubble quote**: `border-l-2 border-brand-dark bg-neutral-100 dark:bg-neutral-800 rounded-r-xl px-2 py-1 mb-1`; author + potongan body `text-xs`; keseluruhan `Pressable` → tap set `?highlight=` pesan asal. `reply_to` null (pesan asal terhapus) → teks "Pesan tidak tersedia" muted | `mobile/src/app/(app)/inbox/[roomId].tsx` (P1 — belum diimplementasi) |
| `SystemEventRow` (PRD §30 komp 8) | Baris sistem di timeline chat — centered, tanpa bubble. `flex-row items-center justify-center gap-2 py-2`; ikon `information-circle-outline` (Ionicons, 14px, `text-neutral-400 dark:text-neutral-500`); body `text-xs text-neutral-500 dark:text-neutral-400 text-center`; keseluruhan max-w `max-w-[85%] self-center`. Tidak interaktif (informational-only V1); tidak punya `accessibilityRole` khusus (plain text). Contoh body: "Dewi menyetujui — status jadi Selesai" | `mobile/src/app/(app)/inbox/[roomId].tsx` |
| `ChatAttachButton` (PRD §30 komp 11, FR-ATT-1.1) | Tombol lampir di composer. **Ukuran**: inline style `{width:44,height:44}` numeric (WAJIB — pola `SendButton`; class NativeWind tak deterministik di jest); `rounded-full items-center justify-center`; ikon paperclip (Ionicons `attach-outline`, 20px, `text-neutral-600 dark:text-neutral-300`). `accessibilityRole='button'` + `accessibilityLabel='Lampirkan gambar'`. Disabled (`opacity-40` + `accessibilityState={{disabled}}` eksplisit) saat **non-member** — composer + tombol **tidak dirender sama sekali** untuk non-member (EE-14: jangan render lalu tolak), atau saat sudah 3 gambar terpilih (EE-3) | `mobile/src/app/(app)/inbox/[roomId].tsx` (belum diimplementasi — [spec](specs/inbox-chat-attachments.md), gate FR-ATT-0.4, milestone V2) |
| `ChatAttachmentBubble` (PRD §30 komp 11, FR-ATT-0.4/3.1) | Varian `ChatBubble` yang membawa lampiran gambar. **Struktur**: `ChatAttachmentThumbnail` di atas, caption (body pesan, **wajib** — NG-4) di bawah dalam sel bubble yang sama; radius/warna/max-width **identik** `ChatBubble` (me: `bg-brand-dark`, them: `bg-neutral-100 dark:bg-neutral-800`) — attachment bukan varian visual baru, hanya isi tambahan. **Bukan** galeri/grid/feed (NG-7) — satu bubble per pesan, hingga 3 thumbnail berjajar `flex-row gap-1.5 flex-wrap` di dalamnya (EE-3: maks 3/pesan). Progress upload **tidak** tampil di bubble — muncul di composer via `ProgressPill` yang sudah ada (FR-ATT-1.6); bubble baru dirender setelah RPC commit mulai (optimistic) | `mobile/src/app/(app)/inbox/[roomId].tsx` (belum diimplementasi — [spec](specs/inbox-chat-attachments.md), gate FR-ATT-0.4, milestone V2) |
| `ChatAttachmentThumbnail` (PRD §30 komp 11, FR-ATT-3.1/3.2/3.3) | Thumbnail gambar di dalam `ChatAttachmentBubble`. **Ukuran tetap** (belum final — kandidat 160×160 atau 200×150, tentukan saat build V2) `rounded-xl` (radius sama skala dengan `SectionCard`), `overflow-hidden`. **State loading** (EE-16): reuse token `Skeleton` (§7) berukuran tetap sama persis dimensi thumbnail final — **jangan reflow** saat gambar selesai muat. **State gagal/kedaluwarsa** (EE-15, Kelas D non-blocking): placeholder ikon `image-outline` + teks `text-xs text-neutral-500` "Gagal memuat" + tombol **"Muat ulang"** `min-w-[44px] min-h-[44px]` `text-brand-dark text-xs font-semibold` — **dua sinyal non-warna wajib** (ikon + teks), bukan overlay warna saja (§4). Signed URL di-mint **saat render** (TTL 60 detik, FR-ATT-2.6) — jangan cache lintas re-render. Tap thumbnail: **tidak ada** viewer full-size/zoom di V1 (NG-6) | `mobile/src/app/(app)/inbox/[roomId].tsx` (belum diimplementasi — [spec](specs/inbox-chat-attachments.md), gate FR-ATT-0.4, milestone V2) |
| `UploadButton` (DA-AP5-1) | `min-h-[44px] rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-3`; ikon ➕ + label "Pilih file"; `accessibilityRole='button'` + `accessibilityLabel='Pilih file bukti'`; disabled saat sudah ≥5 file (`opacity-40`) atau `uploading` (`accessibilityState={{disabled}}` eksplisit) | `mobile/src/app/(app)/action-plan/submit.tsx` |
| `AttachmentRow` (DA-AP5-2) | `flex-row items-center gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3`; thumbnail icon (📄/🖼/📕 per kind), filename `text-sm font-semibold` truncate, size `text-xs text-neutral-500`, chip MIME kind (Badge tone neutral), tombol Remove (`accessibilityLabel='Hapus {filename}'`, hitSlop 8) | `mobile/src/app/(app)/action-plan/submit.tsx` |
| `ProgressPill` (DA-AP5-3) | chip kecil `rounded-full px-2.5 py-1 text-xs font-semibold` dengan 4 state warna: `'Siap unggah'` neutral-100/600, `'Mengunggah'` blue-100/700 (+optional spinner inline), `'OK'` green-100/700, `'Gagal'` red-100/700 + tombol "Coba lagi" inline. `accessibilityLabel` selalu sertakan state eksplisit (DESIGN §4: warna ≠ satu-satunya sinyal) | `mobile/src/app/(app)/action-plan/submit.tsx` |
| `StrategyLinkageCard` (DA-AP6-1) | `rounded-2xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40 p-4 gap-2`; baris atas: "Masuk Strategy" kicker + nama Strategy bold; baris bawah: "Sumber: Task {name}" muted; ada link Detail jika perlu | `mobile/src/app/(app)/task/submit.tsx` |
| `DeltaArrow` (DA-AP6-2) | `flex-row items-center gap-2`; angka lama `text-base font-bold text-neutral-500`, ikon arrow (↑ green-700 / ↓ amber-700 / → neutral-500), angka baru `text-2xl font-extrabold` (tone sama dgn arah). **A11y mengikat**: `accessibilityLabel` selalu menyebut arah eksplisit (`naik 25`, `turun 12`, `tetap`); warna BUKAN satu-satunya sinyal (DESIGN §4) — ikon + label teks wajib | `mobile/src/app/(app)/action-plan/submit.tsx` |
| `ImpactApprovalCard` (DA-AP6-3) | `rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 p-3 gap-1`; ikon ⚠ + heading "Setelah disetujui Reviewer" + body teks (mis. "Nilai Strategy X akan menjadi 145"); copy diambil dari konstanta `IMPACT_APPROVAL_COPY` (FR-AP6-10) — tidak hardcoded inline | `mobile/src/app/(app)/task/submit.tsx` |
| `WeightInput` (DA-SF1-1) | `min-w-[64px] min-h-[44px] rounded-xl border border-neutral-300 px-3 py-2 text-base text-right text-black dark:border-neutral-700 dark:text-white`; `keyboardType='numeric'`, `maxLength=3`, regex client `^\d{0,3}$`, clamp 0..100 sebelum apply ke state; saat read-only: `editable={false}` + `opacity-60` | `mobile/src/app/(app)/settings-score-formula.tsx` |
| `RoleChipGroup` (DA-SF1-2) | `flex-row flex-wrap gap-2`; chip = `min-h-[44px] rounded-full px-4 py-2`; active `bg-brand-dark` (teks `text-white`), inactive `border border-neutral-300` (teks `text-black/dark:text-white`); 4 chip V1: Staff/Management/C-Level/CEO (Custom HIDE per §6 DEC-9); `accessibilityRole='tab'` + `accessibilityState={{selected}}` | `mobile/src/app/(app)/settings-score-formula.tsx` |
| `AckCheckbox` (konfirmasi aksi ireversibel) | Checkbox pernyataan-paham di **body** dialog destruktif, menggantikan pola "kalimat panjang di label tombol" (label >302px wrap 2 baris di viewport 390 — terukur). `Pressable` `min-h-[44px] flex-row items-start gap-3 py-2`. **TANPA border/latar kotak** — dengan bingkai penuh ia terbaca sebagai "tombol ketiga" di antara aksi utama & Batal; bentuknya harus baris pilihan, bukan kotak. Area tap tetap ≥44px lewat `min-h` + `py`. **Indikator state wajib berupa bentuk berbeda** (sinyal non-warna §4 rule 2), dan karena bingkai dihapus, indikator inilah satu-satunya penanda state sehingga **tidak boleh diganti perbedaan warna saja**. **Kontrak (per §10):** state pakai ikon Ionicons `checkmark-circle` (checked) / `ellipse-outline` (unchecked) `#1564b3` terang / `#93c5fd` gelap — bukan glyph teks `✓`/`○`. **Sudah diimplementasi** (pass `colorize`): `ui.tsx` `AckCheckbox` + `finalize-period-modal.tsx` memakai Ionicons. Teks pernyataan `flex-1 text-sm` **boleh wrap** (memang untuk dibaca, bukan label tombol). **A11y mengikat**: `accessibilityRole='checkbox'` + `accessibilityState={{ checked }}` + `accessibilityLabel` = kalimat pernyataan penuh. **Kontrak pemakaian**: tombol aksi destruktif WAJIB `disabled` sampai `checked` — dua tindakan sadar terpisah; state di-reset saat dialog ditutup supaya tidak "lengket" saat dibuka ulang. Preseden pola checkbox: `settings-card-completion-rule.tsx`. **Sprint 7**: diekstrak ke `ui.tsx` sebagai komponen `AckCheckbox({ label, checked, onToggle })` supaya dipakai ulang oleh S7-6 (`review-submission-panel.tsx` approve submission + `settings-score-formula.tsx` aktivasi versi) tanpa duplikat pola. `finalize-period-modal.tsx` tetap memakai implementasi inline (test coverage sudah stabil; tak perlu port ulang saat ini). | `ui.tsx` (`AckCheckbox`) + inline preseden `mobile/src/components/finalize-period-modal.tsx` |
| `WarningCallout` (peringatan kritis in-dialog) | Kotak peringatan ber-ikon di body dialog. `View` `accessibilityRole='alert'` `flex-row items-start gap-2 rounded-lg bg-amber-50 p-3 dark:bg-amber-950`; ikon `Ionicons name='warning'` size 18, warna hex per tema (`#b45309` terang / `#fbbf24` gelap — Ionicons tak menerima class NativeWind untuk `color`, pola `brandIconColor`); teks `flex-1 text-sm font-semibold text-amber-900 dark:text-amber-200`. **Ikon WAJIB dekoratif** (`accessibilityElementsHidden` + `importantForAccessibility='no'`) — teks tetap satu-satunya pembawa makna supaya pembaca layar tidak mengumumkan "warning" dua kali; ikon berfungsi menarik mata ke informasi kritis lebih dulu, bukan menggantikan teks (§4 rule 2). **Sprint 7**: diekstrak ke `ui.tsx` sebagai `WarningCallout({ message })` (memilih warna ikon lewat `useThemePreference()`) supaya dipakai bersama `AckCheckbox` di modal konfirmasi ireversibel. | `ui.tsx` (`WarningCallout`) + inline preseden `mobile/src/components/finalize-period-modal.tsx` |
| `WeightTotalBadge` (DA-SF1-3) | chip `self-start rounded-full px-2.5 py-1 text-xs font-semibold`; valid (sum==100) `bg-green-100 text-green-700`; invalid `bg-amber-100 text-amber-700`; `accessibilityLabel` selalu menyebut total + status eksplisit ("Total bobot 95%, harus 100% untuk aktivasi") — DESIGN §4 warna ≠ satu-satunya sinyal | `mobile/src/app/(app)/settings-score-formula.tsx` |
| `FormulaStickyFooter` (DA-SF1-4) | container `flex-row gap-2 border-t border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-black`; isi 2 tombol: `Simpan Draft` (secondary, disabled saat tidak dirty), `Aktifkan` (primary, disabled saat sum!=100 OR dirty OR isActivating); `accessibilityState={{disabled}}` EKSPLISIT | `mobile/src/app/(app)/settings-score-formula.tsx` |
| `VersionStatusBadge` (DA-SF1-5) | reuse `Badge` dengan tone: `draft`→warn (kuning), `active`→success (hijau), `archived`→neutral (abu); label dari `FORMULA_STATUS_LABEL` konstanta yg sudah ada di `lib/people-score.ts` | `mobile/src/app/(app)/settings-score-formula.tsx` |
| `IconTile` (UI-G-011) | tile ikon per kartu/baris Menu — prototype `.menu-icon` 40×40 radius 8, ikon 22px stroke. App: `View` `rounded-xl` (radius md) ukuran default 40 (`items-center justify-center`) + `Ionicons` size ≈55% tile. Latar soft + warna ikon per **tone** selaras palet app (DESIGN §8), BUKAN hex prototype: `info` bg-blue-50/dark blue-950/40 ikon `#1564b3`→dark `#93c5fd`; `success` bg-green-50 ikon `#15803d`→`#86efac`; `warn` bg-amber-50 ikon `#b45309`→`#fcd34d`; `danger` bg-red-50 ikon `#b91c1c`→`#fca5a5`; `violet` bg-violet-50 ikon `#6d28d9`→`#c4b5fd`; `neutral` bg-neutral-100/800 ikon `#525252`→`#a3a3a3`. Warna ikon dipilih via `useThemePreference().effective` (§12 — **JANGAN `useColorScheme()`**; pola `Badge` `dark:text-*-300`). Ikon = dekorasi (label teks tetap sumber makna — DESIGN §4), jadi tile `accessibilityElementsHidden`/tanpa label sendiri. | `mobile/src/components/ui.tsx`, grid & list Menu `settings.tsx` |
| `NotificationRow` (UI-S-N01/N02) | kartu `rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950` berisi 2 sibling: Pressable baris (IconTile 40 tipe→ikon Ionicons outline, tone = `NOTIFICATION_TYPE_TONE`; judul `text-base` — `font-bold` saat unread, `font-semibold` saat read; body muted; meta row `Badge` label tipe + waktu relatif `text-xs text-neutral-500`) + tombol aksi kompak (`self-start min-h-[44px] rounded-xl bg-brand-dark px-5`, teks putih AA) di `pl-[52px]` sejajar kolom teks. **Sibling, bukan nested** — Pressable dalam Pressable = `<button>` bersarang invalid di web. Dot unread `h-2.5 w-2.5 bg-red-600` kanan-atas + `accessibilityLabel="Belum dibaca"` (§4 warna ≠ satu-satunya sinyal). "Tandai semua dibaca" = link-button `checkmark-done-outline` + teks `text-brand-dark dark:text-blue-300`, min-h 44 | `mobile/src/app/(app)/(tabs)/notifications.tsx` |
| `TimezoneNote` (BL-06, PRD §23 field 5) | Keterangan **read-only** di dalam `repeat-config`: `gap-0.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900`; kicker `text-[11px] font-semibold uppercase text-neutral-500` "Zona Waktu", nilai `text-sm font-semibold text-black dark:text-white` (mis. `Asia/Jakarta (WIB)`), hint `text-xs text-neutral-500`. Radius `rounded-xl` = skala field (§5), bukan `rounded-2xl` kartu — ia sebaris dengan field form di sekitarnya. **Tidak berisi kontrol** (zona = properti organisasi, bukan override per repeat-rule) sehingga aturan touch target §4.1 tidak berlaku; sebagai gantinya `accessible` + satu `accessibilityLabel` gabungan supaya pembaca layar mengumumkannya sekali, bukan tiga potong. **Jangan** ubah jadi picker/chip — lihat [feature-gap-backlog §BL-06](wiki/concepts/feature-gap-backlog.md) | `mobile/src/app/(app)/task/new.tsx` + [`org-timezone.ts`](mobile/src/lib/org-timezone.ts) |
| `ProgressOrb` (UI-G-001) | SVG ring 2 lapis (`Circle` track `#e2e8f0` + `Circle` value rotate `-90`, `strokeLinecap='round'`); size diskrit **56** (stroke 6) atau **72** (stroke 8); angka persen di tengah (`font-extrabold`, 16/20px). Tone otomatis dari nilai: `<35 danger` (red-700 `#b91c1c`), `35–69 warn` (amber-700 `#b45309`), `70–99 brand` (brand-dark `#1564b3`), `100 success` (green-700 `#15803d`); override via prop `tone` jika perlu. **A11y mengikat** (DESIGN §4: warna ≠ satu-satunya sinyal): `accessibilityRole='progressbar'` + `accessibilityLabel` selalu menyebut persen + label tone eksplisit (mis. "Capaian 68 persen, Berjalan"); angka tetap tampil di tengah orb | `mobile/src/components/ui.tsx`, header detail Goal/Strategy/Initiative/Action Plan/Task |

---

## 8. Token semantik turunan

**Score band** ([`score.ts`](mobile/src/lib/score.ts)):
| Band | Rentang | Label | Warna |
|---|---|---|---|
| on-track | ≥ 85 | On track | green-700/100 |
| stable | 70–84 | Stabil | neutral-600/100 |
| attention | < 70 | Perlu perhatian | amber-700/100 |

**Avatar palette** ([`avatar-color.ts`](mobile/src/lib/avatar-color.ts)) — deterministik per orang, semua lulus kontras AA dengan teks putih:
`#1d4ed8 #6d28d9 #0f766e #b45309 #be123c #15803d #0369a1 #9333ea`

---

## 9. Motion

- **Durasi:** mikro 150ms · standar 250ms · skeleton pulse 650ms.
- **Easing:** ease-in-out untuk pulse; `active:opacity-70/80` untuk feedback tekan (sudah dipakai di `Button`/`SectionCard`).
- Hemat animasi: app utilitas — gerakan untuk feedback & hierarki, bukan dekorasi.
- **Hormati Reduce Motion (OS a11y):** hook [`useReduceMotion()`](mobile/src/hooks/use-reduce-motion.ts) membungkus `AccessibilityInfo.isReduceMotionEnabled()` + listener `reduceMotionChanged`. Saat aktif:
  - `Skeleton` (`ui.tsx`) melewati pulse dan merender blok statis opacity `0.7` (tetap terbaca "memuat").
  - `<Modal>` tangan (bukan native-stack): `animationType="none"` — muncul seketika tanpa transisi (termasuk sheet-bawah). Pusatkan di primitif [`BottomSheet`](mobile/src/components/bottom-sheet.tsx) supaya semua adopter ikut otomatis; sisanya di-set per-modal.
  - Transisi layar native-stack Expo Router sudah mematuhi setelan OS — tak perlu diutak-atik.

---

## 10. Iconography

- Garis (stroke) 2px, ujung membulat (`stroke-linecap="round"`), 24×24 viewBox — konsisten dengan nav bawah & ikon prototype.
- Search = kaca pembesar, back = chevron kiri, lebih (`⋯`) = aksi sekunder.
- **Library ikon: `Ionicons` dari `@expo/vector-icons`** (dipakai `app-header`, tab bar, `IconTile`). Varian `-outline` untuk kartu/baris (stroke, konsisten prototype); filled untuk state aktif nav.
- **Ikon = penguat, bukan satu-satunya sinyal** (DESIGN §4): setiap `IconTile` selalu ditemani label teks; jangan pernah pakai ikon sendirian untuk membedakan makna/status.
- **State pilihan/checked = ikon Ionicons, bukan glyph teks** (resolusi konflik §7↔§10, owner 2026-08-04): kontrol seperti `AckCheckbox` memakai `checkmark-circle` (terpilih) / `ellipse-outline` (tak terpilih) dari Ionicons — genuine perbedaan bentuk (memenuhi §4 "warna ≠ satu-satunya sinyal") **dan** Ionicons (memenuhi aturan library di sini). **Jangan** pakai glyph teks telanjang `✓`/`○`. Penukaran seluruh glyph-as-icon ke Ionicons (`AckCheckbox`, `finalize-period-modal`, `settings-card-completion-rule`, checkbox `evaluation`, dsb.) **selesai** pada pass `colorize` (PR fix/colorize-p1-ionicons). Warna ikon pilihan pakai pasangan `brand-dark` (`#1564b3`/`#93c5fd`).
- **Warna ikon di prop non-className (`Ionicons` `color`)**: pakai hook `useThemedIcon(light, dark)` (`mobile/src/providers/theme-provider.tsx`) — bukan ternary `effective === 'dark' ? ... : ...` inline berulang. Pasangan hex yang sudah dipakai berkali-kali (daftarkan pasangan baru di sini sebelum dipakai di kode baru):
  - `muted` (ikon sekunder/tutup: `checkmark-done`, tombol tutup modal): `#6b7280` (terang) / `#a3a3a3` (gelap)
  - `neutral` (ikon aksi header netral, mis. `people-outline`): `#1f2937` (terang) / `#d1d5db` (gelap)
  - `brand-dark` (ikon aksen di atas latar netral, mis. tombol buka Rencana Aksi di header): `#1564b3` (terang) / `#93c5fd` (gelap)
  - `brand` (ikon aksen primer, mis. tombol lampirkan gambar): `#208aef` (terang) / `#93c5fd` (gelap)
  - `back` (chevron kembali `app-header`): `#145ebc` (terang) / `#93c5fd` (gelap) — terang sengaja pakai hue kategori Goal/Task (§2), bukan `brand-dark`; jangan lebur ke `brand-dark`. Verifikasi: [`app-header.tsx`](mobile/src/components/app-header.tsx) `backIconColor`.
  - `warn` (ikon peringatan in-dialog, mis. `WarningCallout` / `finalize-period-modal` / `ImpactApprovalCard`): `#b45309` (terang) / `#fbbf24` (gelap) — selaras status `warn` §2. Verifikasi: [`finalize-period-modal.tsx`](mobile/src/components/finalize-period-modal.tsx) `warningIconColor`.
  - `success` (ikon konfirmasi/selesai hijau, mis. `checkmark`/`checkmark-circle` di `workspace-help-modal`, toggle aktif template, banner "Selesai"): `#15803d` (terang) / `#86efac` (gelap) — selaras status `success` §2 + tile `success` §7.
  - `danger` (ikon aksi destruktif, mis. `trash-outline`): `#b91c1c` (terang) / `#fca5a5` (gelap) — selaras status `danger` §2 + tile `danger` §7.
  - `info` (ikon banner konteks biru, mis. `information-circle-outline`/`link-outline`/`chevron-forward` di `ChatContextBanner`/`GovernanceBanner`): `#1d4ed8` (terang) / `#93c5fd` (gelap) — selaras status `info` §2.

  **Near-miss muted (audit 2026-08-04, belum dikonsolidasi):** beberapa ikon sekunder ship dengan slate yang mendekati—tetapi bukan—`muted` terdaftar (`#6b7280`/`#a3a3a3`). Semuanya lulus kontras; idealnya dilebur ke `muted` di pass mendatang, didokumentasikan di sini agar tak terbaca sebagai baru:
  - eye-toggle auth + chevron akordeon Menu: `#667085` (terang, = token `muted` §2) / `#94a3b8` (gelap) — [`login.tsx`](mobile/src/app/(auth)/login.tsx) `eyeColor`, [`menu.tsx`](mobile/src/app/(app)/(tabs)/menu.tsx) `chevronColor`.
  - chip tema idle Menu: `#64748b` / `#a3a3a3` — [`menu.tsx`](mobile/src/app/(app)/(tabs)/menu.tsx) `idleIcon`.
  - gear Menu: `#26364f` / `#cbd5e1` — [`menu.tsx`](mobile/src/app/(app)/(tabs)/menu.tsx) `gearColor`.
  - ikon muted `notifications`: `#667085` (terang) / `#a3a3a3` (gelap, = `muted` gelap) — [`notifications.tsx`](mobile/src/app/(app)/(tabs)/notifications.tsx) `mutedIconColor`.

> Catatan `brand-light` (`#93c5fd`, token `global.css`): adopsinya **terbelah dengan sengaja** — sebagai **class** (`dark:text-brand-light`) di teks/ikon vektor NativeWind, dan sebagai **hex literal** `#93c5fd` di prop `color` Ionicons (mis. `app-header` sisi gelap). Prop `color` Ionicons tak menerima class NativeWind, jadi literal tak terhindarkan; pembelahan ini bukan drift.

---

## 11. Peta implementasi & keputusan terbuka

**Implementasi tokens** → `mobile/src/global.css` `@theme` (brand) + class NativeWind (neutrals/status pakai palet Tailwind bawaan).

**Keputusan (sudah final — owner 2026-06-29):**
1. ~~**Brand hue** — `#208aef` (kode) vs `#1877f2` (prototype).~~ ✅ **Pertahankan `#208aef`** (kanonik, sudah shipping). Tidak migrasi ke `#1877f2`.
2. ~~**Inter** — muat font asli vs tetap `system-ui`.~~ ✅ **Tetap `system-ui`** (lebih ringan, tanpa dependensi). Inter tidak dimuat.
3. ~~**Button contrast** — ganti fill primary ke `brand-dark` `#1564b3` agar teks putih lulus AA.~~ ✅ **Selesai** — `Button` primary kini `bg-brand-dark` (5.99:1).
4. ~~**Model auth** — self-signup vs admin-only.~~ ✅ **Admin-only** (PRD V1.8.2): Login tanpa toggle Daftar; ada "Hubungi Admin" + "Lupa password?". Akun dibuat administrator perusahaan.

---

## 12. Theme switch (Sistem / Terang / Gelap)

Mode tampilan dapat dipilih oleh pengguna di **Settings → Tampilan** dengan 3 opsi: `Sistem` (default — ikut OS), `Terang`, `Gelap`. Preferensi dipersist di `AsyncStorage` (key `rencanaapp:theme`).

**Implementasi** ([`theme-provider.tsx`](mobile/src/providers/theme-provider.tsx)):
- `ThemeProvider` membungkus app di [`_layout.tsx`](mobile/src/app/_layout.tsx) sebelum `AuthProvider`.
- Memanggil `Appearance.setColorScheme()` agar NativeWind v5 (lewat `react-native-css`) ikut mengganti varian `dark:*` realtime.
- `expo-router` `ThemeProvider` + `StatusBar` ikut nilai `effective` (`'light' | 'dark'`).
- Hook `useThemePreference()` mengembalikan `{ mode, effective, setMode }`. Fallback aman tanpa provider (test-friendly: default `'system'` + `effective: 'light'`).

> [!warning] Sumber tema tunggal untuk warna imperatif — **pakai `useThemePreference().effective`, JANGAN `useColorScheme()`**.
> Di **web**, `react-native-web` tidak mengimplementasi `Appearance.setColorScheme()`, jadi saat user memilih mode manual (Terang/Gelap), varian `dark:*` diatur via class `.dark`/`.light` di root oleh provider, sementara `useColorScheme()` tetap membaca `prefers-color-scheme` OS. Keduanya **berbeda** saat pilihan manual ≠ OS → komponen yang memilih hex lewat `useColorScheme()` (mis. track SVG, ikon, placeholder, surface inline) jadi "salah tema" (kartu hitam di mode Terang, dst). Hanya `effective` yang konsisten native + web. Mode `Sistem` juga live di web karena provider me-`apply()` ulang saat OS scheme berubah.

**Override fidelity mode:**
- Saat `EXPO_PUBLIC_UI_MODE=prototype`, tampilan dipaksa ke `light` agar audit visual bisa dibandingkan langsung dengan `design.html`.
- Token web tambahan untuk mode ini dideklarasikan di `global.css`: `--color-prototype-bg` `#f3f5f8` dan `--color-prototype-line` `#dde3eb`.

**Kontrol UI:** segmented 3 chip (Sistem/Terang/Gelap) di **Menu → Tampilan** ([`menu.tsx`](mobile/src/app/(app)/(tabs)/menu.tsx) `ThemeSwitch`; pindah dari Settings saat hub `/settings` pensiun), `accessibilityRole='radiogroup'` + tiap chip `radio` dengan `accessibilityState.selected`. Touch target ≥44px sesuai §4. Tiap chip: ikon Ionicons + label (§10 ikon = penguat, tak pernah sendirian) — `contrast`/`sunny`/`moon`, **filled saat aktif, `-outline` saat inaktif** (sinyal seleksi non-warna tambahan). Aktif `bg-brand-dark` + ikon/teks putih; inaktif `border border-neutral-300 bg-white` (dark: `border-neutral-700 bg-neutral-900`), warna ikon inaktif via `effective`.

**Cakupan:** semua layar utama (Home, Workspace, Inbox, People, Notifications, Settings + sub-settings, detail Goal/Strategy/Initiative/Action Plan/Task, Login) sudah memakai pola `class dark:class` sehingga otomatis terbaca di kedua mode. Saat menambah layar/komponen baru, **wajib** sediakan varian `dark:*` untuk: latar (`bg-*`), border (`border-*`), teks (`text-*`), dan placeholder/icon non-tailwind (pakai `useThemePreference().effective` untuk pick warna eksplisit).

Saat sebuah keputusan diambil, perbarui token terkait di sini + `global.css`.
