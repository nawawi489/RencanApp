// BL-19b — UI-S-OR2: anggota satu Tim. `assignTeamMember` sudah dirangkai lib→hook sejak
// Fase 8 tapi tidak pernah punya layar, jadi Tim selalu kosong sejak dibuat.
// Gating: manage_teams (sama dengan tab Tim di /settings-org-structure).
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView, Text, View } from 'react-native-css/components';

import { AccessDenied } from '@/components/access-denied';
import { Button, EmptyState, LabeledInput, SectionCard, SkeletonList } from '@/components/ui';
import { UserPicker } from '@/components/user-picker';
import { useOrgActions, useTeamMembers, useTeams } from '@/hooks/use-org-structure';
import { useProfile } from '@/hooks/use-profile';
import { personLabel, type PersonRef } from '@/lib/cards';
import { alertFriendlyError } from '@/lib/errors';

export default function SettingsTeamMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const teamId = typeof id === 'string' ? id : null;
  const { can } = useProfile();
  const { teams, isLoading: teamsLoading } = useTeams();
  const { members, isLoading } = useTeamMembers(teamId);
  const { assignTeamMember, removeTeamMember, isPending } = useOrgActions();

  const [person, setPerson] = useState<NonNullable<PersonRef> | null>(null);
  const [roleInTeam, setRoleInTeam] = useState('');
  const [adding, setAdding] = useState(false);

  const team = teams.find((t) => t.id === teamId) ?? null;
  const allowed = can('manage_teams');

  async function handleAdd() {
    if (!teamId || !person) return;
    try {
      await assignTeamMember({ teamId, profileId: person.id, roleInTeam: roleInTeam.trim() });
      setPerson(null);
      setRoleInTeam('');
      setAdding(false);
    } catch (e) {
      alertFriendlyError('Gagal', e, 'Kesalahan.');
    }
  }

  function confirmRemove(profileId: string, name: string) {
    Alert.alert('Lepas anggota?', `${name} akan dikeluarkan dari Tim ini. Bisa ditambahkan lagi nanti.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Lepas',
        style: 'destructive',
        onPress: () => {
          if (!teamId) return;
          removeTeamMember({ teamId, profileId }).catch((e: unknown) =>
            alertFriendlyError('Gagal', e, 'Kesalahan.'),
          );
        },
      },
    ]);
  }

  // Orang yang sudah jadi anggota disembunyikan dari picker: RPC menolak duplikat lewat
  // unique(team_id, profile_id), dan menawarkan pilihan yang pasti gagal itu jebakan.
  const memberIds = new Set(members.map((m) => m.profile_id));

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: team?.name ?? 'Anggota Tim' }} />
      <View className="gap-4 p-5">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-black dark:text-white">
            {team?.name ?? 'Anggota Tim'}
          </Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Anggota Tim dan perannya di dalam Tim.
          </Text>
        </View>

        {!allowed ? (
          <AccessDenied message='Layar ini memerlukan izin "manage_teams". Hubungi administrator bila perlu akses.' />
        ) : isLoading || teamsLoading ? (
          <SkeletonList count={3} />
        ) : (
          <View className="gap-3">
            {members.length === 0 ? (
              <EmptyState
                title="Belum ada anggota"
                description="Tambahkan anggota pertama Tim ini."
              />
            ) : (
              members.map((m) => {
                const name = personLabel(m.profiles);
                return (
                  <SectionCard
                    key={m.id}
                    actions={
                      <Button
                        label="Lepas"
                        accessibilityLabel={`Lepas ${name} dari Tim`}
                        variant="danger"
                        onPress={() => confirmRemove(m.profile_id, name)}
                        disabled={isPending}
                      />
                    }>
                    <Text className="text-base font-semibold text-black dark:text-white">{name}</Text>
                    {m.role_in_team ? (
                      <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                        Peran: {m.role_in_team}
                      </Text>
                    ) : null}
                    {m.profiles?.email ? (
                      <Text className="text-xs text-neutral-400">{m.profiles.email}</Text>
                    ) : null}
                  </SectionCard>
                );
              })
            )}

            {adding ? (
              <SectionCard>
                <UserPicker
                  label="Anggota"
                  required
                  value={person}
                  onChange={setPerson}
                  excludeIds={memberIds}
                />
                <LabeledInput
                  label="Peran di Tim"
                  value={roleInTeam}
                  onChangeText={setRoleInTeam}
                  placeholder="opsional — mis. Koordinator"
                />
                <Button
                  label="Tambahkan ke Tim"
                  onPress={handleAdd}
                  disabled={isPending || !person}
                />
              </SectionCard>
            ) : (
              <Button label="+ Anggota Baru" onPress={() => setAdding(true)} />
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
