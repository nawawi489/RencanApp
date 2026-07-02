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
        name="action-plan/instance/[id]"
        options={{ headerShown: true, title: 'Instance' }}
      />
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

      {/* Fase 8 — Governance & Admin */}
      <Stack.Screen name="settings-org-structure" options={{ headerShown: true, title: 'Organisasi' }} />
      <Stack.Screen name="settings-activity-log" options={{ headerShown: true, title: 'Activity Log' }} />
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
      <Stack.Screen name="settings-status-priority" options={{ headerShown: true, title: 'Status & Prioritas' }} />
      <Stack.Screen name="settings-notifications-rule" options={{ headerShown: true, title: 'Notifications Rule' }} />
      <Stack.Screen name="settings-repeat-rules" options={{ headerShown: true, title: 'Repeat Setting' }} />
      <Stack.Screen name="settings-archive" options={{ headerShown: true, title: 'Arsip' }} />
      <Stack.Screen name="settings-goal-templates" options={{ headerShown: true, title: 'Goal Template' }} />
      <Stack.Screen
        name="settings-permission-users"
        options={{ headerShown: true, title: 'User & Permission' }}
      />
      <Stack.Screen
        name="settings-kpi-area-templates"
        options={{ headerShown: true, title: 'KPI Area Template' }}
      />
      <Stack.Screen name="search" options={{ headerShown: true, title: 'Cari' }} />

      {/* Fase 7 — People & Score (surface) */}
      <Stack.Screen name="people" options={{ headerShown: true, title: 'People' }} />
      <Stack.Screen name="people-ranking" options={{ headerShown: true, title: 'Ranking' }} />
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
        name="cancellation"
        options={{ headerShown: true, title: 'Batalkan Card', presentation: 'modal' }}
      />
      <Stack.Screen
        name="evaluation"
        options={{ headerShown: true, title: 'Evaluasi', presentation: 'modal' }}
      />
    </Stack>
  );
}
