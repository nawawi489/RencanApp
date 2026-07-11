import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { AppHeader } from '@/components/app-header';
import { useThemePreference } from '@/providers/theme-provider';

export default function TabsLayout() {
  // Tab bar gelap: brand-dark #1564b3 drop ke ~2:1 (nyaris tak beda dari inactive). blue-300
  // #93c5fd di gelap (pola app-header/IconTile, DESIGN §12).
  const { effective } = useThemePreference();
  const activeTint = effective === 'dark' ? '#93c5fd' : '#1564b3';
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeTint,
        header: () => <AppHeader />,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          header: () => <AppHeader kicker="Pusat Kendali Hari Ini" />,
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notif',
          header: () => <AppHeader kicker="Notifikasi resmi dan respons" />,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="workspace"
        options={{
          title: 'Workspace',
          header: () => <AppHeader kicker="Peta eksekusi perusahaan" />,
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          header: () => <AppHeader kicker="Khusus chat Action Plan" />,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menu',
          header: () => <AppHeader kicker="Profil, People, dan admin" />,
          tabBarIcon: ({ color, size }) => <Ionicons name="menu-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
