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
      <Stack.Screen name="inbox/[roomId]" options={{ headerShown: true, title: 'Diskusi Initiative' }} />

      {/* Fase 4 — Performance Workspace (Hierarki Strategis) */}
      <Stack.Screen
        name="goal-wizard"
        options={{ headerShown: true, title: 'Goal Wizard', presentation: 'modal' }}
      />
      <Stack.Screen name="goal/new" options={{ headerShown: true, title: 'Goal Baru', presentation: 'modal' }} />
      <Stack.Screen name="goal/[id]" options={{ headerShown: true, title: 'Goal' }} />
      <Stack.Screen
        name="kpi-area/new"
        options={{ headerShown: true, title: 'KPI Area Baru', presentation: 'modal' }}
      />
      <Stack.Screen name="kpi-area/[id]" options={{ headerShown: true, title: 'KPI Area' }} />
      <Stack.Screen
        name="strategy/new"
        options={{ headerShown: true, title: 'Strategy Baru', presentation: 'modal' }}
      />
      <Stack.Screen name="strategy/[id]" options={{ headerShown: true, title: 'Strategy' }} />

      {/* Fase 6 — Development Workspace */}
      <Stack.Screen
        name="development-area/new"
        options={{ headerShown: true, title: 'Development Area Baru', presentation: 'modal' }}
      />
      <Stack.Screen
        name="development-area/[id]"
        options={{ headerShown: true, title: 'Development Area' }}
      />
      <Stack.Screen
        name="problem-statement/new"
        options={{ headerShown: true, title: 'Problem Statement Baru', presentation: 'modal' }}
      />
      <Stack.Screen
        name="problem-statement/[id]"
        options={{ headerShown: true, title: 'Problem Statement' }}
      />
    </Stack>
  );
}
