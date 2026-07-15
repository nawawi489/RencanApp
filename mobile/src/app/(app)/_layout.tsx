import { Ionicons } from '@expo/vector-icons';
import { Redirect, Stack, router } from 'expo-router';
import { Pressable } from 'react-native';

import { useAuth } from '@/providers/auth-provider';

// RN Web quirk: default Stack header omits back button when navigated via direct URL.
// Force render sebuah custom back Pressable yang panggil router.back() jika bisa,
// atau router.replace('/') sebagai fallback. Ukuran 44×44 patuh DESIGN.md §4 touch target.
function HeaderBack() {
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      accessibilityRole="button"
      accessibilityLabel="Kembali"
      style={({ pressed }) => ({
        minHeight: 44,
        minWidth: 44,
        marginLeft: 8,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name="chevron-back" size={26} color="#1564b3" />
    </Pressable>
  );
}

export default function AppLayout() {
  const { session } = useAuth();

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Force back button visible di semua Stack.Screen dgn headerShown: true.
        headerBackVisible: true,
        headerLeft: () => <HeaderBack />,
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="inbox/[roomId]" options={{ headerShown: true, title: 'Diskusi Rencana Aksi' }} />

      {/* Fase 4 — Performance Workspace V1.8.3:
          Goal → Strategy → Initiative → Action Plan → Task
          Route folder ↔ label UI:
            strategy/    → Strategi (level 1, dulu KPI Area)
            initiative/  → Inisiatif (level 2, dulu Strategy)
            action-plan/ → Rencana Aksi (level 3, dulu Initiative) — otomatis dapat Diskusi Rencana Aksi
            task/        → Tugas (level 4, dulu Action Plan) */}
      <Stack.Screen
        name="goal-wizard"
        options={{ headerShown: true, title: 'Goal Wizard', presentation: 'modal' }}
      />
      <Stack.Screen name="goal/new" options={{ headerShown: true, title: 'Goal Baru', presentation: 'modal' }} />
      <Stack.Screen name="goal/[id]" options={{ headerShown: true, title: 'Goal' }} />
      <Stack.Screen
        name="strategy/new"
        options={{ headerShown: true, title: 'Strategi Baru', presentation: 'modal' }}
      />
      <Stack.Screen name="strategy/[id]" options={{ headerShown: true, title: 'Strategi' }} />
      <Stack.Screen
        name="initiative/new"
        options={{ headerShown: true, title: 'Inisiatif Baru', presentation: 'modal' }}
      />
      <Stack.Screen name="initiative/[id]" options={{ headerShown: true, title: 'Inisiatif' }} />
      <Stack.Screen
        name="action-plan/new"
        options={{ headerShown: true, title: 'Rencana Aksi Baru', presentation: 'modal' }}
      />
      <Stack.Screen name="action-plan/[id]" options={{ headerShown: true, title: 'Rencana Aksi' }} />
      <Stack.Screen
        name="task/new"
        options={{ headerShown: true, title: 'Tugas Baru', presentation: 'modal' }}
      />
      <Stack.Screen name="task/[id]" options={{ headerShown: true, title: 'Tugas' }} />
      <Stack.Screen
        name="task/instance/[id]"
        options={{ headerShown: true, title: 'Instance' }}
      />
      <Stack.Screen
        name="task/submit"
        options={{ headerShown: true, title: 'Submit Bukti & Nilai Hasil', presentation: 'modal' }}
      />

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

      {/* Fase 8 — Governance & Admin */}
      <Stack.Screen name="settings-org-structure" options={{ headerShown: true, title: 'Organisasi' }} />
      <Stack.Screen name="settings-activity-log" options={{ headerShown: true, title: 'Log Aktivitas' }} />
      <Stack.Screen
        name="settings-governance-violation"
        options={{ headerShown: true, title: 'Governance Violation' }}
      />
      <Stack.Screen name="settings-confidential-access" options={{ headerShown: true, title: 'Akses Rahasia' }} />
      <Stack.Screen
        name="settings-card-completion-rule"
        options={{ headerShown: true, title: 'Card Completion Rule' }}
      />
      <Stack.Screen name="settings-card-guidance" options={{ headerShown: true, title: 'Keterangan Card' }} />
      <Stack.Screen name="settings-notifications-rule" options={{ headerShown: true, title: 'Notifications Rule' }} />
      <Stack.Screen name="settings-repeat-rules" options={{ headerShown: true, title: 'Repeat Setting' }} />
      <Stack.Screen name="settings-archive" options={{ headerShown: true, title: 'Arsip' }} />
      <Stack.Screen name="settings-goal-templates" options={{ headerShown: true, title: 'Goal Template' }} />
      <Stack.Screen
        name="settings-mbr"
        options={{ headerShown: true, title: 'Aturan Pecah Target' }}
      />
      <Stack.Screen
        name="settings-score-formula"
        options={{ headerShown: true, title: 'Score Formula' }}
      />
      <Stack.Screen
        name="settings-permission-users"
        options={{ headerShown: true, title: 'User & Permission' }}
      />
      <Stack.Screen
        name="settings-user-new"
        options={{ headerShown: true, title: 'Tambah User' }}
      />
      <Stack.Screen
        name="settings-strategy-templates"
        options={{ headerShown: true, title: 'Strategi Template' }}
      />
      <Stack.Screen name="search" options={{ headerShown: true, title: 'Cari' }} />

      {/* Fase 7 — People & Score (surface) */}
      <Stack.Screen name="people" options={{ headerShown: true, title: 'People' }} />
      <Stack.Screen name="people-profile/[id]" options={{ headerShown: true, title: 'Profil' }} />
      <Stack.Screen
        name="manual-score-override"
        options={{ headerShown: true, title: 'Override Skor', presentation: 'modal' }}
      />
      <Stack.Screen
        name="deadline-change-request"
        options={{ headerShown: true, title: 'Perubahan Deadline', presentation: 'modal' }}
      />
      <Stack.Screen
        name="evaluation"
        options={{ headerShown: true, title: 'Evaluasi', presentation: 'modal' }}
      />
    </Stack>
  );
}
