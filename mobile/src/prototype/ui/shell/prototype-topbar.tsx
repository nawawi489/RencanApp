import { Text, View } from 'react-native-css/components';

export function PrototypeTopbar({ title, kicker, initials }: { title: string; kicker: string; initials: string }) {
  return (
    <View className="flex-row items-center justify-between border-b border-[#dde3eb] bg-white px-5 py-4">
      <View className="gap-1">
        <Text className="text-xl font-extrabold text-[#092753]">{title}</Text>
        <Text className="text-xs font-semibold uppercase text-[#667085]">{kicker}</Text>
      </View>
      <View className="h-11 w-11 items-center justify-center rounded-full bg-[#e8f2ff]">
        <Text className="text-sm font-bold text-[#1877f2]">{initials}</Text>
      </View>
    </View>
  );
}
