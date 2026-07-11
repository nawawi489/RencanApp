// WSA-03 / spec §9 — Workspace Pill System. Letter badge kategori dengan warna terkunci spec
// (bukan icon lucide bebas). Warna dipakai inline (bukan class) agar hex persis spec & mudah
// diverifikasi; token yang sama didaftarkan di DESIGN.md §Workspace.
import { Text, View } from 'react-native-css/components';

/** Warna border kiri card per kategori (spec §6.4–6.8): dipakai `borderColor` di TreeCard. */
export const WORKSPACE_KIND_BORDER: Record<
  'goal' | 'strategy' | 'initiative' | 'action_plan' | 'task' | 'development_area' | 'problem_statement',
  string
> = {
  goal: '#1877f2',
  strategy: '#b76b00',
  initiative: '#6941c6',
  action_plan: '#14845c',
  task: '#145ebc',
  development_area: '#0f766e',
  problem_statement: '#c2410c',
};

/** Level tree → margin kiri compact untuk mobile (§8). Level 0 = root (0px). */
export const TREE_LEVEL_INDENT: Record<0 | 1 | 2 | 3 | 4 | 5, number> = {
  0: 0,
  1: 6,
  2: 10,
  3: 12,
  4: 12,
  5: 14,
};

export type WorkspaceKind =
  | 'goal'
  | 'strategy'
  | 'initiative'
  | 'action_plan'
  | 'task'
  | 'development_area'
  | 'problem_statement';

type KindStyle = {
  letter: string;
  label: string;
  text: string; // warna teks pill
  bg: string; // background pill
  border: string; // border pill
  circleBg: string; // background lingkaran huruf
  circleFontSize: number; // 10 default, 8 utk "AP"
};

/** Mapping terkunci spec §9 (warna, huruf, label). */
export const WORKSPACE_KIND: Record<WorkspaceKind, KindStyle> = {
  goal: { letter: 'G', label: 'Goal', text: '#145ebc', bg: '#e8f2ff', border: '#cce2ff', circleBg: '#1877f2', circleFontSize: 10 },
  strategy: { letter: 'K', label: 'KPI Area', text: '#b76b00', bg: '#fff3d7', border: '#ffe1a1', circleBg: '#b76b00', circleFontSize: 10 },
  initiative: { letter: 'S', label: 'Initiative', text: '#6941c6', bg: '#f1ebff', border: '#dfd1ff', circleBg: '#6941c6', circleFontSize: 10 },
  action_plan: { letter: 'I', label: 'ActionPlan', text: '#14845c', bg: '#e7f7ef', border: '#c9ebda', circleBg: '#14845c', circleFontSize: 10 },
  task: { letter: 'AP', label: 'Action Plan', text: '#145ebc', bg: '#eef6ff', border: '#cce2ff', circleBg: '#145ebc', circleFontSize: 8 },
  development_area: { letter: 'D', label: 'Development Area', text: '#0f766e', bg: '#e6fffb', border: '#99f6e4', circleBg: '#0f766e', circleFontSize: 10 },
  problem_statement: { letter: 'P', label: 'Problem Statement', text: '#c2410c', bg: '#fff7ed', border: '#fed7aa', circleBg: '#c2410c', circleFontSize: 10 },
};

/**
 * Pill kategori Workspace (§9). Base: min-h 26, radius 999, gap 6, padding 4/9/4/5, font 11 w900.
 * Circle 18×18 radius 50%, teks putih.
 */
export function WorkspaceKindPill({ kind }: { kind: WorkspaceKind }) {
  const s = WORKSPACE_KIND[kind];
  return (
    <View
      accessibilityLabel={`Kategori: ${s.label}`}
      style={{
        minHeight: 26,
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: s.border,
        backgroundColor: s.bg,
        paddingTop: 4,
        paddingRight: 9,
        paddingBottom: 4,
        paddingLeft: 5,
      }}>
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: s.circleBg,
        }}>
        <Text style={{ color: '#ffffff', fontSize: s.circleFontSize, fontWeight: '900' }}>
          {s.letter}
        </Text>
      </View>
      <Text style={{ color: s.text, fontSize: 11, fontWeight: '900' }}>{s.label}</Text>
    </View>
  );
}
