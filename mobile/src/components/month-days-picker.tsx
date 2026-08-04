// MonthDaysPicker — grid multi-select tanggal 1–31 (menggantikan input teks koma).
// Pola UI identik dengan weekday chips di task/new.tsx repeat mingguan.
import { Pressable, Text, View } from 'react-native-css/components';

type Props = {
  label: string;
  value: number[];
  onChange: (v: number[]) => void;
  required?: boolean;
};

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function MonthDaysPicker({ label, value, onChange, required }: Props) {
  function toggle(day: number) {
    if (value.includes(day)) {
      onChange(value.filter((d) => d !== day));
    } else {
      onChange([...value, day].sort((a, b) => a - b));
    }
  }

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold text-black dark:text-white">
        {label}
        {required ? <Text className="text-red-700 dark:text-red-400"> *</Text> : null}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {DAYS.map((day) => {
          const active = value.includes(day);
          return (
            <Pressable
              key={day}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`Tanggal ${day}`}
              onPress={() => toggle(day)}
              // §4.1 — sel 44×44 (touch target minimum; native tanpa hitSlop) + gap-2 supaya
              // grid 31 sel yang padat tak memicu salah-tap hari.
              className={`h-11 w-11 items-center justify-center rounded-lg border active:opacity-70 ${
                active
                  ? 'border-brand-dark bg-brand-dark'
                  : 'border-neutral-300 dark:border-neutral-700'
              }`}>
              <Text
                className={`text-sm font-semibold ${
                  active ? 'text-white' : 'text-black dark:text-white'
                }`}>
                {day}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
