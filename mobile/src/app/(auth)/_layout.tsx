import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/providers/auth-provider';

export default function AuthLayout() {
  const { session, isRecovering } = useAuth();

  // Selama recovery flow (deep-link "Lupa password"), Supabase membuat session
  // sementara sebelum user set kata sandi baru — jangan redirect ke (app).
  if (session && !isRecovering) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
