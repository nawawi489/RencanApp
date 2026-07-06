// WS-5 — Modal konfirmasi dua-langkah "Tutup Periode" (close-period snapshot).
// Langkah 1: ringkasan dampak (non-final). Langkah 2: tombol final destruktif
// "Saya paham, tutup periode" (Button variant primary = bg-brand-dark #1564b3 +
// text-white, AA 5.99:1; a11y label menyebut nama periode). Umpan-balik sukses/n=0/
// error INLINE (tanpa toast — tak ada toast standar di codebase). Saat submit:
// tombol terkunci + dismiss (onRequestClose/overlay/Batal) diabaikan → cegah
// double-submit & aksi setengah jalan. Error terminal memicu onError (refetch periode).
import { useState } from 'react';
import { Modal } from 'react-native';
import { Text, View } from 'react-native-css/components';

import { Button } from './ui';

export type ClosePeriodModalPeriod = {
  id: string;
  period_name: string;
  period_start: string;
  period_end: string;
};

type Result = { ok: true; count: number } | { ok: false; message: string };

export function ClosePeriodModal({
  visible,
  period,
  onConfirm,
  onError,
  onClose,
}: {
  visible: boolean;
  period: ClosePeriodModalPeriod;
  /** RPC wrapper — mengembalikan jumlah user ter-ranking (bisa 0). Melempar error apa adanya. */
  onConfirm: (periodId: string) => Promise<number>;
  /** Dipanggil pada error terminal → refetch periode aktif (finalitas bisa saja sudah berubah). */
  onError: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  function handleClose() {
    if (submitting) return; // dismiss-lock saat pending
    setStep(1);
    setResult(null);
    onClose();
  }

  async function handleConfirm() {
    if (submitting) return; // anti double-submit
    setSubmitting(true);
    try {
      const n = await onConfirm(period.id);
      setResult({ ok: true, count: n });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Terjadi kesalahan.' });
      onError();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View className="flex-1 justify-center bg-black/40 p-6">
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLabel={`Konfirmasi tutup periode ${period.period_name}`}
          className="gap-3 rounded-2xl bg-white p-5 dark:bg-neutral-900">
          {result ? (
            result.ok ? (
              <>
                <Text accessibilityRole="header" className="text-lg font-bold text-black dark:text-white">
                  Periode Ditutup
                </Text>
                <Text className="text-sm text-neutral-600 dark:text-neutral-300">
                  Periode {period.period_name} ditutup. {result.count} pengguna masuk ranking.
                </Text>
                <Button label="Selesai" accessibilityLabel="Selesai tutup periode" onPress={handleClose} />
              </>
            ) : (
              <>
                <Text accessibilityRole="header" className="text-lg font-bold text-black dark:text-white">
                  Gagal Menutup Periode
                </Text>
                <Text className="text-sm font-semibold text-red-700 dark:text-red-400">{result.message}</Text>
                <Button
                  label="Tutup"
                  variant="secondary"
                  accessibilityLabel="Tutup dialog"
                  onPress={handleClose}
                />
              </>
            )
          ) : step === 1 ? (
            <>
              <Text accessibilityRole="header" className="text-lg font-bold text-black dark:text-white">
                Tutup Periode Skoring
              </Text>
              <Text className="text-sm text-neutral-600 dark:text-neutral-300">
                {period.period_name} · {period.period_start} – {period.period_end}
              </Text>
              <Text className="text-sm text-neutral-600 dark:text-neutral-300">
                Menutup periode akan membekukan ranking, memfinalkan skor tiap pengguna, dan
                mengunci periode ini — tidak dapat dibuka kembali dari aplikasi.
              </Text>
              <Button
                label="Lanjutkan"
                accessibilityLabel="Lanjutkan tutup periode"
                onPress={() => setStep(2)}
              />
              <Button
                label="Batal"
                variant="secondary"
                accessibilityLabel="Batal tutup periode"
                onPress={handleClose}
              />
            </>
          ) : (
            <>
              <Text accessibilityRole="header" className="text-lg font-bold text-black dark:text-white">
                Konfirmasi Akhir
              </Text>
              <Text className="text-sm text-neutral-600 dark:text-neutral-300">
                Tindakan ini final untuk periode {period.period_name}.
              </Text>
              <Button
                label="Saya paham, tutup periode"
                accessibilityLabel={`Tutup periode ${period.period_name}`}
                onPress={handleConfirm}
                loading={submitting}
              />
              <Button
                label="Batal"
                variant="secondary"
                accessibilityLabel="Batal tutup periode"
                onPress={handleClose}
                disabled={submitting}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
