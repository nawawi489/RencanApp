// Fase 8 data layer — Video Brief + Brief Understanding.
const mockFrom = jest.fn();

jest.mock('../supabase', () => ({
  supabase: { from: (...a: unknown[]) => mockFrom(...a) },
}));

// eslint-disable-next-line import/first
import { makeQueryThenable, makeSingleBuilder, someCall } from '@/test-support/fase8-builders';
// eslint-disable-next-line import/first
import { getVideoBrief, listVideoBriefs, markBriefUnderstood } from '../video-briefs';

beforeEach(() => {
  mockFrom.mockReset();
});

it('[34] listVideoBriefs eq action_plan_id return array', async () => {
  const { builder, calls } = makeQueryThenable({ data: [{ id: 'v1' }], error: null });
  mockFrom.mockReturnValue(builder);
  const rows = await listVideoBriefs('i1');
  expect(mockFrom).toHaveBeenCalledWith('video_briefs');
  expect(someCall(calls, 'eq', (a) => a[0] === 'action_plan_id' && a[1] === 'i1')).toBe(true);
  expect(rows).toEqual([{ id: 'v1' }]);
});

it('[34b] getVideoBrief eq action_plan_id maybeSingle', async () => {
  const { builder } = makeSingleBuilder({ data: { id: 'v1' }, error: null });
  mockFrom.mockReturnValue(builder);
  const v = await getVideoBrief('i1');
  expect(builder.maybeSingle).toHaveBeenCalled();
  expect(v).toEqual({ id: 'v1' });
});

it('[35] markBriefUnderstood upsert ke brief_understanding_records dengan onConflict', async () => {
  const { builder, calls } = makeQueryThenable({ data: null, error: null });
  mockFrom.mockReturnValue(builder);
  await markBriefUnderstood({ videoBriefId: 'v1', organizationId: 'o1', userId: 'u1', isUnderstood: true });
  expect(mockFrom).toHaveBeenCalledWith('brief_understanding_records');
  expect(builder.upsert).toHaveBeenCalled();
  // memilih jalur from().upsert() (BUKAN rpc) — kunci jalur implementasi.
  const upsertArgs = calls.upsert![0];
  expect((upsertArgs[0] as Record<string, unknown>).video_brief_id).toBe('v1');
  expect((upsertArgs[1] as Record<string, unknown>).onConflict).toBe('video_brief_id,user_id');
});

it('[35b] markBriefUnderstood propagasi error', async () => {
  const { builder } = makeQueryThenable({ data: null, error: { message: 'denied' } });
  mockFrom.mockReturnValue(builder);
  await expect(
    markBriefUnderstood({ videoBriefId: 'v1', organizationId: 'o1', userId: 'u1' }),
  ).rejects.toEqual({ message: 'denied' });
});
