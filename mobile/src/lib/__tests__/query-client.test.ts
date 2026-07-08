import { MutationObserver } from '@tanstack/react-query';

import { _resetForTest, addTransport, type LogTransport } from '../logger';
import { createQueryClient } from '../query-client';

function mockTransport(): LogTransport & { write: jest.Mock } {
  return { name: 'mock', write: jest.fn() };
}

afterEach(() => _resetForTest());

describe('createQueryClient — choke point error global', () => {
  it('meneruskan error QUERY yang gagal ke transport (tidak ada kegagalan senyap)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const t = mockTransport();
    addTransport(t);
    const qc = createQueryClient();
    const boom = new Error('query boom');
    await qc
      .fetchQuery({ queryKey: ['x'], queryFn: () => Promise.reject(boom), retry: false })
      .catch(() => {});
    expect(t.write).toHaveBeenCalled();
    expect(t.write.mock.calls[0][0].namespace).toBe('ReactQuery');
    expect(t.write.mock.calls[0][0].level).toBe('error');
    const rawArgs = t.write.mock.calls[0][1] as unknown[];
    expect(rawArgs).toContain(boom);
    spy.mockRestore();
  });

  it('meneruskan error MUTATION yang gagal ke transport (tidak ada kegagalan senyap)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const t = mockTransport();
    addTransport(t);
    const qc = createQueryClient();
    const boom = new Error('mutation boom');
    const observer = new MutationObserver(qc, {
      mutationFn: () => Promise.reject(boom),
      retry: false,
    });
    await observer.mutate().catch(() => {});
    expect(t.write).toHaveBeenCalled();
    expect(t.write.mock.calls[0][0].namespace).toBe('ReactQuery');
    const rawArgs = t.write.mock.calls[0][1] as unknown[];
    expect(rawArgs).toContain(boom);
    spy.mockRestore();
  });
});
