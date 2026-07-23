// BL-10 — Search global (PRD §38): 9 dari 14 scope, hasil DIKELOMPOKKAN per jenis.
//
// KOREKSI KOMENTAR LAMA (§10.4): berkas ini dulu berbunyi "RLS-scoped via search_cards RPC".
// Itu menyesatkan. `search_global` adalah SECURITY DEFINER dengan `search_path=''`, sehingga
// RLS tabel TIDAK berlaku di dalamnya — otorisasi ditulis tangan per cabang di migrasi 0085.
// Tidak ada jaring pengaman kedua.
//
// Tiga aturan anti-oracle yang mengikat layar ini (FR-15/FR-16):
//   1. Grup nol-hasil TIDAK dirender. Header grup kosong membocorkan keberadaan data yang
//      justru disaring otorisasi.
//   2. TANPA count apa pun — tanpa "(3)", tanpa "N hasil", tanpa "N disembunyikan".
//   3. Empty state untuk "tidak cocok" dan "tersaring otorisasi" WAJIB identik. Keduanya
//      lewat cabang render yang sama; jangan menambah cabang yang membedakannya.
import { Stack, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList } from 'react-native';
import { Text, TextInput, View } from 'react-native-css/components';

import { EmptyState, SectionCard, SkeletonList, usePlaceholderColor } from '@/components/ui';
import { useSearchGlobal } from '@/hooks/use-search-global';
import { ENTITY_ROUTE_SEGMENT } from '@/lib/entity-routes';
import {
  SEARCH_SCOPE_LABEL,
  SEARCH_SCOPE_ORDER,
  cardScopeOf,
  type SearchHit,
  type SearchScope,
} from '@/lib/search';

const COPY = {
  title: 'Cari',
  inputLabel: 'Kotak pencarian',
  placeholder: 'Cari Goal, Tugas, Pesan…',
  startTitle: 'Mulai mencari',
  startDesc: 'Ketik minimal 2 huruf untuk mencari apa pun yang dapat Anda akses.',
  // SATU teks untuk dua sebab (tidak cocok / tersaring otorisasi). Membedakannya =
  // memberi tahu bahwa ada sesuatu di sana — itu oracle.
  emptyTitle: 'Tidak ada hasil',
  emptyDesc: 'Tidak ada yang cocok dengan pencarian Anda.',
  rpcMissingTitle: 'Pencarian belum aktif',
  rpcMissingDesc: 'Fitur ini belum aktif di server. Coba lagi setelah aplikasi diperbarui.',
  errorTitle: 'Gagal memuat',
  errorDesc: 'Terjadi kesalahan saat mencari.',
} as const;

type Section = { scope: SearchScope; title: string; data: SearchHit[] };

/** Rute tujuan per hit. `null` = baris tidak dapat ditekan (bukan push path rusak). */
function hrefForHit(h: SearchHit): Href | null {
  if (h.scope === 'chat') {
    // Deep-link ke ruangan + sorot pesannya (pola `?highlight=` dari Inbox search).
    return h.parentId ? (`/(tabs)/inbox/${h.parentId}?highlight=${h.id}` as Href) : null;
  }
  const card = cardScopeOf(h.scope);
  if (!card) return null;
  const segment = ENTITY_ROUTE_SEGMENT[card as keyof typeof ENTITY_ROUTE_SEGMENT];
  return segment ? (`/${segment}/${h.id}` as Href) : null;
}

export function LiveSearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const placeholderColor = usePlaceholderColor();
  const { hits, isLoading, isError, isRpcMissing, enabled } = useSearchGlobal(query);

  // Urutan section dibangun dengan MENGITERASI KONSTANTA, bukan urutan kedatangan baris.
  // Map insertion-order akan membuat urutan grup bergantung pada data — tidak stabil,
  // dan secara halus juga membocorkan sesuatu tentang isi hasil.
  const sections = useMemo<Section[]>(() => {
    const byScope = new Map<SearchScope, SearchHit[]>();
    for (const h of hits) {
      const list = byScope.get(h.scope);
      if (list) list.push(h);
      else byScope.set(h.scope, [h]);
    }
    return SEARCH_SCOPE_ORDER.filter((s) => byScope.has(s)).map((s) => ({
      scope: s,
      title: SEARCH_SCOPE_LABEL[s],
      data: byScope.get(s) as SearchHit[],
    }));
  }, [hits]);

  const header = (
    <View className="pb-3">
      <TextInput
        className="min-h-[44px] rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
        placeholder={COPY.placeholder}
        placeholderTextColor={placeholderColor}
        value={query}
        onChangeText={setQuery}
        accessibilityLabel={COPY.inputLabel}
      />
    </View>
  );

  let body: React.ReactNode = null;
  if (!enabled) {
    body = <EmptyState title={COPY.startTitle} description={COPY.startDesc} />;
  } else if (isLoading) {
    body = <SkeletonList count={4} />;
  } else if (isRpcMissing) {
    body = <EmptyState title={COPY.rpcMissingTitle} description={COPY.rpcMissingDesc} />;
  } else if (isError) {
    body = <EmptyState title={COPY.errorTitle} description={COPY.errorDesc} />;
  } else if (sections.length === 0) {
    // SATU cabang untuk dua sebab. Jangan pecah.
    body = <EmptyState title={COPY.emptyTitle} description={COPY.emptyDesc} />;
  }

  if (body !== null) {
    return (
      <View className="flex-1 bg-neutral-50 dark:bg-black">
        <Stack.Screen options={{ title: COPY.title }} />
        <View className="gap-3 p-5">
          {header}
          {body}
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: COPY.title }} />
      <SectionList<SearchHit, Section>
        contentContainerStyle={{ gap: 12, padding: 20 }}
        sections={sections}
        keyExtractor={(h) => `${h.scope}:${h.id}`}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => (
          <Text className="pt-2 text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => {
          const href = hrefForHit(item);
          return (
            <SectionCard
              accessibilityLabel={`Buka ${item.title}`}
              onPress={href ? () => router.push(href) : undefined}>
              <Text className="text-base font-semibold text-black dark:text-white">
                {item.title}
              </Text>
              {item.subtitle ? (
                <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                  {item.subtitle}
                </Text>
              ) : null}
              {item.snippet ? (
                <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                  {item.snippet}
                </Text>
              ) : null}
            </SectionCard>
          );
        }}
      />
    </View>
  );
}

export default function SearchRoute() {
  return <LiveSearchScreen />;
}
