// Tab Menu — PRD V1.83 §31.
// Menu = pusat akses sekunder (profil, People, tools admin), BUKAN halaman kerja harian.
// §31 restructure: Score Formula/MBR/Log Aktivitas pindah ke Admin Lanjutan (staff biasa
// tidak melihat sebagai shortcut utama); Akses Cepat = People/Archive/Pusat Bantuan;
// Template accordion conditional (hanya jika user punya akses template).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Avatar, Badge, IconTile, ScoreBadge, SkeletonCard, type IconTileTone } from '@/components/ui';
import { useProfile } from '@/hooks/use-profile';
import { useMyScore } from '@/hooks/use-people-score';
import { effectiveScore } from '@/lib/people-score';
import { columnBasis, menuGridColumns, useBreakpoint } from '@/lib/responsive';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useThemePreference, type ThemeMode } from '@/providers/theme-provider';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// ThemeSwitch pindah ke sini dari settings.tsx (hub lama pensiun) — preferensi tampilan
// adalah setting user-level; rumah barunya Menu (satu-satunya surface pengaturan tersisa).
// Ikon per opsi (DESIGN §10: ikon = penguat, SELALU + label teks; filled saat aktif = sinyal
// seleksi non-warna tambahan). `icon` = base Ionicons; outline saat inaktif.
const THEME_OPTIONS: { key: ThemeMode; label: string; icon: 'contrast' | 'sunny' | 'moon' }[] = [
  { key: 'system', label: 'Sistem', icon: 'contrast' },
  { key: 'light', label: 'Terang', icon: 'sunny' },
  { key: 'dark', label: 'Gelap', icon: 'moon' },
];

function ThemeSwitch() {
  const { mode, setMode, effective } = useThemePreference();
  // Ikon inaktif theme-aware (DESIGN §12: pakai `effective`, bukan useColorScheme).
  const idleIcon = effective === 'dark' ? '#a3a3a3' : '#64748b';
  return (
    <View className="gap-2">
      <CategoryHeading title="Tampilan" />
      <View
        className="flex-row gap-2"
        accessibilityRole="radiogroup"
        accessibilityLabel="Mode tampilan">
        {THEME_OPTIONS.map((opt) => {
          const active = opt.key === mode;
          const iconName = (active ? opt.icon : `${opt.icon}-outline`) as IoniconName;
          return (
            <Pressable
              key={opt.key}
              onPress={() => setMode(opt.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={opt.label}
              className={`min-h-[44px] flex-1 flex-row items-center justify-center gap-1.5 rounded-xl px-2 py-2 ${
                active
                  ? 'bg-brand-dark'
                  : 'border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900'
              } active:opacity-70`}>
              <Ionicons name={iconName} size={16} color={active ? '#ffffff' : idleIcon} />
              <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-neutral-700 dark:text-neutral-200'}`}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Satu item Menu. `href` = navigasi; `permission` = gate opsional (non-pressable + dim
// bila can() false). `permissionAny` = gate bila user punya SALAH SATU izin (layar
// multi-tab dg gate per-tab). `icon` XOR `text` (glyph).
//
// S4-7: field `toast` dihapus. Dulu dipakai untuk item yang menampilkan "Segera hadir"
// (Pusat Bantuan, Dukungan) — audit menandai tile mati. Kembalikan bila fitur berikutnya
// perlu placeholder yang eksplisit alih-alih diam.
type MenuItem = {
  label: string;
  description: string;
  tone: IconTileTone;
  icon?: IoniconName;
  text?: string;
  href?: Href;
  permission?: string;
  permissionAny?: readonly string[];
};

// Layar Organisasi punya 4 tab dengan gate per-tab (create_department / manage_positions /
// manage_teams / manage_settings). Entry tampil bila user bisa MASUK minimal satu tab — Manager
// tetap capai tab Tim (manage_teams) meski Departemen kini admin-only (ISSUE-001, ikuti PRD).
const ORG_SETTINGS_PERMISSIONS = [
  'create_department', 'manage_positions', 'manage_teams', 'manage_settings',
] as const;

// Akses Cepat — §31: People / Archive.
// S4-7: "Pusat Bantuan" dihapus — sebelumnya `toast: true` → alert "Segera hadir"
// (fitur belum dibangun); audit menandai sebagai tile mati. Sudah tak ditawarkan
// dari mana pun; ketika Pusat Bantuan siap, cukup kembalikan entry-nya.
const AKSES_CEPAT: MenuItem[] = [
  { label: 'Anggota', description: 'Ranking & profil', icon: 'people-outline', tone: 'info', href: '/people' as Href },
  { label: 'Arsip', description: 'Card selesai', icon: 'archive-outline', tone: 'danger', href: '/settings-archive' as Href },
];

const TEMPLATE_ITEMS: MenuItem[] = [
  { label: 'Goal Template', description: 'Pustaka Goal', icon: 'document-text-outline', tone: 'success', href: '/settings-goal-templates' as Href },
  { label: 'Strategi Template', description: 'Buat & edit', icon: 'bar-chart-outline', tone: 'warn', href: '/settings-strategy-templates' as Href, permission: 'manage_kpi_area_templates' },
];

// Pengaturan — §31: Score Formula + Aturan Pecah Target pindah ke Admin Lanjutan.
// 3 item terakhir DIVERGENSI TERCATAT (owner decision 2026-07-05): dipertahankan agar layar
// Card Completion Rule / Keterangan Card / Notifications Rule tetap punya entry point.
const PENGATURAN_ITEMS: MenuItem[] = [
  // BL-19c — tanpa `permission`: ini baris milik user sendiri, bukan aksi admin.
  { label: 'Profil Saya', description: 'Ubah nama', icon: 'person-outline', tone: 'info', href: '/settings-profile' as Href },
  // S5-8 — jalur user-owned untuk ekspor data + permintaan penghapusan akun.
  // Wajib ada demi UU 27/2022 PDP + Play Data safety; tak berjenjang permission.
  { label: 'Kelola Akun', description: 'Ekspor & hapus', icon: 'shield-outline', tone: 'danger', href: '/settings-account' as Href },
  { label: 'Organisasi', description: 'Tim dan role', icon: 'business-outline', tone: 'warn', href: '/settings-org-structure' as Href, permissionAny: ORG_SETTINGS_PERMISSIONS },
  { label: 'Profil Organisasi', description: 'Nama & zona waktu', icon: 'globe-outline', tone: 'warn', href: '/settings-organization' as Href, permission: 'manage_settings' },
  { label: 'Pengaturan Pengulangan', description: 'Jadwal Tugas', icon: 'repeat', tone: 'success', href: '/settings-repeat-rules' as Href },
  { label: 'Pengaturan Hak Akses', description: 'Role & akses', icon: 'shield-checkmark-outline', tone: 'success', href: '/settings-permission-users' as Href, permission: 'manage_users_permissions' },
  { label: 'Aturan Penyelesaian Card', description: 'Aturan selesai', icon: 'checkbox-outline', tone: 'info', href: '/settings-card-completion-rule' as Href, permission: 'manage_card_completion_rule' },
  { label: 'Keterangan Card', description: 'Panduan isi card', icon: 'information-circle-outline', tone: 'info', href: '/settings-card-guidance' as Href, permission: 'manage_card_completion_rule' },
  { label: 'Aturan Notifikasi', description: 'Aturan notifikasi', icon: 'notifications-outline', tone: 'info', href: '/settings-notifications-rule' as Href, permission: 'manage_settings' },
];

// Admin Lanjutan — §31: Score Formula/MBR/Log Aktivitas masuk sini (staff tak melihat
// sebagai shortcut utama). Semua item WAJIB punya `permission` agar adminVisible gating benar.
//
// S4-7: dua tile dihapus karena mengarah ke layar yang butuh konteks-per-entitas dan
// mendarat di "Data target tidak lengkap"/rules-kosong bila diketuk dari sini:
//   • "Override Skor" (/manual-score-override) — butuh userId + periodId; dibuka dari
//     profil anggota (people-profile), bukan tile top-level.
//   • "Rahasia" (/settings-confidential-access) — butuh entity_type + entity_id;
//     dibuka dari detail card, dan `grant lewat detail card` masih di-defer.
// Layar kedua tetap ada untuk saat sudah dijangkau dengan konteks yang benar.
const ADMIN_ITEMS: MenuItem[] = [
  { label: 'Aturan Pecah Target', description: 'Aturan turunan', icon: 'git-branch-outline', tone: 'info', href: '/settings-mbr' as Href, permission: 'manage_minimum_breakdown_rule' },
  { label: 'Rumus Skor', description: 'Formula penilaian', icon: 'stats-chart-outline', tone: 'violet', href: '/settings-score-formula' as Href, permission: 'manage_score_formula' },
  { label: 'Tata Kelola', description: 'Pelanggaran aturan', icon: 'warning-outline', tone: 'danger', href: '/settings-governance-violation' as Href, permission: 'view_governance_violation' },
  { label: 'Log Aktivitas', description: 'Riwayat sistem', icon: 'time-outline', tone: 'success', href: '/settings-activity-log' as Href, permission: 'view_activity_log' },
];

type ProfileRow = {
  full_name: string | null;
  email: string | null;
  role_templates: { name: string; level: string } | null;
};

async function fetchProfile(uid: string): Promise<ProfileRow | null> {
  if (!uid) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, email, role_templates(name, level)')
    .eq('id', uid)
    .single();
  if (error) throw error;
  return data as unknown as ProfileRow;
}

/** Kartu fitur Menu (grid width-derived: 2 kolom compact → 3 kolom ≥medium). `basis` =
 *  flexBasis persen dari breakpoint (P1 adapt item 2), menggantikan `basis-[48%]` tetap yang
 *  memberi 2 kolom identik di 320pt maupun 1440pt. Non-pressable + dim bila permission tak
 *  terpenuhi (spec §18). */
function MenuCard({
  item,
  onPress,
  basis,
}: {
  item: MenuItem;
  onPress: (item: MenuItem) => void;
  basis: ReturnType<typeof columnBasis>;
}) {
  const { can } = useProfile();
  const permitted =
    (!item.permission || can(item.permission)) &&
    (!item.permissionAny || item.permissionAny.some((k) => can(k)));
  const active = !!item.href && permitted;
  const body = (
    <View
      className={`min-h-[112px] justify-between rounded-2xl border p-3.5 ${
        active
          ? 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
          : 'border-neutral-200 bg-neutral-100 opacity-60 dark:border-neutral-800 dark:bg-neutral-900/40'
      }`}>
      <IconTile icon={item.icon} text={item.text} tone={active ? item.tone : 'neutral'} size={40} />
      <View className="mt-2">
        <Text
          className={`text-base font-bold ${active ? 'text-black dark:text-white' : 'text-neutral-400 dark:text-neutral-500'}`}
          numberOfLines={2}>
          {item.label}
        </Text>
        <Text className="mt-0.5 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400" numberOfLines={2}>
          {item.description}
        </Text>
      </View>
    </View>
  );
  if (!active) return <View style={{ flexBasis: basis }}>{body}</View>;
  return (
    <View style={{ flexBasis: basis }}>
      <Pressable accessibilityRole="button" accessibilityLabel={item.label} className="active:opacity-70" onPress={() => onPress(item)}>
        {body}
      </Pressable>
    </View>
  );
}

function MenuGrid({ items, onPress }: { items: MenuItem[]; onPress: (item: MenuItem) => void }) {
  // Kolom diturunkan dari lebar jendela (P1 adapt item 2): 2 di compact, 3 di ≥medium.
  const { breakpoint } = useBreakpoint();
  const basis = columnBasis(menuGridColumns(breakpoint));
  return (
    <View className="flex-row flex-wrap gap-2.5">
      {items.map((it) => (
        <MenuCard key={it.label} item={it} onPress={onPress} basis={basis} />
      ))}
    </View>
  );
}

/** Heading kategori seragam (spec §7/§11): 14px / weight 900 / navy #26364f, kanan muted. */
function CategoryHeading({ title, right }: { title: string; right?: string }) {
  return (
    <View className="min-h-[42px] flex-row items-center justify-between px-0.5">
      <Text className="text-sm font-black text-[#26364f] dark:text-neutral-100">{title}</Text>
      {right ? <Text className="text-xs font-extrabold text-neutral-400">{right}</Text> : null}
    </View>
  );
}

/** Accordion Menu — collapsed by default (spec §11). Heading identik CategoryHeading. */
function MenuAccordion({ title, items, onPress }: { title: string; items: MenuItem[]; onPress: (item: MenuItem) => void }) {
  const [open, setOpen] = useState(false);
  // Chevron muted theme-aware (DESIGN §12: warna imperatif via `effective`, bukan hardcoded).
  const chevronColor = useThemePreference().effective === 'dark' ? '#94a3b8' : '#667085';
  return (
    <View className="gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        className="min-h-[42px] flex-row items-center justify-between px-0.5 active:opacity-70"
        onPress={() => setOpen((v) => !v)}>
        <Text className="text-sm font-black text-[#26364f] dark:text-neutral-100">{title}</Text>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={chevronColor} />
      </Pressable>
      {open ? <MenuGrid items={items} onPress={onPress} /> : null}
    </View>
  );
}

export default function MenuScreen() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const { can } = useProfile();
  // Ikon gear theme-aware (DESIGN §12): pill `dark:bg-neutral-800` butuh warna terang di dark.
  const gearColor = useThemePreference().effective === 'dark' ? '#cbd5e1' : '#26364f';
  const uid = session?.user?.id ?? '';
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', uid],
    queryFn: () => fetchProfile(uid),
    enabled: !!uid,
  });
  const { score } = useMyScore();
  const scoreValue = effectiveScore(score ?? null);

  const name = profile?.full_name ?? session?.user.email ?? 'Pengguna';
  const userId = session?.user.id;
  const role = profile?.role_templates?.name;
  const subhead = role ? `${role} · Lihat profil kamu` : 'Lihat profil kamu';

  const openMyProfile = userId ? () => router.push(`/people-profile/${userId}` as Href) : undefined;

  const onItemPress = (item: MenuItem) => {
    if (item.href) router.push(item.href);
  };

  // Admin Lanjutan disembunyikan bila user tak punya SATU pun permission-nya (spec §15/§20).
  const adminVisible = ADMIN_ITEMS.some((it) => !it.permission || can(it.permission));

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <View className="gap-4 p-5">
        {/* Local header — spec §5: title Menu (28px) + satu gear (tanpa search/plus).
            Gear muncul bila user bisa masuk minimal satu tab Organisasi — non-admin jangan
            diarahkan ke layar akses-ditolak (spec §18: hide diizinkan). */}
        <View className="mb-1 flex-row items-center justify-between">
          <Text className="text-[28px] font-extrabold text-black dark:text-white">Menu</Text>
          {ORG_SETTINGS_PERMISSIONS.some((k) => can(k)) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pengaturan organisasi"
              // Sprint 6 S6-5 — visual 36px (h-9 w-9), touch 44px via hitSlop 4 (DESIGN §4).
              hitSlop={4}
              className="h-9 w-9 items-center justify-center rounded-full bg-[#eef2f7] active:opacity-70 dark:bg-neutral-800"
              onPress={() => router.push('/settings-org-structure' as Href)}>
              <Ionicons name="settings-outline" size={19} color={gearColor} />
            </Pressable>
          ) : null}
        </View>

        {/* Profile card — spec §6: langsung di bawah header; tap → people-profile diri sendiri. */}
        {isLoading ? (
          <SkeletonCard />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Buka profil saya"
            onPress={openMyProfile}
            disabled={!openMyProfile}
            className="flex-row items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3 active:opacity-70 dark:border-neutral-800 dark:bg-neutral-900">
            <Avatar name={name} seed={userId ?? name} size={54} />
            <View className="flex-1">
              <Text className="text-lg font-bold text-black dark:text-white" numberOfLines={1}>
                {name}
              </Text>
              <Text className="text-sm text-neutral-500 dark:text-neutral-400" numberOfLines={1}>
                {subhead}
              </Text>
            </View>
            {scoreValue != null ? <ScoreBadge score={scoreValue} /> : <Badge label="Belum ada skor" tone="neutral" />}
          </Pressable>
        )}

        {/* Akses Cepat — grid, selalu tampil, tepat 3 fitur. */}
        <View className="gap-2">
          <CategoryHeading title="Akses Cepat" right={`${AKSES_CEPAT.length} fitur`} />
          <MenuGrid items={AKSES_CEPAT} onPress={onItemPress} />
        </View>

        {/* Accordion (collapsed by default). Template conditional §31. */}
        {can('manage_kpi_area_templates') ? (
          <MenuAccordion title="Template" items={TEMPLATE_ITEMS} onPress={onItemPress} />
        ) : null}
        {/* S4-7: accordion "Bantuan" dihapus — satu-satunya isinya ("Dukungan") berupa
            toast "Segera hadir". Kembalikan ketika Pusat Bantuan/Dukungan siap. */}
        <MenuAccordion title="Pengaturan" items={PENGATURAN_ITEMS} onPress={onItemPress} />
        {adminVisible ? <MenuAccordion title="Admin Lanjutan" items={ADMIN_ITEMS} onPress={onItemPress} /> : null}

        {/* Tampilan (theme) — di bawah accordion, di atas Keluar. Divergensi kecil dari urutan
            spec §4 (spec tak menyebut theme); dipindah dari hub settings.tsx yang pensiun. */}
        <ThemeSwitch />

        {/* Logout — spec §16: full width, abu (bukan merah), teks "Keluar". */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Keluar"
          className="mt-1 min-h-[48px] items-center justify-center rounded-xl bg-[#dfe5eb] active:opacity-80 dark:bg-neutral-800"
          onPress={signOut}>
          <Text className="text-[15px] font-black text-[#172033] dark:text-white">Keluar</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
