// Builder helper bersama untuk test data-layer Fase 8.
// CONCERN-1: calls[m] adalah ARRAY of arg-arrays (rekam tiap pemanggilan, bukan timpa) —
//   agar .eq() dua kali (entity_type + entity_id) bisa diassert lengkap.
// CONCERN-2: builder menyediakan select/eq/is/in/order/limit/range/upsert + then + single/maybeSingle.

export type SupaResult = { data: unknown; error: unknown };

export type QueryThenable = {
  builder: Record<string, jest.Mock> & { then: unknown };
  calls: Record<string, unknown[][]>;
};

/** Builder chainable yang resolve via .then() (untuk select().eq().order()...). */
export function makeQueryThenable(result: SupaResult): QueryThenable {
  const calls: Record<string, unknown[][]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'range', 'upsert', 'insert']) {
    builder[m] = jest.fn((...args: unknown[]) => {
      (calls[m] ??= []).push(args);
      return builder;
    });
  }
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { builder: builder as QueryThenable['builder'], calls };
}

/** Builder yang diakhiri .single() / .maybeSingle(). */
export function makeSingleBuilder(result: SupaResult): QueryThenable {
  const calls: Record<string, unknown[][]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'range', 'upsert', 'insert']) {
    builder[m] = jest.fn((...args: unknown[]) => {
      (calls[m] ??= []).push(args);
      return builder;
    });
  }
  builder.single = jest.fn(() => Promise.resolve(result));
  builder.maybeSingle = jest.fn(() => Promise.resolve(result));
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { builder: builder as QueryThenable['builder'], calls };
}

/** Cari apakah salah satu pemanggilan method cocok dengan predikat args. */
export function someCall(calls: Record<string, unknown[][]>, method: string, pred: (args: unknown[]) => boolean): boolean {
  return (calls[method] ?? []).some(pred);
}
