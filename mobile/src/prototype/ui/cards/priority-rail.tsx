import { Text, View } from 'react-native-css/components';

export function PriorityRail({
  items,
}: {
  items: ReadonlyArray<{ icon: string; title: string; body: string }>;
}) {
  return (
    <View className="gap-3">
      {items.map((item) => (
        <View key={item.title} className="rounded-[20px] border border-[#dde3eb] bg-white p-4">
          <Text className="text-sm font-semibold text-[#1877f2]">{item.icon}</Text>
          <Text className="mt-2 text-base font-bold text-[#172033]">{item.title}</Text>
          <Text className="mt-1 text-sm text-[#667085]">{item.body}</Text>
        </View>
      ))}
    </View>
  );
}
