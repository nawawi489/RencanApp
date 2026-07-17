// DateRangeField — pasangan DateField (Mulai / Selesai) + validasi end ≥ start di komponen.
// Menggantikan pola "dua DateField terpisah + periodError() di tiap layar".
import { View, Text } from 'react-native-css/components';

import { DateField } from '@/components/date-field';
import { DATE_RE } from '@/lib/date';

type Props = {
  startLabel?: string;
  endLabel?: string;
  startValue: string;
  endValue: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  required?: boolean;
};

export function DateRangeField({
  startLabel = 'Tanggal Mulai',
  endLabel = 'Tanggal Selesai',
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  required,
}: Props) {
  const bothValid =
    startValue && endValue && DATE_RE.test(startValue) && DATE_RE.test(endValue);
  const invalid = bothValid && endValue < startValue;

  return (
    <View className="gap-3">
      <DateField
        label={startLabel}
        value={startValue}
        onChange={onStartChange}
        required={required}
      />
      <DateField
        label={endLabel}
        value={endValue}
        onChange={onEndChange}
        required={required}
      />
      {invalid ? (
        <Text
          className="text-sm text-red-700 dark:text-red-400"
          accessibilityRole="alert">
          Tanggal selesai tidak boleh sebelum tanggal mulai.
        </Text>
      ) : null}
    </View>
  );
}
