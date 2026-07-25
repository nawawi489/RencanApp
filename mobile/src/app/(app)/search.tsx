// BL-10 — Search global (PRD §38): 14 dari 14 scope, hasil DIKELOMPOKKAN per jenis.
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
import { useCallback, useMemo, useState } from 'react';
import { SectionList } from 'react-native';
import { Text, TextInput, View } from 'react-native-css/components';

import { EmptyState, SectionCard, SkeletonList, usePlaceholderColor } from '@/components/ui';
import { useProfile } from '@/hooks/use-profile';
import { useSearchGlobal } from '@/hooks/use-search-global';
import {
  GOVERNANCE_VIOLATION_SEVERITY_LABEL,
  activityLogActionLabel,
  governanceViolationTypeLabel,
} from '@/lib/activity-governance';
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

const LIST_CONTENT_STYLE = { gap: 12, padding: 20 };

/** Rute tujuan per hit. `null` = baris tidak dapat ditekan (bukan push path rusak). */
function hrefForHit(h: SearchHit): Href | null {
  if (h.scope === 'chat') {
    // Deep-link ke ruangan + sorot pesannya (pola `?highlight=` dari Inbox search).
    return h.parentId ? (`/(tabs)/inbox/${h.parentId}?highlight=${h.id}` as Href) : null;
  }
  if (h.scope === 'people') {
    // Ditangani terpisah, BUKAN lewat `ENTITY_ROUTE_SEGMENT` — peta itu ber-key
    // `CardEntityType` (7 tipe card) dan tidak boleh diperluas (NG-7).
    return `/people-profile/${h.id}` as Href;
  }
  if (h.scope === 'task_instance') {
    // `id` instance itu sendiri yang jadi rute; `parentId` (task_id) hanya konteks.
    return `/task/instance/${h.id}` as Href;
  }
  if (h.scope === 'evidence') {
    // Bukti tidak punya layar sendiri — dibawa ke Task induknya (`parentId` = `task_id`).
    return h.parentId ? (`/task/${h.parentId}` as Href) : null;
  }
  if (h.scope === 'comment') {
    // Komentar juga tak punya layar sendiri, tetapi induknya BISA BERBEDA JENIS. Untuk
    // scope ini `subtitle` memang literal `entity_type` (§6.3 "jenis induk") — jadi ini
    // memakai maknanya, bukan menebak dari teks tampilan.
    //
    // Dispatch disalin dari §6.4 dan memuat literal WARISAN pra-0045 (`action_plan`,
    // `action_plan_instance`) yang masih sah tersimpan di data. Literal di luar daftar
    // ini membuat baris tidak dapat ditekan — fail-closed, bukan rute tebakan.
    if (!h.parentId) return null;
    switch (h.subtitle) {
      case 'action_plan':
      case 'task':
        return `/task/${h.parentId}` as Href;
      case 'action_plan_instance':
      case 'task_instance':
        return `/task/instance/${h.parentId}` as Href;
      case 'initiative':
        return `/initiative/${h.parentId}` as Href;
      default:
        return null;
    }
  }
  const card = cardScopeOf(h.scope);
  if (!card) return null;
  const segment = ENTITY_ROUTE_SEGMENT[card as keyof typeof ENTITY_ROUTE_SEGMENT];
  return segment ? (`/${segment}/${h.id}` as Href) : null;
}

/**
 * Subtitle yang siap dibaca manusia (BL-17).
 *
 * `search_global` memproyeksikan kolom audit MENTAH — `activity_logs.action` dan
 * `governance_violations.violation_type || ' · ' || severity` — dan menyerahkan pelabelan
 * ke sini. Itu keputusan sadar migrasi 0088: peta label di SQL akan menduplikasi peta
 * client dan mengembalikan drift yang gate CI BL-13/BL-17 pasang untuk dicegah.
 *
 * `hrefForHit` untuk scope `comment` masih membaca `h.subtitle` MENTAH (literal
 * `entity_type`); rute tidak boleh bergantung pada teks tampilan, jadi pelabelan sengaja
 * hanya terjadi di sini, pada saat render.
 */
export function subtitleForHit(h: SearchHit): string | null {
  if (h.scope === 'activity_log') return activityLogActionLabel(h.subtitle);
  if (h.scope === 'governance_violation') {
    // Server merangkai `tipe · severity`; keduanya snake_case/lowercase dan punya peta
    // masing-masing sejak BL-12. Bentuk lain (kolom kosong) jatuh ke cabang aman di bawah.
    const [type, severity] = (h.subtitle ?? '').split(' · ');
    const typeLabel = governanceViolationTypeLabel(type);
    const severityLabel = severity ? (GOVERNANCE_VIOLATION_SEVERITY_LABEL[severity] ?? severity) : '';
    return severityLabel ? `${typeLabel} · ${severityLabel}` : typeLabel;
  }
  return h.subtitle;
}


export function LiveSearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const placeholderColor = usePlaceholderColor();
  const { can } = useProfile();
  const { hits, isLoading, isError, isRpcMissing, enabled } = useSearchGlobal(query);

  /**
   * Label grup. Dua scope audit punya varian menurut permission PEMANGGIL (FR-10):
   * pemegang permission melihat "Log Aktivitas"/"Governance Violation", yang bukan
   * melihat "Aktivitas Saya"/"Catatan Governance Saya".
   *
   * Ini BUKAN oracle. Yang membedakan label adalah permission pemanggil sendiri —
   * sesuatu yang sudah ia ketahui — bukan ada-tidaknya data milik orang lain. Bandingkan
   * dengan count atau grup kosong, yang merupakan fungsi data pihak lain dan karena itu
   * dilarang (FR-15/FR-16).
   */
  const scopeLabel = useCallback(
    (s: SearchScope): string => {
      if (s === 'activity_log' && !can('view_activity_log')) return 'Aktivitas Saya';
      if (s === 'governance_violation' && !can('view_governance_violation')) {
        return 'Catatan Governance Saya';
      }
      return SEARCH_SCOPE_LABEL[s];
    },
    [can],
  );

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
      title: scopeLabel(s),
      data: byScope.get(s) as SearchHit[],
    }));
  }, [hits, scopeLabel]);

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
        contentContainerStyle={LIST_CONTENT_STYLE}
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
          const subtitle = subtitleForHit(item);
          return (
            <SectionCard
              accessibilityLabel={`Buka ${item.title}`}
              onPress={href ? () => router.push(href) : undefined}>
              <Text className="text-base font-semibold text-black dark:text-white">
                {item.title}
              </Text>
              {subtitle ? (
                <Text className="text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</Text>
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
