// Item — choke point global React Query: SETIAP query/mutation yang gagal harus meneruskan
// detail teknis ke logger (telemetry) meski layar tidak merender error-nya. Tanpa ini kegagalan
// bisa senyap total di produksi. Handler global TIDAK menampilkan apa pun ke user (WSA-18);
// pesan user tetap tanggung jawab layar via reportError/alertFriendlyError/ErrorState.
import { MutationObserver } from '@tanstack/react-query';

import { consoleLogger, setLogger } from '../logger';
import { createQueryClient } from '../query-client';

describe('createQueryClient — choke point error global', () => {
  afterEach(() => setLogger(consoleLogger));

  it('meneruskan error QUERY yang gagal ke logger (tidak ada kegagalan senyap)', async () => {
    const active = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    setLogger(active);
    const qc = createQueryClient();
    const boom = new Error('query boom');
    await qc
      .fetchQuery({ queryKey: ['x'], queryFn: () => Promise.reject(boom), retry: false })
      .catch(() => {});
    expect(active.error).toHaveBeenCalled();
    // objek error ASLI diteruskan (bukan hanya string), agar stack tetap utuh di telemetry.
    expect(active.error.mock.calls.some((c) => c.includes(boom))).toBe(true);
  });

  it('meneruskan error MUTATION yang gagal ke logger (tidak ada kegagalan senyap)', async () => {
    const active = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    setLogger(active);
    const qc = createQueryClient();
    const boom = new Error('mutation boom');
    // Lewat MutationObserver (jalur nyata useMutation) agar MutationCache.onError terpicu.
    const observer = new MutationObserver(qc, {
      mutationFn: () => Promise.reject(boom),
      retry: false,
    });
    await observer.mutate().catch(() => {});
    expect(active.error).toHaveBeenCalled();
    expect(active.error.mock.calls.some((c) => c.includes(boom))).toBe(true);
  });
});
