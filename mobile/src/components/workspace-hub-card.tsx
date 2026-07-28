// UI-N-002 Stage 2 — Hub-card lobby di tab Workspace. 2 instance (Performance + Development).
// Komposisi: `?` help + orb % + 3-stat row + "Masuk →" button. Tap card area ATAU button → onEnter().
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native-css/components';

import { ProgressOrb } from '@/components/ui';
import { useThemePreference } from '@/providers/theme-provider';
import { WorkspaceHelpModal, type WorkspaceHelpContent } from '@/components/workspace-help-modal';
import type { HubStats } from '@/lib/workspace-hub-stats';

export function WorkspaceHubCard({
  kicker,
  title,
  meta,
  stats,
  enterLabel,
  enterAccessibilityLabel,
  parentStatLabel,
  childStatLabel,
  activeStatLabel,
  onEnter,
  help,
  helpAccessibilityLabel,
  space = 'performance',
}: {
  kicker: string;
  title: string;
  meta: string;
  stats: HubStats;
  enterLabel: string;
  /** Label a11y kartu; membedakan ruang saat `enterLabel` visible sama ("Masuk"). */
  enterAccessibilityLabel?: string;
  parentStatLabel: string;
  childStatLabel: string;
  activeStatLabel: string;
  onEnter: () => void;
  /** WSA-05 — konten help modal `?`; bila ada, render tombol `?` (tak menavigasi). */
  help?: WorkspaceHelpContent;
  helpAccessibilityLabel?: string;
  /** WSA-11 — ruang menentukan border-kiri + tint kicker pill (spec §4.2/§4.3). */
  space?: 'performance' | 'development';
}) {
  const a11yEnter = enterAccessibilityLabel ?? enterLabel;
  const [helpOpen, setHelpOpen] = useState(false);
  const isDark = useThemePreference().effective === 'dark';
  // WSA-11 identitas hub-card per ruang:
  //   Performance biru #1877f2 / bg #f8fbff; Development teal #0f766e / bg #f7fffd.
  // Border-kiri kategori dipertahankan di kedua tema. Surface + border netral wajib
  // theme-aware: bg light terkunci spec HANYA berlaku di light mode; di dark mode surface
  // ikut gelap agar teks `dark:` anak (judul/orb/stat) kontras AA (DESIGN.md §4 mengikat).
  // `border`/`kickerBg` = fill non-teks (border kiri, progress line, chip) → boleh hue penuh.
  // `cta` = fill tombol solid + teks putih → WAJIB lulus AA (DESIGN §4 rule 3): Performance
  // #1877f2 (3.6:1) diganti brand-dark #1564b3 (5.99:1); Development #0f766e sudah 4.8:1.
  const identity =
    space === 'performance'
      ? { border: '#1877f2', cta: '#1564b3', bg: '#f8fbff', kickerBg: '#e8f2ff', kickerText: '#145ebc' }
      : { border: '#0f766e', cta: '#0f766e', bg: '#f7fffd', kickerBg: '#e6fffb', kickerText: '#0f766e' };
  const surfaceBg = isDark ? '#0a0a0a' : identity.bg;
  const neutralBorder = isDark ? '#262626' : '#e5e7eb';
  // Orb null (belum ada data) → tampilkan "—" tanpa angka misleading.
  // orbPercent sudah 0–100 (workspace-hub-stats), ProgressOrb juga 0–100 — jangan dibagi lagi.
  const orbValue = stats.orbPercent;

  return (
    // Kartu = View (bukan Pressable) agar `?` dan `Masuk` tidak jadi button-di-dalam-button
    // (invalid HTML + a11y buruk). Spec §4.4: yang WAJIB adalah tombol `Masuk`; tap seluruh
    // kartu bersifat opsional dan sengaja tidak dipakai di sini.
    <View
      style={{
        minHeight: 172,
        borderRadius: 16,
        borderLeftWidth: 4,
        borderLeftColor: identity.border,
        borderTopWidth: 1,
        borderTopColor: neutralBorder,
        borderRightWidth: 1,
        borderRightColor: neutralBorder,
        borderBottomWidth: 1,
        borderBottomColor: neutralBorder,
        backgroundColor: surfaceBg,
        padding: 16,
        gap: 12,
      }}>
      <View className="flex-row items-start gap-3">
        <View className="flex-1 gap-1.5">
          <View className="flex-row items-center justify-between gap-2">
            {/* Kicker jadi pill (spec §4.2/§4.3). */}
            <View style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: identity.kickerBg }}>
              <Text style={{ color: identity.kickerText, fontSize: 11, fontWeight: '900', letterSpacing: 0.4 }}>
                {kicker.toUpperCase()}
              </Text>
            </View>
            {help ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={helpAccessibilityLabel ?? `Bantuan ${help.kind}`}
                onPress={() => setHelpOpen(true)}
                style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: '#cce2ff', backgroundColor: 'rgba(238,246,255,0.94)', alignItems: 'center', justifyContent: 'center' }}
                className="active:opacity-70">
                <Text style={{ color: '#145ebc', fontSize: 13, fontWeight: '900' }}>?</Text>
              </Pressable>
            ) : null}
          </View>
          <Text className="text-xl font-bold text-black dark:text-white">{title}</Text>
          <Text className="text-xs text-neutral-500 dark:text-neutral-400" numberOfLines={2}>
            {meta}
          </Text>
        </View>
        {orbValue == null ? (
          <View className="h-[72px] w-[72px] items-center justify-center rounded-full border border-neutral-200 dark:border-neutral-800">
            <Text className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">—</Text>
          </View>
        ) : (
          <ProgressOrb size={72} value={orbValue} sublabel="aktif" />
        )}
      </View>

      <View className="flex-row gap-2">
        <HubStat label={parentStatLabel} value={String(stats.parentCount)} />
        <HubStat label={childStatLabel} value={String(stats.childCount)} />
        <HubStat label={activeStatLabel} value={String(stats.activeCount)} />
      </View>

      {/* Progress line bawah + tombol Masuk nyata (spec §4.2 no.14 / §4.3 no.13).
          Track theme-aware: tint terang kickerBg tepat di light (kontras dgn isian border),
          tapi jadi garis "menyala" di card gelap → pakai neutral-800 di dark (DESIGN §12). */}
      <View style={{ height: 3, borderRadius: 999, backgroundColor: isDark ? '#1f2937' : identity.kickerBg, marginTop: 4 }}>
        <View style={{ height: 3, borderRadius: 999, width: `${Math.max(6, orbValue ?? 0)}%`, backgroundColor: identity.border }} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${a11yEnter}: ${stats.parentCount} ${parentStatLabel}, ${stats.childCount} ${childStatLabel}`}
        onPress={onEnter}
        style={{ alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, borderRadius: 999, backgroundColor: identity.cta, paddingHorizontal: 16, paddingVertical: 8 }}
        className="active:opacity-70">
        <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '900' }}>{enterLabel}</Text>
        <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '900' }}>›</Text>
      </Pressable>

      {help ? (
        <WorkspaceHelpModal visible={helpOpen} content={help} onClose={() => setHelpOpen(false)} />
      ) : null}
    </View>
  );
}

function HubStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 gap-0.5 rounded-xl bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">{label}</Text>
      <Text className="text-base font-bold text-black dark:text-white">{value}</Text>
    </View>
  );
}
