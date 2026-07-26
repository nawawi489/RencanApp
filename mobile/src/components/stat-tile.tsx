import { Text, View } from 'react-native-css/components';

/**
 * Kotak angka kecil untuk strip metrik di detail-screen.
 *
 * Dua ukuran nyata dari code yang ada:
 * - `sm` (default): rounded-lg px-3 py-1.5, label 10px, value 14px semibold.
 *   Dipakai untuk chip status di Ruang Eksekusi Rencana Aksi & Ringkasan Hari Ini
 *   di Tugas Instance.
 * - `md`: flex-1 gap-0.5 rounded-lg px-3 py-2, label 10px, value 16px bold.
 *   Dipakai untuk strip ringkasan Development Area (tiga tile mengisi baris).
 */
export function StatTile({
  label,
  value,
  containerCls,
  textCls,
  size = 'sm',
}: {
  label: string;
  value: string | number;
  containerCls: string;
  textCls: string;
  size?: 'sm' | 'md';
}) {
  // A11y: gabungkan label+nilai jadi satu node ("label: value") agar tiap metrik = satu swipe
  // pembaca layar, bukan dua potong terpisah (DESIGN §4).
  const a11yLabel = `${label}: ${value}`;
  if (size === 'md') {
    return (
      <View
        className={`flex-1 gap-0.5 rounded-lg px-3 py-2 ${containerCls}`}
        accessible
        accessibilityLabel={a11yLabel}>
        <Text className={`text-[10px] ${textCls}`}>{label}</Text>
        <Text className={`text-base font-bold ${textCls}`}>{value}</Text>
      </View>
    );
  }
  return (
    <View
      className={`rounded-lg px-3 py-1.5 ${containerCls}`}
      accessible
      accessibilityLabel={a11yLabel}>
      <Text className={`text-[10px] ${textCls}`}>{label}</Text>
      <Text className={`text-sm font-semibold ${textCls}`}>{value}</Text>
    </View>
  );
}
