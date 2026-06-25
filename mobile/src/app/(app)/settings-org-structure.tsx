// Fase 8 — Settings > Organisasi (Department / Team). Gated create_department / manage_teams.
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { AccessDenied } from '@/components/access-denied';
import { Button, EmptyState, LabeledInput, SectionCard, SkeletonList } from '@/components/ui';
import { useOrgActions, useOrgStructure } from '@/hooks/use-org-structure';
import { useProfile } from '@/hooks/use-profile';

export default function SettingsOrgStructureScreen() {
  const { can } = useProfile();
  const { departments, isLoading } = useOrgStructure();
  const { createDepartment, isPending } = useOrgActions();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);

  const allowed = can('create_department');

  async function handleAdd() {
    if (!name.trim()) return;
    await createDepartment({ name: name.trim() });
    setName('');
    setAdding(false);
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Organisasi' }} />
      <View className="gap-4 p-5">
        {!allowed ? (
          <AccessDenied message="Pengelolaan struktur organisasi hanya untuk pemegang izin Membuat Department." />
        ) : isLoading ? (
          <SkeletonList count={4} />
        ) : (
          <>
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">
              Kelola Departemen organisasi. Nonaktifkan tanpa menghapus untuk menjaga riwayat.
            </Text>
            {departments.length === 0 ? (
              <EmptyState title="Belum ada Departemen" description="Tambahkan Departemen pertama Anda." />
            ) : (
              departments.map((d) => (
                <SectionCard key={d.id}>
                  <Text className="text-base font-semibold text-black dark:text-white">{d.name}</Text>
                  {d.description ? (
                    <Text className="text-sm text-neutral-500 dark:text-neutral-400">{d.description}</Text>
                  ) : null}
                  {!d.is_active ? <Text className="text-xs text-neutral-400">Nonaktif</Text> : null}
                </SectionCard>
              ))
            )}

            {adding ? (
              <SectionCard>
                <LabeledInput label="Nama Departemen" value={name} onChangeText={setName} placeholder="mis. Operasi" />
                <Button label="Simpan Departemen" onPress={handleAdd} disabled={isPending || !name.trim()} />
              </SectionCard>
            ) : (
              <Button label="+ Departemen Baru" onPress={() => setAdding(true)} />
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}
