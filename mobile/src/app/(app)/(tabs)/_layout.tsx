import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { AppHeader } from '@/components/app-header';
import { useInboxRooms } from '@/hooks/use-inbox';
import { useThemePreference } from '@/providers/theme-provider';

export default function TabsLayout() {
  // Tab bar gelap: brand-dark #1564b3 drop ke ~2:1 (nyaris tak beda dari inactive). blue-300
  // #93c5fd di gelap (pola app-header/IconTile, DESIGN §12).
  const { effective } = useThemePreference();
  const activeTint = effective === 'dark' ? '#93c5fd' : '#1564b3';

  // Badge unread di ikon Inbox: total pesan belum dibaca lintas room (clamp '99+').
  const { rooms } = useInboxRooms();
  const totalUnread = rooms.reduce((sum, r) => sum + (r.unread_count > 0 ? r.unread_count : 0), 0);
  const inboxBadge = totalUnread > 0 ? (totalUnread > 99 ? '99+' : totalUnread) : undefined;
  // Sprint 6 S6-6 — warna ≠ satu-satunya sinyal (DESIGN §4 rule 2): tab aktif juga ganti
  // varian ikon `-outline` → filled. `focused` disediakan Expo Router tabBarIcon.
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
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notif',
          header: () => <AppHeader kicker="Notifikasi resmi dan respons" />,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'notifications' : 'notifications-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="workspace"
        options={{
          title: 'Workspace',
          header: () => <AppHeader kicker="Peta eksekusi perusahaan" />,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          header: () => <AppHeader kicker="Khusus chat Rencana Aksi" />,
          tabBarBadge: inboxBadge,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menu',
          header: () => <AppHeader kicker="Profil, People, dan admin" />,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'menu' : 'menu-outline'} color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
