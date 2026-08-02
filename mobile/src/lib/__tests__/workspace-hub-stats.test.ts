// Mengunci konvensi rollup `deriveSpaceProgress` agar tetap sejajar dengan dua sumber:
//   (a) badan RPC `workspace_card_progress` cabang `goal_attainment` (aturan mean-nya), dan
//   (b) `treeOrbLabel`/`TreeOrbCell` di tree (kapan "Capaian" vs "Progress" vs '—').
// Kalau salah satu tes gagal, JANGAN longgarkan tesnya sebelum memastikan salah satu
// sumber itu memang berubah — angka lobby harus bisa direkonsiliasi dengan orb tree.
import { deriveSpaceProgress } from '../workspace-hub-stats';

type Item = { id: string; status: string };

/** Helper: bikin progressOf/measuredOf dari peta id → [progress, measured]. */
function lookups(map: Record<string, [number | null, boolean]>) {
  return {
    progressOf: (id: string) => map[id]?.[0] ?? null,
    measuredOf: (id: string) => map[id]?.[1] ?? false,
  };
}

describe('deriveSpaceProgress — jalur CAPAIAN (ada kartu terukur)', () => {
  it('[rollup·1] mean TAK TERTIMBANG anak terukur — cocok data nyata mean(0,13,0)=4', () => {
    const items: Item[] = [
      { id: 'g1', status: 'active' },
      { id: 'g2', status: 'active' },
      { id: 'g3', status: 'active' },
    ];
    const { progressOf, measuredOf } = lookups({
      g1: [0, true],
      g2: [13, true],
      g3: [0, true],
    });
    expect(deriveSpaceProgress(items, progressOf, measuredOf)).toEqual({
      value: 4,
      label: 'Capaian',
      measuredCount: 3,
      population: 3,
    });
  });

  it('[rollup·2] anak TAK-terukur DIKELUARKAN dari mean capaian, bukan dihitung 0', () => {
    const items: Item[] = [
      { id: 'g1', status: 'active' },
      { id: 'g2', status: 'active' },
    ];
    const { progressOf, measuredOf } = lookups({
      g1: [80, true],
      g2: [10, false], // status-rollup — beda semantik, tak boleh dicampur
    });
    // Kalau keliru ikut dirata-rata → 45. Itu bug yang tes ini jaga.
    const res = deriveSpaceProgress(items, progressOf, measuredOf);
    expect(res.value).toBe(80);
    expect(res.label).toBe('Capaian');
  });

  it('[rollup·3] populasi hanya active/done — draft & archived dibuang', () => {
    const items: Item[] = [
      { id: 'g1', status: 'active' },
      { id: 'g2', status: 'done' },
      { id: 'g3', status: 'draft' },
      { id: 'g4', status: 'archived' },
    ];
    const { progressOf, measuredOf } = lookups({
      g1: [100, true],
      g2: [50, true],
      g3: [0, true],
      g4: [0, true],
    });
    const res = deriveSpaceProgress(items, progressOf, measuredOf);
    expect(res.value).toBe(75); // mean(100,50)
    expect(res.population).toBe(2);
  });

  it('[rollup·4] capaian 0 yang TERUKUR tetap 0, bukan null', () => {
    const items: Item[] = [{ id: 'g1', status: 'active' }];
    const { progressOf, measuredOf } = lookups({ g1: [0, true] });
    expect(deriveSpaceProgress(items, progressOf, measuredOf).value).toBe(0);
  });
});

describe('deriveSpaceProgress — jalur PROGRESS (nol kartu terukur, mis. Development)', () => {
  it('[rollup·5] nol terukur → mean SEMUA kartu, label "Progress" (bukan "—")', () => {
    // Cermin TreeOrbCell: kartu tak-terukur tetap merender orb berlabel "Progress";
    // '—' HANYA untuk value null. Development selalu lewat jalur ini.
    const items: Item[] = [
      { id: 'd1', status: 'active' },
      { id: 'd2', status: 'active' },
    ];
    const { progressOf, measuredOf } = lookups({
      d1: [40, false],
      d2: [60, false],
    });
    expect(deriveSpaceProgress(items, progressOf, measuredOf)).toEqual({
      value: 50,
      label: 'Progress',
      measuredCount: 0,
      population: 2,
    });
  });

  it('[rollup·6] semua progress 0 tapi ada datanya → 0 + "Progress", BUKAN null', () => {
    const items: Item[] = [{ id: 'd1', status: 'active' }];
    const { progressOf, measuredOf } = lookups({ d1: [0, false] });
    const res = deriveSpaceProgress(items, progressOf, measuredOf);
    expect(res.value).toBe(0);
    expect(res.label).toBe('Progress');
  });
});

describe('deriveSpaceProgress — jalur NULL (tak ada data)', () => {
  it('[rollup·7] tanpa kartu sama sekali → null', () => {
    expect(deriveSpaceProgress([], () => null, () => false).value).toBeNull();
  });

  it('[rollup·8] semua progress null (gagal fetch / RLS) → null', () => {
    const items: Item[] = [{ id: 'g1', status: 'active' }];
    const { progressOf, measuredOf } = lookups({ g1: [null, false] });
    expect(deriveSpaceProgress(items, progressOf, measuredOf).value).toBeNull();
  });

  it('[rollup·9] progress null di antara yang terukur tak mencemari mean', () => {
    const items: Item[] = [
      { id: 'g1', status: 'active' },
      { id: 'g2', status: 'active' },
    ];
    const { progressOf, measuredOf } = lookups({
      g1: [60, true],
      g2: [null, true], // measured tapi belum ter-fetch
    });
    expect(deriveSpaceProgress(items, progressOf, measuredOf).value).toBe(60);
  });

  it('[rollup·10] semua kartu draft → populasi kosong → null', () => {
    const items: Item[] = [{ id: 'g1', status: 'draft' }];
    const { progressOf, measuredOf } = lookups({ g1: [90, true] });
    const res = deriveSpaceProgress(items, progressOf, measuredOf);
    expect(res.value).toBeNull();
    expect(res.population).toBe(0);
  });
});
