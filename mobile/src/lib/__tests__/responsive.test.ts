import {
  BREAKPOINT,
  MAX_CONTENT_WIDTH,
  columnBasis,
  contentWidthStyle,
  menuGridColumns,
  metaGridColumns,
  widthToBreakpoint,
} from '@/lib/responsive';

// Sumber kebenaran lebar (P1 adapt). Uji deterministik untuk logika width-derived yang
// menggerakkan cap konten (item 1), kolom grid (item 2), dan rail (item 3) — jalur yang tak
// bisa dibuktikan lewat browser di harness ini (dev SPA tak deep-link, backend lokal mati,
// klik sintetis Pressable no-op di RN-web). Hook `useBreakpoint` sendiri ter-exercise di render
// nyata oleh menu.test (MenuScreen → MenuGrid → useBreakpoint) tanpa crash; di sini kita uji
// murni fungsi turunannya yang deterministik.

describe('[RESP-1] widthToBreakpoint — batas kelas ukuran Material', () => {
  it('compact di bawah 600', () => {
    expect(widthToBreakpoint(320)).toBe('compact');
    expect(widthToBreakpoint(375)).toBe('compact');
    expect(widthToBreakpoint(599)).toBe('compact');
  });
  it('medium pada 600–839', () => {
    expect(widthToBreakpoint(600)).toBe('medium');
    expect(widthToBreakpoint(768)).toBe('medium');
    expect(widthToBreakpoint(839)).toBe('medium');
  });
  it('expanded pada ≥840', () => {
    expect(widthToBreakpoint(840)).toBe('expanded');
    expect(widthToBreakpoint(1024)).toBe('expanded');
    expect(widthToBreakpoint(1440)).toBe('expanded');
  });
  it('konstanta breakpoint konsisten', () => {
    expect(BREAKPOINT.medium).toBe(600);
    expect(BREAKPOINT.expanded).toBe(840);
  });
});

describe('[RESP-2] kolom grid width-derived', () => {
  it('MenuCard: 2 kolom compact → 3 kolom ≥medium', () => {
    expect(menuGridColumns('compact')).toBe(2);
    expect(menuGridColumns('medium')).toBe(3);
    expect(menuGridColumns('expanded')).toBe(3);
  });
  it('MetaGrid: 2 kolom compact → 4 kolom ≥medium', () => {
    expect(metaGridColumns('compact')).toBe(2);
    expect(metaGridColumns('medium')).toBe(4);
    expect(metaGridColumns('expanded')).toBe(4);
  });
});

describe('[RESP-3] columnBasis — flexBasis persen per jumlah kolom', () => {
  it('memetakan kolom → persen di bawah 100/N (menyisakan gap)', () => {
    expect(columnBasis(1)).toBe('100%');
    expect(columnBasis(2)).toBe('48%');
    expect(columnBasis(3)).toBe('31%');
    expect(columnBasis(4)).toBe('23%');
  });
  it('fallback aman untuk jumlah kolom tak terduga', () => {
    expect(columnBasis(7)).toBe('48%');
  });
});

describe('[RESP-4] contentWidthStyle — pembungkus cap + tengah', () => {
  it('membatasi ke MAX_CONTENT_WIDTH dan menengahkan di kolom & baris', () => {
    expect(MAX_CONTENT_WIDTH).toBe(720);
    expect(contentWidthStyle.maxWidth).toBe(720);
    expect(contentWidthStyle.width).toBe('100%');
    expect(contentWidthStyle.alignSelf).toBe('center');
    expect(contentWidthStyle.marginHorizontal).toBe('auto');
  });
});

describe('[RESP-5] aturan rail (useNavRail) turunan breakpoint', () => {
  // useNavRail = (breakpoint === 'expanded'); buktikan lewat width→breakpoint di 3 lebar QA.
  it('375pt & 768pt tetap bottom bar; 1440pt jadi rail', () => {
    expect(widthToBreakpoint(375) === 'expanded').toBe(false);
    expect(widthToBreakpoint(768) === 'expanded').toBe(false);
    expect(widthToBreakpoint(1440) === 'expanded').toBe(true);
  });
});
