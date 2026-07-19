// UI-G-006 — Trigger "?" pada header section/kartu untuk menampilkan glossary singkat.
// Wave 4.4 — konten sekarang dibaca dari card_guidance_contents (fallback ke glossary.ts).
// Anti-flash (AC-7): saat loading, TIDAK tampilkan glossary title/body — tombol netral saja.
import { useQuery } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { Pressable, Text } from 'react-native-css/components';

import { getGuidance, type CardTypeGuided } from '@/lib/card-rules';
import { glossaryFor, type GlossaryTopic } from '@/lib/glossary';
import { useProfile } from '@/hooks/use-profile';

function useCardGuidance(topic: GlossaryTopic) {
  const { profile } = useProfile();
  const orgId = profile?.organization_id ?? '';
  return useQuery({
    queryKey: ['card-rules', 'guidance', orgId, topic],
    queryFn: () => getGuidance(orgId, topic as CardTypeGuided),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });
}

/**
 * Tombol kecil "?" di sebelah judul section/kartu. Tap → Alert dgn guidance dari server
 * (org-specific → org-NULL default → glossary fallback). Saat loading/error, fallback ke
 * glossaryFor untuk tetap responsif.
 */
export function CardHelpTrigger({
  topic,
  label,
}: {
  topic: GlossaryTopic;
  /** Override label aksesibilitas; default = "Bantuan". */
  label?: string;
}) {
  const { data } = useCardGuidance(topic);
  const entry = data ?? glossaryFor(topic);
  // AC-7: label default netral saat loading — TIDAK bocorkan glossary title sebelum server response.
  const a11yLabel = label ?? (data ? `Bantuan ${entry.title}` : 'Bantuan');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={() => Alert.alert(entry.title, entry.body)}
      hitSlop={12}
      className="h-6 w-6 items-center justify-center rounded-full border border-neutral-300 active:opacity-70 dark:border-neutral-700">
      <Text className="text-xs font-bold text-neutral-600 dark:text-neutral-300">?</Text>
    </Pressable>
  );
}
