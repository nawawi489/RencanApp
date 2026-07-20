// Fase 3 TDD plan (specs/score-ranking-finalization-tdd-plan.md) — orkestrator
// tombol "Finalisasi Periode & Peringkat" di settings-score-formula.tsx.
//
// Menggantikan ClosePeriodModal (WS-5) yang hanya memanggil close_period_snapshot
// dan menghasilkan ranking KOSONG karena calculatePeriodScores tak pernah dipanggil dari UI.
// Bug jembatan V1.83 ditutup di sini: modal ini memanggil calculate → close berurutan sync
// client-side (owner decision #2), dengan advisory lock 0079 sebagai backstop concurrency.
//
// State machine (spec §6.2, TDD plan Fase 3):
//   loading-preview  → useQuery(usePreviewFinalization) belum siap
//   step1            → preview siap; user melihat pratinjau angka + peringatan ireversibel
//   error-preview    → preview error; user "Coba lagi" me-refetch
//   calculating      → useCalculatePeriodScores in-flight (label "Langkah 1 dari 2")
//   locking          → useClosePeriod in-flight (label "Langkah 2 dari 2")
//   error-calc       → calculate error; retry hanya calculate (close tidak boleh dipanggil sebelum calc sukses)
//   error-lock       → close error setelah calc sukses; retry mengulang calc + close (calc idempotent + advisory lock)
//   error-mismatch   → canary AC-FIN-8b: calc>0 tapi close=0; state error yang tidak boleh terjadi jika lock bekerja
//   done             → sukses; menampilkan N pengguna diperingkat + soft escape hatch footer
//
// A11y (DESIGN.md §4): touch target ≥44px lewat Button; solid primary = brand-dark #1564b3 default;
// label progres accessibilityLiveRegion="polite" agar screen reader mengumumkan transisi.
//
// Copy Indonesia konsisten "pengguna" (bukan "user"); label utama menyebut nama periode.

import { useCallback, useState } from 'react';
import { Modal } from 'react-native';
import { Text, View } from 'react-native-css/components';

import {
  useCalculatePeriodScores,
  useClosePeriod,
  usePreviewFinalization,
} from '@/hooks/use-people-score';

import { Button } from './ui';

export type FinalizePeriodModalPeriod = {
  id: string;
  period_name: string;
  period_start: string;
  period_end: string;
};

// Fase yang dipicu AKSI USER. Disimpan di state karena tidak bisa diturunkan dari query manapun.
type Phase =
  | { kind: 'calculating' }
  | { kind: 'locking' }
  | { kind: 'error-calc'; message: string }
  | { kind: 'error-lock'; message: string }
  | { kind: 'error-mismatch' }
  | { kind: 'done'; count: number };

// Fase pra-aksi DITURUNKAN dari status query preview saat render (bukan disalin ke state lewat
// useEffect — setState sinkron di effect memicu cascading render dan dilarang React Compiler).
type State =
  | { kind: 'loading-preview' }
  | { kind: 'step1'; eligibleUsers: number; activeOverrides: number }
  | { kind: 'error-preview' }
  | Phase;

// Copy §6.4 (verified spec). Sengaja diletakkan sebagai konstanta agar mudah refactor ke i18n.
const CONFIRM_LABEL = 'Saya paham, finalisasi periode & kunci peringkat';
const CONCURRENT_COPY =
  'Perhitungan sedang berjalan di sesi lain. Muat ulang halaman dan coba lagi.';
const MISMATCH_COPY =
  'Perhitungan selesai tapi peringkat tidak tersimpan (0 baris). Hubungi admin.';
// NG-2 ditutup — OpenPeriodModal sudah mendarat, jadi janji bersyarat di copy lama
// ("setelah UI buka-periode tersedia") kini menyesatkan: tombolnya ada di layar ini.
const FOOTER_ESCAPE =
  'Butuh mengoreksi? Buka periode berikutnya lewat tombol “Buka Periode” di layar ini.';

// PostgREST error mapping. Bila server mengirim PG code 23505 (unique_violation dari race
// yang berhasil melewati advisory lock — mis. bug atau flag statement_timeout), tampilkan
// copy Indonesia daripada pesan mentah "duplicate key value violates unique constraint …".
function mapError(e: unknown, fallback: string): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === '23505') return CONCURRENT_COPY;
  return err?.message ?? fallback;
}

export function FinalizePeriodModal({
  visible,
  period,
  onClose,
}: {
  visible: boolean;
  period: FinalizePeriodModalPeriod;
  onClose: () => void;
}) {
  const preview = usePreviewFinalization(visible ? period?.id : undefined);
  const calc = useCalculatePeriodScores();
  const close = useClosePeriod();
  // Hanya fase pasca-konfirmasi yang disimpan. `null` = user belum menekan tombol konfirmasi,
  // sehingga tampilan mengikuti status query preview.
  const [phase, setPhase] = useState<Phase | null>(null);

  // State efektif diturunkan saat render. Begitu `phase` terisi, ia menang atas preview —
  // itulah yang mencegah modal "mundur" ke step1 saat query di-invalidate pasca-close.
  const state: State =
    phase ??
    (preview.isError
      ? { kind: 'error-preview' }
      : preview.preview
        ? {
            kind: 'step1',
            eligibleUsers: preview.preview.eligibleUsers,
            activeOverrides: preview.preview.activeOverrides,
          }
        : { kind: 'loading-preview' });

  const isBusy =
    state.kind === 'loading-preview' ||
    state.kind === 'calculating' ||
    state.kind === 'locking';

  const handleDismiss = useCallback(() => {
    if (isBusy) return;
    // Reset saat menutup dari terminal state, supaya modal fresh saat dibuka lagi.
    setPhase(null);
    onClose();
  }, [isBusy, onClose]);

  const runFinalize = useCallback(async () => {
    setPhase({ kind: 'calculating' });
    let calcCount: number;
    try {
      calcCount = await calc.calculatePeriod(period.id);
    } catch (e) {
      setPhase({ kind: 'error-calc', message: mapError(e, 'Gagal menghitung skor.') });
      return;
    }

    setPhase({ kind: 'locking' });
    let closeCount: number;
    try {
      closeCount = await close.closePeriod(period.id);
    } catch (e) {
      setPhase({ kind: 'error-lock', message: mapError(e, 'Gagal mengunci peringkat.') });
      return;
    }

    // Canary AC-FIN-8b: calc menghasilkan baris user_score_results, tapi close tidak
    // meng-insert ranking_snapshots. Kombinasi ini adalah tanda tangan bug asli V1.83
    // yang seharusnya sudah tertutup Fase 0 advisory lock + close membaca is_current=true.
    if (calcCount > 0 && closeCount === 0) {
      setPhase({ kind: 'error-mismatch' });
      return;
    }
    setPhase({ kind: 'done', count: closeCount });
  }, [calc, close, period.id]);

  const retryCalcOnly = useCallback(async () => {
    setPhase({ kind: 'calculating' });
    try {
      const calcCount = await calc.calculatePeriod(period.id);
      // Setelah calc sukses lanjut ke close (mengikuti flow normal).
      setPhase({ kind: 'locking' });
      const closeCount = await close.closePeriod(period.id);
      if (calcCount > 0 && closeCount === 0) {
        setPhase({ kind: 'error-mismatch' });
        return;
      }
      setPhase({ kind: 'done', count: closeCount });
    } catch (e) {
      // Bila error terjadi pada calc (kita di state.kind === 'calculating'), tetap error-calc.
      setPhase({ kind: 'error-calc', message: mapError(e, 'Gagal menghitung skor.') });
    }
  }, [calc, close, period.id]);

  return (
    <Modal
      testID="finalize-modal"
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}>
      <View className="flex-1 justify-center bg-black/40 p-6">
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLabel={`Finalisasi periode ${period.period_name}`}
          className="gap-3 rounded-2xl bg-white p-5 dark:bg-neutral-900">
          {state.kind === 'loading-preview' && (
            <>
              <Text accessibilityRole="header" className="text-lg font-bold text-black dark:text-white">
                Memuat pratinjau…
              </Text>
              <Text className="text-sm text-neutral-600 dark:text-neutral-300">
                Menghitung pengguna yang akan diperingkat.
              </Text>
            </>
          )}

          {state.kind === 'error-preview' && (
            <>
              <Text accessibilityRole="header" className="text-lg font-bold text-black dark:text-white">
                Gagal memuat pratinjau
              </Text>
              <Text className="text-sm font-semibold text-red-700 dark:text-red-400">
                Periksa koneksi lalu coba lagi.
              </Text>
              <Button
                label="Coba lagi"
                accessibilityLabel="Coba lagi memuat pratinjau"
                onPress={() => preview.refetch()}
              />
              <Button
                label="Batal"
                variant="secondary"
                accessibilityLabel="Batal finalisasi periode"
                onPress={handleDismiss}
              />
            </>
          )}

          {state.kind === 'step1' && (
            <>
              <Text accessibilityRole="header" className="text-lg font-bold text-black dark:text-white">
                Finalisasi periode {period.period_name}?
              </Text>
              <Text className="text-sm text-neutral-600 dark:text-neutral-300">
                {period.period_name} · {period.period_start} – {period.period_end}
              </Text>
              {state.eligibleUsers > 0 ? (
                <Text className="text-sm text-neutral-700 dark:text-neutral-200">
                  {state.eligibleUsers} pengguna akan diperingkat · {state.activeOverrides} Manual
                  Override aktif akan efektif.
                </Text>
              ) : (
                <Text
                  accessibilityRole="alert"
                  className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Belum ada pengguna dengan template role terpetakan untuk periode ini. Melanjutkan
                  berarti mengunci periode tanpa peringkat.
                </Text>
              )}
              <Text className="text-sm text-neutral-600 dark:text-neutral-300">
                Skor setiap pengguna akan dihitung ulang berdasar formula aktif, lalu peringkat
                dibekukan dan periode ditutup. Setelah dikunci, periode ini tidak dapat dibuka
                kembali dari aplikasi dan Manual Override tidak bisa lagi diubah.
              </Text>
              <Button
                label={CONFIRM_LABEL}
                accessibilityLabel={CONFIRM_LABEL}
                onPress={runFinalize}
                disabled={calc.isPending || close.isPending}
                loading={calc.isPending || close.isPending}
              />
              <Button
                label="Batal"
                variant="secondary"
                accessibilityLabel="Batal finalisasi periode"
                onPress={handleDismiss}
              />
            </>
          )}

          {state.kind === 'calculating' && (
            <>
              <Text accessibilityRole="header" className="text-lg font-bold text-black dark:text-white">
                Memfinalisasi…
              </Text>
              <Text
                accessibilityLiveRegion="polite"
                accessibilityValue={{ text: 'Langkah 1 dari 2 · Menghitung skor pengguna' }}
                className="text-sm text-neutral-700 dark:text-neutral-200">
                Langkah 1 dari 2 · Menghitung skor pengguna…
              </Text>
            </>
          )}

          {state.kind === 'locking' && (
            <>
              <Text accessibilityRole="header" className="text-lg font-bold text-black dark:text-white">
                Memfinalisasi…
              </Text>
              <Text
                accessibilityLiveRegion="polite"
                accessibilityValue={{ text: 'Langkah 2 dari 2 · Mengunci peringkat' }}
                className="text-sm text-neutral-700 dark:text-neutral-200">
                Langkah 2 dari 2 · Mengunci peringkat…
              </Text>
            </>
          )}

          {state.kind === 'error-calc' && (
            <>
              <Text accessibilityRole="header" className="text-lg font-bold text-black dark:text-white">
                Gagal menghitung skor
              </Text>
              <Text className="text-sm font-semibold text-red-700 dark:text-red-400">
                {state.message}
              </Text>
              <Button
                label="Coba lagi"
                accessibilityLabel="Coba lagi menghitung skor"
                onPress={retryCalcOnly}
                disabled={calc.isPending || close.isPending}
              />
              <Button
                label="Tutup"
                variant="secondary"
                accessibilityLabel="Tutup dialog finalisasi"
                onPress={handleDismiss}
              />
            </>
          )}

          {state.kind === 'error-lock' && (
            <>
              <Text accessibilityRole="header" className="text-lg font-bold text-black dark:text-white">
                Gagal mengunci peringkat
              </Text>
              <Text className="text-sm font-semibold text-red-700 dark:text-red-400">
                {state.message}
              </Text>
              {/* runFinalize aman diulang: calculate idempotent + advisory lock 0079. */}
              <Button
                label="Coba lagi"
                accessibilityLabel="Coba lagi finalisasi peringkat"
                onPress={runFinalize}
                disabled={calc.isPending || close.isPending}
              />
              <Button
                label="Tutup"
                variant="secondary"
                accessibilityLabel="Tutup dialog finalisasi"
                onPress={handleDismiss}
              />
            </>
          )}

          {state.kind === 'error-mismatch' && (
            <>
              <Text accessibilityRole="header" className="text-lg font-bold text-black dark:text-white">
                Peringatan sistem
              </Text>
              <Text className="text-sm font-semibold text-red-700 dark:text-red-400">
                {MISMATCH_COPY}
              </Text>
              <Button
                label="Tutup"
                variant="secondary"
                accessibilityLabel="Tutup dialog finalisasi"
                onPress={handleDismiss}
              />
            </>
          )}

          {state.kind === 'done' && (
            <>
              <Text accessibilityRole="header" className="text-lg font-bold text-black dark:text-white">
                Periode {period.period_name} difinalisasi.
              </Text>
              {state.count > 0 ? (
                <Text className="text-sm text-neutral-700 dark:text-neutral-200">
                  {state.count} pengguna masuk peringkat.
                </Text>
              ) : (
                <Text className="text-sm text-neutral-700 dark:text-neutral-200">
                  0 pengguna diperingkat — kemungkinan penyebab: template role belum dipetakan ke
                  pengguna aktif. Periode berikutnya bisa diperbaiki.
                </Text>
              )}
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                {FOOTER_ESCAPE}
              </Text>
              <Button
                label="Tutup"
                accessibilityLabel="Tutup dialog finalisasi"
                onPress={handleDismiss}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
