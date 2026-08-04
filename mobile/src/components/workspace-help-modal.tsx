// WSA-05 / spec §5 — Workspace Help Modal. Dibuka dari tombol `?` di hub card; berisi
// kind/title/question/description + 3 checks. Copy terkunci di WS_HELP_COPY.
import { Modal } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { useReduceMotion } from '@/hooks/use-reduce-motion';

export type WorkspaceHelpContent = {
  kind: string;
  title: string;
  question: string;
  description: string;
  checks: readonly string[];
};

export function WorkspaceHelpModal({
  visible,
  content,
  onClose,
}: {
  visible: boolean;
  content: WorkspaceHelpContent;
  onClose: () => void;
}) {
  const reduceMotion = useReduceMotion();
  return (
    <Modal
      visible={visible}
      animationType={reduceMotion ? 'none' : 'fade'}
      transparent
      onRequestClose={onClose}>
      <View className="flex-1 justify-center bg-black/40 p-6">
        <View
          className="gap-3 rounded-2xl bg-white p-5 dark:bg-neutral-900"
          accessibilityLabel={`Bantuan ${content.kind}`}
          accessibilityViewIsModal>
          <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
            {content.kind}
          </Text>
          <Text accessibilityRole="header" className="text-xl font-bold text-black dark:text-white">
            {content.title}
          </Text>
          <Text className="text-sm font-semibold text-brand-dark dark:text-brand">{content.question}</Text>
          <Text className="text-sm text-neutral-600 dark:text-neutral-300">{content.description}</Text>
          <ScrollView className="grow-0">
            <View className="gap-2">
              {content.checks.map((check) => (
                <View key={check} className="flex-row gap-2">
                  <Text className="text-sm text-green-700 dark:text-green-400">✓</Text>
                  <Text className="flex-1 text-sm text-black dark:text-white">{check}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
          <Pressable
            className="min-h-[44px] items-center justify-center rounded-xl bg-brand-dark active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel="Tutup bantuan"
            onPress={onClose}>
            <Text className="text-sm font-semibold text-white">Tutup</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
