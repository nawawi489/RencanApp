// OpenPeriodModal — membuka periode skoring baru (NG-2 follow-up jembatan finalisasi).
//
// Sebelum ini `open_period_snapshot` hidup di DB (0013:472) tapi nol caller UI: organisasi
// tanpa periode hasil seed/legacy tidak punya jalan masuk ke Score/Ranking sama sekali.
// Modal ini melengkapi siklus: buka → (skor terkumpul) → Finalisasi Periode & Peringkat.
//
// DUA LANGKAH, dan itu disengaja. Membuka periode praktis ireversibel:
//   - trigger BEFORE DELETE menolak delete pada period_snapshots (0013 K5), jadi baris salah
//     tidak bisa dibuang;
//   - partial unique index ux_period_snapshots_one_active_per_org mengunci org ke SATU periode
//     aktif, jadi salah tanggal memblokir pembukaan periode benar sampai yang salah difinalisasi.
// Karena itu langkah 2 mengulang nama + rentang secara verbatim sebelum tombol aksi.
//
// VALIDASI CLIENT MENUTUP LUBANG SERVER. RPC tidak memvalidasi apa pun di luar izin + guard
// satu-aktif: `period_name text not null` menerima '' dan '   '. CHECK tabel hanya menegakkan
// `period_end >= period_start` — periode 1 hari SAH dan sengaja diizinkan di sini.
//
// A11y (DESIGN.md §4): touch target ≥44px lewat Button; setiap tombol punya accessibilityLabel
// unik; error pakai accessibilityRole="alert"; progres pakai accessibilityLiveRegion="polite".

import { useCallback, useState } from 'react';
import { Modal } from 'react-native';
import { Text, View } from 'react-native-css/components';

import { DateRangeField } from '@/components/date-range-field';
import { useOpenPeriod } from '@/hooks/use-people-score';
import { DATE_RE } from '@/lib/date';

import { Button, LabeledInput } from './ui';

// Fase yang dipicu AKSI USER. Tidak ada query pra-aksi di sini (beda dari FinalizePeriodModal),
// sehingga seluruh state cukup disimpan — tak ada yang perlu diturunkan saat render.
type Phase =
  | { kind: 'form' }
  | { kind: 'confirm' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; name: string };

const NEXT_LABEL = 'Lanjut ke konfirmasi buka periode';
const CONFIRM_LABEL = 'Saya paham, buka periode ini';
const ACTIVE_EXISTS_COPY =
  'Sudah ada periode aktif untuk organisasi ini. Tutup dulu sebelum membuka yang baru.';
const DATE_ORDER_COPY = 'Tanggal selesai tidak boleh sebelum tanggal mulai.';

// PostgREST error mapping — jangan pernah menyurface pesan constraint mentah ke pengguna.
// 23505 = ux_period_snapshots_one_active_per_org (race yang lolos guard RPC, mis. dua tab).
// 23514 = period_snapshots_period_order (hanya tercapai bila validasi client dilewati).
function mapError(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === '23505') return ACTIVE_EXISTS_COPY;
  if (err?.code === '23514') return DATE_ORDER_COPY;
  return err?.message ?? 'Gagal membuka periode.';
}

export function OpenPeriodModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { openPeriod, isPending } = useOpenPeriod();
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });

  const trimmedName = name.trim();
  // `end >= start` (bukan `>`): periode 1 hari sah — cocokkan CHECK period_order di DB.
  const canProceed =
    trimmedName.length > 0 && DATE_RE.test(start) && DATE_RE.test(end) && end >= start;

  const handleDismiss = useCallback(() => {
    if (isPending) return;
    onClose();
  }, [isPending, onClose]);

  const goConfirm = useCallback(() => {
    // Guard kedua selain `disabled` — melindungi dari press yang lolos saat re-render.
    if (!canProceed) return;
    setPhase({ kind: 'confirm' });
  }, [canProceed]);

  const submit = useCallback(async () => {
    try {
      await openPeriod({ periodName: trimmedName, periodStart: start, periodEnd: end });
      setPhase({ kind: 'done', name: trimmedName });
    } catch (e) {
      setPhase({ kind: 'error', message: mapError(e) });
    }
  }, [openPeriod, trimmedName, start, end]);

  return (
    <Modal
      testID="open-period-modal"
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}>
      <View className="flex-1 justify-center bg-black/40 p-6">
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLabel="Buka periode skoring baru"
          accessibilityViewIsModal
          className="gap-3 rounded-2xl bg-white p-5 dark:bg-neutral-900">
          {phase.kind === 'form' && (
            <>
              <Text accessibilityRole="header" className="text-lg font-bold text-black dark:text-white">
                Buka periode baru
              </Text>
              <Text className="text-sm text-neutral-600 dark:text-neutral-300">
                Periode menentukan rentang tanggal yang dinilai saat skor dihitung.
              </Text>
              <LabeledInput
                label="Nama Periode"
                value={name}
                onChangeText={setName}
                placeholder="mis. Juli 2026"
                required
                autoCapitalize="sentences"
              />
              <DateRangeField
                startValue={start}
                endValue={end}
                onStartChange={setStart}
                onEndChange={setEnd}
                required
              />
              <Button
                label="Lanjut"
                accessibilityLabel={NEXT_LABEL}
                onPress={goConfirm}
                disabled={!canProceed}
              />
              <Button
                label="Batal"
                variant="secondary"
                accessibilityLabel="Batal buka periode"
                onPress={handleDismiss}
              />
            </>
          )}

          {phase.kind === 'confirm' && (
            <>
              <Text accessibilityRole="header" className="text-lg font-bold text-black dark:text-white">
                Konfirmasi periode baru
              </Text>
              {/* Nama + rentang sengaja dalam SATU baris teks: pengulangan verbatim dari
                  formulir, supaya salah ketik tanggal terlihat sebelum aksi ireversibel. */}
              <Text className="text-sm font-semibold text-black dark:text-white">
                {trimmedName} · {start} – {end}
              </Text>
              <Text
                accessibilityRole="alert"
                className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                Periode yang sudah dibuka tidak dapat dihapus, dan organisasi hanya boleh punya
                satu periode aktif. Bila tanggalnya keliru, satu-satunya jalan keluar adalah
                memfinalisasinya lebih dulu.
              </Text>
              {isPending ? (
                <Text
                  accessibilityLiveRegion="polite"
                  accessibilityValue={{ text: 'Membuka periode' }}
                  className="text-sm text-neutral-700 dark:text-neutral-200">
                  Membuka periode…
                </Text>
              ) : null}
              <Button
                label="Buka Periode"
                accessibilityLabel={CONFIRM_LABEL}
                onPress={submit}
                disabled={isPending}
                loading={isPending}
              />
              <Button
                label="Kembali"
                variant="secondary"
                accessibilityLabel="Kembali ke formulir periode"
                onPress={() => setPhase({ kind: 'form' })}
                disabled={isPending}
              />
              <Button
                label="Batal"
                variant="secondary"
                accessibilityLabel="Batal buka periode"
                onPress={handleDismiss}
              />
            </>
          )}

          {phase.kind === 'error' && (
            <>
              <Text accessibilityRole="header" className="text-lg font-bold text-black dark:text-white">
                Gagal membuka periode
              </Text>
              <Text className="text-sm font-semibold text-red-700 dark:text-red-400">
                {phase.message}
              </Text>
              {/* Aman diulang: RPC atomik — kegagalan berarti nol baris tertulis. */}
              <Button
                label="Coba lagi"
                accessibilityLabel="Coba lagi buka periode"
                onPress={submit}
                disabled={isPending}
                loading={isPending}
              />
              <Button
                label="Kembali"
                variant="secondary"
                accessibilityLabel="Kembali ke formulir periode"
                onPress={() => setPhase({ kind: 'form' })}
                disabled={isPending}
              />
              <Button
                label="Tutup"
                variant="secondary"
                accessibilityLabel="Tutup dialog buka periode"
                onPress={handleDismiss}
              />
            </>
          )}

          {phase.kind === 'done' && (
            <>
              <Text accessibilityRole="header" className="text-lg font-bold text-black dark:text-white">
                Periode {phase.name} dibuka.
              </Text>
              <Text className="text-sm text-neutral-600 dark:text-neutral-300">
                Skor belum dihitung. Setelah aktivitas terkumpul, gunakan “Finalisasi Periode &
                Peringkat” untuk menghitung skor sekaligus mengunci peringkat.
              </Text>
              <Button
                label="Tutup"
                accessibilityLabel="Tutup dialog buka periode"
                onPress={handleDismiss}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
