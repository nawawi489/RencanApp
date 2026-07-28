import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native-css/components';

/** Kartu sapaan gradient di Home (mis. "Selamat pagi, Rina."). */
export function GreetingHero({
  name,
  dateLabel,
  message,
}: {
  name: string;
  dateLabel: string;
  message?: string;
}) {
  return (
    <LinearGradient
      // Brand gradient: dari brand-dark ke green-700 #15803d (AA-safe utk teks putih).
      // #14845c sebelumnya gagal AA — lihat DESIGN.md §2.
      colors={['#1564b3', '#15803d']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: 20, padding: 20 }}>
      <View className="gap-2">
        {dateLabel ? (
          // UI-S-H05: pill tanggal (bukan caption uppercase) — match prototype.
          // `bg-black/25` menggelapkan gradient di belakang pill; teks putih ≥7:1
          // AA. Sebelum ini `bg-white/20` = 3.51:1 (gagal AA — DESIGN §4).
          <View className="self-start rounded-full bg-black/25 px-3 py-1">
            <Text className="text-xs font-semibold text-white">{dateLabel}</Text>
          </View>
        ) : null}
        <Text className="text-2xl font-extrabold text-white">{greeting()}, {name}.</Text>
        {message ? <Text className="text-sm text-white/90">{message}</Text> : null}
      </View>
    </LinearGradient>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 19) return 'Selamat sore';
  return 'Selamat malam';
}
