import { useWindowDimensions } from 'react-native';
import type { ViewStyle } from 'react-native';

// Sumber kebenaran lebar untuk seluruh pass responsif (P1 adapt). Nilai dihitung dari lebar
// jendela (`useWindowDimensions`) — identik di web & native — bukan dari prefix breakpoint
// NativeWind (`sm:`/`md:`/`lg:`), yang belum terverifikasi andal pada pin preview NativeWind
// v5 + react-native-css di proyek ini. Semua keputusan layout width-derived mengalir dari sini.

/** Lebar konten maksimum yang nyaman dibaca (measure) di web/tablet. Di ponsel (<720pt)
 *  `maxWidth` tak berpengaruh → layout ponsel tak berubah. DESIGN: kolom konten tunggal. */
export const MAX_CONTENT_WIDTH = 720;

/** Kelas ukuran jendela — disederhanakan dari Material 3 window size classes:
 *   compact  <600     — ponsel potret
 *   medium   600–839  — ponsel besar lanskap / tablet potret
 *   expanded ≥840     — tablet lanskap / web desktop */
export const BREAKPOINT = { medium: 600, expanded: 840 } as const;

export type Breakpoint = 'compact' | 'medium' | 'expanded';

export function widthToBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINT.expanded) return 'expanded';
  if (width >= BREAKPOINT.medium) return 'medium';
  return 'compact';
}

/** Hook sumber kebenaran lebar. Re-render otomatis saat viewport berubah (resize web /
 *  rotasi device), jadi semua consumer ikut beradaptasi. */
export function useBreakpoint() {
  const { width, height } = useWindowDimensions();
  const breakpoint = widthToBreakpoint(width);
  return {
    width,
    height,
    breakpoint,
    isCompact: breakpoint === 'compact',
    isMedium: breakpoint === 'medium',
    isExpanded: breakpoint === 'expanded',
    /** Rail navigasi (gantikan bottom tab bar) di lebar expanded. */
    useNavRail: breakpoint === 'expanded',
  };
}

/** Style pembungkus konten: batasi lebar + tengahkan. Dipakai pada `contentStyle` (Stack),
 *  `sceneStyle` (Tabs), dan pembungkus `Screen`. `alignSelf` menengahkan di parent kolom
 *  (native + web); `marginHorizontal:'auto'` menengahkan di parent baris — mis. area konten
 *  di samping rail pada web, tempat sumbu-silang flex vertikal sehingga `alignSelf` tak
 *  menengahkan horizontal. Keduanya disertakan agar robust lintas platform & arah flex. */
export const contentWidthStyle: ViewStyle = {
  width: '100%',
  maxWidth: MAX_CONTENT_WIDTH,
  alignSelf: 'center',
  marginHorizontal: 'auto',
};

/** Jumlah kolom grid kartu-fitur (Menu) menurut breakpoint. Konten dibatasi
 *  `MAX_CONTENT_WIDTH`, jadi ≥medium cukup 3 kolom (≈240pt/kartu) — nyaman untuk ikon +
 *  label 2 baris; 4 kolom akan menyempit di bawah cap 720pt. */
export function menuGridColumns(bp: Breakpoint): number {
  return bp === 'compact' ? 2 : 3;
}

/** Kolom MetaGrid (sel label/nilai pendek pada layar detail). 4 kolom di ≥medium tetap
 *  terbaca dalam cap 720pt; 2 kolom di ponsel. */
export function metaGridColumns(bp: Breakpoint): number {
  return bp === 'compact' ? 2 : 4;
}

/** `flexBasis` persen untuk N kolom pada baris `flex-wrap` ber-gap kecil. Persen sedikit di
 *  bawah 100/N menyisakan ruang untuk gap; `flex-wrap` menata baris berikutnya. Dipakai via
 *  inline `style` (bukan className) agar nilai dinamis tak bergantung pada ekstraksi kelas
 *  compiler react-native-css. */
export function columnBasis(cols: number): `${number}%` {
  const map: Record<number, number> = { 1: 100, 2: 48, 3: 31, 4: 23 };
  return `${map[cols] ?? 48}%`;
}
