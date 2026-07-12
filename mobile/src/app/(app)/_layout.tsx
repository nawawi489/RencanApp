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
      <Stack.Screen name="settings-status-priority" options={{ headerShown: true, title: 'Status & Prioritas' }} />
      <Stack.Screen name="settings-notifications-rule" options={{ headerShown: true, title: 'Notifications Rule' }} />
      <Stack.Screen name="settings-repeat-rules" options={{ headerShown: true, title: 'Repeat Setting' }} />
      <Stack.Screen name="settings-archive" options={{ headerShown: true, title: 'Arsip' }} />
      <Stack.Screen name="settings-goal-templates" options={{ headerShown: true, title: 'Goal Template' }} />
      <Stack.Screen
        name="settings-mbr"
        options={{ headerShown: true, title: 'Minimum Breakdown Rule' }}
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
        name="settings-kpi-area-templates"
        options={{ headerShown: true, title: 'Strategi Template' }}
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
        name="evaluation"
        options={{ headerShown: true, title: 'Evaluasi', presentation: 'modal' }}
      />
    </Stack>
  );
}
