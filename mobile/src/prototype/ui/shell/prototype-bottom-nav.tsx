import { Text, View } from 'react-native-css/components';

const ITEMS = [
  { key: 'home', label: 'Home' },
  { key: 'notifications', label: 'Notifikasi' },
  { key: 'workspace', label: 'Workspace' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'menu', label: 'Menu' },
] as const;

export function PrototypeBottomNav({ active }: { active: (typeof ITEMS)[number]['key'] }) {
  return (
    <View className="flex-row items-center justify-between border-t border-[#dde3eb] bg-white px-5 py-4">
      {ITEMS.map((item) => (
        <Text
          key={item.key}
          className={`text-xs font-semibold ${item.key === active ? 'text-[#1877f2]' : 'text-[#667085]'}`}>
          {item.label}
        </Text>
      ))}
    </View>
  );
}
