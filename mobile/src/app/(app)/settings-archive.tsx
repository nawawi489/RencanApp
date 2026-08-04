// Fase 8 — Settings > Arsip. Daftar card terarsip + UI-S-AR1: filter chip per entity type
// + tombol "Pulihkan" per row (RPC restore_card → status 'draft'). TIDAK ada hapus permanen.
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native-css/components';

import { Button, EmptyState, SectionCard, SkeletonList, TabBar, usePlaceholderColor } from '@/components/ui';
import { useSearchCards } from '@/hooks/use-search';
import { showAlert } from '@/lib/alert';
import { getArchiveMetadata } from '@/lib/activity-governance';
import { ENTITY_ROUTE_SEGMENT } from '@/lib/entity-routes';
import { alertFriendlyError } from '@/lib/errors';
import { restoreCard, type CardEntityType } from '@/lib/governance-admin';
import { CARD_TYPE_LABEL, type CardType } from '@/lib/settings-mbr';

const FILTER_CHIPS: { key: 'semua' | CardEntityType; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'goal', label: 'Goal' },
  { key: 'strategy', label: 'Strategi' },
  { key: 'initiative', label: 'Inisiatif' },
  { key: 'action_plan', label: 'Rencana Aksi' },
  { key: 'task', label: 'Tugas' },
  { key: 'development_area', label: 'Dev Area' },
  { key: 'problem_statement', label: 'Problem' },
];

export default function SettingsArchiveScreen() {
  const qc = useQueryClient();
  const router = useRouter();
  const placeholderColor = usePlaceholderColor();
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<'semua' | CardEntityType>('semua');
  const { results, isLoading, enabled } = useSearchCards({ query, includeArchived: true });

  const restoreM = useMutation({
    mutationFn: (args: { entityType: CardEntityType; entityId: string }) =>
      restoreCard(args.entityType, args.entityId),
    onSuccess: () => {
      // BL-09(c): key harus cocok dgn useSearchCards (['cards_search', ...]). ['search'] tidak
      // dipakai query mana pun → invalidate no-op, list tetap menampilkan card yang sudah dipulihkan.
      qc.invalidateQueries({ queryKey: ['cards_search'] });
      showAlert('Dipulihkan', 'Card kembali ke status Draft. Verifikasi lalu Aktifkan kembali.');
    },
    onError: (e) => alertFriendlyError('Gagal pulihkan', e, 'Kesalahan.'),
  });

  const archived = useMemo(() => {
    const filt = results.filter((r) => r.status === 'archived');
    if (chip === 'semua') return filt;
    return filt.filter((r) => r.entity_type === chip);
  }, [results, chip]);

  // UI-S-AR1 metadata — ambil archived_at per row dari activity_logs (action=card_archived).
  // 1 query per row baik utk daftar kecil; halaman ini sudah paginated via search RPC.
  const metadataQueries = useQueries({
    queries: archived.map((r) => ({
      queryKey: ['archive-metadata', r.entity_type, r.id],
      queryFn: () => getArchiveMetadata(r.entity_type, r.id),
    })),
  });

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Arsip' }} />
      <View className="gap-3 p-5">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">Arsip</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Card yang telah diselesaikan atau dinonaktifkan.
          </Text>
        </View>
        <Text className="text-xs text-neutral-400">
          Card yang diarsipkan tidak dihapus permanen — pemegang akses dapat memulihkan ke Draft.
        </Text>
        <TextInput
          className="min-h-[44px] rounded-xl border border-neutral-300 px-4 text-base text-black dark:border-neutral-700 dark:text-white"
          placeholder="Cari card terarsip…"
          placeholderTextColor={placeholderColor}
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="Kotak pencarian arsip"
        />
        <TabBar tabs={FILTER_CHIPS} active={chip} onChange={setChip} />

        {!enabled ? (
          <EmptyState title="Cari arsip" description="Ketik kata kunci untuk menemukan card terarsip." />
        ) : isLoading ? (
          <SkeletonList count={3} />
        ) : archived.length === 0 ? (
          <EmptyState title="Tidak ada arsip" description="Tidak ada card terarsip yang cocok dengan filter." />
        ) : (
          archived.map((r, idx) => {
            const meta = metadataQueries[idx]?.data ?? null;
            const archivedAtLabel = meta?.archived_at
              ? new Date(meta.archived_at).toLocaleString('id-ID', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : null;
            // BL-09(b): baris arsip harus bisa dibuka utk memeriksa isi card sebelum dipulihkan.
            // Pola sama dgn search.tsx — `undefined` bila tipe tak punya segmen rute, supaya kartu
            // tetap non-pressable alih-alih push path rusak. Layar detail (7 tipe) sudah menangani
            // status 'archived': badge "Diarsipkan", CTA aksi hanya muncul saat status 'draft'.
            const segment = ENTITY_ROUTE_SEGMENT[r.entity_type as CardEntityType];
            const typeLabel = CARD_TYPE_LABEL[r.entity_type as CardType] ?? r.entity_type;
            return (
            <SectionCard
              key={`${r.entity_type}:${r.id}`}
              accessibilityLabel={`Buka detail ${r.name}, ${typeLabel}, diarsipkan`}
              onPress={segment ? () => router.push(`/${segment}/${r.id}` as Href) : undefined}
              actions={
                // Slot `actions`, BUKAN children: tombol tak boleh bersarang di dalam region
                // pressable atau VoiceOver kehilangan fokus terpisah untuknya (lihat SectionCard).
                <Button
                  label="Pulihkan ke Draft"
                  variant="secondary"
                  loading={restoreM.isPending}
                  onPress={() =>
                    showAlert(
                      'Pulihkan card?',
                      `Mengembalikan "${r.name}" ke status Draft. Anda perlu verifikasi & Aktifkan ulang.`,
                      [
                        { text: 'Tutup', style: 'cancel' },
                        {
                          text: 'Pulihkan',
                          onPress: () =>
                            restoreM.mutate({ entityType: r.entity_type as CardEntityType, entityId: r.id }),
                        },
                      ],
                    )
                  }
                />
              }>
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1 gap-0.5">
                  <Text className="text-base font-semibold text-black dark:text-white">{r.name}</Text>
                  <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                    {typeLabel} · Diarsipkan
                  </Text>
                  {archivedAtLabel ? (
                    <Text className="text-xs text-neutral-400">
                      {archivedAtLabel}{meta?.archived_by ? ' · oleh pengguna' : ''}
                    </Text>
                  ) : null}
                </View>
              </View>
            </SectionCard>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
