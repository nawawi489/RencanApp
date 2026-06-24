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
      colors={['#1564b3', '#14845c']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: 20, padding: 20 }}>
      <View className="gap-1.5">
        <Text className="text-xs font-semibold uppercase text-white/80">{dateLabel}</Text>
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
