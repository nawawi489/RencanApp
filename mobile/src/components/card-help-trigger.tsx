// UI-G-006 — Trigger "?" pada header section/kartu untuk menampilkan glossary singkat.
// Membuka native Alert sebagai sheet ringan (tanpa lib modal tambahan). Konten dibaca dari
// `lib/glossary.ts` berdasarkan `topic` — placeholder bila topic belum terdaftar.
import { Alert } from 'react-native';
import { Pressable, Text } from 'react-native-css/components';

import { glossaryFor, type GlossaryTopic } from '@/lib/glossary';

/**
 * Tombol kecil "?" di sebelah judul section/kartu. Tap → Alert dgn glossary entry.
 * `topic` = key yang stabil supaya bisa dihubungkan ke konten edukatif sentral.
 */
export function CardHelpTrigger({
  topic,
  label,
}: {
  topic: GlossaryTopic;
  /** Override label aksesibilitas; default = "Bantuan {topic}". */
  label?: string;
}) {
  const entry = glossaryFor(topic);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? `Bantuan ${entry.title}`}
      onPress={() => Alert.alert(entry.title, entry.body)}
      className="h-6 w-6 items-center justify-center rounded-full border border-neutral-300 active:opacity-70 dark:border-neutral-700">
      <Text className="text-xs font-bold text-neutral-600 dark:text-neutral-300">?</Text>
    </Pressable>
  );
}
