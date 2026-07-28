// Panel Reviewer approve/reject satu submission (mockup 24).
// Sebelumnya diduplikasi verbatim di action-plan/[id].tsx (AP one-time) & instance/[id].tsx (repeat).
// State (rejecting, rejectReason) di-hoist ke sini agar owner cukup pasang panel + mutation.
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native-css/components';

import { AckCheckbox, Button, WarningCallout, usePlaceholderColor } from './ui';

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
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [noting, setNoting] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  // S7-6: konfirmasi aksi ireversibel. "Setujui submission" langsung menerapkan nilai KPI
  // ke Strategy/Goal — sebelum sprint 7 sekali-tap, tanpa peringatan. Sekarang wajib
  // AckCheckbox (pola DESIGN §7 preseden finalize-period-modal). State di-reset saat
  // panel keluar dari mode "approving" supaya centang tidak lengket di sesi berikutnya.
  const [approving, setApproving] = useState(false);
  const [approveAck, setApproveAck] = useState(false);
  return (
    <View className="gap-2 rounded-2xl border border-amber-200 p-4 dark:border-amber-900">
      <Text className="text-sm font-semibold text-black dark:text-white">Review submission terbaru</Text>
      {rejecting ? (
        <View className="gap-2">
          <TextInput
            className={`h-20 rounded-xl border px-4 py-3 text-base text-black dark:text-white ${rejectError ? 'border-red-500 dark:border-red-400' : 'border-neutral-300 dark:border-neutral-700'}`}
            placeholder="Alasan penolakan (wajib)"
            placeholderTextColor={placeholderColor}
            value={rejectReason}
            onChangeText={(t) => {
              setRejectReason(t);
              if (rejectError) setRejectError(null);
            }}
            multiline
            textAlignVertical="top"
            accessibilityLabel={rejectError ? `Alasan penolakan wajib, error: ${rejectError}` : 'Alasan penolakan wajib'}
            aria-invalid={!!rejectError}
          />
          {rejectError ? (
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className="text-sm font-semibold text-red-700 dark:text-red-400">
              {rejectError}
            </Text>
          ) : null}
          <Button
            label="Kirim Penolakan"
            variant="danger"
            loading={isPending}
            disabled={isPending}
            onPress={() => {
              if (!rejectReason.trim()) {
                // S7-3: pindah ke error inline supaya pesan menempel di field, bukan di
                // Alert yang hilang saat dismiss.
                setRejectError('Isi alasan penolakan terlebih dahulu.');
                return;
              }
              onDecide({ decision: 'reject', reason: rejectReason.trim() });
            }}
          />
          <Button label="Batal" variant="secondary" onPress={() => { setRejecting(false); setRejectError(null); }} />
        </View>
      ) : noting ? (
        <View className="gap-2">
          <TextInput
            className={`h-20 rounded-xl border px-4 py-3 text-base text-black dark:text-white ${noteError ? 'border-red-500 dark:border-red-400' : 'border-neutral-300 dark:border-neutral-700'}`}
            placeholder="Catatan untuk PIC (tidak mengubah status)"
            placeholderTextColor={placeholderColor}
            value={noteBody}
            onChangeText={(t) => {
              setNoteBody(t);
              if (noteError) setNoteError(null);
            }}
            multiline
            textAlignVertical="top"
            accessibilityLabel={noteError ? `Catatan untuk PIC, error: ${noteError}` : 'Catatan untuk PIC'}
            aria-invalid={!!noteError}
          />
          {noteError ? (
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className="text-sm font-semibold text-red-700 dark:text-red-400">
              {noteError}
            </Text>
          ) : null}
          <Button
            label="Kirim Catatan"
            loading={isNotePending}
            disabled={isNotePending}
            onPress={() => {
              if (!noteBody.trim()) {
                setNoteError('Tulis catatan terlebih dahulu.');
                return;
              }
              onNote(noteBody.trim()).then(
                () => {
                  setNoting(false);
                  setNoteBody('');
                  setNoteError(null);
                },
                // Error sudah dilaporkan pemanggil (alertFriendlyError). Di sini cukup
                // menahan rejection agar form tetap terbuka dengan teks utuh.
                () => {},
              );
            }}
          />
          <Button label="Batal" variant="secondary" onPress={() => { setNoting(false); setNoteError(null); }} />
        </View>
      ) : approving ? (
        // S7-6: konfirmasi ireversibel untuk approve. AckCheckbox + WarningCallout memastikan
        // reviewer sadar bahwa satu klik berikutnya melanjutkan status ke "Selesai" &
        // menerapkan nilai KPI ke Strategy/Goal (perhitungan skor mengikuti). Sesuai pola
        // finalize-period-modal (DESIGN §7). Tombol Setujui terkunci sampai `approveAck`.
        <View className="gap-2">
          <WarningCallout message="Setelah disetujui, submission bertransisi ke Selesai. Nilai KPI langsung diterapkan ke Strategy/Goal terkait dan tidak dapat dibatalkan dari layar ini." />
          <AckCheckbox
            label="Saya paham, hasil ini akan diterapkan dan tidak dapat dibatalkan."
            checked={approveAck}
            onToggle={() => setApproveAck((v) => !v)}
          />
          <Button
            label="Setujui (Selesai)"
            variant="success"
            loading={isPending}
            disabled={!approveAck || isPending}
            onPress={() => onDecide({ decision: 'approve', reason: null })}
          />
          <Button
            label="Batal"
            variant="secondary"
            onPress={() => { setApproving(false); setApproveAck(false); }}
          />
        </View>
      ) : (
        <View className="gap-2">
          <Button
            label="Setujui (Selesai)"
            variant="success"
            // Bukan lagi one-tap: buka mode konfirmasi (S7-6).
            onPress={() => setApproving(true)}
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
