import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/providers/auth-provider';

export default function AppLayout() {
  const { session } = useAuth();

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings' }} />
      <Stack.Screen
        name="initiative/new"
        options={{ headerShown: true, title: 'Initiative Baru', presentation: 'modal' }}
      />
      <Stack.Screen name="initiative/[id]" options={{ headerShown: true, title: 'Initiative' }} />
      <Stack.Screen
        name="action-plan/new"
        options={{ headerShown: true, title: 'Action Plan Baru', presentation: 'modal' }}
      />
      <Stack.Screen name="action-plan/[id]" options={{ headerShown: true, title: 'Action Plan' }} />
      <Stack.Screen
        name="action-plan/submit"
        options={{ headerShown: true, title: 'Submit Bukti & Nilai Hasil', presentation: 'modal' }}
      />
    </Stack>
  );
}
