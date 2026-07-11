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
    body: 'Tujuan strategis organisasi untuk satu periode. Goal dipecah menjadi beberapa Strategi terukur sebelum dapat diaktifkan.',
  },
  strategy: {
    title: 'Strategi',
    body: 'Area hasil di bawah Goal — punya target dan nilai capaian. Pecahan Target per kuartal atau bulan menjelaskan distribusi target sepanjang periode.',
  },
  initiative: {
    title: 'Inisiatif',
    body: 'Pendekatan utama untuk mencapai Strategi, disertai alasan, risiko, dan alternatif. Inisiatif dipecah menjadi Rencana Aksi.',
  },
  action_plan: {
    title: 'Rencana Aksi',
    body: 'Program eksekusi konkret di bawah Inisiatif atau Problem Statement. Otomatis mendapat ruang Diskusi Rencana Aksi dan bisa memiliki banyak Tugas.',
  },
  task: {
    title: 'Tugas',
    body: 'Pekerjaan terjadwal dengan PIC, Reviewer, bukti, dan nilai hasil. Bisa one-time atau Repeat (menghasilkan instance harian/mingguan/bulanan).',
  },
  development_area: {
    title: 'Development Area',
    body: 'Bidang pengembangan organisasi — bukan target performa. Diisi Problem Statement yang dipecah menjadi Rencana Aksi dan Tugas.',
  },
  problem_statement: {
    title: 'Problem Statement',
    body: 'Pernyataan masalah di bawah Development Area — fokus pada apa yang perlu diperbaiki, bukan keluhan. Ditangani melalui Rencana Aksi.',
  },
  mbr: {
    title: 'Minimum Breakdown Rule',
    body: 'Aturan jumlah turunan minimum agar induk bisa diaktifkan (mis. Goal butuh ≥1 Strategi). Mode penegakan: peringatan, blok aktivasi, atau blok tombol tambah.',
  },
  score_formula: {
    title: 'Formula Skor',
    body: 'Pembagi bobot metrik (Completion, OnTime, Quality, dst.) per level peran. Total bobot tiap level wajib 100%.',
  },
  achievement_score: {
    title: 'Achievement Score',
    body: 'Skor periodik hasil gabungan kontribusi anggota. Muncul setelah perhitungan periode berjalan atau periode tertutup.',
  },
  activity_log: {
    title: 'Log Aktivitas',
    body: 'Catatan append-only untuk setiap perubahan signifikan pada card ini. Tidak dapat diubah atau dihapus — jejak audit penuh.',
  },
  evaluation: {
    title: 'Evaluasi Rencana Aksi',
    body: 'Refleksi setelah Rencana Aksi berjalan atau selesai. Bisa ditandai untuk menjadi SOP atau di-rollout ke Development Workspace.',
  },
  target_breakdown: {
    title: 'Pecahan Target',
    body: 'Distribusi target Strategi per kuartal (total 100%). Opsional dipecah lebih halus per bulan dalam tiap kuartal.',
  },
};

export function glossaryFor(topic: GlossaryTopic): GlossaryEntry {
  return ENTRIES[topic];
}
