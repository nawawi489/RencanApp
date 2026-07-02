import type { PropsWithChildren } from 'react';
import { View } from 'react-native-css/components';

export function PrototypeThemeBoundary({ children }: PropsWithChildren) {
  return <View className="flex-1 bg-[#f3f5f8]">{children}</View>;
}
