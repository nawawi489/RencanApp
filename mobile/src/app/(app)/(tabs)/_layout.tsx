import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { AppHeader } from '@/components/app-header';

const BRAND = '#1564b3';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: BRAND,
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
          header: () => <AppHeader kicker="Khusus chat Initiative" />,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          title: 'People',
          header: () => <AppHeader kicker="Ranking dan profil pencapaian" />,
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
