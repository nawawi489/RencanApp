# Checklist Implementasi — Prototype → `mobile/`

Pemetaan 46 layar [`design.html`](../../design.html) ke route Expo Router di `mobile/src/app/`, dengan status dan **state yang masih perlu ditambahkan** sebelum tiap layar layak rilis.

Legenda status: ✅ sudah solid · 🟡 ada tapi stub/parsial · ⬜ belum dibangun
Legenda state: **L** loading · **E** empty · **Err** error/retry · **0R** zero-result · **OK** success/optimistic · **G** guard/rule

---

## 1. Fondasi dulu (komponen lintas-layar) — kerjakan ini #1

Kondisi sekarang di [`ui.tsx`](../../mobile/src/components/ui.tsx):
- `EmptyState` ada tapi **minim** — hanya title + description, tanpa ikon, chip status, atau aksi.
- Loading = `ActivityIndicator` (spinner) di mana-mana — **belum ada skeleton**.
- Error = `Alert.alert` popup — **belum ada inline error/retry**.
- Skor People belum ada komponen badge bersemantik.

Status: ✅ sudah dibuat + test (commit fondasi) · lokasi [`ui.tsx`](../../mobile/src/components/ui.tsx), [`lib/score.ts`](../../mobile/src/lib/score.ts), [`lib/avatar-color.ts`](../../mobile/src/lib/avatar-color.ts)

| Komponen | Status | Catatan |
|---|---|---|
| `EmptyState` v2 | ✅ | `icon`, `tone` (neutral/success), `meta`, `action`; backward-compatible; `accessibilityLabel` |
| `Skeleton` / `SkeletonCard` / `SkeletonList` | ✅ | Shimmer opacity (`Animated`); `accessibilityState={{busy}}` + label "Memuat…" |
| `ErrorState` | ✅ | Inline pesan + "Coba lagi" → `onRetry`; `accessibilityRole="alert"` |
| `ScoreBadge` + `ScoreLegend` | ✅ | Warna SELALU + label teks (a11y); threshold di `lib/score.ts` |
| `Avatar` + `avatarColor` / `initials` | ✅ | Warna deterministik dari palet AA; `accessibilityLabel`=nama |
| `Button` (a11y upgrade) | ✅ | `min-h-[44px]` touch target + `accessibilityRole/State` |
| `ZeroResult` | ↪︎ pakai `EmptyState` | Tidak perlu komponen terpisah — `EmptyState` (icon+action) sudah menutup kasus search 0 hasil |

**Verifikasi:** `npx tsc --noEmit` bersih · `npx jest` 51/51 hijau (termasuk [`ui-feedback.test.tsx`](../../mobile/src/components/__tests__/ui-feedback.test.tsx), [`score.test.ts`](../../mobile/src/lib/__tests__/score.test.ts), [`avatar-color.test.ts`](../../mobile/src/lib/__tests__/avatar-color.test.ts)).

Mayoritas layar di bawah kini tinggal "pasang state" pakai komponen ini.

---

## 2. Per-layar

### Tabs (sudah ada route)
| Prototype | Route mobile | Status | OK | Perlu ditambah |
|---|---|---|---|---|
| home | `(tabs)/index.tsx` | ✅ | L (spinner) + E sudah ada | Err/retry; upgrade L→skeleton |
| notifications | `(tabs)/notifications.tsx` | 🟡 stub | — | Query + **L, E, Err**; filter chip scrollable (fade tepi); badge unread |
| workspace (hub) | `(tabs)/workspace.tsx` | 🟡 | L + E ada (query Initiative) | Hub belum cocok prototype (2 kartu Performance/Development); **Err** |
| inbox | `(tabs)/inbox.tsx` | 🟡 stub | — | List Initiative chat: **L, E, Err** |
| people | `(tabs)/people.tsx` | ✅ | List anggota asli + `ScoreLegend` + `Avatar` + 4 state (L/E/Err); test 4/4 | `ScoreBadge` aktif saat skor terisi (Fase 7) |

### Action Plan & eksekusi (sebagian ada)
| Prototype | Route mobile | Status | OK | Perlu ditambah |
|---|---|---|---|---|
| action-plan-detail | `action-plan/[id].tsx` | ✅ | L + inline empty instance | Err/retry; **G** (guard "Lengkapi…"); state bukti/review |
| new-action-plan | `action-plan/new.tsx` | ✅ | L mutation + Alert err | **G** minimum breakdown; validasi field inline |
| evidence-submission | `action-plan/submit.tsx` | ✅ | L + Alert err | OK sukses (toast versi bukti); preview upload |
| action-plan-instance-detail | — | ⬜ | — | Bangun; L, E, Err |
| result-value-input | — | ⬜ | — | Bangun; validasi + OK |
| review-flow | — | ⬜ | — | Bangun; OK approve/revisi |
| deadline-request | — | ⬜ | — | Bangun; OK kirim request |
| repeat-setting | (parsial di `[id]`) | 🟡 | toggle ada | Layar penuh; preview jadwal |
| card-completeness | — | ⬜ | — | Modal panduan; **G** sebelum aktif |
| evaluation-flow | — | ⬜ | — | Bangun; E (belum selesai) |

### Performance hierarchy (belum ada)
| Prototype | Route mobile | Status | Perlu ditambah |
|---|---|---|---|
| performance-workspace (tree) | ⬜ | tree Goal→KPI→Strategy→Initiative→Plan; **L (skeleton tree), E, Err, G** (tombol + terkunci) |
| goal-detail / new-goal | ⬜ | detail + form; L, E, Err, validasi |
| kpi-detail / new-kpi-area | ⬜ | **form panjang → pecah multi-step**; L, Err, **G** |
| strategy-detail / new-strategy | ⬜ | detail + form |
| initiative-detail | `initiative/[id].tsx` ✅ / new ✅ | Err/retry; G |

### Development hierarchy (belum ada)
| Prototype | Status | Perlu ditambah |
|---|---|---|
| development-workspace, development-area-detail, new-development-area, problem-detail, new-problem | ⬜ semua | Bangun; tiap list/detail butuh **L, E, Err**; form butuh validasi + **G** |

### Inbox / chat
| Prototype | Status | Perlu ditambah |
|---|---|---|
| inbox-chat | ⬜ | **E** (belum ada pesan — perbaiki gap kosong di atas), L (riwayat), Err kirim; pesan sistem |

### People & profil
| Prototype | Status | Perlu ditambah |
|---|---|---|
| people-ranking, people-profile | ⬜ | ScoreBadge + legenda; L, E, Err |
| score-settings, manual-score-override | ⬜ | Form; konfirmasi (override = aksi berwenang) |

### Admin / governance / settings
| Prototype | Route | Status | Perlu ditambah |
|---|---|---|---|
| menu | (`settings.tsx` parsial) | 🟡 | Daftar menu + profil |
| permission-settings | ⬜ | **Konfirmasi destruktif**; reason wajib sebelum simpan; ringkasan dampak di atas |
| organization-settings, rules-settings, repeat-rule-settings | ⬜ | Form + L, Err |
| goal-template-library, kpi-template-library | ⬜ | List + **E** ("belum ada template") |
| activity-log | ⬜ | List + **L (skeleton), E**; read-only |
| governance-violation | ⬜ | **E "semua bersih"** (mockup 01); L, Err |
| archive-view | ⬜ | List + **E**; tetap searchable |
| global-search | ⬜ | **Initial state + 0R** (mockup 02/03); L; debounce |
| confidential-access | ⬜ | Form alasan + konfirmasi |

---

## 3. Pola yang berulang (terapkan ke SEMUA layar)
1. **Tiap list** = 4 state: L (skeleton) · E (EmptyState v2 + aksi) · Err (retry) · isi.
2. **Tiap form** = validasi inline + **G** (minimum breakdown rule) + OK sukses (toast, bukan cuma navigasi).
3. **Tiap aksi konsekuensial** (hapus, ubah akses, override, ubah deadline) = konfirmasi + alasan bila perlu.
4. **Search** = initial state + 0R, jangan layar kosong.
5. **Warna = makna**: skor & status pakai tone bersemantik + legenda, jangan warna dekoratif.
6. **Touch target** ≥ 44px; filter horizontal beri fade/afordance scroll.

---

## 4. Urutan kerja yang disarankan
1. **Fondasi** (bag. 1) — 6 komponen. Sekali kerja, dipakai semua.
2. **Lengkapi tab stub** — notifications, inbox, people (pasang L/E/Err pakai fondasi).
3. **Performance tree** — layar inti produk; butuh guard + skeleton tree.
4. **Sisanya** per fase sesuai roadmap (governance/search/admin terakhir).
