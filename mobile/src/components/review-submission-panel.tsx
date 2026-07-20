// Panel Reviewer approve/reject satu submission (mockup 24).
// Sebelumnya diduplikasi verbatim di action-plan/[id].tsx (AP one-time) & instance/[id].tsx (repeat).
// State (rejecting, rejectReason) di-hoist ke sini agar owner cukup pasang panel + mutation.
import { useState } from 'react';
import { Alert } from 'react-native';
import { Text, TextInput, View } from 'react-native-css/components';

import { Button, usePlaceholderColor } from './ui';

export type ReviewDecision = 'approve' | 'reject';

export function ReviewSubmissionPanel({
  onDecide,
  isPending,
  onNote,
  isNotePending,
}: {
  onDecide: (args: { decision: ReviewDecision; reason: string | null }) => void;
  isPending: boolean;
  // PRD §24.3 aksi ke-3 "Catatan" — NON-TERMINAL: mengirim umpan balik reviewer ke
  // Diskusi Rencana Aksi tanpa menyentuh status submission (tetap `pending`).
  // Async (pasang `mutateAsync`): form hanya direset saat kirim BERHASIL, sehingga
  // teks yang sudah diketik tidak hilang bila jaringan/RPC gagal.
  onNote: (body: string) => Promise<unknown>;
  isNotePending: boolean;
}) {
  const placeholderColor = usePlaceholderColor();
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [noting, setNoting] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  return (
    <View className="gap-2 rounded-2xl border border-amber-200 p-4 dark:border-amber-900">
      <Text className="text-sm font-semibold text-black dark:text-white">Review submission terbaru</Text>
      {rejecting ? (
        <View className="gap-2">
          <TextInput
            className="h-20 rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
            placeholder="Alasan penolakan (wajib)"
            placeholderTextColor={placeholderColor}
            value={rejectReason}
            onChangeText={setRejectReason}
            multiline
            textAlignVertical="top"
          />
          <Button
            label="Kirim Penolakan"
            variant="danger"
            loading={isPending}
            onPress={() => {
              if (!rejectReason.trim()) {
                Alert.alert('Alasan wajib', 'Isi alasan penolakan terlebih dahulu.');
                return;
              }
              onDecide({ decision: 'reject', reason: rejectReason.trim() });
            }}
          />
          <Button label="Batal" variant="secondary" onPress={() => setRejecting(false)} />
        </View>
      ) : noting ? (
        <View className="gap-2">
          <TextInput
            className="h-20 rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
            placeholder="Catatan untuk PIC (tidak mengubah status)"
            placeholderTextColor={placeholderColor}
            value={noteBody}
            onChangeText={setNoteBody}
            multiline
            textAlignVertical="top"
          />
          <Button
            label="Kirim Catatan"
            loading={isNotePending}
            onPress={() => {
              if (!noteBody.trim()) {
                Alert.alert('Catatan kosong', 'Tulis catatan terlebih dahulu.');
                return;
              }
              onNote(noteBody.trim()).then(
                () => {
                  setNoting(false);
                  setNoteBody('');
                },
                // Error sudah dilaporkan pemanggil (alertFriendlyError). Di sini cukup
                // menahan rejection agar form tetap terbuka dengan teks utuh.
                () => {},
              );
            }}
          />
          <Button label="Batal" variant="secondary" onPress={() => setNoting(false)} />
        </View>
      ) : (
        <View className="gap-2">
          <Button
            label="Setujui (Selesai)"
            variant="success"
            loading={isPending}
            onPress={() => onDecide({ decision: 'approve', reason: null })}
          />
          <Button label="Tolak (Minta Revisi)" variant="danger" onPress={() => setRejecting(true)} />
          <Button label="Catatan" variant="secondary" onPress={() => setNoting(true)} />
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">
            Catatan mengirim umpan balik ke Diskusi Rencana Aksi tanpa menyetujui atau menolak.
          </Text>
        </View>
      )}
    </View>
  );
}
