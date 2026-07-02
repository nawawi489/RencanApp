import { Text, View } from 'react-native-css/components';

export function SnapshotTeamCard({ items }: { items: ReadonlyArray<string> }) {
  return (
    <View className="rounded-[20px] border border-[#dde3eb] bg-white p-4">
      <Text className="text-[20px] font-bold text-[#172033]">Snapshot Tim</Text>
      <View className="mt-3 gap-2">
        {items.map((item) => (
          <Text key={item} className="text-sm text-[#667085]">
            {item}
          </Text>
        ))}
      </View>
    </View>
  );
}
