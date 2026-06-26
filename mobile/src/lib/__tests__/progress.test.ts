// UI-G-001 — derivasi capaian header detail.
import {
  childrenSublabel,
  computeActionPlanProgress,
  ratioDoneOfChildren,
} from '../progress';

describe('ratioDoneOfChildren', () => {
  it('total 0 → 0% (kosong = belum mulai)', () => {
    expect(ratioDoneOfChildren([])).toBe(0);
  });

  it('archived dikecualikan dari pembilang & penyebut', () => {
    expect(
      ratioDoneOfChildren([
        { status: 'done' },
        { status: 'archived' },
        { status: 'active' },
      ]),
    ).toBe(50); // 1 done / 2 non-archived
  });

  it('semua non-done → 0%', () => {
    expect(ratioDoneOfChildren([{ status: 'draft' }, { status: 'active' }])).toBe(0);
  });

  it('semua non-archived done → 100%', () => {
    expect(
      ratioDoneOfChildren([{ status: 'done' }, { status: 'done' }, { status: 'archived' }]),
    ).toBe(100);
  });

  it('pembulatan ke int terdekat', () => {
    // 1/3 = 33.33… → 33
    expect(ratioDoneOfChildren([{ status: 'done' }, { status: 'active' }, { status: 'active' }])).toBe(33);
  });
});

describe('childrenSublabel', () => {
  it('total 0 → "Belum ada turunan"', () => {
    expect(childrenSublabel([])).toBe('Belum ada turunan');
  });
  it('mengabaikan archived dalam hitungan', () => {
    expect(
      childrenSublabel([
        { status: 'done' },
        { status: 'archived' },
        { status: 'active' },
        { status: 'done' },
      ]),
    ).toBe('2/3 selesai');
  });
});

describe('computeActionPlanProgress', () => {
  it('repeat → compliancePercent (null → 0)', () => {
    expect(
      computeActionPlanProgress({ status: 'in_progress', repeat: true, compliancePercent: 80 }),
    ).toBe(80);
    expect(
      computeActionPlanProgress({ status: 'draft', repeat: true, compliancePercent: null }),
    ).toBe(0);
  });

  it('one-time → status-based heuristik', () => {
    expect(
      computeActionPlanProgress({ status: 'draft', repeat: false, compliancePercent: null }),
    ).toBe(0);
    expect(
      computeActionPlanProgress({ status: 'in_progress', repeat: false, compliancePercent: null }),
    ).toBe(50);
    expect(
      computeActionPlanProgress({ status: 'done', repeat: false, compliancePercent: null }),
    ).toBe(100);
    expect(
      computeActionPlanProgress({ status: 'revision', repeat: false, compliancePercent: null }),
    ).toBe(30);
  });

  it('status tak dikenal → 0 (fail-open ringan, tidak menipu user)', () => {
    expect(
      computeActionPlanProgress({ status: 'mystery', repeat: false, compliancePercent: null }),
    ).toBe(0);
  });
});
