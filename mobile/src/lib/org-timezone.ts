// Zona waktu efektif untuk Repeat Setting (PRD §23 field 5).
//
// Zona waktu adalah properti ORGANISASI, bukan properti repeat-rule: kolom
// `organizations.timezone` (migration 0007, default 'Asia/Jakarta') adalah zona tempat
// `deadline_at` dihitung, dan helper server `public.org_today(p_org)` meresolusi zona yang
// sama untuk deteksi instance terlewat & reminder deadline. `task_repeat_rules` TIDAK punya
// kolom timezone — jadi field ini murni TAMPILAN: ia memberi tahu user "Jam Deadline 09:00
// itu relatif terhadap apa", bukan sebuah override per-rule.
import { getOrgContext } from './org-context';
import { supabase } from './supabase';

/** Sama dengan default kolom `organizations.timezone` di migration 0007. */
export const DEFAULT_ORG_TIMEZONE = 'Asia/Jakarta';

/** Singkatan lokal Indonesia per zona IANA. Zona di luar peta ini tampil apa adanya. */
const TIMEZONE_ABBREVIATION: Record<string, string> = {
  'Asia/Jakarta': 'WIB',
  'Asia/Pontianak': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT',
};

/**
 * Label tampilan zona waktu, mis. `Asia/Jakarta (WIB)`.
 * Nilai kosong/null jatuh ke default org supaya UI tidak pernah menampilkan "—" untuk
 * sesuatu yang server selalu punya nilainya.
 */
export function orgTimezoneLabel(timezone: string | null | undefined): string {
  const zone = timezone?.trim() || DEFAULT_ORG_TIMEZONE;
  const abbreviation = TIMEZONE_ABBREVIATION[zone];
  return abbreviation ? `${zone} (${abbreviation})` : zone;
}

/**
 * Pilihan zona untuk layar Profil Organisasi (BL-19c). Sengaja hanya tiga zona Indonesia:
 * server menerima zona APA PUN yang dikenal katalog Postgres (±600 nama), dan daftar
 * sepanjang itu di picker mobile lebih mudah salah pilih daripada berguna.
 *
 * Zona di luar daftar TIDAK hilang: `orgTimezoneOptions()` menyisipkan nilai yang sedang
 * dipakai bila belum ada — picker yang diam-diam membuang nilai tersimpan akan menampilkan
 * "kosong" untuk kolom yang server selalu punya isinya, lalu menimpanya saat disimpan.
 */
const TIMEZONE_CHOICES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] as const;

export function orgTimezoneOptions(current: string | null | undefined): {
  value: string;
  label: string;
}[] {
  const zone = current?.trim() || DEFAULT_ORG_TIMEZONE;
  const values: string[] = [...TIMEZONE_CHOICES];
  if (!values.includes(zone)) values.unshift(zone);
  return values.map((v) => ({ value: v, label: orgTimezoneLabel(v) }));
}

/**
 * Zona waktu organisasi user yang sedang login. Read-only dari sisi Repeat Setting —
 * perubahan zona adalah setting organisasi (lihat `/settings-organization`).
 */
export async function getOrgTimezone(): Promise<string> {
  const { orgId } = await getOrgContext();
  // maybeSingle, BUKAN single: RLS `org_select_own` menyaring org lain jadi 0 baris dan
  // single() akan balas 406 → React Query retry tanpa henti untuk field yang cuma hiasan.
  const { data, error } = await supabase
    .from('organizations')
    .select('timezone')
    .eq('id', orgId)
    .maybeSingle();
  if (error) throw error;
  return data?.timezone ?? DEFAULT_ORG_TIMEZONE;
}
