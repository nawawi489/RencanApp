// Tab Menu — MENU_UI_LOCK_SPEC_V1.82.
// Menu = pusat akses sekunder (profil, People, tools admin), BUKAN halaman kerja harian.
// Layar mandiri (bukan lagi adapter ke /settings). Struktur terkunci spec: local header +
// profile card + Akses Cepat (grid, tepat 3) + accordion Template/Bantuan/Pengaturan/Admin
// Lanjutan (collapsed by default) + tombol Keluar. Radius kartu memakai token app (rounded-2xl,
// DESIGN.md) alih-alih 8px prototype HTML — konsistensi design-system (divergensi tercatat).
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Avatar, Badge, IconTile, ScoreBadge, SkeletonCard, type IconTileTone } from '@/components/ui';
import { useProfile } from '@/hooks/use-profile';
import { useMyScore } from '@/hooks/use-people-score';
import { effectiveScore } from '@/lib/people-score';
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

// Satu item Menu. `href` = navigasi; `toast` = fitur belum dibangun (Bantuan) → alert "Segera hadir";
// `permission` = gate opsional (non-pressable + dim bila can() false). `icon` XOR `text` (glyph).
type MenuItem = {
  label: string;
  description: string;
  tone: IconTileTone;
  icon?: IoniconName;
  text?: string;
  href?: Href;
  permission?: string;
  toast?: boolean;
};

// Akses Cepat — spec §7/§10: TEPAT 3, tak ber-permission (visible untuk semua user, §18).
const AKSES_CEPAT: MenuItem[] = [
  { label: 'People', description: 'Ranking & profil', icon: 'people-outline', tone: 'info', href: '/people' as Href },
  { label: 'Log Aktivitas', description: 'Riwayat sistem', icon: 'time-outline', tone: 'success', href: '/settings-activity-log' as Href },
  { label: 'Archive', description: 'Card selesai', icon: 'archive-outline', tone: 'danger', href: '/settings-archive' as Href },
];

const TEMPLATE_ITEMS: MenuItem[] = [
  { label: 'Goal Template', description: 'Library Goal', icon: 'document-text-outline', tone: 'success', href: '/settings-goal-templates' as Href },
  { label: 'KPI Area Template', description: 'Buat & edit', icon: 'bar-chart-outline', tone: 'warn', href: '/settings-kpi-area-templates' as Href, permission: 'manage_kpi_area_templates' },
];

// Bantuan — spec §13. Belum ada layar (help-center/support); tap → toast (owner decision).
const BANTUAN_ITEMS: MenuItem[] = [
  { label: 'Pusat Bantuan', description: 'Panduan EMS', text: '?', tone: 'info', toast: true },
  { label: 'Support', description: 'Hubungi admin', text: 'CS', tone: 'success', toast: true },
];

// Pengaturan — spec §14 mengunci 5 item pertama. 4 item terakhir DIVERGENSI TERCATAT (owner
// decision 2026-07-05): dipertahankan agar layar Card Completion Rule / Keterangan Card /
// Status & Prioritas / Notifications Rule tetap punya entry point (kalau tidak, jadi orphan).
const PENGATURAN_ITEMS: MenuItem[] = [
  { label: 'Organisasi', description: 'Tim dan role', icon: 'business-outline', tone: 'warn', href: '/settings-org-structure' as Href, permission: 'create_department' },
  { label: 'Repeat Setting', description: 'Jadwal Action Plan', text: 'R', tone: 'success', href: '/settings-repeat-rules' as Href },
  { label: 'Score Formula', description: 'Rumus score', icon: 'stats-chart-outline', tone: 'violet', href: '/settings-score-formula' as Href, permission: 'manage_score_formula' },
  { label: 'Permission Settings', description: 'Role & akses', icon: 'shield-checkmark-outline', tone: 'success', href: '/settings-permission-users' as Href, permission: 'manage_users_permissions' },
  { label: 'Minimum Breakdown Rule', description: 'Aturan turunan', icon: 'git-branch-outline', tone: 'info', href: '/settings-mbr' as Href, permission: 'manage_minimum_breakdown_rule' },
  { label: 'Card Completion Rule', description: 'Aturan selesai', icon: 'checkbox-outline', tone: 'info', href: '/settings-card-completion-rule' as Href, permission: 'manage_card_completion_rule' },
  { label: 'Keterangan Card', description: 'Panduan isi card', icon: 'information-circle-outline', tone: 'info', href: '/settings-card-guidance' as Href, permission: 'manage_card_completion_rule' },
  { label: 'Status & Prioritas', description: 'Label kerja', icon: 'flag-outline', tone: 'warn', href: '/settings-status-priority' as Href, permission: 'manage_settings' },
  { label: 'Notifications Rule', description: 'Aturan notifikasi', icon: 'notifications-outline', tone: 'info', href: '/settings-notifications-rule' as Href, permission: 'manage_settings' },
];

// Admin Lanjutan — spec §15. Override Score → manual-score-override; layar itu menuntut
// userId+periodId, tanpa param menampilkan guard "buka dari profil" (bukan layar kosong).
const ADMIN_ITEMS: MenuItem[] = [
  { label: 'Governance', description: 'Guard violation', icon: 'warning-outline', tone: 'danger', href: '/settings-governance-violation' as Href, permission: 'view_governance_violation' },
  { label: 'Confidential', description: 'Akses khusus', icon: 'lock-closed-outline', tone: 'warn', href: '/settings-confidential-access' as Href, permission: 'manage_confidential_access' },
  { label: 'Override Score', description: 'Akses berwenang', icon: 'ribbon-outline', tone: 'violet', href: '/manual-score-override' as Href, permission: 'manage_score_formula' },
];

type ProfileRow = {
  full_name: string | null;
  email: string | null;
  role_templates: { name: string; level: string } | null;
};

async function fetchProfile(): Promise<ProfileRow | null> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, email, role_templates(name, level)')
    .eq('id', auth.user!.id)
    .single();
  if (error) throw error;
  return data as unknown as ProfileRow;
}

/** Kartu fitur Menu (grid 2 kolom). Non-pressable + dim bila permission tak terpenuhi (spec §18). */
function MenuCard({ item, onPress }: { item: MenuItem; onPress: (item: MenuItem) => void }) {
  const { can } = useProfile();
  const active = item.toast ? true : !!item.href && (!item.permission || can(item.permission));
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
  if (!active) return <View className="basis-[48%]">{body}</View>;
  return (
    <View className="basis-[48%]">
      <Pressable accessibilityRole="button" accessibilityLabel={item.label} className="active:opacity-70" onPress={() => onPress(item)}>
        {body}
      </Pressable>
    </View>
  );
}

function MenuGrid({ items, onPress }: { items: MenuItem[]; onPress: (item: MenuItem) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2.5">
      {items.map((it) => (
        <MenuCard key={it.label} item={it} onPress={onPress} />
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
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', session?.user.id],
    queryFn: fetchProfile,
  });
  const { score } = useMyScore();
  const scoreValue = effectiveScore(score ?? null);

  const name = profile?.full_name ?? session?.user.email ?? 'Pengguna';
  const userId = session?.user.id;
  const role = profile?.role_templates?.name;
  const subhead = role ? `${role} · Lihat profil kamu` : 'Lihat profil kamu';

  const openMyProfile = userId ? () => router.push(`/people-profile/${userId}` as Href) : undefined;

  // Handler tunggal: toast (fitur belum ada) vs navigasi.
  const onItemPress = (item: MenuItem) => {
    if (item.toast) {
      Alert.alert('Segera hadir', `${item.label} akan tersedia di versi berikutnya.`);
      return;
    }
    if (item.href) router.push(item.href);
  };

  // Admin Lanjutan disembunyikan bila user tak punya SATU pun permission-nya (spec §15/§20).
  const adminVisible = ADMIN_ITEMS.some((it) => !it.permission || can(it.permission));

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <View className="gap-4 p-5">
        {/* Local header — spec §5: title Menu (28px) + satu gear (tanpa search/plus).
            Gear hanya untuk admin (can create_department) — non-admin jangan diarahkan ke
            layar akses-ditolak (spec §18: hide diizinkan). */}
        <View className="mb-1 flex-row items-center justify-between">
          <Text className="text-[28px] font-extrabold text-black dark:text-white">Menu</Text>
          {can('create_department') ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pengaturan organisasi"
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
            {scoreValue != null ? <ScoreBadge score={scoreValue} /> : <Badge label="Belum" tone="neutral" />}
          </Pressable>
        )}

        {/* Akses Cepat — grid, selalu tampil, tepat 3 fitur. */}
        <View className="gap-2">
          <CategoryHeading title="Akses Cepat" right={`${AKSES_CEPAT.length} fitur`} />
          <MenuGrid items={AKSES_CEPAT} onPress={onItemPress} />
        </View>

        {/* Accordion (collapsed by default). */}
        <MenuAccordion title="Template" items={TEMPLATE_ITEMS} onPress={onItemPress} />
        <MenuAccordion title="Bantuan" items={BANTUAN_ITEMS} onPress={onItemPress} />
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
