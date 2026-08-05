// Token warna theme-aware untuk INLINE style RN di layar Workspace (tree controls, hub-card,
// period-switcher). Dipakai inline (bukan className) karena react-native-css TIDAK mengkonsumsi
// utility `@theme`/NativeWind di prop `style` — preseden `WORKSPACE_KIND_BORDER`
// (workspace-kind-pill.tsx). Mengangkat literal hex yang tersebar (dulu invisible ke setiap
// perubahan token) ke satu sumber bernama + terdaftar di DESIGN.md §2.
//
// Semua nilai di sini PERSIS seperti sebelum ekstraksi — ini refactor VISUAL-IDENTIK, bukan
// restyle. Jangan mengubah hex tanpa memperbarui DESIGN.md + memverifikasi kontras §4.

/** Pasangan warna terang/gelap; resolve via {@link pick}. */
export type ThemePair = { light: string; dark: string };

/** Pilih sisi pasangan sesuai mode. `isDark` biasanya `useThemePreference().effective === 'dark'`. */
export const pick = (pair: ThemePair, isDark: boolean): string => (isDark ? pair.dark : pair.light);

/**
 * "Constructive teal" — tombol "+ turunan" (aksi konstruktif) di CompactActionRow tree.
 * Dibedakan dari Detail (biru = primary nav) dan "⋯" (netral = utility) lewat hue teal.
 * Teks teal-700 `#0f766e` di atas teal-100 `#ccfbf1` = 5.0:1 ✓ AA (§4).
 */
export const TREE_ADD_BUTTON: { border: ThemePair; background: ThemePair; text: ThemePair } = {
  border: { light: '#99f6e4', dark: '#115e59' },
  background: { light: '#ccfbf1', dark: '#134e4a' },
  text: { light: '#0f766e', dark: '#5eead4' },
};

/**
 * "Expanded-state blue" — TreeToggleButton saat sedang expanded (chevron terbuka).
 * Aksen non-teks (border/fill/ikon chevron) → hanya butuh 3:1 (§4).
 */
export const TREE_TOGGLE_EXPANDED: { border: ThemePair; background: ThemePair; icon: ThemePair } = {
  border: { light: '#bfdbfe', dark: '#3b82f6' },
  background: { light: '#eff6ff', dark: '#172554' },
  icon: { light: '#2563eb', dark: '#bfdbfe' },
};

/**
 * Surface & border netral utilitas (tombol "⋯", TreeToggleButton collapsed). Theme-aware per
 * DESIGN §4 rule 2 — tint terang terkunci HANYA di light mode; dark ikut gelap agar tak jadi
 * "light island". Dipakai di beberapa kontrol; nilai tunggal → satu sumber.
 */
export const NEUTRAL_UTILITY: { surface: ThemePair; border: ThemePair } = {
  surface: { light: '#f8fafc', dark: '#171717' },
  border: { light: '#e2e8f0', dark: '#404040' },
};

/**
 * Identitas ruang Workspace (Performance biru / Development teal) — border kiri kategori, CTA
 * solid, dan tint surface/kicker/pill yang terkunci LIGHT-only (dark ikut gelap, §4 rule 2).
 * Dipakai hub-card (kartu lobby) + period-switcher (collapsed pill). `cta` = fill solid + teks
 * putih → WAJIB lulus AA §4 rule 1: Performance pakai brand-dark `#1564b3` (5.99:1), Development
 * `#0f766e` (4.8:1). `categoryBorder`/kicker = aksen non-teks → hue penuh boleh (mis. `#1877f2`).
 */
export const WORKSPACE_SPACE: Record<
  'performance' | 'development',
  {
    categoryBorder: string;
    cta: string;
    hubBgLight: string;
    hubKickerBgLight: string;
    hubKickerText: string;
    pillBgLight: string;
    pillBorderLight: string;
  }
> = {
  performance: {
    categoryBorder: '#1877f2',
    cta: '#1564b3',
    hubBgLight: '#f8fbff',
    hubKickerBgLight: '#e8f2ff',
    hubKickerText: '#145ebc',
    pillBgLight: '#eef4fb',
    pillBorderLight: '#d9e3ef',
  },
  development: {
    categoryBorder: '#0f766e',
    cta: '#0f766e',
    hubBgLight: '#f7fffd',
    hubKickerBgLight: '#e6fffb',
    hubKickerText: '#0f766e',
    pillBgLight: '#eefaf8',
    pillBorderLight: '#cceee8',
  },
};
