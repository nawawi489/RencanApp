import '@/global.css';
import 'react-native-url-polyfill/auto';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityIndicator, View } from 'react-native-css/components';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getPrototypeMode } from '@/prototype/utils/fidelity-mode';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { PeriodFocusProvider } from '@/providers/period-focus-provider';
import { ThemeProvider, useThemePreference } from '@/providers/theme-provider';

const queryClient = new QueryClient();

function RootNavigator() {
  const prototypeMode = getPrototypeMode();
  const { initializing } = useAuth();
  const { effective } = useThemePreference();
  const navTheme = prototypeMode ? DefaultTheme : effective === 'dark' ? DarkTheme : DefaultTheme;
  const barStyle = prototypeMode ? 'dark' : effective === 'dark' ? 'light' : 'dark';

  if (initializing) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
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
    </GestureHandlerRootView>
  );
}
