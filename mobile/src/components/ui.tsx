import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import { Animated } from 'react-native';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native-css/components';
import Svg, { Circle } from 'react-native-svg';
import { avatarColor, initials } from '@/lib/avatar-color';
import { useThemePreference } from '@/providers/theme-provider';
import { SCORE_DESC, SCORE_LABEL, SCORE_RANGE, scoreBand, type ScoreBand } from '@/lib/score';

// ---------------------------------------------------------------- Button

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success';

const BUTTON_CLASS: Record<ButtonVariant, string> = {
  // brand-dark (#1564b3) bukan brand (#208aef): teks putih lulus WCAG AA (5.99:1 vs 3.53:1).
  primary: 'bg-brand-dark active:opacity-80',
  secondary:
    'border border-neutral-300 active:opacity-70 dark:border-neutral-700',
  danger: 'border border-red-300 active:opacity-70 dark:border-red-900',
  // green-700 (#15803d, 4.57:1) bukan green-600 (~3.3:1): teks putih lulus WCAG AA (DESIGN §2/§4).
  success: 'bg-green-700 active:opacity-80',
};

const BUTTON_TEXT_CLASS: Record<ButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-black dark:text-white',
  // red-700 (#b91c1c, 5.91:1) bukan red-600 (~4.0:1, gagal AA teks normal) — token danger DESIGN §2.
  danger: 'text-red-700 dark:text-red-400',
  success: 'text-white',
};

export function Button({
  label,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  // Opsional: a11y label eksplisit (mis. menyebut nama entitas) bila teks tombol saja tak cukup.
  // Default = `label` → backward-compatible dengan seluruh call-site existing.
  accessibilityLabel?: string;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      // min-h-[44px]: touch target minimum (a11y) — chip/tombol kecil tetap nyaman ditekan.
      className={`min-h-[44px] items-center justify-center rounded-xl px-4 py-3 ${BUTTON_CLASS[variant]} ${inactive ? 'opacity-40' : ''}`}
      disabled={inactive}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'success' ? '#ffffff' : undefined} />
      ) : (
        <Text className={`text-base font-semibold ${BUTTON_TEXT_CLASS[variant]}`}>{label}</Text>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------- Badge

export type Tone = 'neutral' | 'info' | 'warn' | 'success' | 'danger';

const BADGE_CLASS: Record<Tone, string> = {
  neutral: 'bg-neutral-100 dark:bg-neutral-800',
  info: 'bg-blue-100 dark:bg-blue-950',
  warn: 'bg-amber-100 dark:bg-amber-950',
  success: 'bg-green-100 dark:bg-green-950',
  danger: 'bg-red-100 dark:bg-red-950',
};

const BADGE_TEXT_CLASS: Record<Tone, string> = {
  neutral: 'text-neutral-600 dark:text-neutral-300',
  info: 'text-blue-700 dark:text-blue-300',
  warn: 'text-amber-700 dark:text-amber-300',
  success: 'text-green-700 dark:text-green-300',
  danger: 'text-red-700 dark:text-red-300',
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <View className={`self-start rounded-full px-2.5 py-1 ${BADGE_CLASS[tone]}`}>
      <Text className={`text-xs font-semibold ${BADGE_TEXT_CLASS[tone]}`}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- IconTile (UI-G-011)

// Tone tile ikon — superset `Tone` + `violet` (prototype `.menu-icon` punya varian violet).
export type IconTileTone = Tone | 'violet';

const ICON_TILE_BG: Record<IconTileTone, string> = {
  neutral: 'bg-neutral-100 dark:bg-neutral-800',
  info: 'bg-blue-50 dark:bg-blue-950/40',
  warn: 'bg-amber-50 dark:bg-amber-950/40',
  success: 'bg-green-50 dark:bg-green-950/40',
  danger: 'bg-red-50 dark:bg-red-950/40',
  violet: 'bg-violet-50 dark:bg-violet-950/40',
};

// [light, dark] warna ikon per tone — dark lebih terang agar kontras di bg-*-950/40 (pola Badge).
const ICON_TILE_COLOR: Record<IconTileTone, [string, string]> = {
  neutral: ['#525252', '#a3a3a3'],
  info: ['#1564b3', '#93c5fd'],
  warn: ['#b45309', '#fcd34d'],
  success: ['#15803d', '#86efac'],
  danger: ['#b91c1c', '#fca5a5'],
  violet: ['#6d28d9', '#c4b5fd'],
};

/**
 * Tile ikon berwarna untuk kartu/baris Menu (prototype `.menu-icon`). Ikon = dekorasi
 * penguat; label teks di sebelahnya tetap sumber makna (DESIGN §4), jadi tile disembunyikan
 * dari a11y tree. Beri `icon` (nama Ionicons, mis. 'people-outline') ATAU `text` (glyph
 * pendek seperti '?', 'CS', 'R') — keduanya di-center identik di frame (spec Menu §9).
 */
export function IconTile({
  icon,
  text,
  tone = 'info',
  size = 40,
}: {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  text?: string;
  tone?: IconTileTone;
  size?: number;
}) {
  const { effective } = useThemePreference();
  const color = ICON_TILE_COLOR[tone][effective === 'dark' ? 1 : 0];
  const glyphSize = Math.round(size * 0.38);
  return (
    <View
      style={{ width: size, height: size }}
      className={`items-center justify-center rounded-xl ${ICON_TILE_BG[tone]}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {text != null ? (
        // lineHeight = fontSize agar glyph teks ('?','CS','R') center presisi tanpa offset naik/turun.
        <Text style={{ fontSize: glyphSize, lineHeight: glyphSize, fontWeight: '900', color }}>
          {text}
        </Text>
      ) : (
        <Ionicons name={icon!} size={Math.round(size * 0.55)} color={color} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------- SectionCard

/**
 * Kartu seksi. Tiga bentuk:
 * - statis (`onPress` kosong) → `View` biasa.
 * - bisa ditekan → `Pressable` ber-`accessibilityRole="button"`.
 * - bisa ditekan **dan** punya kontrol sendiri → wadah statis + region pressable + slot `actions`.
 *
 * `actions` ADA supaya kontrol tidak bersarang di dalam Pressable. `Pressable` RN default
 * `accessible={true}`, yang di iOS meleburkan seluruh anak jadi SATU elemen a11y: tombol
 * bersarang berhenti bisa difokus VoiceOver dan aksinya jadi tak terjangkau — persis
 * pelanggaran DESIGN §4.4. Menaruh kontrol di `actions` membuatnya jadi *sibling* region
 * pressable, jadi keduanya dapat fokus sendiri-sendiri. Kontrol interaktif apa pun
 * (`Button`, `Pressable`, input) di kartu pressable WAJIB lewat `actions`, bukan `children`.
 */
export function SectionCard({
  children,
  onPress,
  accessibilityLabel,
  actions,
}: PropsWithChildren<{
  onPress?: () => void;
  accessibilityLabel?: string;
  actions?: ReactNode;
}>) {
  // Surface token DESIGN §2: kartu = putih di atas latar layar neutral-50 (level-2 inset
  // bg-neutral-50 baru terbaca bila kartunya sendiri tidak transparan).
  const className =
    'gap-2 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950';
  if (onPress) {
    // DESIGN §4.4 — `accessibilityRole` + `accessibilityLabel`. Label opsional: tanpa label RN
    // membacakan gabungan teks anak, yang untuk kartu ringkas justru lebih kaya. Isi label hanya
    // bila teks anak saja tidak menjelaskan apa yang terjadi saat di-tap.
    const pressable = (
      <Pressable
        className={actions ? 'gap-2 active:opacity-70' : `${className} active:opacity-70`}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}>
        {children}
      </Pressable>
    );
    if (!actions) return pressable;
    // Padding/border pindah ke wadah statis; region pressable menyisakan `gap-2` saja supaya
    // jarak antar-elemen kartu tidak berubah secara visual.
    return (
      <View className={className}>
        {pressable}
        {actions}
      </View>
    );
  }
  // Kartu statis tetap merender `actions` — kalau tidak, kartu yang kehilangan `onPress`-nya
  // (mis. entity type tanpa segmen rute di layar Arsip) ikut kehilangan tombol aksinya.
  return (
    <View className={className}>
      {children}
      {actions}
    </View>
  );
}

// ---------------------------------------------------------------- SectionHeading

/**
 * Judul seksi di dalam layar (H2). Merender `<Text>` tebal dengan
 * `accessibilityRole="header"` supaya navigasi-heading TalkBack/VoiceOver
 * (gestur utama pembaca layar untuk meloncati seksi) berfungsi — mayoritas
 * heading in-screen sebelumnya `<Text>` polos tanpa role.
 *
 * Ukuran default `text-lg font-bold` selaras pola H2 in-screen yang dominan
 * (DESIGN §3; judul layar/H1 tetap milik `Screen`). Slot `right` opsional untuk
 * elemen ekor (hitungan, aksi, `CardHelpTrigger`) di baris yang sama —
 * heading kiri, ekor kanan (`justify-between`).
 */
export function SectionHeading({
  title,
  right,
}: {
  title: string;
  right?: ReactNode;
}) {
  const heading = (
    <Text accessibilityRole="header" className="text-lg font-bold text-black dark:text-white">
      {title}
    </Text>
  );
  if (right == null) return heading;
  return (
    <View className="flex-row items-center justify-between gap-2">
      {heading}
      {right}
    </View>
  );
}

// ---------------------------------------------------------------- Field (display)

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View className="gap-0.5">
      <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">{label}</Text>
      {typeof value === 'string' ? (
        <Text className="text-base text-black dark:text-white">{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

// ---------------------------------------------------------------- placeholder color

/**
 * Warna `placeholderTextColor` TextInput — RN tak menerima class Tailwind untuk prop ini,
 * jadi hex eksplisit per tema (DESIGN §2): terang `#9ca3af`, gelap `#6b7280`. Semua layar
 * bertema wajib memakai hook ini alih-alih hardcode `#9ca3af`.
 */
export function usePlaceholderColor(): string {
  const { effective } = useThemePreference();
  return effective === 'dark' ? '#6b7280' : '#9ca3af';
}

// ---------------------------------------------------------------- LabeledInput (form)

export function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  required,
  multiline,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  autoCapitalize?: 'none' | 'sentences';
}) {
  const placeholderColor = usePlaceholderColor();
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold text-black dark:text-white">
        {label}
        {required ? <Text className="text-red-700 dark:text-red-400"> *</Text> : null}
      </Text>
      <TextInput
        className={`rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white ${multiline ? 'h-24' : ''}`}
        // A11y: `*` merah tak terdengar pembaca layar → sertakan " wajib" di label (WCAG 3.3.2).
        accessibilityLabel={required ? `${label} wajib` : label}
        placeholder={placeholder}
        placeholderTextColor={placeholderColor}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

// ---------------------------------------------------------------- GuidanceNote (Keterangan Card)

export function GuidanceNote({ title, body }: { title: string; body: string }) {
  return (
    <View className="gap-1 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
      <Text className="text-sm font-semibold text-blue-800 dark:text-blue-300">{title}</Text>
      <Text className="text-sm text-blue-700 dark:text-blue-300/80">{body}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- EmptyState

/**
 * State kosong sebagai fitur: ikon opsional, nada (neutral/success), dan satu aksi.
 * Backward-compatible — pemanggilan lama (title+description) tetap jalan.
 */
export function EmptyState({
  title,
  description,
  icon,
  tone = 'neutral',
  action,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  tone?: 'neutral' | 'success';
  action?: { label: string; onPress: () => void; disabled?: boolean };
}) {
  const ring =
    tone === 'success'
      ? 'bg-green-100 dark:bg-green-950'
      : 'bg-neutral-100 dark:bg-neutral-800';
  return (
    <View
      className="items-center gap-2 rounded-2xl border border-dashed border-neutral-300 p-8 dark:border-neutral-700"
      accessible
      accessibilityLabel={`${title}. ${description}`}>
      {icon ? (
        <View className={`mb-1 h-16 w-16 items-center justify-center rounded-full ${ring}`}>
          {icon}
        </View>
      ) : null}
      <Text className="text-center text-base font-semibold text-neutral-700 dark:text-neutral-200">
        {title}
      </Text>
      <Text className="text-center text-sm text-neutral-500 dark:text-neutral-400">{description}</Text>
      {action ? (
        // WS-04: opacity dim + label a11y mengindikasikan periode arsip; onPress
        // tetap wired (parent memilih handler alert vs push).
        <View
          className="mt-3"
          style={{ opacity: action.disabled ? 0.4 : 1 }}
          accessibilityState={{ disabled: !!action.disabled }}
          accessibilityLabel={
            action.disabled ? `${action.label} (periode arsip — nonaktif)` : undefined
          }>
          <Button label={action.label} onPress={action.onPress} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- ErrorState

/** Error inline dengan retry. Sisakan Alert hanya untuk mutation gagal. */
export function ErrorState({
  title = 'Gagal memuat',
  description = 'Periksa koneksi lalu coba lagi.',
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <View
      className="items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950/40"
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${description}`}>
      <Text className="text-center text-base font-semibold text-red-700 dark:text-red-300">{title}</Text>
      <Text className="text-center text-sm text-red-600 dark:text-red-400">{description}</Text>
      {onRetry ? (
        <View className="mt-2">
          <Button label="Coba lagi" onPress={onRetry} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- Skeleton

/** Blok shimmer (opacity pulse). Aksesibel sebagai "memuat", bukan konten kosong. */
export function Skeleton({
  width = '100%',
  height = 12,
  radius = 8,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
}) {
  const { effective } = useThemePreference();
  const base = effective === 'dark' ? '#27272a' : '#e2e8f0';
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    // Loop tak terbatas membanjiri timer di jest → lewati di test (animasi murni dekoratif).
    if (process.env.NODE_ENV === 'test') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 0.5, duration: 650, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={{ width, height, borderRadius: radius, backgroundColor: base, opacity }}
    />
  );
}

/** Kartu skeleton meniru baris list (avatar + 2 baris teks). */
export function SkeletonCard() {
  return (
    <View className="gap-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
      <View className="flex-row items-center gap-3">
        <Skeleton width={40} height={40} radius={20} />
        <View className="flex-1 gap-2">
          <Skeleton width="70%" height={12} />
          <Skeleton width="45%" height={12} />
        </View>
      </View>
    </View>
  );
}

/** Daftar skeleton untuk loading state list. */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View
      className="gap-3"
      accessible
      accessibilityState={{ busy: true }}
      accessibilityLabel="Memuat…">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- Avatar

/** Avatar inisial dengan warna deterministik per orang. */
export function Avatar({ name, seed, size = 46 }: { name: string; seed?: string; size?: number }) {
  const bg = avatarColor(seed ?? name);
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg }}
      className="items-center justify-center"
      accessible
      accessibilityLabel={name}>
      <Text className="font-bold text-white" style={{ fontSize: size * 0.32 }}>
        {initials(name)}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------- ScoreBadge + Legend

const SCORE_BADGE_CLASS: Record<ScoreBand, string> = {
  'on-track': 'bg-green-100 dark:bg-green-950',
  stable: 'bg-neutral-100 dark:bg-neutral-800',
  attention: 'bg-amber-100 dark:bg-amber-950',
};
const SCORE_TEXT_CLASS: Record<ScoreBand, string> = {
  'on-track': 'text-green-700 dark:text-green-300',
  stable: 'text-neutral-600 dark:text-neutral-300',
  attention: 'text-amber-700 dark:text-amber-300',
};

/** Badge skor: warna SELALU dipasangkan label teks (a11y, bukan warna saja). */
export function ScoreBadge({ score }: { score: number }) {
  const band = scoreBand(score);
  const text = `Score ${score} · ${SCORE_LABEL[band]}`;
  return (
    <View
      className={`self-start rounded-full px-2.5 py-1 ${SCORE_BADGE_CLASS[band]}`}
      accessible
      accessibilityLabel={text}>
      <Text className={`text-xs font-semibold ${SCORE_TEXT_CLASS[band]}`}>{text}</Text>
    </View>
  );
}

const LEGEND_DOT: Record<ScoreBand, string> = {
  'on-track': 'bg-green-600',
  stable: 'bg-neutral-400',
  attention: 'bg-amber-600',
};

/** Legenda skala skor untuk header daftar People. */
export function ScoreLegend() {
  const bands: ScoreBand[] = ['on-track', 'stable', 'attention'];
  return (
    <View className="gap-2 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
      <Text className="text-sm font-bold text-black dark:text-white">Skala Score</Text>
      {bands.map((b) => (
        <View key={b} className="flex-row items-center gap-2.5">
          <View className={`h-3.5 w-3.5 rounded ${LEGEND_DOT[b]}`} />
          <Text className="text-sm font-semibold text-black dark:text-white">{SCORE_LABEL[b]}</Text>
          <Text className="flex-1 text-sm text-neutral-500 dark:text-neutral-400"> · {SCORE_DESC[b]}</Text>
          <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">{SCORE_RANGE[b]}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- ScoreSparkline (Fase 7, D6)

/**
 * Sparkline mini untuk Trend skor — N titik (skala 0-100), urut KRONOLOGIS (kiri = terlama).
 * Graceful saat <2 titik: render single bar atau placeholder; tidak crash.
 * Implementasi bar-based (tanpa SVG) agar tidak menambah dependency.
 */
export function ScoreSparkline({ points }: { points: number[] }) {
  if (!points.length) {
    return (
      <Text className="text-xs text-neutral-400">
        Tren skor menyusul setelah ≥1 periode tertutup.
      </Text>
    );
  }
  const safe = points.map((p) => Math.max(0, Math.min(100, p)));
  const latest = safe[safe.length - 1];
  const prev = safe.length >= 2 ? safe[safe.length - 2] : null;
  const delta = prev != null ? latest - prev : null;
  const deltaTone =
    delta == null
      ? 'text-neutral-400'
      : delta > 0
        ? 'text-green-700 dark:text-green-400'
        : delta < 0
          ? 'text-amber-700 dark:text-amber-400'
          : 'text-neutral-500';
  const deltaLabel =
    delta == null ? '—' : delta > 0 ? `↑ +${delta}` : delta < 0 ? `↓ ${delta}` : '→ 0';
  return (
    <View
      className="gap-1.5"
      accessible
      accessibilityLabel={`Tren skor ${safe.length} periode, terbaru ${latest}, perubahan ${deltaLabel}`}>
      <View className="flex-row items-end gap-1" style={{ height: 28 }}>
        {safe.map((p, i) => (
          <View
            key={i}
            style={{ height: `${Math.max(8, p)}%`, width: 6 }}
            className={`rounded-sm ${
              i === safe.length - 1 ? 'bg-brand-dark' : 'bg-neutral-300 dark:bg-neutral-700'
            }`}
          />
        ))}
      </View>
      <Text className={`text-xs font-semibold ${deltaTone}`}>{deltaLabel}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- ScoreBreakdown (Fase 7)

export type ScoreBreakdownMetric = { label: string; value: number };

/**
 * Daftar metrik People (label + persen). Clamp 0–100. TIDAK menampilkan bobot
 * formula (per spec FR-7.8: breakdown menampilkan nama kategori + persentase
 * TANPA label bobot). ProgressBar dipakai untuk indikasi visual.
 */
export function ScoreBreakdown({ metrics }: { metrics: ScoreBreakdownMetric[] }) {
  if (!metrics.length) {
    return (
      <Text className="text-sm text-neutral-500 dark:text-neutral-400">
        Belum ada metrik untuk ditampilkan.
      </Text>
    );
  }
  return (
    <View className="gap-3">
      {metrics.map((m, i) => {
        const pct = Math.max(0, Math.min(100, Math.round(m.value)));
        return (
          <View key={`${m.label}-${i}`} className="gap-1.5">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-black dark:text-white">{m.label}</Text>
              <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">{pct}%</Text>
            </View>
            <ProgressBar value={pct} tone="brand" />
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- ProgressBar

/** Bar progres + persen opsional. Warna brand-dark (AA) atau green saat selesai. */
export function ProgressBar({
  value,
  tone = 'brand',
  showLabel = false,
}: {
  value: number;
  tone?: 'brand' | 'success';
  showLabel?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const fill = tone === 'success' ? 'bg-green-600' : 'bg-brand-dark';
  return (
    <View className="flex-row items-center gap-2" accessibilityRole="progressbar" accessibilityValue={{ now: pct, min: 0, max: 100 }}>
      <View className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <View style={{ width: `${pct}%` }} className={`h-full rounded-full ${fill}`} />
      </View>
      {showLabel ? (
        <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">{pct}%</Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- ProgressOrb (UI-G-001)

/**
 * Orb capaian sistemik untuk header detail Goal/KPI/Inisiatif/Rencana Aksi/Tugas.
 * Discrete size 56 (compact) atau 72 (hero). Tone otomatis dari nilai bila tidak diisi:
 *   - 0–34 → danger (merah) "Perlu dukungan"
 *   - 35–69 → warn  (amber) "Berjalan"
 *   - 70–99 → brand (biru)  "Menuju target"
 *   - 100   → success (hijau) "Selesai"
 * A11y mengikat (DESIGN §4): warna BUKAN satu-satunya sinyal — `accessibilityLabel`
 * selalu menyebut persen + label tone eksplisit; angka tetap tampil di tengah orb.
 */
export type OrbTone = 'brand' | 'success' | 'warn' | 'danger';
export type OrbSize = 56 | 72;

const ORB_COLOR: Record<OrbTone, string> = {
  brand: '#1564b3',   // brand-dark (AA)
  success: '#15803d', // green-700
  warn: '#b45309',    // amber-700
  danger: '#b91c1c',  // red-700
};
const ORB_TONE_LABEL: Record<OrbTone, string> = {
  brand: 'Menuju target',
  success: 'Selesai',
  warn: 'Berjalan',
  danger: 'Perlu dukungan',
};

export function orbToneFor(value: number): OrbTone {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  if (v >= 100) return 'success';
  if (v >= 70) return 'brand';
  if (v >= 35) return 'warn';
  return 'danger';
}

/** Ring SVG (track + progress arc) untuk ProgressOrb & TreeProgressOrb. */
function RingSvg({
  size,
  stroke,
  color,
  track,
  pct,
}: {
  size: number;
  stroke: number;
  color: string;
  track: string;
  pct: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  return (
    <Svg width={size} height={size} style={{ position: 'absolute' }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

export function ProgressOrb({
  value,
  size = 56,
  sublabel,
  label,
}: {
  value: number;
  size?: OrbSize;
  sublabel?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const resolvedTone = orbToneFor(pct);
  const stroke = size === 72 ? 8 : 6;
  const color = ORB_COLOR[resolvedTone];
  const numberSize = size === 72 ? 20 : 16;
  // Track ring wajib theme-aware: #e2e8f0 terang menyala di atas surface gelap (DESIGN §12).
  const { effective } = useThemePreference();
  const trackColor = effective === 'dark' ? '#27272a' : '#e2e8f0';
  const effectiveLabel = label ?? 'Capaian';
  const a11y = `${effectiveLabel} ${pct} persen, ${ORB_TONE_LABEL[resolvedTone]}${
    sublabel ? `. ${sublabel}` : ''
  }`;
  return (
    <View
      style={{ width: size, height: size }}
      className="items-center justify-center"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={a11y}
      accessibilityValue={{ now: pct, min: 0, max: 100 }}>
      <RingSvg size={size} stroke={stroke} color={color} track={trackColor} pct={pct} />
      <Text
        className="font-extrabold text-black dark:text-white"
        style={{ fontSize: numberSize, lineHeight: numberSize + 2 }}>
        {pct}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------- TreeProgressOrb (spec §10)

/**
 * Warna orb tree terkunci spec §10: good/risk/bad/null.
 * - 0% → netral (`muted`): barusaja dibuat / target belum diisi, BUKAN kondisi "buruk".
 *   Merah hanya untuk 1–34% yang artinya sudah ada upaya tapi masih rendah.
 * - 1–34% → bad (merah)
 * - 35–69% → risk (amber)
 * - 70–100% → good (hijau)
 */
export function treeOrbColor(value: number): string {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  if (v >= 70) return '#14845c'; // good green
  if (v >= 35) return '#b76b00'; // risk amber
  if (v >= 1) return '#c93434'; // bad red
  return '#94a3b8'; // neutral — "belum mulai" (bukan kesalahan)
}

export const TREE_PROGRESS_ORB_SIZE = 50;
export const TREE_PROGRESS_ORB_COMPACT_SIZE = 38;

/**
 * Orb progress varian tree (§10, WSA-15): default 50×50, mode compact 42×42, angka + "%" di
 * tengah, label visual di bawah (`Capaian` untuk Goal/Strategi, `Progress` untuk lainnya).
 * Ring SVG dgn warna good/risk/bad.
 */
export function TreeProgressOrb({
  value,
  label,
  compact = false,
}: {
  value: number;
  label: string;
  compact?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const size = compact ? TREE_PROGRESS_ORB_COMPACT_SIZE : TREE_PROGRESS_ORB_SIZE;
  const stroke = compact ? 4 : 6;
  const numberSize = compact ? 9 : 12;
  // UI-S-W09: label compact minimal 10px (DESIGN §4.5 — readable di mobile). Sebelumnya 8px
  // menyulitkan identifikasi status ring (Capaian/Progress) di Dynamic Type & dark mode.
  const labelSize = compact ? 10 : 11;
  const color = treeOrbColor(pct);
  // Track ring theme-aware (warna value good/risk/bad tetap terkunci spec §10; hanya track).
  const { effective } = useThemePreference();
  const trackColor = effective === 'dark' ? '#334155' : '#d9e2ec';
  return (
    <View
      style={{ minWidth: size }}
      className="items-center gap-0"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label} ${pct} persen`}
      accessibilityValue={{ now: pct, min: 0, max: 100 }}>
      <View style={{ width: size, height: size }} className="items-center justify-center">
        <RingSvg size={size} stroke={stroke} color={color} track={trackColor} pct={pct} />
        <Text className="font-extrabold text-black dark:text-white" style={{ fontSize: numberSize }}>
          {pct}%
        </Text>
      </View>
      <Text
        className="font-semibold text-neutral-500 dark:text-neutral-400"
        style={{ fontSize: labelSize }}>
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------- MetaGrid

/** Grid 2 kolom metadata (PIC/Reviewer/Deadline/Mode) untuk layar detail. */
export function MetaGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <View className="flex-row flex-wrap gap-3">
      {items.map((it, i) => (
        <View
          key={i}
          className="min-w-[45%] flex-1 gap-0.5 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
          <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">{it.label}</Text>
          <Text className="text-base font-semibold text-black dark:text-white" numberOfLines={1}>
            {it.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- PriorityCard

type PriorityTone = 'danger' | 'warn' | 'info';
const PRIORITY_CLASS: Record<PriorityTone, string> = {
  danger: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40',
  warn: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40',
  info: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40',
};
const PRIORITY_ICON_BG: Record<PriorityTone, string> = {
  danger: 'bg-red-100 dark:bg-red-900',
  warn: 'bg-amber-100 dark:bg-amber-900',
  info: 'bg-blue-100 dark:bg-blue-900',
};
const PRIORITY_ICON_TEXT: Record<PriorityTone, string> = {
  danger: 'text-red-700 dark:text-red-300',
  warn: 'text-amber-700 dark:text-amber-300',
  info: 'text-blue-700 dark:text-blue-300',
};

/** Kartu prioritas Home (Lewat deadline / Butuh Review / Gap KPI). */
export function PriorityCard({
  icon,
  title,
  subtitle,
  tone,
  onPress,
}: {
  icon: string;
  title: string;
  subtitle: string;
  tone: PriorityTone;
  onPress?: () => void;
}) {
  const Wrap = onPress ? Pressable : View;
  return (
    <Wrap
      className={`min-h-[44px] flex-1 gap-1.5 rounded-2xl border p-3 ${PRIORITY_CLASS[tone]} ${onPress ? 'active:opacity-70' : ''}`}
      onPress={onPress}
      // A11y: varian statis (tanpa onPress) tetap satu node ber-label agar dibaca sekali;
      // varian pressable sudah `accessible` default via Pressable (DESIGN §4).
      accessible={onPress ? undefined : true}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${title}. ${subtitle}`}>
      <View
        className={`h-7 w-7 items-center justify-center rounded-lg ${PRIORITY_ICON_BG[tone]}`}
        importantForAccessibility="no-hide-descendants">
        <Text className={`text-xs font-bold ${PRIORITY_ICON_TEXT[tone]}`}>
          {icon}
        </Text>
      </View>
      <Text className="text-sm font-bold text-black dark:text-white">{title}</Text>
      <Text className="text-xs text-neutral-500 dark:text-neutral-400" numberOfLines={2}>
        {subtitle}
      </Text>
    </Wrap>
  );
}

// ---------------------------------------------------------------- TabBar

/** Tab horizontal yang bisa di-scroll (segmentasi Notifications, dll). Badge unread opsional. */
export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
  showsScrollIndicator = false,
}: {
  tabs: { key: T; label: string; badge?: number }[];
  active: T;
  onChange: (key: T) => void;
  /** Tampilkan indikator scroll horizontal — pakai bila jumlah tab > yang muat di layar,
   *  agar user tahu ada opsi tersembunyi (mis. Log Aktivitas dgn 7 filter). */
  showsScrollIndicator?: boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={showsScrollIndicator}>
      <View className="flex-row gap-2 px-0.5 py-0.5">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <Pressable
              key={t.key}
              onPress={() => onChange(t.key)}
              // min-h-[44px]: touch target a11y.
              className={`min-h-[44px] flex-row items-center gap-1.5 rounded-full px-4 py-2 ${
                on ? 'bg-brand-dark' : 'border border-neutral-300 dark:border-neutral-700'
              } active:opacity-70`}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}>
              <Text className={`text-sm font-semibold ${on ? 'text-white' : 'text-black dark:text-white'}`}>
                {t.label}
              </Text>
              {t.badge ? (
                <View className={`min-w-[18px] items-center rounded-full px-1.5 ${on ? 'bg-white/25' : 'bg-red-700'}`}>
                  <Text className="text-xs font-bold text-white">{t.badge > 99 ? '99+' : t.badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------- StatPill

// ---------------------------------------------------------------- AP5+AP6 components

/** UI-S-AP5 (UploadButton DA-AP5-1). Disabled saat sudah penuh atau sedang upload. */
export function UploadButton({
  onPress,
  disabled,
  count,
  max = 5,
}: {
  onPress: () => void;
  disabled?: boolean;
  count: number;
  max?: number;
}) {
  const isFull = count >= max;
  const isDisabled = disabled || isFull;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel="Pilih file bukti"
      accessibilityState={{ disabled: !!isDisabled }}
      className={`min-h-[44px] flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 px-4 py-3 dark:border-neutral-700 ${isDisabled ? 'opacity-40' : 'active:opacity-70'}`}>
      <Text className="text-base font-bold text-brand-dark dark:text-brand">+</Text>
      <Text className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
        {isFull ? `Maksimum ${max} file` : `Pilih file (${count}/${max})`}
      </Text>
    </Pressable>
  );
}

/** UI-S-AP5 (ProgressPill DA-AP5-3). 4 state — warna BUKAN satu-satunya sinyal (a11y label eksplisit). */
export type UploadState = 'ready' | 'uploading' | 'ok' | 'failed';
const PROGRESS_CLASS: Record<UploadState, string> = {
  ready: 'bg-neutral-100 dark:bg-neutral-800',
  uploading: 'bg-blue-100 dark:bg-blue-950',
  ok: 'bg-green-100 dark:bg-green-950',
  failed: 'bg-red-100 dark:bg-red-950',
};
const PROGRESS_TEXT_CLASS: Record<UploadState, string> = {
  ready: 'text-neutral-600 dark:text-neutral-300',
  uploading: 'text-blue-700 dark:text-blue-300',
  ok: 'text-green-700 dark:text-green-300',
  failed: 'text-red-700 dark:text-red-300',
};
const PROGRESS_LABEL: Record<UploadState, string> = {
  ready: 'Siap unggah',
  uploading: 'Mengunggah',
  ok: 'OK',
  failed: 'Gagal',
};
export function ProgressPill({ state }: { state: UploadState }) {
  return (
    <View
      className={`self-start rounded-full px-2.5 py-1 ${PROGRESS_CLASS[state]}`}
      accessible
      accessibilityLabel={`Status unggahan: ${PROGRESS_LABEL[state]}`}>
      <Text className={`text-xs font-semibold ${PROGRESS_TEXT_CLASS[state]}`}>{PROGRESS_LABEL[state]}</Text>
    </View>
  );
}

const KIND_ICON: Record<string, string> = { photo: '🖼', pdf: '📕', file: '📄' };

/** UI-S-AP5 (AttachmentRow DA-AP5-2). Filename + size + chip kind + remove + progress. */
export function AttachmentRow({
  fileName,
  sizeBytes,
  kind,
  kindLabel,
  uploadState = 'ready',
  onRemove,
  onRetry,
}: {
  fileName: string;
  sizeBytes: number;
  kind: 'photo' | 'pdf' | 'file' | string;
  kindLabel: string;
  uploadState?: UploadState;
  onRemove?: () => void;
  onRetry?: () => void;
}) {
  const sizeStr = formatBytes(sizeBytes);
  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
      <Text className="text-xl">{KIND_ICON[kind] ?? '📄'}</Text>
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-semibold text-black dark:text-white" numberOfLines={1}>
          {fileName}
        </Text>
        <View className="flex-row items-center gap-2">
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">{sizeStr}</Text>
          <Badge label={kindLabel} tone="neutral" />
          <ProgressPill state={uploadState} />
        </View>
      </View>
      {onRetry && uploadState === 'failed' ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={`Coba lagi unggah ${fileName}`}
          hitSlop={8}
          className="active:opacity-70">
          <Text className="text-xs font-semibold text-brand-dark">Coba lagi</Text>
        </Pressable>
      ) : null}
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Hapus ${fileName}`}
          hitSlop={8}
          className="active:opacity-70">
          <Text className="text-base text-neutral-500">✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** UI-S-AP6 (KpiLinkageCard DA-AP6-1). "Masuk Strategi" + nama + sumber. */
export function KpiLinkageCard({
  kpiName,
  sourceLabel,
}: {
  kpiName: string;
  sourceLabel: string;
}) {
  return (
    <View className="gap-1 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
      <Text className="text-xs font-semibold uppercase text-blue-700 dark:text-blue-300">
        Masuk Strategi
      </Text>
      <Text className="text-base font-bold text-black dark:text-white">{kpiName}</Text>
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">{sourceLabel}</Text>
    </View>
  );
}

/** UI-S-AP6 (DeltaArrow DA-AP6-2). a11y label EKSPLISIT menyebut arah (DESIGN §4: warna ≠ satu-satunya sinyal). */
export function DeltaArrow({
  previous,
  proposed,
}: {
  previous: number | null;
  proposed: number | null;
}) {
  const hasBoth = previous != null && proposed != null;
  const delta = hasBoth ? proposed! - previous! : null;
  const tone =
    delta == null
      ? 'text-neutral-500'
      : delta > 0
        ? 'text-green-700 dark:text-green-400'
        : delta < 0
          ? 'text-amber-700 dark:text-amber-400'
          : 'text-neutral-500';
  const arrow = delta == null ? '→' : delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
  const directionLabel =
    delta == null
      ? 'belum ada perubahan'
      : delta > 0
        ? `naik ${delta}`
        : delta < 0
          ? `turun ${Math.abs(delta)}`
          : 'tetap';
  const a11y = `Perubahan nilai: ${directionLabel}. Nilai lama ${previous ?? '-'}, nilai baru ${proposed ?? '-'}.`;
  return (
    <View className="flex-row items-center gap-2" accessible accessibilityLabel={a11y}>
      <Text className="text-base font-bold text-neutral-500">{previous ?? '—'}</Text>
      <Text className={`text-xl font-bold ${tone}`}>{arrow}</Text>
      <Text className={`text-2xl font-extrabold ${tone}`}>{proposed ?? '—'}</Text>
    </View>
  );
}

/** UI-S-AP6 (ImpactApprovalCard DA-AP6-3). Copy via konstanta IMPACT_APPROVAL_COPY (FR-AP6-10). */
export const IMPACT_APPROVAL_COPY = {
  heading: 'Setelah disetujui Reviewer',
  body: (kpiName: string, proposed: number | string | null) =>
    proposed == null
      ? `Nilai Strategi "${kpiName}" akan diperbarui setelah Reviewer menyetujui submission ini.`
      : `Nilai Strategi "${kpiName}" akan diperbarui menjadi ${proposed} setelah Reviewer menyetujui submission ini.`,
};

export function ImpactApprovalCard({
  kpiName,
  proposed,
}: {
  kpiName: string;
  proposed: number | string | null;
}) {
  return (
    <View
      className="gap-1 rounded-2xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40"
      accessible
      accessibilityLabel={IMPACT_APPROVAL_COPY.body(kpiName, proposed)}>
      <Text className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-300">
        ⚠ {IMPACT_APPROVAL_COPY.heading}
      </Text>
      <Text className="text-sm text-amber-900 dark:text-amber-200">
        {IMPACT_APPROVAL_COPY.body(kpiName, proposed)}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------- StatPill

/** Angka ringkas berlabel (snapshot tim di Home). */
export function StatPill({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: Tone }) {
  return (
    <View className={`min-w-[28%] flex-1 items-center gap-0.5 rounded-xl px-3 py-2.5 ${BADGE_CLASS[tone]}`}>
      <Text className={`text-lg font-extrabold ${BADGE_TEXT_CLASS[tone]}`}>{value}</Text>
      <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- Banner

export type BannerTone = 'warn' | 'error';

export function Banner({
  tone,
  message,
  action,
}: {
  tone: BannerTone;
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  const bg =
    tone === 'error'
      ? 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-900'
      : 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-900';
  const textCls =
    tone === 'error'
      ? 'text-red-800 dark:text-red-200'
      : 'text-amber-800 dark:text-amber-200';
  return (
    // A11y: role="alert" + liveRegion="polite" agar pembaca layar mengumumkan banner
    // (degraded-search / network-error) saat muncul — mirror pola login-error. JANGAN set
    // `accessible` di container: tombol aksi harus tetap fokusabel sebagai sibling (DESIGN §4.6).
    <View
      className={`gap-2 rounded-xl border p-3 ${bg}`}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite">
      <Text className={`text-sm ${textCls}`}>{message}</Text>
      {action ? (
        <View className="self-start">
          <Button label={action.label} onPress={action.onPress} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}
