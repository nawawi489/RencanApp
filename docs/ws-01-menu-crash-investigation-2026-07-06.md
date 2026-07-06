# WS-1 / BUG-01 — Investigasi Menu tab crash `reading 'length'`

Sumber: [bugfix-plan-2026-07-06.md](bugfix-plan-2026-07-06.md) §WS-1. Branch: `fix/menu-crash-revisit` (di atas `feat/menu-v182-uilock`, karena crash ada di `menu.tsx` hasil rebuild V1.82 yang belum di-merge ke `main`).

## Kesimpulan

**Bukan bug produksi — artefak HMR. Tidak ada perubahan kode yang dibenarkan.**

Gejala (`Cannot read properties of undefined (reading 'length')`, overlay menunjuk `ScrollView` [menu.tsx:250](../mobile/src/app/(app)/(tabs)/menu.tsx), component stack berhenti di `ScrollViewBase`) muncul hanya pada kunjungan tab ke-2 saat fast-refresh aktif. Analisis statik menyeluruh menunjukkan **tidak ada** pembacaan `.length` pada nilai async/undefined di seluruh rantai dependensi Menu.

## Bukti (analisis statik lengkap)

| Lokasi | Baca `.length` pada data async? | Guard yang sudah ada |
|---|---|---|
| `menu.tsx` | Hanya `AKSES_CEPAT.length` (konstanta modul) | tak pernah undefined |
| `useProfile().can()` | Tidak | `if (!profile) return false`; `permissionKeys` selalu `string[]` (di-default `?? []` di `fetchCurrentProfile`); pakai `.includes`, bukan `.length` mentah |
| `useMyScore()` | Tidak | `score ?? null` di call-site; `effectiveScore(r)` `if (r == null) return null` |
| `useMyScoreHistory()` | Tidak | `q.data ?? []` di dalam hook |
| Anak UI Menu (`IconTile`, `ScoreBadge`, `Avatar`, `Badge`, `SkeletonCard`) | Tidak ada `.length` sama sekali | — |

Aturan yang diresepkan plan ("hook pengembali array selalu default `[]` di hook-nya, bukan tebar `?? []` di call-site") **sudah dipenuhi** di seluruh rantai. Tidak ada yang perlu di-guard.

## Kenapa HMR, bukan produksi

- Component stack berhenti di `ScrollViewBase` (bukan komponen anak) → error terjadi di pemrosesan `className`/style ScrollView milik `react-native-css`, bukan di kode app.
- Stack `react-native-css` (NativeWind `5.0.0-preview.4`) adalah pin preview yang rapuh (lihat AGENTS.md: "preview intentional; upgrades have broken styling"). Partial hot-reload dapat meninggalkan array style/atom setengah-terinisialisasi → `.length` pada undefined saat reconcile.
- Konsekuensi: **tidak reproduce di production bundle** (tanpa fast-refresh). Prioritas turun sesuai plan §WS-1 langkah 2.

## Kenapa TIDAK menambah test

Test regresi yang diusulkan plan (render Menu → unmount → render ulang dgn `useMyScore`/`useProfile` resolve lambat) akan **HIJAU pada kode saat ini** — menu.tsx tak pernah membaca `.length` pada data async, jadi test tak mereproduksi crash dan tak membuktikan apa pun (dikonfirmasi Critic #10). Menambahnya memberi false confidence. Tidak ditambahkan.

## Rekomendasi

1. **Tutup WS-1 sebagai no-fix** (artefak HMR dev-only). Tidak ada risiko produksi.
2. Bila crash tetap mengganggu DX saat dev: tangkap stack RUNTIME penuh di sesi dev hidup (dgn fast-refresh) untuk mengonfirmasi frame `react-native-css`; ini isu tooling/preview-pin, bukan kode app. Jangan blokir rilis.
3. Verifikasi lokal opsional (butuh Supabase lokal + login): jalankan web build produksi (`expo start --web --no-dev --minify`), login, navigasi Menu → buka form KPI Area → Home → Menu; harapkan TIDAK crash — mengonfirmasi hipotesis HMR.

## Status lingkungan saat investigasi

- Supabase lokal (docker) TIDAK berjalan saat investigasi → repro runtime tidak dijalankan; kesimpulan bertumpu pada analisis statik yang konklusif + tanda tangan crash.
