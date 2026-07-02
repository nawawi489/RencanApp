import { Text, View } from 'react-native-css/components';
import { PrototypeThemeBoundary } from '@/prototype/ui/shell/prototype-theme-boundary';

export default function PrototypeGoalFormScreen() {
  return (
    <PrototypeThemeBoundary>
      <View className="flex-1 p-5">
        <Text className="text-2xl font-bold text-[#172033]">Goal Baru</Text>
      </View>
    </PrototypeThemeBoundary>
  );
}
