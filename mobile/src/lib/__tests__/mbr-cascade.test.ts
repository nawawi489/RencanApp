// BL-04 — pemetaan cascade MBR + gerbang mode.
// Dua hal yang dikunci di sini: (1) ARAH pemetaan (tombol yang dijaga milik CUCU, bukan induk),
// (2) hanya mode `blokir_akses_turunan` yang menahan tombol.
import {
  MBR_CASCADE_TARGETS,
  isMbrCascadeBlocked,
  type MbrCascadeTarget,
} from '../mbr-cascade';
import type { CardType, EnforcementMode, MbrCompliance } from '../settings-mbr';

/**
 * Hierarki kartu yang BENAR menurut penamaan sekarang (pasca 0045/0046), ditulis ulang di test
 * secara independen dari modul yang diuji. Kalau pemetaan produksi tergeser satu tingkat — jebakan
 * persis yang membuat rename V1.8.3 berbahaya — perbandingan di bawah merah.
 */
const CHILD_EDGES: readonly (readonly [CardType, CardType])[] = [
  ['goal', 'strategy'],
  ['strategy', 'initiative'],
  ['initiative', 'action_plan'],
  ['action_plan', 'task'],
  ['development_area', 'problem_statement'],
  ['problem_statement', 'action_plan'],
];

const isChildOf = (parent: CardType, child: CardType) =>
  CHILD_EDGES.some(([p, c]) => p === parent && c === child);

function complianceOf(mode: EnforcementMode, compliant: boolean): MbrCompliance {
  return {
    child_card_type: 'initiative',
    child_count: compliant ? 3 : 1,
    min_count: 3,
    enforcement_mode: mode,
    is_compliant: compliant,
  };
}

describe('MBR_CASCADE_TARGETS — arah pemetaan', () => {
  it('[BL-04·map·1] setiap entri: kartu ber-tombol = anak dari induk, kartu yang dibuat = cucunya', () => {
    for (const t of MBR_CASCADE_TARGETS) {
      expect(isChildOf(t.complianceParentType, t.guardedCardType)).toBe(true);
      expect(isChildOf(t.guardedCardType, t.createdCardType)).toBe(true);
      // Cascade satu tingkat: tombol yang dijaga TIDAK boleh yang membuat anak langsung si induk.
      expect(t.createdCardType).not.toBe(t.guardedCardType);
    }
  });

  it('[BL-04·map·2] nol alias legacy — `kpi_area` tak boleh muncul di pemetaan mana pun', () => {
    const values = MBR_CASCADE_TARGETS.flatMap((t) => [
      t.complianceParentType,
      t.guardedCardType,
      t.createdCardType,
    ]);
    expect(values).not.toContain('kpi_area');
  });

  it('[BL-04·map·3] pemetaan persis 5 aturan ber-sasaran (action_plan→task nihil sasaran: Tugas = leaf)', () => {
    const actual = MBR_CASCADE_TARGETS.map(
      (t) => `${t.complianceParentType}>${t.guardedCardType}>${t.createdCardType}`,
    ).sort();
    expect(actual).toEqual(
      [
        'goal>strategy>initiative',
        'strategy>initiative>action_plan',
        'initiative>action_plan>task',
        'development_area>problem_statement>action_plan',
        'problem_statement>action_plan>task',
      ].sort(),
    );
  });

  it('[BL-04·map·4] tiap induk hanya sekali — nol aturan ganda yang saling menimpa', () => {
    const parents = MBR_CASCADE_TARGETS.map((t: MbrCascadeTarget) => t.complianceParentType);
    expect(new Set(parents).size).toBe(parents.length);
  });
});

describe('isMbrCascadeBlocked — gerbang mode', () => {
  it('[BL-04·mode·1] blokir_akses_turunan + belum patuh → tertahan', () => {
    expect(isMbrCascadeBlocked(complianceOf('blokir_akses_turunan', false))).toBe(true);
  });

  it('[BL-04·mode·2] blokir_akses_turunan + sudah patuh → lolos', () => {
    expect(isMbrCascadeBlocked(complianceOf('blokir_akses_turunan', true))).toBe(false);
  });

  // Regresi arah-balik: sebelum BL-04 guard hanya melihat is_compliant, sehingga hanya_peringatan
  // & blokir_aktivasi ikut menahan tombol tambah — perilaku yang bukan miliknya.
  it.each<EnforcementMode>(['nonaktif', 'hanya_peringatan', 'blokir_aktivasi'])(
    '[BL-04·mode·3] mode %s TIDAK menahan tombol walau belum patuh',
    (mode) => {
      expect(isMbrCascadeBlocked(complianceOf(mode, false))).toBe(false);
    },
  );

  it('[BL-04·mode·4] compliance belum ter-fetch → fail-open', () => {
    expect(isMbrCascadeBlocked(undefined)).toBe(false);
  });
});
