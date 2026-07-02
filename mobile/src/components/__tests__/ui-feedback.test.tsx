// Komponen fondasi: EmptyState v2, ErrorState, SkeletonList, ScoreBadge, Avatar.
// Render RN pertama (cold transform react-native-css) bisa lambat → longgarkan timeout.
import { render, screen } from '@testing-library/react-native';
import { Avatar, EmptyState, ErrorState, IconTile, ProgressOrb, ScoreBadge, ScoreBreakdown, ScoreSparkline, SkeletonList, orbToneFor } from '../ui';

jest.setTimeout(30000);

describe('IconTile (UI-G-011)', () => {
  it('me-render ikon dan disembunyikan dari a11y (label teks pendamping = sumber makna, DESIGN §4)', async () => {
    await render(<IconTile icon="people-outline" tone="info" />);
    // Ikon Ionicons ter-render (satu node) tapi tile tidak mengekspos label a11y sendiri.
    expect(screen.queryByLabelText('people-outline')).toBeNull();
    expect(screen.root).toBeTruthy();
  });
});

describe('EmptyState', () => {
  it('menampilkan title, description, dan aksi opsional', async () => {
    const onPress = jest.fn();
    await render(
      <EmptyState
        title="Tidak ada pelanggaran"
        description="Semua card rapi."
        tone="success"
        action={{ label: 'Lihat log', onPress }}
      />,
    );
    expect(screen.getByText('Tidak ada pelanggaran')).toBeTruthy();
    expect(screen.getByText('Semua card rapi.')).toBeTruthy();
    expect(screen.getByText('Lihat log')).toBeTruthy();
  });

  it('backward-compatible: hanya title + description', async () => {
    await render(<EmptyState title="Kosong" description="Belum ada data." />);
    expect(screen.getByText('Kosong')).toBeTruthy();
  });
});

describe('ErrorState', () => {
  it('punya role alert dan tombol retry', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Coba lagi')).toBeTruthy();
  });
});

describe('SkeletonList', () => {
  it('aksesibel sebagai "Memuat…" (busy), bukan konten kosong', async () => {
    await render(<SkeletonList count={2} />);
    expect(screen.getByLabelText('Memuat…')).toBeTruthy();
  });
});

describe('ScoreBadge', () => {
  it('memasangkan warna dengan label teks (a11y)', async () => {
    await render(<ScoreBadge score={68} />);
    expect(screen.getByText('Score 68 · Perlu perhatian')).toBeTruthy();
  });
  it('skor tinggi → On track', async () => {
    await render(<ScoreBadge score={86} />);
    expect(screen.getByText('Score 86 · On track')).toBeTruthy();
  });
});

describe('ScoreBreakdown (Fase 7)', () => {
  it('render label + persen tanpa label bobot', async () => {
    await render(
      <ScoreBreakdown
        metrics={[
          { label: 'Action Plan Completion', value: 80 },
          { label: 'Repeat Compliance', value: 65 },
        ]}
      />,
    );
    expect(screen.getByText('Action Plan Completion')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
    expect(screen.getByText('Repeat Compliance')).toBeTruthy();
    expect(screen.getByText('65%')).toBeTruthy();
  });

  it('clamp di luar 0-100 (negatif & >100)', async () => {
    await render(
      <ScoreBreakdown
        metrics={[
          { label: 'A', value: -5 },
          { label: 'B', value: 150 },
        ]}
      />,
    );
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('empty metrics → empty state copy', async () => {
    await render(<ScoreBreakdown metrics={[]} />);
    expect(screen.getByText(/Belum ada/i)).toBeTruthy();
  });
});

describe('ScoreSparkline (Fase 7, D6)', () => {
  it('points kosong → placeholder text, tidak crash', async () => {
    await render(<ScoreSparkline points={[]} />);
    expect(screen.getByText(/Tren skor menyusul/i)).toBeTruthy();
  });

  it('1 titik → render dgn delta "—" (graceful)', async () => {
    await render(<ScoreSparkline points={[80]} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('2 titik naik → delta "↑ +X" hijau', async () => {
    await render(<ScoreSparkline points={[70, 85]} />);
    expect(screen.getByText('↑ +15')).toBeTruthy();
  });

  it('2 titik turun → delta "↓ −X" amber', async () => {
    await render(<ScoreSparkline points={[85, 70]} />);
    expect(screen.getByText('↓ -15')).toBeTruthy();
  });

  it('a11y label menyebut jumlah periode + terbaru + delta', async () => {
    await render(<ScoreSparkline points={[60, 75, 80]} />);
    expect(screen.getByLabelText(/Tren skor 3 periode, terbaru 80, perubahan ↑ \+5/)).toBeTruthy();
  });
});

describe('Avatar', () => {
  it('mengekspos nama sebagai accessibilityLabel', async () => {
    await render(<Avatar name="Rina Jaya" />);
    expect(screen.getByLabelText('Rina Jaya')).toBeTruthy();
    expect(screen.getByText('RJ')).toBeTruthy();
  });
});

describe('ProgressOrb (UI-G-001)', () => {
  it('tone otomatis dari nilai (warna bukan satu-satunya sinyal, label eksplisit)', () => {
    expect(orbToneFor(0)).toBe('danger');
    expect(orbToneFor(34)).toBe('danger');
    expect(orbToneFor(35)).toBe('warn');
    expect(orbToneFor(69)).toBe('warn');
    expect(orbToneFor(70)).toBe('brand');
    expect(orbToneFor(99)).toBe('brand');
    expect(orbToneFor(100)).toBe('success');
  });

  it('clamp 0–100 dan menampilkan angka di tengah', async () => {
    await render(<ProgressOrb value={150} />);
    expect(screen.getByText('100')).toBeTruthy();
  });

  it('a11y label menyebut persen + label tone + sublabel', async () => {
    await render(<ProgressOrb value={68} sublabel="2/3 selesai" />);
    expect(screen.getByLabelText('Capaian 68 persen, Berjalan. 2/3 selesai')).toBeTruthy();
  });

  it('size 72 → render normal (hero variant)', async () => {
    await render(<ProgressOrb value={42} size={72} />);
    expect(screen.getByText('42')).toBeTruthy();
  });
});
