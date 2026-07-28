import { Stack } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { CardHelpTrigger } from '@/components/card-help-trigger';
import { Badge, SectionCard, SkeletonList } from '@/components/ui';
import { useMbrRuleActions, useMbrRules } from '@/hooks/use-mbr';
import { useProfile } from '@/hooks/use-profile';
import {
  cardTypeLabel,
  ENFORCEMENT_MODES,
  ENFORCEMENT_MODE_DESC,
  ENFORCEMENT_MODE_LABEL,
  ENFORCEMENT_MODE_TONE,
  MBR_MIN_COUNT_MAX,
  MBR_MIN_COUNT_MIN,
  type EnforcementMode,
  type MbrRule,
} from '@/lib/settings-mbr';

/**
 * Aturan Goal → Strategi dikunci: konsisten dgn gerbang aktivasi Goal (≥1 Strategi) Fase 4.
 * Cocokkan juga alias legacy `kpi_area` dari seed DB 0011 (rename V1.8.3).
 */
function isLocked(rule: MbrRule): boolean {
  return (
    rule.parent_card_type === 'goal' &&
    (rule.child_card_type === 'strategy' || rule.child_card_type === 'kpi_area')
  );
}

/**
 * UI-S-MBR1 — Kartu demo edukasi "Contoh Tombol Ditahan".
 * Menampilkan visual tombol Aktifkan yang ditahan saat MBR belum terpenuhi
 * (rasio <100% atau jumlah turunan < min_count). Bukan kontrol fungsional — hanya ilustrasi.
 */
function MbrExampleCard() {
  return (
    <SectionCard>
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-base font-semibold text-black dark:text-white">
          Contoh: Tombol Aktifkan ditahan
        </Text>
        <Badge label="Edukasi" tone="info" />
      </View>
      <Text className="text-sm text-neutral-500 dark:text-neutral-400">
        Saat kartu induk belum memenuhi Aturan Pecah Target, tombol Aktifkan akan tampil non-aktif
        dengan indikator rasio turunan.
      </Text>
      <View className="gap-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="text-sm font-medium text-black dark:text-white">Inisiatif: &ldquo;Tingkatkan retensi&rdquo;</Text>
          <Badge label="Draft" tone="neutral" />
        </View>
        <View className="flex-row items-center gap-2">
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">Rencana Aksi</Text>
          <Text className="text-xs font-semibold text-amber-700 dark:text-amber-400">1 / 2 (50%)</Text>
        </View>
        <View
          aria-disabled
          className="min-h-[44px] items-center justify-center rounded-xl bg-brand-dark opacity-40">
          <Text className="text-base font-semibold text-white">Aktifkan Inisiatif</Text>
        </View>
        <Text className="text-xs text-neutral-400">
          Tap akan menampilkan dialog: <Text className="italic">&ldquo;Butuh minimal 2 Rencana Aksi; saat ini 1.&rdquo;</Text>
        </Text>
      </View>
    </SectionCard>
  );
}

function RuleCard({
  rule,
  onSet,
}: {
  rule: MbrRule;
  onSet: (rule: MbrRule, minCount: number, mode: EnforcementMode) => void;
}) {
  const label = `${cardTypeLabel(rule.parent_card_type)} → ${cardTypeLabel(rule.child_card_type)}`;
  const locked = isLocked(rule);
  const atMin = rule.min_count <= MBR_MIN_COUNT_MIN;
  const atMax = rule.min_count >= MBR_MIN_COUNT_MAX;

  return (
    <SectionCard>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-base font-semibold text-black dark:text-white">{label}</Text>
        {locked ? (
          <Badge label="Terkunci" tone="neutral" />
        ) : (
          <Badge
            label={ENFORCEMENT_MODE_LABEL[rule.enforcement_mode]}
            tone={ENFORCEMENT_MODE_TONE[rule.enforcement_mode]}
          />
        )}
      </View>

      {locked ? (
        <Text className="text-sm text-neutral-500 dark:text-neutral-400">
          Aturan ini dikunci pada Blokir Aktivasi (minimum 1) agar konsisten dengan gerbang aktivasi Goal.
        </Text>
      ) : (
        <>
          <View className="gap-2">
            <Text className="text-sm text-neutral-600 dark:text-neutral-300">Mode penegakan</Text>
            {/* 2×2 grid — 4 mode dalam satu baris membuat teks wrapping tak konsisten (UX audit). */}
            <View className="flex-row flex-wrap gap-2">
              {ENFORCEMENT_MODES.map((m) => {
                const active = m === rule.enforcement_mode;
                return (
                  <Pressable
                    key={m}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Set ${ENFORCEMENT_MODE_LABEL[m]} untuk ${label}`}
                    className={`min-h-[44px] w-[48%] items-center justify-center rounded-xl border px-3 py-2 active:opacity-70 ${
                      active
                        ? 'border-brand-dark bg-brand-dark'
                        : 'border-neutral-300 dark:border-neutral-700'
                    }`}
                    onPress={() => onSet(rule, rule.min_count, m)}
                  >
                    <Text
                      className={`text-center text-sm font-semibold ${
                        active ? 'text-white' : 'text-black dark:text-white'
                      }`}
                    >
                      {ENFORCEMENT_MODE_LABEL[m]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {/* Helper text per mode — sebelumnya hanya `nonaktif` yg punya, sekarang keempatnya. */}
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">
              {ENFORCEMENT_MODE_DESC[rule.enforcement_mode]}
            </Text>
          </View>

          {rule.enforcement_mode !== 'nonaktif' ? (
            <View className="gap-1">
              <View className="flex-row items-center gap-3">
                <Text className="flex-1 text-sm text-neutral-600 dark:text-neutral-300">
                  Minimum turunan
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Kurangi minimum ${label}`}
                  accessibilityState={{ disabled: atMin }}
                  className={`h-11 w-11 items-center justify-center rounded-xl border border-neutral-300 dark:border-neutral-700 ${
                    atMin ? 'opacity-40' : 'active:opacity-70'
                  }`}
                  disabled={atMin}
                  onPress={() =>
                    onSet(rule, Math.max(MBR_MIN_COUNT_MIN, rule.min_count - 1), rule.enforcement_mode)
                  }
                >
                  <Text className="text-lg font-bold text-black dark:text-white">−</Text>
                </Pressable>
                <Text className="min-w-[24px] text-center text-base font-bold text-black dark:text-white">
                  {rule.min_count}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Tambah minimum ${label}`}
                  accessibilityState={{ disabled: atMax }}
                  className={`h-11 w-11 items-center justify-center rounded-xl border border-neutral-300 dark:border-neutral-700 ${
                    atMax ? 'opacity-40' : 'active:opacity-70'
                  }`}
                  disabled={atMax}
                  onPress={() =>
                    onSet(rule, Math.min(MBR_MIN_COUNT_MAX, rule.min_count + 1), rule.enforcement_mode)
                  }
                >
                  <Text className="text-lg font-bold text-black dark:text-white">+</Text>
                </Pressable>
              </View>
              <Text className="text-xs text-neutral-400 dark:text-neutral-500">
                Rentang {MBR_MIN_COUNT_MIN}–{MBR_MIN_COUNT_MAX}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

export default function SettingsMbrScreen() {
  const { can } = useProfile();
  const { rules, isLoading } = useMbrRules();
  const { setRule } = useMbrRuleActions();

  const allowed = can('manage_minimum_breakdown_rule');

  function handleSet(rule: MbrRule, minCount: number, mode: EnforcementMode) {
    void setRule({
      parentCardType: rule.parent_card_type,
      childCardType: rule.child_card_type,
      minCount,
      enforcementMode: mode,
    });
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Aturan Pecah Target' }} />
      <View className="gap-4 p-5">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">Aturan Pecah Target</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Aturan jumlah minimum kartu turunan per tingkat.
          </Text>
        </View>
        {!allowed ? (
          <SectionCard>
            <Text className="text-base font-semibold text-black dark:text-white">
              Anda tidak memiliki akses
            </Text>
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">
              Pengaturan Aturan Pecah Target hanya untuk pemegang izin Kelola Aturan Pecah Target.
            </Text>
          </SectionCard>
        ) : isLoading ? (
          <SkeletonList count={4} />
        ) : (
          <>
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 text-sm text-neutral-500 dark:text-neutral-400">
                Atur jumlah minimum kartu turunan dan mode penegakannya. Perubahan berlaku prospektif —
                kartu yang sudah ada tidak terpengaruh.
              </Text>
              <CardHelpTrigger topic="mbr" />
            </View>
            {rules.map((rule) => (
              <RuleCard key={rule.id} rule={rule} onSet={handleSet} />
            ))}
            <MbrExampleCard />
          </>
        )}
      </View>
    </ScrollView>
  );
}
