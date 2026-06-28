// Fase 8 — Settings > Organisasi. UI-S-OR1: tab Departemen / Posisi / Tim / Role Template.
// Gating: create_department / manage_positions / manage_teams / manage_settings (per tab).
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { AccessDenied } from '@/components/access-denied';
import { Button, EmptyState, LabeledInput, SectionCard, SkeletonList, TabBar } from '@/components/ui';
import {
  useOrgActions,
  useOrgStructure,
  usePositions,
  useRoleTemplates,
  useTeams,
} from '@/hooks/use-org-structure';
import { useProfile } from '@/hooks/use-profile';

type Tab = 'department' | 'position' | 'team' | 'role';

const TAB_PERMISSION: Record<Tab, string> = {
  department: 'create_department',
  position: 'manage_positions',
  team: 'manage_teams',
  role: 'manage_settings',
};

const LEVEL_OPTIONS: { value: 'ceo' | 'c_level' | 'management' | 'staff'; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'management', label: 'Management' },
  { value: 'c_level', label: 'C-Level' },
  { value: 'ceo', label: 'CEO' },
];

const LEVEL_LABEL: Record<string, string> = {
  staff: 'Staff', management: 'Management', c_level: 'C-Level', ceo: 'CEO',
};

export default function SettingsOrgStructureScreen() {
  const { can } = useProfile();
  const [tab, setTab] = useState<Tab>('department');

  const allowed = can(TAB_PERMISSION[tab]);
  // Setiap tab punya akses level masing-masing; jika tidak allowed → AccessDenied per-tab.

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Organisasi' }} />
      <View className="gap-4 p-5">
        <TabBar<Tab>
          tabs={[
            { key: 'department', label: 'Departemen' },
            { key: 'position', label: 'Posisi' },
            { key: 'team', label: 'Tim' },
            { key: 'role', label: 'Role' },
          ]}
          active={tab}
          onChange={setTab}
        />
        {!allowed ? (
          <AccessDenied
            message={`Tab ini memerlukan izin "${TAB_PERMISSION[tab]}". Hubungi administrator bila perlu akses.`}
          />
        ) : tab === 'department' ? (
          <DepartmentTab />
        ) : tab === 'position' ? (
          <PositionTab />
        ) : tab === 'team' ? (
          <TeamTab />
        ) : (
          <RoleTab />
        )}
      </View>
    </ScrollView>
  );
}

function DepartmentTab() {
  const { departments, isLoading } = useOrgStructure();
  const { createDepartment, isPending } = useOrgActions();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!name.trim()) return;
    await createDepartment({ name: name.trim() });
    setName('');
    setAdding(false);
  }

  if (isLoading) return <SkeletonList count={4} />;
  return (
    <View className="gap-3">
      <Text className="text-sm text-neutral-500 dark:text-neutral-400">
        Kelola Departemen organisasi. Nonaktifkan tanpa menghapus untuk menjaga riwayat.
      </Text>
      {departments.length === 0 ? (
        <EmptyState title="Belum ada Departemen" description="Tambahkan Departemen pertama Anda." />
      ) : (
        departments.map((d) => (
          <SectionCard key={d.id}>
            <Text className="text-base font-semibold text-black dark:text-white">{d.name}</Text>
            {d.description ? (
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">{d.description}</Text>
            ) : null}
            {!d.is_active ? <Text className="text-xs text-neutral-400">Nonaktif</Text> : null}
          </SectionCard>
        ))
      )}
      {adding ? (
        <SectionCard>
          <LabeledInput label="Nama Departemen" value={name} onChangeText={setName} placeholder="mis. Operasi" />
          <Button label="Simpan Departemen" onPress={handleAdd} disabled={isPending || !name.trim()} />
        </SectionCard>
      ) : (
        <Button label="+ Departemen Baru" onPress={() => setAdding(true)} />
      )}
    </View>
  );
}

function PositionTab() {
  const { positions, isLoading } = usePositions();
  const { createPosition, isPending } = useOrgActions();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!name.trim()) return;
    await createPosition({ name: name.trim() });
    setName('');
    setAdding(false);
  }

  if (isLoading) return <SkeletonList count={4} />;
  return (
    <View className="gap-3">
      <Text className="text-sm text-neutral-500 dark:text-neutral-400">
        Posisi (jabatan) yang bisa dipilih saat memetakan struktur organisasi.
      </Text>
      {positions.length === 0 ? (
        <EmptyState title="Belum ada Posisi" description="Tambahkan Posisi pertama untuk mulai memetakan." />
      ) : (
        positions.map((p) => (
          <SectionCard key={p.id}>
            <Text className="text-base font-semibold text-black dark:text-white">{p.name}</Text>
            {p.description ? (
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">{p.description}</Text>
            ) : null}
            {!p.is_active ? <Text className="text-xs text-neutral-400">Nonaktif</Text> : null}
          </SectionCard>
        ))
      )}
      {adding ? (
        <SectionCard>
          <LabeledInput label="Nama Posisi" value={name} onChangeText={setName} placeholder="mis. Sales Manager" />
          <Button label="Simpan Posisi" onPress={handleAdd} disabled={isPending || !name.trim()} />
        </SectionCard>
      ) : (
        <Button label="+ Posisi Baru" onPress={() => setAdding(true)} />
      )}
    </View>
  );
}

function TeamTab() {
  const { teams, isLoading } = useTeams();
  const { createTeam, isPending } = useOrgActions();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!name.trim()) return;
    try {
      await createTeam({ name: name.trim(), departmentId: null, leadId: null });
      setName('');
      setAdding(false);
    } catch (e) {
      Alert.alert('Gagal', e instanceof Error ? e.message : 'Kesalahan.');
    }
  }

  if (isLoading) return <SkeletonList count={4} />;
  return (
    <View className="gap-3">
      <Text className="text-sm text-neutral-500 dark:text-neutral-400">
        Tim lintas departemen — gunakan untuk kelompokkan eksekusi yang membutuhkan kolaborasi.
      </Text>
      {teams.length === 0 ? (
        <EmptyState title="Belum ada Tim" description="Tambahkan Tim pertama Anda." />
      ) : (
        teams.map((t) => (
          <SectionCard key={t.id}>
            <Text className="text-base font-semibold text-black dark:text-white">{t.name}</Text>
            {t.description ? (
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">{t.description}</Text>
            ) : null}
            {!t.is_active ? <Text className="text-xs text-neutral-400">Nonaktif</Text> : null}
          </SectionCard>
        ))
      )}
      {adding ? (
        <SectionCard>
          <LabeledInput label="Nama Tim" value={name} onChangeText={setName} placeholder="mis. Squad Mobile" />
          <Button label="Simpan Tim" onPress={handleAdd} disabled={isPending || !name.trim()} />
        </SectionCard>
      ) : (
        <Button label="+ Tim Baru" onPress={() => setAdding(true)} />
      )}
    </View>
  );
}

function RoleTab() {
  const { roleTemplates, isLoading } = useRoleTemplates();
  const { createRoleTemplate, isPending } = useOrgActions();
  const [name, setName] = useState('');
  const [level, setLevel] = useState<'ceo' | 'c_level' | 'management' | 'staff'>('staff');
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!name.trim()) return;
    try {
      await createRoleTemplate({ name: name.trim(), level });
      setName('');
      setAdding(false);
    } catch (e) {
      Alert.alert('Gagal', e instanceof Error ? e.message : 'Kesalahan.');
    }
  }

  if (isLoading) return <SkeletonList count={4} />;
  return (
    <View className="gap-3">
      <Text className="text-sm text-neutral-500 dark:text-neutral-400">
        Role Template menentukan default izin saat user di-assign. Sistem template tidak bisa diubah.
      </Text>
      {roleTemplates.length === 0 ? (
        <EmptyState title="Belum ada Role" description="Tambahkan Role Template kustom untuk org Anda." />
      ) : (
        roleTemplates.map((r) => (
          <SectionCard key={r.id}>
            <View className="flex-row items-center justify-between gap-2">
              <Text className="text-base font-semibold text-black dark:text-white">{r.name}</Text>
              <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                {LEVEL_LABEL[r.level] ?? r.level}
              </Text>
            </View>
            {r.is_system ? (
              <Text className="text-xs text-neutral-400">Sistem (tidak dapat diubah)</Text>
            ) : null}
          </SectionCard>
        ))
      )}
      {adding ? (
        <SectionCard>
          <LabeledInput label="Nama Role" value={name} onChangeText={setName} placeholder="mis. Sales Lead" />
          <Text className="px-1 text-xs font-semibold uppercase text-neutral-400">Level</Text>
          <View
            className="flex-row gap-2"
            accessibilityRole="radiogroup"
            accessibilityLabel="Level role">
            {LEVEL_OPTIONS.map((opt) => {
              const active = level === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={opt.label}
                  onPress={() => setLevel(opt.value)}
                  className={`min-h-[36px] flex-1 items-center justify-center rounded-lg px-2 ${
                    active ? 'bg-brand-dark' : 'border border-neutral-300 dark:border-neutral-700'
                  } active:opacity-70`}>
                  <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-black dark:text-white'}`}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Button label="Simpan Role" onPress={handleAdd} disabled={isPending || !name.trim()} />
        </SectionCard>
      ) : (
        <Button label="+ Role Baru" onPress={() => setAdding(true)} />
      )}
    </View>
  );
}
