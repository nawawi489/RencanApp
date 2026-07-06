import { Stack } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { CardHelpTrigger } from '@/components/card-help-trigger';
import { Badge, SectionCard, SkeletonList } from '@/components/ui';
import { useMbrRuleActions, useMbrRules } from '@/hooks/use-mbr';
import { useProfile } from '@/hooks/use-profile';
import {
  CARD_TYPE_LABEL,
  ENFORCEMENT_MODES,
  ENFORCEMENT_MODE_LABEL,
  ENFORCEMENT_MODE_TONE,
  type EnforcementMode,
  type MbrRule,
} from '@/lib/settings-mbr';

/** Aturan Goal → KPI Area dikunci: konsisten dgn gerbang aktivasi Goal (≥1 KPI Area) Fase 4. */
function isLocked(rule: MbrRule): boolean {
  return rule.parent_card_type === 'goal' && rule.child_card_type === 'kpi_area';
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
        Saat kartu induk belum memenuhi Minimum Breakdown Rule, tombol Aktifkan akan tampil non-aktif
        dengan indikator rasio turunan.
      </Text>
      <View className="gap-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="text-sm font-medium text-black dark:text-white">Strategy: &ldquo;Tingkatkan retensi&rdquo;</Text>
          <Badge label="Draft" tone="neutral" />
        </View>
        <View className="flex-row items-center gap-2">
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">Initiative</Text>
          <Text className="text-xs font-semibold text-amber-700 dark:text-amber-400">1 / 2 (50%)</Text>
        </View>
        <View
          aria-disabled
          className="min-h-[44px] items-center justify-center rounded-xl bg-brand-dark opacity-40">
          <Text className="text-base font-semibold text-white">Aktifkan Strategy</Text>
        </View>
        <Text className="text-xs text-neutral-400">
          Tap akan menampilkan dialog: <Text className="italic">&ldquo;Butuh minimal 2 Initiative; saat ini 1.&rdquo;</Text>
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
  const label = `${CARD_TYPE_LABEL[rule.parent_card_type]} → ${CARD_TYPE_LABEL[rule.child_card_type]}`;
  const locked = isLocked(rule);

  return (
    <SectionCard>
      <View className="flex-row items-center justify-between gap-3">
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
          <View className="flex-row items-center gap-3">
            <Text className="flex-1 text-sm text-neutral-600 dark:text-neutral-300">
              Minimum turunan
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Kurangi minimum ${label}`}
              className="h-11 w-11 items-center justify-center rounded-xl border border-neutral-300 active:opacity-70 dark:border-neutral-700"
              disabled={rule.min_count <= 1}
              onPress={() => onSet(rule, Math.max(1, rule.min_count - 1), rule.enforcement_mode)}
            >
              <Text className="text-lg font-bold text-black dark:text-white">−</Text>
            </Pressable>
            <Text className="min-w-[24px] text-center text-base font-bold text-black dark:text-white">
              {rule.min_count}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Tambah minimum ${label}`}
              className="h-11 w-11 items-center justify-center rounded-xl border border-neutral-300 active:opacity-70 dark:border-neutral-700"
              onPress={() => onSet(rule, rule.min_count + 1, rule.enforcement_mode)}
            >
              <Text className="text-lg font-bold text-black dark:text-white">+</Text>
            </Pressable>
          </View>

          <View className="gap-2">
            <Text className="text-sm text-neutral-600 dark:text-neutral-300">Mode penegakan</Text>
            <View className="flex-row flex-wrap gap-2">
              {ENFORCEMENT_MODES.map((m) => {
                const active = m === rule.enforcement_mode;
                return (
                  <Pressable
                    key={m}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Set ${ENFORCEMENT_MODE_LABEL[m]} untuk ${label}`}
                    className={`min-h-[44px] justify-center rounded-xl border px-3 py-2 active:opacity-70 ${
                      active
                        ? 'border-brand-dark bg-brand-dark'
                        : 'border-neutral-300 dark:border-neutral-700'
                    }`}
                    onPress={() => onSet(rule, rule.min_count, m)}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        active ? 'text-white' : 'text-black dark:text-white'
                      }`}
                    >
                      {ENFORCEMENT_MODE_LABEL[m]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
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
      <Stack.Screen options={{ title: 'Minimum Breakdown Rule' }} />
      <View className="gap-4 p-5">
        {!allowed ? (
          <SectionCard>
            <Text className="text-base font-semibold text-black dark:text-white">
              Anda tidak memiliki akses
            </Text>
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">
              Pengaturan Minimum Breakdown Rule hanya untuk pemegang izin Kelola Minimum Breakdown Rule.
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
