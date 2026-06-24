// Komponen fondasi: EmptyState v2, ErrorState, SkeletonList, ScoreBadge, Avatar.
// Render RN pertama (cold transform react-native-css) bisa lambat → longgarkan timeout.
import { render, screen } from '@testing-library/react-native';

jest.setTimeout(30000);

import { Avatar, EmptyState, ErrorState, ScoreBadge, SkeletonList } from '../ui';

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

describe('Avatar', () => {
  it('mengekspos nama sebagai accessibilityLabel', async () => {
    await render(<Avatar name="Rina Jaya" />);
    expect(screen.getByLabelText('Rina Jaya')).toBeTruthy();
    expect(screen.getByText('RJ')).toBeTruthy();
  });
});
