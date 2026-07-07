import '@/global.css';
import 'react-native-url-polyfill/auto';

import * as Sentry from '@sentry/react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { ActivityIndicator, View } from 'react-native-css/components';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/error-boundary';
import { installGlobalErrorHandler } from '@/lib/global-handler';
import { createQueryClient } from '@/lib/query-client';
import { initSentry, type InjectableSentry } from '@/lib/sentry-init';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { PeriodFocusProvider } from '@/providers/period-focus-provider';
import { ThemeProvider, useThemePreference } from '@/providers/theme-provider';

// Sentry: aktif hanya bila EXPO_PUBLIC_SENTRY_DSN di-set (dev lokal aman tanpa DSN).
// Bila aktif, `initSentry` menukar logger aktif ke Sentry — semua jalur error setelahnya
// (ErrorBoundary, alertFriendlyError/reportError, QueryCache/MutationCache onError,
// installGlobalErrorHandler) mengalir ke Sentry sekaligus tanpa perubahan lain.
initSentry({ sentry: Sentry as unknown as InjectableSentry });

const queryClient = createQueryClient();

// Uncaught error di luar React tree (async yang tak di-catch, promise rejection tanpa handler)
// → logger (choke point telemetry). Dipasang di module scope agar aktif sebelum tree pertama
// dirender. Chains handler sebelumnya sehingga LogBox default dev tetap jalan.
installGlobalErrorHandler();

function RootNavigator() {
  const { initializing } = useAuth();
  const { effective } = useThemePreference();
  const navTheme = effective === 'dark' ? DarkTheme : DefaultTheme;
  const barStyle = effective === 'dark' ? 'light' : 'dark';

  if (initializing) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-black">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavThemeProvider value={navTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
      <StatusBar style={barStyle} />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <PeriodFocusProvider>
                <AuthProvider>
                  <RootNavigator />
                </AuthProvider>
              </PeriodFocusProvider>
            </ThemeProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
