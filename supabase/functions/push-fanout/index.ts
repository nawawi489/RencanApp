// Edge Function: push-fanout — drainer outbox → Expo Push API.
//
// Dipanggil pg_cron (SERVICE_ROLE) tiap 1 menit; juga bisa dipanggil manual utk testing.
// Alur: RPC claim_push_deliveries(100) → POST batch ke Expo → klasifikasi per-ticket
// (ok/DeviceNotRegistered/transient) → update push_deliveries + revoke token bila permanent.
//
// Seam pattern: drainOnce() menerima {backend, transport, log} — memungkinkan test dengan
// mock tanpa network/DB. Real implementasi ada di Deno.serve entry.
//
// verify_jwt=false di config.toml — auth via SERVICE_ROLE header dari pg_cron.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DeliveryRow {
  delivery_id: string;
  notification_id: string;
  push_token_id: string;
  expo_token: string;
  platform: string;
  title: string;
  body: string;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  attempts: number;
}

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound?: 'default';
  priority?: 'high';
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface ExpoTransport {
  sendBatch(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
}

export interface DrainerBackend {
  claim(limit: number): Promise<DeliveryRow[]>;
  markSent(deliveryId: string, ticketId: string | undefined): Promise<void>;
  markFailedPermanent(deliveryId: string, error: string): Promise<void>;
  bumpBackoff(deliveryId: string, error: string): Promise<void>;
  revokeToken(tokenId: string): Promise<void>;
}

export type LogFn = (level: 'info' | 'warn' | 'error', event: string, extra?: Record<string, unknown>) => void;

export interface DrainResult {
  claimed: number;
  sent: number;
  transient: number;
  permanent: number;
  transportFailed: boolean;
}

// ─── Klasifikasi error Expo ────────────────────────────────────────────────

// Permanent — token tidak bisa recover; revoke.
const PERMANENT_ERRORS = new Set(['DeviceNotRegistered', 'InvalidCredentials']);

function classifyTicket(t: ExpoPushTicket): 'ok' | 'permanent' | 'transient' {
  if (t.status === 'ok') return 'ok';
  const err = t.details?.error;
  if (err && PERMANENT_ERRORS.has(err)) return 'permanent';
  return 'transient';
}

// ─── Drainer core (testable) ───────────────────────────────────────────────

export async function drainOnce(input: {
  backend: DrainerBackend;
  transport: ExpoTransport;
  batchLimit?: number;
  log?: LogFn;
}): Promise<DrainResult> {
  const { backend, transport, batchLimit = 100, log = () => {} } = input;
  const requestId = crypto.randomUUID();
  log('info', 'drain_start', { requestId, batchLimit });

  let rows: DeliveryRow[];
  try {
    rows = await backend.claim(batchLimit);
  } catch (err) {
    log('error', 'claim_failed', { requestId, err: String(err) });
    return { claimed: 0, sent: 0, transient: 0, permanent: 0, transportFailed: false };
  }
  if (rows.length === 0) {
    return { claimed: 0, sent: 0, transient: 0, permanent: 0, transportFailed: false };
  }

  const messages: ExpoPushMessage[] = rows.map((r) => ({
    to: r.expo_token,
    title: r.title,
    body: r.body,
    data: {
      notification_id: r.notification_id,
      type: r.type,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
    },
    sound: 'default',
    priority: 'high',
  }));

  let tickets: ExpoPushTicket[];
  try {
    tickets = await transport.sendBatch(messages);
  } catch (err) {
    // Transport-level failure: seluruh batch di-backoff.
    log('error', 'transport_failed', { requestId, count: rows.length, err: String(err) });
    for (const r of rows) {
      await backend.bumpBackoff(r.delivery_id, 'transport_failed');
    }
    return { claimed: rows.length, sent: 0, transient: rows.length, permanent: 0, transportFailed: true };
  }

  let sent = 0, transient = 0, permanent = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const ticket = tickets[i];
    if (!ticket) {
      await backend.bumpBackoff(row.delivery_id, 'missing_ticket');
      transient++;
      continue;
    }
    const kind = classifyTicket(ticket);
    if (kind === 'ok') {
      await backend.markSent(row.delivery_id, ticket.id);
      sent++;
    } else if (kind === 'permanent') {
      // Revoke token dulu supaya round berikutnya tidak materialize ulang.
      await backend.revokeToken(row.push_token_id);
      await backend.markFailedPermanent(
        row.delivery_id,
        `permanent:${ticket.details?.error ?? 'unknown'}`,
      );
      permanent++;
    } else {
      await backend.bumpBackoff(
        row.delivery_id,
        ticket.details?.error ?? ticket.message ?? 'transient',
      );
      transient++;
    }
  }

  log('info', 'drain_done', { requestId, claimed: rows.length, sent, transient, permanent });
  return { claimed: rows.length, sent, transient, permanent, transportFailed: false };
}

// ─── Real backend (Supabase) ───────────────────────────────────────────────

export function createSupabaseBackend(client: SupabaseClient): DrainerBackend {
  return {
    async claim(limit) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (client as any).rpc('claim_push_deliveries', { p_limit: limit });
      if (error) throw new Error(error.message);
      return (data ?? []) as DeliveryRow[];
    },
    async markSent(deliveryId, ticketId) {
      const { error } = await client
        .from('push_deliveries')
        .update({ status: 'sent', provider_ticket_id: ticketId ?? null, updated_at: new Date().toISOString() })
        .eq('id', deliveryId);
      if (error) throw new Error(error.message);
    },
    async markFailedPermanent(deliveryId, err) {
      const { error } = await client
        .from('push_deliveries')
        .update({ status: 'failed', error: err, updated_at: new Date().toISOString() })
        .eq('id', deliveryId);
      if (error) throw new Error(error.message);
    },
    async bumpBackoff(deliveryId, err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (client as any).rpc('bump_push_delivery_backoff', {
        p_id: deliveryId,
        p_error: err,
      });
      if (error) throw new Error(error.message);
    },
    async revokeToken(tokenId) {
      const { error } = await client
        .from('push_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', tokenId);
      if (error) throw new Error(error.message);
    },
  };
}

// ─── Real transport (Expo Push API) ────────────────────────────────────────

export const expoTransport: ExpoTransport = {
  async sendBatch(messages) {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      throw new Error(`Expo ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as { data?: ExpoPushTicket[] };
    return json.data ?? [];
  },
};

// ─── Deno.serve entry ──────────────────────────────────────────────────────

if (import.meta.main) {
  Deno.serve(async (req) => {
    const auth = req.headers.get('Authorization');
    const expected = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;
    if (auth !== expected) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    const log: LogFn = (level, event, extra) =>
      console.log(JSON.stringify({ level, event, fn: 'push-fanout', ...extra }));

    const result = await drainOnce({
      backend: createSupabaseBackend(supabase),
      transport: expoTransport,
      log,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}
