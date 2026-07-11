// UI-G-006 — Glossary content store untuk CardHelpTrigger.
// Konten ringkas (≤2 kalimat) — tujuannya menjawab "apa ini" tanpa perlu buka dokumentasi.
// Topic key stabil; tambah entri baru di sini saat ingin sebar tombol "?" ke surface lain.

export type GlossaryTopic =
  | 'goal'
  | 'strategy'
  | 'initiative'
  | 'action_plan'
  | 'task'
  | 'development_area'
  | 'problem_statement'
  | 'mbr'
  | 'score_formula'
  | 'achievement_score'
  | 'activity_log'
  | 'evaluation'
  | 'target_breakdown';

export type GlossaryEntry = { title: string; body: string };

const ENTRIES: Record<GlossaryTopic, GlossaryEntry> = {
  goal: {
    title: 'Goal',
    body: 'Tujuan strategis organisasi untuk satu periode. Goal dipecah menjadi Strategy terukur sebelum dapat diaktifkan.',
  },
  strategy: {
    title: 'Strategy',
    body: 'Bidang ukur di bawah Goal — punya target & nilai hasil. Pecahan Target per kuartal/bulan menjelaskan distribusi target sepanjang periode.',
  },
  initiative: {
    title: 'Initiative',
    body: 'Pendekatan kunci untuk mencapai Strategy, lengkap dengan alasan, risiko, dan alternatif. Initiative dipecah menjadi Action Plan.',
  },
  action_plan: {
    title: 'Action Plan',
    body: 'Inisiatif konkret yang dieksekusi oleh PIC. Boleh punya banyak Task; setelah selesai dapat dievaluasi.',
  },
  task: {
    title: 'Task',
    body: 'Pekerjaan terjadwal dengan PIC + Reviewer + bukti & nilai hasil. Bisa one-time atau Repeat (dgn instance harian/mingguan).',
  },
  development_area: {
    title: 'Development Area',
    body: 'Bidang pengembangan organisasi (bukan target performa). Diisi Problem Statement yang dipecah jadi Action Plan.',
  },
  problem_statement: {
    title: 'Problem Statement',
    body: 'Pernyataan masalah di bawah Development Area — fokus, bukan keluhan. Ditangani melalui Action Plan + Task.',
  },
  mbr: {
    title: 'Minimum Breakdown Rule',
    body: 'Aturan jumlah turunan minimum agar induk bisa diaktifkan (mis. Goal butuh ≥1 Strategy). Mode penegakan: peringatan, blok, atau off.',
  },
  score_formula: {
    title: 'Formula Skor',
    body: 'Pembagi bobot metrik (Completion, OnTime, Quality, dll.) per level role. Total bobot tiap level wajib 100%.',
  },
  achievement_score: {
    title: 'Achievement Score',
    body: 'Skor periodik gabungan kontribusi anggota. Hanya muncul setelah perhitungan periode berjalan atau periode tertutup.',
  },
  activity_log: {
    title: 'Log Aktivitas',
    body: 'Catatan append-only setiap perubahan signifikan pada card ini. Tidak dapat diubah atau dihapus — jejak audit penuh.',
  },
  evaluation: {
    title: 'Evaluasi Action Plan',
    body: 'Refleksi setelah Action Plan berjalan/selesai. Bisa ditandai untuk menjadi SOP atau di-rollout ke Development Workspace.',
  },
  target_breakdown: {
    title: 'Pecahan Target',
    body: 'Distribusi target Strategy per kuartal (Σ=100%). Opsional dipecah lebih halus per bulan dalam tiap kuartal.',
  },
};

export function glossaryFor(topic: GlossaryTopic): GlossaryEntry {
  return ENTRIES[topic];
}
