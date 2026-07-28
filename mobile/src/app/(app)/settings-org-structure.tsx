// Fase 8 — Settings > Organisasi. UI-S-OR1: tab Departemen / Posisi / Tim / Role Template.
// Gating: create_department / manage_positions / manage_teams / manage_settings (per tab).
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { AccessDenied } from '@/components/access-denied';
import { OptionPicker, type PickerOption } from '@/components/option-picker';
import { Button, EmptyState, ErrorState, LabeledInput, SectionCard, SkeletonList, TabBar } from '@/components/ui';
import { UserPicker } from '@/components/user-picker';
import {
  useOrgActions,
  useOrgStructure,
  usePositions,
  useRoleTemplates,
  useReportingLineActions,
  useReportingLines,
  useTeams,
} from '@/hooks/use-org-structure';
import { useProfile } from '@/hooks/use-profile';
import { listOrgProfiles, personLabel, type PersonRef } from '@/lib/cards';
import { alertFriendlyError } from '@/lib/errors';

type Tab = 'department' | 'position' | 'team' | 'role' | 'reporting';

const TAB_PERMISSION: Record<Tab, string> = {
  department: 'create_department',
  position: 'manage_positions',
  team: 'manage_teams',
  role: 'manage_settings',
  // Garis pelaporan mengubah siapa-atasan-siapa untuk SEMUA orang, bukan hanya struktur
  // unit, jadi gerbangnya disamakan dengan User & Permission — bukan `manage_settings`.
  reporting: 'manage_users_permissions',
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1"
      keyboardVerticalOffset={0}>
      <ScrollView
        className="flex-1 bg-neutral-50 dark:bg-black"
        keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Organisasi' }} />
      <View className="gap-4 p-5">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">Organisasi</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Departemen, posisi, tim, dan role template.
          </Text>
        </View>
        <TabBar<Tab>
          tabs={[
            { key: 'department', label: 'Departemen' },
            { key: 'position', label: 'Posisi' },
            { key: 'team', label: 'Tim' },
            { key: 'role', label: 'Role' },
            { key: 'reporting', label: 'Atasan' },
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
        ) : tab === 'reporting' ? (
          <ReportingTab />
        ) : (
          <RoleTab />
        )}
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Item bersama tab Departemen/Posisi/Tim (nama + optional deskripsi + is_active). */
type OrgItem = { id: string; name: string; description: string | null; is_active: boolean };

function SimpleOrgTab<T extends OrgItem>({
  items,
  isLoading,
  isError,
  onRetry,
  isPending,
  onCreate,
  entity,
  subhead,
  placeholder,
  metaOf,
  actionsOf,
  onPressItem,
  formExtras,
  onResetForm,
}: {
  items: T[];
  isLoading: boolean;
  /** S4-6 — fetch error jangan jatuh ke EmptyState "Belum ada Departemen" — admin
   *  bisa mengira org benar-benar kosong lalu membuat ulang data yang sudah ada. */
  isError?: boolean;
  onRetry?: () => void;
  isPending: boolean;
  onCreate: (name: string) => Promise<unknown>;
  entity: string;
  subhead: string;
  placeholder: string;
  /** Baris keterangan tautan (mis. "Departemen: Operasi") di bawah nama item. */
  metaOf?: (item: T) => string | null;
  /** Kontrol per baris. Lewat prop `actions` SectionCard, bukan children — DESIGN §4 aturan 6. */
  actionsOf?: (item: T) => ReactNode;
  onPressItem?: (item: T) => void;
  /** Field tambahan di form tambah — state-nya dipegang tab pemanggil. */
  formExtras?: ReactNode;
  /** Kosongkan `formExtras` setelah simpan berhasil supaya tidak lengket ke entri berikutnya. */
  onResetForm?: () => void;
}) {
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!name.trim()) return;
    try {
      await onCreate(name.trim());
      setName('');
      onResetForm?.();
      setAdding(false);
    } catch (e) {
      alertFriendlyError('Gagal', e, 'Kesalahan.');
    }
  }

  if (isLoading) return <SkeletonList count={4} />;
  if (isError) {
    return (
      <ErrorState
        title={`Gagal memuat ${entity}`}
        description={`Tidak bisa mengambil daftar ${entity}. Periksa koneksi lalu coba lagi.`}
        onRetry={onRetry}
      />
    );
  }
  return (
    <View className="gap-3">
      <Text className="text-sm text-neutral-500 dark:text-neutral-400">{subhead}</Text>
      {items.length === 0 ? (
        <EmptyState title={`Belum ada ${entity}`} description={`Tambahkan ${entity} pertama Anda.`} />
      ) : (
        items.map((it) => {
          const meta = metaOf?.(it) ?? null;
          return (
            <SectionCard
              key={it.id}
              actions={actionsOf?.(it)}
              onPress={onPressItem ? () => onPressItem(it) : undefined}
              accessibilityLabel={onPressItem ? `Buka ${entity} ${it.name}` : undefined}>
              <Text className="text-base font-semibold text-black dark:text-white">{it.name}</Text>
              {it.description ? (
                <Text className="text-sm text-neutral-500 dark:text-neutral-400">{it.description}</Text>
              ) : null}
              {meta ? <Text className="text-xs text-neutral-500 dark:text-neutral-400">{meta}</Text> : null}
              {!it.is_active ? <Text className="text-xs text-neutral-400">Nonaktif</Text> : null}
            </SectionCard>
          );
        })
      )}
      {adding ? (
        <SectionCard>
          <LabeledInput label={`Nama ${entity}`} value={name} onChangeText={setName} placeholder={placeholder} />
          {formExtras}
          <Button label={`Simpan ${entity}`} onPress={handleAdd} disabled={isPending || !name.trim()} />
        </SectionCard>
      ) : (
        <Button label={`+ ${entity} Baru`} onPress={() => setAdding(true)} />
      )}
    </View>
  );
}

function DepartmentTab() {
  const { departments, isLoading, isError, refetch } = useOrgStructure();
  const { createDepartment, setDepartmentActive, isPending } = useOrgActions();
  // Jumlah tautan hanya untuk teks konfirmasi — keduanya sudah di-cache tab lain.
  const { positions } = usePositions();
  const { teams } = useTeams();

  function confirmToggle(dept: { id: string; name: string; is_active: boolean }) {
    const nextActive = !dept.is_active;
    if (nextActive) {
      void run(true);
      return;
    }
    const linked =
      positions.filter((p) => p.department_id === dept.id).length +
      teams.filter((t) => t.department_id === dept.id).length;
    Alert.alert(
      `Nonaktifkan ${dept.name}?`,
      linked > 0
        ? `${linked} Posisi/Tim masih tertaut dan TIDAK akan diputus — riwayatnya dipertahankan. Departemen ini hanya berhenti muncul sebagai pilihan untuk yang baru.`
        : 'Departemen berhenti muncul sebagai pilihan untuk Posisi/Tim baru. Bisa diaktifkan lagi kapan saja.',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Nonaktifkan', style: 'destructive', onPress: () => void run(false) },
      ],
    );

    async function run(active: boolean) {
      try {
        await setDepartmentActive({ departmentId: dept.id, active });
      } catch (e) {
        alertFriendlyError('Gagal', e, 'Kesalahan.');
      }
    }
  }

  return (
    <SimpleOrgTab
      items={departments}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      isPending={isPending}
      onCreate={(name) => createDepartment({ name })}
      entity="Departemen"
      subhead="Kelola Departemen organisasi. Nonaktifkan tanpa menghapus untuk menjaga riwayat."
      placeholder="mis. Operasi"
      actionsOf={(d) => (
        <Button
          label={d.is_active ? 'Nonaktifkan' : 'Aktifkan kembali'}
          // Tanpa label eksplisit, setiap baris mengumumkan "Nonaktifkan" yang sama —
          // pembaca layar kehilangan tahu departemen mana yang akan terpengaruh.
          accessibilityLabel={`${d.is_active ? 'Nonaktifkan' : 'Aktifkan kembali'} ${d.name}`}
          variant={d.is_active ? 'danger' : 'secondary'}
          onPress={() => confirmToggle(d)}
          disabled={isPending}
        />
      )}
    />
  );
}

/**
 * Opsi Departemen untuk picker Posisi/Tim. Hanya departemen aktif yang bisa dipilih —
 * `create_position` / `create_team` menerima departemen nonaktif, tapi menautkan struktur
 * baru ke unit yang sudah dipensiunkan hanya memindahkan masalah ke laporan.
 */
function useDepartmentOptions(): { options: PickerOption[]; nameOf: (id: string | null) => string | null } {
  const { departments } = useOrgStructure();
  return {
    options: departments.filter((d) => d.is_active).map((d) => ({ value: d.id, label: d.name })),
    nameOf: (id) => (id ? (departments.find((d) => d.id === id)?.name ?? null) : null),
  };
}

const DEPARTMENT_EMPTY_HINT = 'Belum ada Departemen aktif. Buat lebih dulu di tab Departemen.';

function PositionTab() {
  const { positions, isLoading, isError, refetch } = usePositions();
  const { createPosition, isPending } = useOrgActions();
  const { options, nameOf } = useDepartmentOptions();
  const [departmentId, setDepartmentId] = useState<string | null>(null);

  return (
    <SimpleOrgTab
      items={positions}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      isPending={isPending}
      onCreate={(name) => createPosition({ name, departmentId })}
      entity="Posisi"
      subhead="Posisi (jabatan) yang bisa dipilih saat memetakan struktur organisasi."
      placeholder="mis. Sales Manager"
      metaOf={(it) => {
        const dept = nameOf(it.department_id);
        return dept ? `Departemen: ${dept}` : null;
      }}
      formExtras={
        <OptionPicker
          label="Departemen"
          options={options}
          value={departmentId}
          onChange={setDepartmentId}
          placeholder="Tanpa departemen"
          clearLabel="Tanpa departemen"
          emptyText={DEPARTMENT_EMPTY_HINT}
        />
      }
      onResetForm={() => setDepartmentId(null)}
    />
  );
}

function TeamTab() {
  const router = useRouter();
  const { teams, isLoading, isError, refetch } = useTeams();
  const { createTeam, isPending } = useOrgActions();
  const { options, nameOf } = useDepartmentOptions();
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [lead, setLead] = useState<NonNullable<PersonRef> | null>(null);
  // Key sama dengan UserPicker → satu cache profiles untuk picker dan label daftar.
  const { data: profiles } = useQuery({ queryKey: ['org-profiles'], queryFn: listOrgProfiles });

  function leadNameOf(id: string | null): string | null {
    if (!id) return null;
    const p = (profiles ?? []).find((x) => x.id === id);
    return p ? personLabel(p) : null;
  }

  return (
    <SimpleOrgTab
      items={teams}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      isPending={isPending}
      onCreate={(name) => createTeam({ name, departmentId, leadId: lead?.id ?? null })}
      entity="Tim"
      subhead="Tim lintas departemen — gunakan untuk kelompokkan eksekusi yang membutuhkan kolaborasi. Buka satu Tim untuk mengelola anggotanya."
      placeholder="mis. Squad Mobile"
      // `as Href`: tipe rute Expo Router di-generate dev server, rute baru belum ada
      // di sana sampai regenerasi — pola sama dengan settings-archive.tsx:111.
      onPressItem={(t) => router.push(`/settings-team/${t.id}` as Href)}
      metaOf={(it) => {
        const dept = nameOf(it.department_id);
        const leadName = leadNameOf(it.lead_id);
        const parts = [dept ? `Departemen: ${dept}` : null, leadName ? `Lead: ${leadName}` : null];
        const meta = parts.filter(Boolean).join(' · ');
        return meta || null;
      }}
      formExtras={
        <>
          <OptionPicker
            label="Departemen"
            options={options}
            value={departmentId}
            onChange={setDepartmentId}
            placeholder="Tanpa departemen"
            clearLabel="Tanpa departemen"
            emptyText={DEPARTMENT_EMPTY_HINT}
          />
          <UserPicker label="Lead Tim" value={lead} onChange={setLead} />
        </>
      }
      onResetForm={() => {
        setDepartmentId(null);
        setLead(null);
      }}
    />
  );
}

/**
 * BL-19d — garis pelaporan (§34.3 item 5). DESKRIPTIF, bukan otorisasi: menyetel atasan
 * tidak memberi atasan itu akses apa pun atas data bawahannya. Itu dinyatakan di UI supaya
 * admin tidak menyangka sedang mengatur hak akses — lihat komentar migrasi 0094.
 */
function ReportingTab() {
  const { people, isLoading } = useReportingLines();
  const { setReportingLine, isPending } = useReportingLineActions();

  async function change(userId: string, manager: NonNullable<PersonRef> | null) {
    try {
      await setReportingLine({ userId, managerId: manager?.id ?? null });
    } catch (e) {
      // Penolakan server (siklus, lintas-org, atasan nonaktif) muncul apa adanya —
      // pesannya sudah copy Indonesia terkurasi dan menjelaskan sebabnya.
      alertFriendlyError('Gagal', e, 'Kesalahan.');
    }
  }

  if (isLoading) return <SkeletonList count={4} />;
  return (
    <View className="gap-3">
      <Text className="text-sm text-neutral-500 dark:text-neutral-400">
        Siapa melapor kepada siapa. Ini catatan struktur — mengatur atasan TIDAK memberi
        akses ke data bawahan; hak akses tetap diatur di User & Permission.
      </Text>
      {people.length === 0 ? (
        <EmptyState title="Belum ada anggota" description="Tambahkan user lebih dulu." />
      ) : (
        people.map((p) => {
          const label = personLabel(p);
          return (
            <SectionCard
              key={p.id}
              actions={
                <UserPicker
                  label={`Atasan ${label}`}
                  value={p.manager}
                  onChange={(m) => void change(p.id, m)}
                  // Diri sendiri disingkirkan dari pilihan: server menolaknya, dan
                  // menawarkan opsi yang pasti gagal itu jebakan.
                  excludeId={p.id}
                />
              }>
              <Text className="text-base font-semibold text-black dark:text-white">{label}</Text>
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                {p.manager ? `Atasan: ${personLabel(p.manager)}` : 'Belum ada atasan'}
              </Text>
            </SectionCard>
          );
        })
      )}
      {isPending ? (
        <Text className="text-xs text-neutral-400">Menyimpan…</Text>
      ) : null}
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
      alertFriendlyError('Gagal', e, 'Kesalahan.');
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
          <Text className="px-1 text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">Level</Text>
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
                  className={`min-h-[44px] flex-1 items-center justify-center rounded-full px-2 ${
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
