# RencanApp — Design System & Tokens

Sumber kebenaran token desain. Diekstrak dari prototype tim desain [`design.html`](design.html) dan diselaraskan dengan implementasi di [`mobile/`](mobile/) (NativeWind v5 / `react-native-css`, [`global.css`](mobile/src/global.css)).

**Cara pakai:** semua keputusan visual dikalibrasi ke dokumen ini. Token diekspresikan sebagai (1) nilai hex, (2) custom property `@theme` di `global.css`, dan (3) class NativeWind yang dipakai komponen. Saat menambah warna/spasi/komponen, daftarkan di sini dulu.

Render referensi: [`ui/ux/`](ui/ux/) (47 layar) + pola "10/10" di [`ui/ux/improved/`](ui/ux/improved/).

---

## 1. Brand

- **Nama:** Rencanaapp · **Tagline:** "Rencanakan. Jalankan. Tuntaskan."
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

### Brand
| Token | Hex | `@theme` | Pakai |
|---|---|---|---|
| `brand` | `#208aef` | `--color-brand` | Aksen, ikon aktif, link, fill non-teks |
| `brand-dark` | `#1564b3` | `--color-brand-dark` | **Fill tombol solid + teks putih** (lihat §4 a11y) |
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

> Pasangan chip kanonik memakai shade **`-700` di atas `-100`** (semua lulus AA, lihat §4). Pasangan lembut prototype (mis. hijau `#14845c` di `#e7f7ef` = 4.23) **gagal AA** — jangan dipakai untuk teks.

Implementasi: `Badge` & `STATUS_TONE` di [`cards.ts`](mobile/src/lib/cards.ts), `ui.tsx`.

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
| green-700 / green-100 | 4.57 | ✓ |
| amber-700 / amber-100 | 4.51 | ✓ |
| red-700 / red-50 | 5.91 | ✓ |

**Aturan:**
1. **Touch target ≥ 44×44px.** `Button` memakai `min-h-[44px]`. Chip/ikon-only beri padding atau `hitSlop`.
2. **Warna ≠ satu-satunya sinyal.** Status & skor selalu warna **+** label teks (lihat `ScoreBadge`).
3. **Solid + teks putih → pakai `brand-dark` `#1564b3`**, bukan `brand` `#208aef` (gagal AA pada teks normal). ✅ `Button` primary sudah `bg-brand-dark`.
4. **Label screen reader.** `accessibilityRole` + `accessibilityLabel` + `accessibilityState` (`busy`/`disabled`) di tiap kontrol. Sudah di `Button`, `Skeleton`, `ErrorState`, `Avatar`.
5. **Dynamic Type.** Layout harus selamat saat font sistem diperbesar (hindari tinggi fixed pada kontainer teks).

---

## 5. Spacing & radius

**Spacing** (skala 4px, Tailwind): `1=4 · 2=8 · 3=12 · 4=16 · 5=20 · 6=24`. Padding layar `p-5` (20). Gap antar-section `gap-5`. Gap dalam kartu `gap-2`.

**Radius:**
| Token | px | NativeWind | Pakai |
|---|---|---|---|
| sm | 8 | `rounded` | Skeleton, dot |
| md | 12 | `rounded-xl` | Tombol, input, field |
| lg | 16 | `rounded-2xl` | Kartu, sheet |
| full | 999 | `rounded-full` | Chip, avatar, badge |

---

## 6. Elevation

- **Shadow kartu:** `0 12px 30px rgba(31,43,68,.08)` (prototype `--shadow`). Di RN halus dan opsional; default andalkan **border** (`border-neutral-200`) untuk pemisahan, shadow untuk elemen terangkat (FAB, sheet).
- Dark mode: ganti shadow dengan `dark:border-neutral-800`.

---

## 7. Component tokens

| Komponen | Token kunci | Lokasi |
|---|---|---|
| `Button` | `min-h-[44px] rounded-xl px-4 py-3`; variant primary/secondary/danger/success | [`ui.tsx`](mobile/src/components/ui.tsx) |
| `SectionCard` | `rounded-2xl border p-4 gap-2` | `ui.tsx` |
| `Badge`/chip | `rounded-full px-2.5 py-1 text-xs font-semibold`; tone §2 | `ui.tsx` |
| `LabeledInput` | `rounded-xl border px-4 py-3`; `*` wajib merah | `ui.tsx` |
| `EmptyState` v2 | ikon (ring 64px), tone neutral/success, meta chip, action | `ui.tsx` |
| `Skeleton` | shimmer opacity 0.5↔1; radius prop | `ui.tsx` |
| `ErrorState` | latar `red-50`, role `alert`, retry | `ui.tsx` |
| `ScoreBadge`/`ScoreLegend` | band §8 + label teks | `ui.tsx` + [`score.ts`](mobile/src/lib/score.ts) |
| `Avatar` | warna deterministik §8 + inisial | `ui.tsx` + [`avatar-color.ts`](mobile/src/lib/avatar-color.ts) |
| `ChatBubble` (UI-S-IN2) | me: `bg-brand-dark text-white self-end rounded-2xl rounded-br-md px-3 py-2 max-w-[80%]`; them: `bg-neutral-100 dark:bg-neutral-800 self-start rounded-2xl rounded-bl-md px-3 py-2 max-w-[80%]`; identitas `them` = Avatar 28px + nama (`text-xs font-semibold text-neutral-500`) di atas bubble pertama hari itu | `mobile/src/app/(app)/inbox/[roomId].tsx` |
| `DateDivider` (UI-S-IN2) | `flex-row items-center gap-2 my-3`; chip tengah `bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 rounded-full text-xs font-semibold text-neutral-600 dark:text-neutral-300`; garis tipis `flex-1 h-px bg-neutral-200 dark:bg-neutral-800` di kiri & kanan; label = tanggal device-tz (`'Hari ini' / 'Kemarin' / 'd MMM yyyy'`) | `mobile/src/app/(app)/inbox/[roomId].tsx` |
| `ContextBanner` (UI-S-IN3 governance) | `flex-row items-start gap-2 rounded-2xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40 p-3`; ikon `ℹ`, body teks `text-sm text-blue-800`, tombol "Tutup" `text-xs font-semibold text-blue-700`; state `dismissed` lokal (re-mount akan munculkan lagi — by design V1) | `mobile/src/app/(app)/inbox/[roomId].tsx` |
| `SendButton` (UI-S-IN4) | circular `w-11 h-11` (inline style `{width:44,height:44}` — Critic §8.4: NativeWind class tak selalu flatten di jest); `rounded-full bg-brand-dark items-center justify-center`; ikon paper-plane putih; `accessibilityRole='button'` + `accessibilityLabel='Kirim pesan'` + `accessibilityState={{disabled}}` eksplisit (a11y mengikat); disabled saat input kosong/whitespace/`isSending` → `opacity-40` | `mobile/src/app/(app)/inbox/[roomId].tsx` |
| `UploadButton` (DA-AP5-1) | `min-h-[44px] rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-3`; ikon ➕ + label "Pilih file"; `accessibilityRole='button'` + `accessibilityLabel='Pilih file bukti'`; disabled saat sudah ≥5 file (`opacity-40`) atau `uploading` (`accessibilityState={{disabled}}` eksplisit) | `mobile/src/app/(app)/action-plan/submit.tsx` |
| `AttachmentRow` (DA-AP5-2) | `flex-row items-center gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3`; thumbnail icon (📄/🖼/📕 per kind), filename `text-sm font-semibold` truncate, size `text-xs text-neutral-500`, chip MIME kind (Badge tone neutral), tombol Remove (`accessibilityLabel='Hapus {filename}'`, hitSlop 8) | `mobile/src/app/(app)/action-plan/submit.tsx` |
| `ProgressPill` (DA-AP5-3) | chip kecil `rounded-full px-2.5 py-1 text-xs font-semibold` dengan 4 state warna: `'Siap unggah'` neutral-100/600, `'Mengunggah'` blue-100/700 (+optional spinner inline), `'OK'` green-100/700, `'Gagal'` red-100/700 + tombol "Coba lagi" inline. `accessibilityLabel` selalu sertakan state eksplisit (DESIGN §4: warna ≠ satu-satunya sinyal) | `mobile/src/app/(app)/action-plan/submit.tsx` |
| `KpiLinkageCard` (DA-AP6-1) | `rounded-2xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40 p-4 gap-2`; baris atas: "Masuk KPI Area" kicker + nama KPI bold; baris bawah: "Sumber: Action Plan {name}" muted; ada link Detail jika perlu | `mobile/src/app/(app)/action-plan/submit.tsx` |
| `DeltaArrow` (DA-AP6-2) | `flex-row items-center gap-2`; angka lama `text-base font-bold text-neutral-500`, ikon arrow (↑ green-700 / ↓ amber-700 / → neutral-500), angka baru `text-2xl font-extrabold` (tone sama dgn arah). **A11y mengikat**: `accessibilityLabel` selalu menyebut arah eksplisit (`naik 25`, `turun 12`, `tetap`); warna BUKAN satu-satunya sinyal (DESIGN §4) — ikon + label teks wajib | `mobile/src/app/(app)/action-plan/submit.tsx` |
| `ImpactApprovalCard` (DA-AP6-3) | `rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 p-3 gap-1`; ikon ⚠ + heading "Setelah disetujui Reviewer" + body teks (mis. "Nilai KPI Area X akan menjadi 145"); copy diambil dari konstanta `IMPACT_APPROVAL_COPY` (FR-AP6-10) — tidak hardcoded inline | `mobile/src/app/(app)/action-plan/submit.tsx` |

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

---

## 10. Iconography

- Garis (stroke) 2px, ujung membulat (`stroke-linecap="round"`), 24×24 viewBox — konsisten dengan nav bawah & ikon prototype.
- Search = kaca pembesar, back = chevron kiri, lebih (`⋯`) = aksi sekunder.

---

## 11. Peta implementasi & keputusan terbuka

**Implementasi tokens** → `mobile/src/global.css` `@theme` (brand) + class NativeWind (neutrals/status pakai palet Tailwind bawaan).

**Keputusan terbuka (perlu konfirmasi):**
1. **Brand hue** — `#208aef` (kode) vs `#1877f2` (prototype). Default: pertahankan `#208aef`.
2. **Inter** — muat font asli vs tetap `system-ui`. Default: system (lebih ringan).
3. ~~**Button contrast** — ganti fill primary ke `brand-dark` `#1564b3` agar teks putih lulus AA.~~ ✅ **Selesai** — `Button` primary kini `bg-brand-dark` (5.99:1).

Saat sebuah keputusan diambil, perbarui token terkait di sini + `global.css`.
