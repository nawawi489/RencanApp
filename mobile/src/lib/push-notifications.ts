// Data layer push notifications — Fase 1 (6 tipe eksekusi/review).
// Token registry via RPC (bukan INSERT langsung — RLS + audit).
// getPushCopy = spec §7 copy map; fallback fail-closed untuk tipe tak dikenal.
// Module-level token store: diset oleh usePushRegistration, dibaca oleh auth signOut.
import type { NotificationType } from './notifications';
import { supabase } from './supabase';

let _currentPushToken: string | null = null;

export function setCurrentPushToken(token: string | null): void {
  _currentPushToken = token;
}

export function getCurrentPushToken(): string | null {
  return _currentPushToken;
}

export const PUSH_WORTHY_TYPES = [
  'review_request',
  'approved',
  'rejected',
  'deadline_reminder',
  'repeat_due',
  'instance_missed',
] as const satisfies readonly NotificationType[];

export type PushWorthyType = (typeof PUSH_WORTHY_TYPES)[number];

export function isPushWorthy(type: string): type is PushWorthyType {
  return (PUSH_WORTHY_TYPES as readonly string[]).includes(type);
}

const PUSH_COPY: Record<PushWorthyType, { title: string; body: string }> = {
  review_request:    { title: 'Permintaan Review',      body: 'Ada Action Plan yang meminta persetujuan Anda.' },
  approved:          { title: 'Action Plan Disetujui',  body: 'Action Plan Anda telah disetujui.' },
  rejected:          { title: 'Perlu Revisi',           body: 'Reviewer meminta revisi pada Action Plan Anda.' },
  deadline_reminder: { title: 'Deadline Mendekat',      body: 'Deadline Action Plan Anda semakin dekat.' },
  repeat_due:        { title: 'Tugas Rutin Jatuh Tempo', body: 'Ada tugas rutin yang perlu diselesaikan.' },
  instance_missed:   { title: 'Tugas Terlewat',         body: 'Ada tugas rutin yang terlewat.' },
};

const PUSH_COPY_FALLBACK = { title: 'Pembaruan baru', body: 'Ada pembaruan yang perlu ditinjau.' };

export function getPushCopy(type: string): { title: string; body: string } {
  if (isPushWorthy(type)) return PUSH_COPY[type];
  return PUSH_COPY_FALLBACK;
}

export async function registerPushToken(
  expoToken: string,
  platform: string,
  deviceId?: string,
): Promise<void> {
  // Cast: RPCs ini belum ada di database.types.ts — migrasi push_tokens pending regen.
  const { error } = await (supabase as any).rpc('register_push_token', {
    p_expo_token: expoToken,
    p_platform: platform,
    p_device_id: deviceId ?? null,
  });
  if (error) throw new Error((error as { message: string }).message);
}

export async function unregisterPushToken(expoToken: string): Promise<void> {
  const { error } = await (supabase as any).rpc('unregister_push_token', {
    p_expo_token: expoToken,
  });
  if (error) throw new Error((error as { message: string }).message);
}
