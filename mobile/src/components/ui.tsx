import { useEffect, useState } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import { Animated, useColorScheme } from 'react-native';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native-css/components';
import { avatarColor, initials } from '@/lib/avatar-color';
import { SCORE_DESC, SCORE_LABEL, SCORE_RANGE, scoreBand, type ScoreBand } from '@/lib/score';

// ---------------------------------------------------------------- Button

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success';

const BUTTON_CLASS: Record<ButtonVariant, string> = {
  // brand-dark (#1564b3) bukan brand (#208aef): teks putih lulus WCAG AA (5.99:1 vs 3.53:1).
  primary: 'bg-brand-dark active:opacity-80',
  secondary:
    'border border-neutral-300 active:opacity-70 dark:border-neutral-700',
  danger: 'border border-red-300 active:opacity-70 dark:border-red-900',
  success: 'bg-green-600 active:opacity-80',
};

const BUTTON_TEXT_CLASS: Record<ButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-black dark:text-white',
  danger: 'text-red-600 dark:text-red-400',
  success: 'text-white',
};

export function Button({
  label,
  onPress,
  loading,
  disabled,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      // min-h-[44px]: touch target minimum (a11y) — chip/tombol kecil tetap nyaman ditekan.
      className={`min-h-[44px] items-center justify-center rounded-xl px-4 py-3 ${BUTTON_CLASS[variant]} ${inactive ? 'opacity-40' : ''}`}
      disabled={inactive}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
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

type Tone = 'neutral' | 'info' | 'warn' | 'success' | 'danger';

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

// ---------------------------------------------------------------- SectionCard

export function SectionCard({
  children,
  onPress,
}: PropsWithChildren<{ onPress?: () => void }>) {
  const className = 'gap-2 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800';
  if (onPress) {
    return (
      <Pressable className={`${className} active:opacity-70`} onPress={onPress}>
        {children}
      </Pressable>
    );
  }
  return <View className={className}>{children}</View>;
}

// ---------------------------------------------------------------- Field (display)

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View className="gap-0.5">
      <Text className="text-xs font-semibold uppercase text-neutral-400">{label}</Text>
      {typeof value === 'string' ? (
        <Text className="text-base text-black dark:text-white">{value}</Text>
      ) : (
        value
      )}
    </View>
  );
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
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-black dark:text-white">
        {label}
        {required ? <Text className="text-red-500"> *</Text> : null}
      </Text>
      <TextInput
        className={`rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white ${multiline ? 'h-24' : ''}`}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
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
 * State kosong sebagai fitur: ikon opsional, nada (neutral/success), chip meta,
 * dan satu aksi. Backward-compatible — pemanggilan lama (title+description) tetap jalan.
 */
export function EmptyState({
  title,
  description,
  icon,
  tone = 'neutral',
  meta,
  action,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  tone?: 'neutral' | 'success';
  meta?: ReactNode;
  action?: { label: string; onPress: () => void };
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
      {meta ? <View className="mt-1 flex-row flex-wrap justify-center gap-2">{meta}</View> : null}
      {action ? (
        <View className="mt-3">
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
  style,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: object;
}) {
  const scheme = useColorScheme();
  const base = scheme === 'dark' ? '#27272a' : '#e2e8f0';
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
      style={[{ width, height, borderRadius: radius, backgroundColor: base, opacity }, style]}
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

// ---------------------------------------------------------------- MetaGrid

/** Grid 2 kolom metadata (PIC/Reviewer/Deadline/Mode) untuk layar detail. */
export function MetaGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <View className="flex-row flex-wrap gap-3">
      {items.map((it, i) => (
        <View
          key={i}
          className="min-w-[45%] flex-1 gap-0.5 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
          <Text className="text-xs font-semibold uppercase text-neutral-400">{it.label}</Text>
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
const PRIORITY_ICON_CLASS: Record<PriorityTone, string> = {
  danger: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
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
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${title}. ${subtitle}` : undefined}>
      <View className={`h-7 w-7 items-center justify-center rounded-lg ${PRIORITY_ICON_CLASS[tone]}`}>
        <Text className={`text-xs font-bold ${PRIORITY_ICON_CLASS[tone].split(' ').filter((c) => c.startsWith('text-') || c.startsWith('dark:text-')).join(' ')}`}>
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
}: {
  tabs: { key: T; label: string; badge?: number }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
                <View className={`min-w-[18px] items-center rounded-full px-1.5 ${on ? 'bg-white/25' : 'bg-red-500'}`}>
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

/** Angka ringkas berlabel (snapshot tim di Home). */
export function StatPill({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: Tone }) {
  return (
    <View className={`min-w-[28%] flex-1 items-center gap-0.5 rounded-xl px-3 py-2.5 ${BADGE_CLASS[tone]}`}>
      <Text className={`text-lg font-extrabold ${BADGE_TEXT_CLASS[tone]}`}>{value}</Text>
      <Text className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</Text>
    </View>
  );
}
