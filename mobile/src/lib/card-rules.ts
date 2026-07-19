// Wave 4.1 — Reader + writer helper untuk card_completion_rules + card_guidance_contents.
// Fallback tier untuk guidance: (org, ct) > (NULL, ct) > glossary.ts static.
import { supabase } from './supabase';
import { glossaryFor, type GlossaryTopic } from './glossary';

export type CardTypeGated =
  | 'goal'
  | 'strategy'
  | 'initiative'
  | 'action_plan'
  | 'development_area'
  | 'problem_statement';

export type CardTypeGuided = CardTypeGated | 'task';

type CompletionRow = {
  organization_id: string | null;
  required_fields: unknown;
};

type GuidanceRow = {
  organization_id: string | null;
  title: string | null;
  body: string | null;
};

function pickOrgWins<T extends { organization_id: string | null }>(rows: T[] | null, orgId: string): T | undefined {
  if (!rows || rows.length === 0) return undefined;
  return rows.find((r) => r.organization_id === orgId) ?? rows.find((r) => r.organization_id === null);
}

export async function getCompletionRule(
  orgId: string,
  cardType: CardTypeGated,
): Promise<{ requiredFields: string[] }> {
  const { data, error } = await supabase
    .from('card_completion_rules')
    .select('organization_id, required_fields')
    .eq('card_type', cardType)
    .or(`organization_id.eq.${orgId},organization_id.is.null`)
    .order('organization_id', { nullsFirst: false });
  if (error) throw error;
  const row = pickOrgWins<CompletionRow>(data as CompletionRow[] | null, orgId);
  const rf = row?.required_fields;
  return { requiredFields: Array.isArray(rf) ? (rf as string[]) : [] };
}

export async function getGuidance(
  orgId: string,
  cardType: CardTypeGuided,
): Promise<{ title: string; body: string }> {
  try {
    const { data, error } = await supabase
      .from('card_guidance_contents')
      .select('organization_id, title, body')
      .eq('card_type', cardType)
      .or(`organization_id.eq.${orgId},organization_id.is.null`)
      .order('organization_id', { nullsFirst: false });
    if (error) throw error;
    const row = pickOrgWins<GuidanceRow>(data as GuidanceRow[] | null, orgId);
    if (row?.title && row?.body) return { title: row.title, body: row.body };
  } catch {
    // fall through to glossary fallback (last-line safety)
  }
  return glossaryFor(cardType as GlossaryTopic);
}

export async function upsertCompletionRule(
  cardType: CardTypeGated,
  requiredFields: string[],
  reason?: string,
): Promise<void> {
  // RPC baru (migration 0078); regen database.types.ts akan menghapus cast ini.
  // Double-cast via unknown karena RPC belum di generated types (FUT-5).
  const rpc = supabase.rpc as unknown as (name: string, args: unknown) => Promise<{ error: unknown }>;
  const { error } = await rpc('upsert_card_completion_rule', {
    p_card_type: cardType, p_required_fields: requiredFields, p_reason: reason ?? null,
  });
  if (error) throw error;
}

export async function upsertCardGuidance(
  cardType: CardTypeGuided,
  title: string,
  body: string,
  reason?: string,
): Promise<void> {
  const rpc = supabase.rpc as unknown as (name: string, args: unknown) => Promise<{ error: unknown }>;
  const { error } = await rpc('upsert_card_guidance', {
    p_card_type: cardType, p_title: title, p_body: body, p_reason: reason ?? null,
  });
  if (error) throw error;
}
