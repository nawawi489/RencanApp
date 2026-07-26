// Komponen fondasi: EmptyState v2, ErrorState, SkeletonList, ScoreBadge, Avatar.
// Render RN pertama (cold transform react-native-css) bisa lambat → longgarkan timeout.
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native-css/components';
import { Avatar, Banner, Button, EmptyState, ErrorState, IconTile, LabeledInput, PriorityCard, ProgressOrb, ScoreBadge, ScoreBreakdown, ScoreSparkline, SectionCard, SectionHeading, SkeletonList, orbToneFor } from '../ui';
import { StatTile } from '../stat-tile';

jest.setTimeout(30000);

describe('SectionHeading', () => {
  it('mengekspos judul dengan accessibilityRole="header" (navigasi-heading pembaca layar)', async () => {
    await render(<SectionHeading title="Prioritas" />);
    // getByRole('header') hanya cocok bila accessibilityRole="header" terpasang.
    expect(screen.getByRole('header', { name: 'Prioritas' })).toBeTruthy();
  });

  it('merender slot `right` opsional di samping judul', async () => {
    await render(<SectionHeading title="Strategi" right={<Text>3</Text>} />);
    expect(screen.getByRole('header', { name: 'Strategi' })).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });
});

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
    expect(screen.getByText('Score 68 · Perlu dukungan')).toBeTruthy();
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
          { label: 'Tugas Completion', value: 80 },
          { label: 'Repeat Compliance', value: 65 },
        ]}
      />,
    );
    expect(screen.getByText('Tugas Completion')).toBeTruthy();
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

  it('[FR16-1] label="Progress" → a11y memuat "Progress" bukan "Capaian"', async () => {
    await render(<ProgressOrb value={80} label="Progress" />);
    expect(screen.getByLabelText(/^Progress 80 persen/)).toBeTruthy();
  });

  it('[FR16-2] tanpa label → default "Capaian"', async () => {
    await render(<ProgressOrb value={50} />);
    expect(screen.getByLabelText(/^Capaian 50 persen/)).toBeTruthy();
  });

  it('[FR18-1] a11y memuat label teks + sublabel', async () => {
    await render(<ProgressOrb value={60} label="Progress" sublabel="3/5 Strategi terukur" />);
    expect(screen.getByLabelText('Progress 60 persen, Berjalan. 3/5 Strategi terukur')).toBeTruthy();
  });
});

describe('Banner — degraded/network banner diumumkan pembaca layar (DESIGN §4.4)', () => {
  it('[UI-BAN-1] container role="alert" + liveRegion="polite" (mirror login-error)', async () => {
    await render(<Banner tone="warn" message="Pencarian terdegradasi." />);
    // Container bungkus banner mengekspos a11y (bukan `accessible` agar tombol aksi tetap
    // fokusabel) → telusuri leluhur dari teks pesan, pola tes login-error [7].
    const messageText = screen.getByText('Pencarian terdegradasi.');
    let node: typeof messageText | null = messageText;
    while (node) {
      if ((node.props as { accessibilityRole?: string }).accessibilityRole === 'alert') {
        expect((node.props as { accessibilityLiveRegion?: string }).accessibilityLiveRegion).toBe(
          'polite',
        );
        return;
      }
      node = node.parent;
    }
    throw new Error('Banner tidak menyediakan accessibilityRole="alert".');
  });

  it('[UI-BAN-2] tombol aksi tetap dirender sebagai sibling (bukan lebur ke alert)', async () => {
    const onPress = jest.fn();
    await render(
      <Banner tone="error" message="Gagal memuat." action={{ label: 'Coba lagi', onPress }} />,
    );
    // Tombol harus ada dan bisa ditemukan lewat label sendiri — bukan tersembunyi di node alert.
    expect(screen.getByLabelText('Coba lagi')).toBeTruthy();
  });
});

describe('LabeledInput — field wajib diumumkan (WCAG 3.3.2)', () => {
  it('[UI-LI-1] required → accessibilityLabel menambah " wajib"', async () => {
    await render(<LabeledInput label="Nama" value="" onChangeText={() => {}} required />);
    expect(screen.getByLabelText('Nama wajib')).toBeTruthy();
  });

  it('[UI-LI-2] tanpa required → label apa adanya', async () => {
    await render(<LabeledInput label="Catatan" value="" onChangeText={() => {}} />);
    expect(screen.getByLabelText('Catatan')).toBeTruthy();
    expect(screen.queryByLabelText('Catatan wajib')).toBeNull();
  });
});

describe('StatTile — satu metrik = satu swipe pembaca layar (DESIGN §4)', () => {
  it('[UI-ST-1] menggabungkan label + nilai jadi "label: value"', async () => {
    await render(<StatTile label="Deadline" value={3} containerCls="" textCls="" />);
    expect(screen.getByLabelText('Deadline: 3')).toBeTruthy();
  });

  it('[UI-ST-2] varian md juga tergabung', async () => {
    await render(<StatTile label="Selesai" value="80%" containerCls="" textCls="" size="md" />);
    expect(screen.getByLabelText('Selesai: 80%')).toBeTruthy();
  });
});

describe('PriorityCard — varian statis satu node (DESIGN §4)', () => {
  it('[UI-PC-1] tanpa onPress: satu node ber-label, tanpa role button', async () => {
    await render(<PriorityCard icon="!" title="Lewat deadline" subtitle="2 kartu" tone="danger" />);
    expect(screen.getByLabelText('Lewat deadline. 2 kartu')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('SectionCard — kontrol bersarang di kartu pressable (DESIGN §4.4)', () => {
  it('[UI-SC-1] statis: tanpa onPress tidak ada elemen ber-role button', async () => {
    await render(
      <SectionCard>
        <Text>Isi kartu</Text>
      </SectionCard>,
    );
    expect(screen.getByText('Isi kartu')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  // Regresi: `actions` sempat hanya dirender di cabang pressable, sehingga kartu yang
  // kehilangan `onPress` (mis. entity type tanpa segmen rute di layar Arsip) ikut kehilangan
  // tombolnya. Ditempatkan SEBELUM tes yang menekan region pressable: menekan Pressable
  // react-native-css ber-varian `active:` membuat render berikutnya di file ini kosong
  // (artefak harness, bukan cacat komponen — lihat [UI-SC-4]).
  it('[UI-SC-5] statis + actions: tombol tetap dirender walau kartu tak bisa ditekan', async () => {
    const onAct = jest.fn();
    await render(
      <SectionCard actions={<Button label="Pulihkan ke Draft" onPress={onAct} />}>
        <Text>Card Asing</Text>
      </SectionCard>,
    );
    expect(screen.getByText('Card Asing')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Pulihkan ke Draft'));
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it('[UI-SC-2] pressable tanpa actions: seluruh kartu satu tombol ber-label', async () => {
    const onPress = jest.fn();
    await render(
      <SectionCard onPress={onPress} accessibilityLabel="Buka detail Goal Lama">
        <Text>Goal Lama</Text>
      </SectionCard>,
    );
    fireEvent.press(screen.getByLabelText('Buka detail Goal Lama'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // Regresi inti: `Pressable` RN default `accessible={true}`, jadi kontrol yang bersarang di
  // dalamnya lebur jadi satu elemen a11y dan berhenti bisa difokus VoiceOver. `actions` harus
  // merender kontrol sebagai SIBLING region pressable — bukan keturunannya.
  it('[UI-SC-3] actions dirender DI LUAR region pressable (bukan keturunannya)', async () => {
    const onOpen = jest.fn();
    const onAct = jest.fn();
    await render(
      <SectionCard
        onPress={onOpen}
        accessibilityLabel="Buka detail Goal Lama"
        actions={<Button label="Pulihkan ke Draft" onPress={onAct} />}>
        <Text>Goal Lama</Text>
      </SectionCard>,
    );
    const pressableRegion = screen.getByLabelText('Buka detail Goal Lama');
    // tombol ada di kartu…
    expect(screen.getByLabelText('Pulihkan ke Draft')).toBeTruthy();
    // …tapi BUKAN di dalam region pressable, jadi fokus a11y-nya tetap terpisah.
    expect(within(pressableRegion).queryByLabelText('Pulihkan ke Draft')).toBeNull();
  });

  it('[UI-SC-4] kedua target bisa ditekan sendiri-sendiri tanpa saling memicu', async () => {
    const onOpen = jest.fn();
    const onAct = jest.fn();
    await render(
      <SectionCard
        onPress={onOpen}
        accessibilityLabel="Buka detail Goal Lama"
        actions={<Button label="Pulihkan ke Draft" onPress={onAct} />}>
        <Text>Goal Lama</Text>
      </SectionCard>,
    );
    fireEvent.press(screen.getByLabelText('Pulihkan ke Draft'));
    expect(onAct).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Buka detail Goal Lama'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onAct).toHaveBeenCalledTimes(1);
  });
});

