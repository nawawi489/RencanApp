// Deno unit tests untuk drainOnce — pola seam mock backend + transport (tanpa DB/network).
//
// Jalankan:
//   deno test --allow-env --allow-net supabase/functions/push-fanout/index.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  drainOnce,
  type DeliveryRow,
  type DrainerBackend,
  type ExpoPushMessage,
  type ExpoPushTicket,
  type ExpoTransport,
} from './index.ts';

// ─── Mock helpers ──────────────────────────────────────────────────────────

interface BackendCalls {
  claim: number[];
  markSent: Array<{ id: string; ticketId: string | undefined }>;
  markFailed: Array<{ id: string; error: string }>;
  bumpBackoff: Array<{ id: string; error: string }>;
  revokeToken: string[];
}

function makeBackend(rows: DeliveryRow[]): { backend: DrainerBackend; calls: BackendCalls } {
  const calls: BackendCalls = {
    claim: [],
    markSent: [],
    markFailed: [],
    bumpBackoff: [],
    revokeToken: [],
  };
  const backend: DrainerBackend = {
    async claim(limit) { calls.claim.push(limit); return rows; },
    async markSent(id, ticketId) { calls.markSent.push({ id, ticketId }); },
    async markFailedPermanent(id, error) { calls.markFailed.push({ id, error }); },
    async bumpBackoff(id, error) { calls.bumpBackoff.push({ id, error }); },
    async revokeToken(tokenId) { calls.revokeToken.push(tokenId); },
  };
  return { backend, calls };
}

function makeTransport(tickets: ExpoPushTicket[] | Error): {
  transport: ExpoTransport;
  sent: ExpoPushMessage[][];
} {
  const sent: ExpoPushMessage[][] = [];
  const transport: ExpoTransport = {
    async sendBatch(messages) {
      sent.push(messages);
      if (tickets instanceof Error) throw tickets;
      return tickets;
    },
  };
  return { transport, sent };
}

function mkRow(delivery_id: string, expo_token: string, attempts = 0): DeliveryRow {
  return {
    delivery_id,
    notification_id: `notif-${delivery_id}`,
    push_token_id: `token-${delivery_id}`,
    expo_token,
    platform: 'ios',
    title: 'Perlu direview',
    body: 'Ada bukti menunggu review Anda.',
    type: 'review_request',
    entity_type: 'action_plan',
    entity_id: `ap-${delivery_id}`,
    attempts,
  };
}

// ─── Test cases ────────────────────────────────────────────────────────────

Deno.test('[PN-DR-1] all tickets ok → semua row markSent, zero bump', async () => {
  const rows = [mkRow('d1', 'ExponentPushToken[a]'), mkRow('d2', 'ExponentPushToken[b]')];
  const { backend, calls } = makeBackend(rows);
  const { transport, sent } = makeTransport([
    { status: 'ok', id: 'ticket-a' },
    { status: 'ok', id: 'ticket-b' },
  ]);

  const result = await drainOnce({ backend, transport });

  assertEquals(result, { claimed: 2, sent: 2, transient: 0, permanent: 0, transportFailed: false });
  assertEquals(calls.markSent.length, 2);
  assertEquals(calls.markSent[0], { id: 'd1', ticketId: 'ticket-a' });
  assertEquals(calls.bumpBackoff.length, 0);
  assertEquals(calls.revokeToken.length, 0);
  assertEquals(sent[0][0].to, 'ExponentPushToken[a]');
  // Data payload benar (deep-link).
  assertEquals(sent[0][0].data.notification_id, 'notif-d1');
  assertEquals(sent[0][0].data.entity_type, 'action_plan');
});

Deno.test('[PN-DR-2] DeviceNotRegistered → revokeToken + markFailedPermanent (bukan bump)', async () => {
  const rows = [mkRow('d1', 'ExponentPushToken[stale]')];
  const { backend, calls } = makeBackend(rows);
  const { transport } = makeTransport([
    { status: 'error', message: 'device gone', details: { error: 'DeviceNotRegistered' } },
  ]);

  const result = await drainOnce({ backend, transport });

  assertEquals(result.permanent, 1);
  assertEquals(result.sent, 0);
  assertEquals(result.transient, 0);
  assertEquals(calls.revokeToken, ['token-d1']);
  assertEquals(calls.markFailed.length, 1);
  assertEquals(calls.markFailed[0].error, 'permanent:DeviceNotRegistered');
  assertEquals(calls.bumpBackoff.length, 0); // Tidak backoff — sudah permanent.
});

Deno.test('[PN-DR-3] transient error (MessageRateExceeded) → bumpBackoff, no revoke', async () => {
  const rows = [mkRow('d1', 'ExponentPushToken[a]')];
  const { backend, calls } = makeBackend(rows);
  const { transport } = makeTransport([
    { status: 'error', message: 'rate', details: { error: 'MessageRateExceeded' } },
  ]);

  const result = await drainOnce({ backend, transport });

  assertEquals(result.transient, 1);
  assertEquals(result.permanent, 0);
  assertEquals(calls.bumpBackoff.length, 1);
  assertEquals(calls.bumpBackoff[0], { id: 'd1', error: 'MessageRateExceeded' });
  assertEquals(calls.revokeToken.length, 0);
});

Deno.test('[PN-DR-4] transport throws → seluruh batch di-bump, transportFailed=true', async () => {
  const rows = [mkRow('d1', 'ExponentPushToken[a]'), mkRow('d2', 'ExponentPushToken[b]')];
  const { backend, calls } = makeBackend(rows);
  const { transport } = makeTransport(new Error('Expo 503'));

  const result = await drainOnce({ backend, transport });

  assertEquals(result.transportFailed, true);
  assertEquals(result.claimed, 2);
  assertEquals(result.transient, 2);
  assertEquals(result.sent, 0);
  assertEquals(calls.bumpBackoff.length, 2);
  assertEquals(calls.bumpBackoff[0].error, 'transport_failed');
});

Deno.test('[PN-DR-5] empty claim → early return, transport tidak dipanggil', async () => {
  const { backend, calls } = makeBackend([]);
  const { transport, sent } = makeTransport([]);

  const result = await drainOnce({ backend, transport });

  assertEquals(result, { claimed: 0, sent: 0, transient: 0, permanent: 0, transportFailed: false });
  assertEquals(sent.length, 0);
  assertEquals(calls.claim, [100]); // Default batchLimit.
});

Deno.test('[PN-DR-6] claim throws → return zeros, transport tidak dipanggil (fail-safe)', async () => {
  const backend: DrainerBackend = {
    async claim() { throw new Error('DB down'); },
    async markSent() {}, async markFailedPermanent() {},
    async bumpBackoff() {}, async revokeToken() {},
  };
  const { transport, sent } = makeTransport([{ status: 'ok', id: 't' }]);

  const result = await drainOnce({ backend, transport });

  assertEquals(result.claimed, 0);
  assertEquals(sent.length, 0);
});

Deno.test('[PN-DR-7] batchLimit override diteruskan ke claim', async () => {
  const { backend, calls } = makeBackend([]);
  const { transport } = makeTransport([]);

  await drainOnce({ backend, transport, batchLimit: 50 });
  assertEquals(calls.claim, [50]);
});

Deno.test('[PN-DR-8] campur ok + permanent + transient dalam satu batch', async () => {
  const rows = [
    mkRow('d1', 'ExponentPushToken[ok]'),
    mkRow('d2', 'ExponentPushToken[dead]'),
    mkRow('d3', 'ExponentPushToken[rate]'),
  ];
  const { backend, calls } = makeBackend(rows);
  const { transport } = makeTransport([
    { status: 'ok', id: 't1' },
    { status: 'error', details: { error: 'DeviceNotRegistered' } },
    { status: 'error', details: { error: 'MessageRateExceeded' } },
  ]);

  const result = await drainOnce({ backend, transport });

  assertEquals(result, { claimed: 3, sent: 1, transient: 1, permanent: 1, transportFailed: false });
  assertEquals(calls.markSent[0].id, 'd1');
  assertEquals(calls.revokeToken, ['token-d2']);
  assertEquals(calls.markFailed[0].id, 'd2');
  assertEquals(calls.bumpBackoff[0].id, 'd3');
});

Deno.test('[PN-DR-9] missing ticket (index out of bounds) → bumpBackoff transient', async () => {
  const rows = [mkRow('d1', 'ExponentPushToken[a]'), mkRow('d2', 'ExponentPushToken[b]')];
  const { backend, calls } = makeBackend(rows);
  // Expo returns 1 ticket for 2 messages (malformed response).
  const { transport } = makeTransport([{ status: 'ok', id: 't1' }]);

  const result = await drainOnce({ backend, transport });

  assertEquals(result.sent, 1);
  assertEquals(result.transient, 1);
  assertEquals(calls.bumpBackoff[0], { id: 'd2', error: 'missing_ticket' });
});
