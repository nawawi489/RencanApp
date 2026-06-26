// Fase 8 — Settings > Governance Violation (read-only). Gated view_governance_violation (SINGULAR).
import { Stack } from 'expo-router';
import { ScrollView, Text, View } from 'react-native-css/components';

import { AccessDenied } from '@/components/access-denied';
import { Badge, EmptyState, SectionCard, SkeletonList } from '@/components/ui';
import {
  GOVERNANCE_VIOLATION_SEVERITY_LABEL,
  GOVERNANCE_VIOLATION_SEVERITY_TONE,
} from '@/lib/activity-governance';
import { useGovernanceViolations } from '@/hooks/use-activity-governance';
import { useProfile } from '@/hooks/use-profile';

export default function SettingsGovernanceViolationScreen() {
  const { can } = useProfile();
  const { violations, isLoading } = useGovernanceViolations();
  const allowed = can('view_governance_violation');

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Governance Violation' }} />
      <View className="gap-3 p-5">
        {!allowed ? (
          <AccessDenied message="Governance Violation hanya untuk pemegang izin Lihat Governance Violation." />
        ) : isLoading ? (
          <SkeletonList count={5} />
        ) : violations.length === 0 ? (
          <EmptyState title="Tidak ada pelanggaran" description="Belum ada catatan pelanggaran governance." />
        ) : (
          violations.map((v) => {
            const sev = v.severity ?? 'low';
            return (
              <SectionCard key={v.id}>
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="flex-1 text-base font-semibold text-black dark:text-white">
                    {v.violation_type}
                  </Text>
                  <Badge
                    label={GOVERNANCE_VIOLATION_SEVERITY_LABEL[sev] ?? sev}
                    tone={GOVERNANCE_VIOLATION_SEVERITY_TONE[sev] ?? 'neutral'}
                  />
                </View>
                {v.entity_type ? (
                  <Text className="text-sm text-neutral-500 dark:text-neutral-400">{v.entity_type}</Text>
                ) : null}
              </SectionCard>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
