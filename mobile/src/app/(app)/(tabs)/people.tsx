import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native-css/components';

import { Screen } from '@/components/screen';
import {
  Avatar,
  EmptyState,
  ErrorState,
  GuidanceNote,
  ScoreBadge,
  ScoreLegend,
  SkeletonList,
} from '@/components/ui';
import { listOrgProfiles, type PersonRef } from '@/lib/cards';

type Person = NonNullable<PersonRef> & { score?: number | null };

function personLabel(p: Person): string {
  return p.full_name?.trim() || p.email || 'Tanpa nama';
}

export default function PeopleScreen() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['org-profiles'],
    queryFn: listOrgProfiles,
  });

  const people = (data ?? []) as Person[];

  return (
    <Screen title="People" subtitle="Ranking dan profil pencapaian.">
      {isLoading ? (
        <SkeletonList count={5} />
      ) : isError ? (
        <ErrorState
          title="Gagal memuat People"
          description="Tidak bisa mengambil daftar anggota organisasi."
          onRetry={() => refetch()}
        />
      ) : people.length === 0 ? (
        <EmptyState
          icon={<Text className="text-2xl">👥</Text>}
          title="Belum ada anggota"
          description="Anggota organisasi yang diundang admin akan muncul di sini."
        />
      ) : (
        <>
          <ScoreLegend />
          <GuidanceNote
            title="Score menyusul"
            body="Achievement Score & ranking aktif setelah ada data eksekusi (Fase 7). Daftar di bawah menampilkan anggota organisasi."
          />

          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold uppercase text-neutral-400">
                Anggota Organisasi
              </Text>
              <Text className="text-xs font-semibold text-neutral-400">{people.length} user</Text>
            </View>

            {people.map((p, i) => (
              <View
                key={p.id}
                className="flex-row items-center gap-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
                <View className="h-7 w-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950">
                  <Text className="text-xs font-bold text-blue-700 dark:text-blue-300">{i + 1}</Text>
                </View>
                <Avatar name={personLabel(p)} seed={p.id} />
                <View className="flex-1">
                  <Text className="text-base font-bold text-black dark:text-white" numberOfLines={1}>
                    {personLabel(p)}
                  </Text>
                  {p.email ? (
                    <Text className="text-xs text-neutral-400" numberOfLines={1}>
                      {p.email}
                    </Text>
                  ) : null}
                  {/* ScoreBadge muncul otomatis begitu Fase 7 mengisi p.score */}
                  {p.score != null ? (
                    <View className="mt-1.5">
                      <ScoreBadge score={p.score} />
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}
