import { Text, View } from 'react-native-css/components';

export function HeroCard({
  dateLabel,
  greeting,
  body,
}: {
  dateLabel: string;
  greeting: string;
  body: string;
}) {
  return (
    <View className="rounded-[24px] bg-[#1877f2] p-5">
      <Text className="self-start rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#172033]">
        {dateLabel}
      </Text>
      <Text className="mt-4 text-[20px] font-extrabold text-white">{greeting}</Text>
      <Text className="mt-3 text-sm text-white">{body}</Text>
    </View>
  );
}
