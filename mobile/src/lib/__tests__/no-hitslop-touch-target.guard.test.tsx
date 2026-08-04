// harden-2 penjaga: `hitSlop` TIDAK boleh jadi mekanisme touch-target.
//
// Latar: `hitSlop` adalah no-op di react-native-web — stub Pressable RNW
// (`node_modules/react-native-web/dist/exports/Pressable/index.js`) hanya menangani `onPress`;
// `hitSlop` tak muncul di mana pun di `react-native-web/dist/` kecuali mixin `Touchable` lama
// yang deprecated. Jadi kontrol yang mengandalkan `hitSlop` untuk mencapai target sentuh ≥44px
// (DESIGN §4) punya kotak sentuh yang benar di native tapi TETAP kecil di web — cacat web-only
// yang preset jest native laporkan hijau. Sprint 6 (S6-5) sempat MENGADOPSI pola ini sebagai
// remediasi resmi ("visual 34px + hitSlop → 44px"), yang tak pernah terjadi di web.
//
// Penjaga ini menahan pola itu tetap NOL: target sentuh harus kotak NYATA (min-h/min-w-[44px]
// via className, atau minHeight/minWidth ≥44 lewat style). Kalau chrome visual harus tetap
// compact (mis. pill tree Workspace 32–34px), pakai margin negatif pada Pressable pembungkus
// transparan (lihat `touchTarget` di workspace-screen.tsx) — bukan hitSlop.
//
// Bukti "computed size ≥44" untuk kontrol berbasis inline-style ada di
// `app/(app)/(tabs)/__tests__/workspace.test.tsx` (pill CompactActionRow) — react-native-css
// mengonsumsi className tanpa mengekspos style/px teratasi di renderer jest, jadi ukuran numerik
// hanya bisa diassert pada kontrol yang memakai `style` inline. Di sini kita: (1) larang `hitSlop`
// secara statik di seluruh src, (2) render sebuah kontrol representatif dan pastikan ia TIDAK
// lagi mengekspos prop `hitSlop` (prop ini bertahan di tree jest, jadi assertion-nya andal).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { createElement, type PropsWithChildren } from 'react';

const ROOT = join(__dirname, '..', '..');
const SCAN_ROOTS = ['app', 'components', 'screens', 'lib', 'hooks', 'providers'];

// Prop JSX `hitSlop={...}` / `hitSlop = ...`. Komentar prosa ("hitSlop dihindari", "via hitSlop")
// tak punya `=` setelah token → tak terjaring. `__tests__` & `__mocks__` di-skip oleh walk,
// jadi file penjaga ini (yang menyebut token) tak men-scan dirinya sendiri.
const HITSLOP_PROP_RE = /\bhitSlop\s*=/;

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    if (name === '__tests__' || name === '__mocks__') continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, acc);
    else if (s.isFile() && (full.endsWith('.tsx') || full.endsWith('.ts'))) acc.push(full);
  }
  return acc;
}

const mockGetGuidance = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/card-rules', () => ({
  __esModule: true,
  getGuidance: (...args: unknown[]) => mockGetGuidance(...args),
}));
const mockUseProfile = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => mockUseProfile(),
}));

// eslint-disable-next-line import/first
import { CardHelpTrigger } from '@/components/card-help-trigger';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

describe('harden-2 no-hitSlop touch-target guard', () => {
  const files = SCAN_ROOTS.flatMap((r) => walk(join(ROOT, r)));

  it('scan menemukan file sumber (sanity — root path benar)', () => {
    expect(files.length).toBeGreaterThan(80);
  });

  it('tidak ada prop hitSlop di src (kotak sentuh harus NYATA ≥44px, bukan hitSlop no-op di web)', () => {
    const hits: string[] = [];
    for (const path of files) {
      const lines = readFileSync(path, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        if (HITSLOP_PROP_RE.test(line)) hits.push(`${path.replace(/\\/g, '/')}:${i + 1}  ${line.trim()}`);
      });
    }
    if (hits.length) {
      throw new Error(
        `hitSlop dipakai sebagai target sentuh (${hits.length}) — no-op di react-native-web. ` +
          `Ganti dengan kotak NYATA: min-h/min-w-[44px] (className) atau minHeight/minWidth ≥44 (style); ` +
          `untuk chrome compact pakai Pressable pembungkus 44 + margin negatif (lihat touchTarget di ` +
          `workspace-screen.tsx):\n` +
          hits.map((h) => '  ' + h).join('\n'),
      );
    }
  });

  it('kontrol representatif (CardHelpTrigger "?") render tanpa prop hitSlop', async () => {
    mockUseProfile.mockReturnValue({
      profile: { id: 'u1', organization_id: 'org-A' },
      isLoading: false,
    });
    mockGetGuidance.mockResolvedValue({ title: 'Inisiatif X', body: 'b' });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<CardHelpTrigger topic="initiative" />, { wrapper: wrapper() });
    const btn = await screen.findByRole('button');
    // hitSlop bertahan sbg prop di renderer jest (className tidak) — assertion andal.
    expect(btn.props.hitSlop).toBeUndefined();
    jest.restoreAllMocks();
  });
});
