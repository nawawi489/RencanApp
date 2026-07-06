import { useQuery } from '@tanstack/react-query';

import { MGR_DEFAULT_KEYS } from '@/lib/permission-defaults';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export type CurrentProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  organization_id: string | null;
  role_level: string | null;
  role_name: string | null;
  org_name: string | null;
  /** Timezone IANA organisasi (organizations.timezone) — untuk format timestamp sisi klien. */
  org_timezone: string | null;
  created_at: string | null;
  permissionKeys: string[];
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  organization_id: string | null;
  created_at: string | null;
  role_templates: { name: string; level: string } | null;
  organizations: { name: string; timezone: string | null } | null;
  user_permissions: { granted: boolean; permissions: { key: string } | null }[] | null;
};

/**
 * Usia profil dalam hari (UTC). Sumber kebenaran onboarding hint Fase 3 (FR-H-12 / CF-2).
 * created_at null/invalid → Infinity (hint disembunyikan, tidak crash).
 */
export function getProfileAgeInDays(createdAt: string | null | undefined): number {
  if (!createdAt) return Infinity;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return Infinity;
  return (Date.now() - created) / 86_400_000;
}

async function fetchCurrentProfile(): Promise<CurrentProfile> {
  // RLS profiles mengizinkan lihat seluruh anggota org, jadi WAJIB filter ke diri sendiri
  // sebelum .single() — tanpa ini PostgREST balas 406 (rows != 1).
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, full_name, email, organization_id, created_at, role_templates(name, level), organizations(name, timezone), user_permissions(granted, permissions(key))',
    )
    .eq('id', auth.user!.id)
    .single();
  if (error) throw error;
  const row = data as unknown as ProfileRow;
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    organization_id: row.organization_id,
    role_level: row.role_templates?.level ?? null,
    role_name: row.role_templates?.name ?? null,
    org_name: row.organizations?.name ?? null,
    org_timezone: row.organizations?.timezone ?? null,
    created_at: row.created_at ?? null,
    permissionKeys: (row.user_permissions ?? [])
      .filter((p) => p.granted && p.permissions?.key)
      .map((p) => p.permissions!.key),
  };
}

// Cermin client-side dari public.has_permission (server tetap penegak akhir). 6 key default
// c_level/management bersumber tunggal dari MGR_DEFAULT_KEYS (lib/permission-defaults.ts) agar
// sinkron dengan has_permission (0016) + is_default (0017). Key LAIN butuh grant eksplisit.
const ROLE_DEFAULTS: Record<string, string[]> = {
  c_level: [...MGR_DEFAULT_KEYS],
  management: [...MGR_DEFAULT_KEYS],
};

export function useProfile() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ['current-profile', session?.user.id],
    queryFn: fetchCurrentProfile,
    enabled: !!session,
  });

  const profile = query.data;
  function can(key: string): boolean {
    if (!profile) return false;
    if (profile.role_level === 'ceo') return true;
    if (profile.role_level && ROLE_DEFAULTS[profile.role_level]?.includes(key)) return true;
    return profile.permissionKeys.includes(key);
  }

  return { profile, isLoading: query.isLoading, can };
}
