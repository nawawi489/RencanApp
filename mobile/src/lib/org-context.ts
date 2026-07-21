// Preamble tunggal untuk semua create-* card (INSERT ber-RLS): getUser → profiles.organization_id.
// Sebelumnya diduplikasi di goals/strategies/action-plans/development-areas/problem-statements/cards
// (createActionPlan & createTask). Ponytail: satu helper, satu shape kesalahan.
import { supabase } from './supabase';

/** Fetch org context for the currently authenticated user. Throws if unauthenticated
 * or if the profile has no organization_id set. */
export async function getOrgContext(): Promise<{ uid: string; orgId: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Not authenticated');
  // maybeSingle, BUKAN single: profil tanpa baris (mis. baru dibuat/terhapus) → null tanpa 406,
  // jatuh ke 'Organization not found' alih-alih error PostgREST yang membingungkan.
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', uid)
    .maybeSingle();
  if (!profile?.organization_id) throw new Error('Organization not found');
  return { uid, orgId: profile.organization_id };
}
