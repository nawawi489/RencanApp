// Fase 8 — Settings > Confidential Access. Gated manage_confidential_access.
// Daftar rule per entity (entity_type, user, access_level). Grant lewat detail card (defer).
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native-css/components';

import { AccessDenied } from '@/components/access-denied';
import { Badge, EmptyState, SectionCard, SkeletonList } from '@/components/ui';
import { ACCESS_LEVEL_LABEL, type ConfidentialEntityType } from '@/lib/confidential-access';
import { useConfidentialAccessRules } from '@/hooks/use-confidential-access';
import { useProfile } from '@/hooks/use-profile';

export default function SettingsConfidentialAccessScreen() {
  const { can } = useProfile();
  const params = useLocalSearchParams<{ entityType?: string; entityId?: string }>();
  const entityType = (params.entityType ?? 'action_plan') as ConfidentialEntityType;
  const entityId = params.entityId ?? '';
  const { rules, isLoading } = useConfidentialAccessRules(entityType, entityId);
  const allowed = can('manage_confidential_access');

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Akses Rahasia' }} />
      <View className="gap-3 p-5">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-black dark:text-white">Akses Rahasia</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Aturan pengecualian akses data sensitif.
          </Text>
        </View>
        {!allowed ? (
          <AccessDenied message="Akses Rahasia hanya untuk pemegang izin Kelola Akses Rahasia." />
        ) : isLoading ? (
          <SkeletonList count={3} />
        ) : rules.length === 0 ? (
          <EmptyState title="Belum ada aturan" description="Belum ada aturan akses rahasia untuk entity ini." />
        ) : (
          rules.map((r) => (
            <SectionCard key={r.id}>
              <View className="flex-row items-center justify-between gap-2">
                <Text className="flex-1 text-base font-semibold text-black dark:text-white">{r.entity_type}</Text>
                <Badge label={ACCESS_LEVEL_LABEL[r.access_level] ?? r.access_level} tone="warn" />
              </View>
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">Pengguna: {r.user_id}</Text>
            </SectionCard>
          ))
        )}
      </View>
    </ScrollView>
  );
}
