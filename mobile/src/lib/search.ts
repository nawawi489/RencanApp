// BL-10 — lapis data Search global (PRD §38). Pemanggil TIPIS: otorisasi, guard biaya,
// escaping, dan paging semuanya hidup di RPC `search_global`. Klien tidak menirunya.
//
// Kenapa tipis itu mengikat, bukan preferensi gaya:
//   * Guard `length < 2` ada di server (FR-5). Klien yang ikut menjaga membuat perilaku
//     bercabang begitu ambangnya berubah — dua sumber kebenaran yang pasti menyimpang.
//   * Validasi bentuk-request cursor ada di server (FR-19). Sama alasannya.
//   * Query diteruskan UTUH, termasuk `%`/`_`/`\` dan spasi tepi. Merapikannya di sini
//     akan mengubah arti pencarian tanpa server pernah tahu.
import { createLogger } from './logger';
import { supabase } from './supabase';

/** 14 scope kanonik §6.1. Urutan array = urutan section di layar. */
export const SEARCH_SCOPE_ORDER = [
  'goal',
  'strategy',
  'initiative',
  'action_plan',
  'task',
  'task_instance',
  'development_area',
  'problem_statement',
  'people',
  'comment',
  'chat',
  'evidence',
  'activity_log',
  'governance_violation',
] as const;

export type SearchScope = (typeof SEARCH_SCOPE_ORDER)[number];

/**
 * Label grup §6.1. "Problem Statement" dan "Governance Violation" dipertahankan apa adanya
 * karena keduanya istilah produk V1.83 di PRD, bukan nama tabel.
 *
 * Label `activity_log`/`governance_violation` di sini adalah varian pemegang permission.
 * Varian tanpa permission ("Aktivitas Saya"/"Catatan Governance Saya") ditentukan di layar
 * dari `can()` — ia fungsi permission PEMANGGIL SENDIRI, bukan fungsi data pihak lain,
 * jadi bukan oracle (FR-10). Baru relevan di PR-4.
 */
export const SEARCH_SCOPE_LABEL: Record<SearchScope, string> = {
  goal: 'Goal',
  strategy: 'Strategi',
  initiative: 'Inisiatif',
  action_plan: 'Rencana Aksi',
  task: 'Tugas',
  task_instance: 'Instansi Tugas',
  development_area: 'Area Pengembangan',
  problem_statement: 'Problem Statement',
  people: 'Orang',
  comment: 'Komentar',
  chat: 'Pesan',
  evidence: 'Bukti',
  activity_log: 'Log Aktivitas',
  governance_violation: 'Pelanggaran Tata Kelola',
};

/** Tujuh scope yang merupakan card. Switch EKSPLISIT — bukan pencocokan daftar. */
export function cardScopeOf(scope: SearchScope): SearchScope | null {
  switch (scope) {
    case 'goal':
    case 'strategy':
    case 'initiative':
    case 'action_plan':
    case 'task':
    case 'development_area':
    case 'problem_statement':
      return scope;
    default:
      return null;
  }
}

export type SearchHit = {
  scope: SearchScope;
  id: string;
  parentId: string | null;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  status: string | null;
  sortTs: string;
  sortId: string;
};

type SearchRow = {
  scope: string;
  id: string;
  parent_id: string | null;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  status: string | null;
  sort_ts: string;
  sort_id: string;
};

/**
 * Memilih SEMBILAN field satu per satu — sengaja bukan `{ ...row }`.
 *
 * Spread akan meloloskan kolom apa pun yang kelak ditambahkan server (mis. `total_count`
 * atau `storage_path`) langsung ke UI. Jumlah hasil sebenarnya adalah oracle: ia
 * membocorkan keberadaan baris yang sengaja disaring otorisasi. Daftar eksplisit membuat
 * kebocoran semacam itu butuh perubahan sadar di berkas ini.
 *
 * Fungsi TOP-LEVEL, bukan closure di dalam pemanggil async — supaya dapat diuji langsung.
 */
export function mapSearchHit(row: SearchRow): SearchHit {
  return {
    scope: row.scope as SearchScope,
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    subtitle: row.subtitle,
    snippet: row.snippet,   // server sudah memotong 240; jangan potong ulang
    status: row.status,
    sortTs: row.sort_ts,
    sortId: row.sort_id,
  };
}

export type SearchGlobalParams = {
  query: string;
  scopes?: SearchScope[] | null;
  includeArchived?: boolean;
  limit?: number;
  cursorTs?: string | null;
  cursorId?: string | null;
  /**
   * Identitas pemanggil, HANYA untuk penghitung per-aktor FR-34. Disuplai pemanggil
   * (hook punya `useAuth`), bukan diambil sendiri di sini — memanggil `auth.getUser()`
   * dari lapis data akan menambah round-trip pada setiap pencarian.
   *
   * BL-18: penghitung ini BELUM menjadi kontrol — lihat catatan di atas `log`.
   */
  actorId?: string | null;
};

/**
 * Observability FR-34. Metrik AGREGAT saja — dan daftar yang dilarang sama pentingnya
 * dengan yang dicatat:
 *
 *   [MUST NOT] isi query, nama entity/judul hasil, atau PII apa pun.
 *
 * Alasannya bukan kerapian. Search sengaja NOL-EMISI AUDIT (G6) supaya mencari tidak
 * meninggalkan jejak; kalau isi query mengalir ke sink telemetry, jejak itu kembali lewat
 * pintu belakang — dengan aturan akses yang berbeda dari `activity_logs`. Judul hasil juga
 * data yang tunduk permission; melognya memindahkan permukaan disclosure ke tempat yang
 * kontrolnya lain.
 *
 * `queryLength` dicatat sebagai ANGKA (berguna untuk melihat pola beban), bukan teksnya.
 * `actorId` ada karena FR-34 menuntutnya, dan ia UUID internal — bukan nama/email.
 *
 * ---------------------------------------------------------------------------
 * BL-18 — STATUS SEBENARNYA: ini BUKAN kontrol kompensasi, dan tidak akan menjadi
 * kontrol itu. Jangan menghitungnya sebagai penutup `BL10-OQ-09`.
 *
 * Keputusan owner 2026-07-23: kontrolnya dibangun di sisi PLATFORM, bukan di sini —
 * membaca `edge_logs` (yang membawa `sb.auth_user` dan diisi gateway, bukan klien).
 * Runbook: `wiki/concepts/search-mining-monitor.md`. Penghitung di bawah tetap ada
 * sebagai metrik operasional biasa (pola beban, durasi, error) — itu saja.
 *
 * Komentar versi sebelumnya menyebut penghitung per-aktor ini "kontrol kompensasi atas
 * nol-emisi audit". Itu klaim yang tidak dipenuhi implementasinya, dan klaim semacam itu
 * lebih berbahaya daripada tidak ada komentar sama sekali: ia membuat kontrol tercentang
 * di review tanpa ada yang memeriksa apakah benda itu benar-benar bekerja. Dua fakta,
 * keduanya terverifikasi di kode ini juga:
 *
 *   1. Emisi berhenti di perangkat. Peristiwa sukses ditulis pada level `info`, dan
 *      SATU-SATUNYA transport terpusat (`createSentryTransport`) hanya meneruskan
 *      `error` + `warn` — dikunci tesnya sendiri di `sentry-logger.test.ts`
 *      ("info/debug tidak mengirim ke Sentry (hanya console)"). Jadi penghitung ini
 *      hari ini berakhir di `console.log` milik perangkat pemakai, bukan di sink mana pun.
 *   2. Sekalipun sampai ke sink, ia dilaporkan SENDIRI oleh pihak yang diawasi.
 *      `search_global` di-`grant execute … to authenticated`, sehingga siapa pun yang
 *      punya sesi dapat memanggilnya langsung lewat PostgREST tanpa menjalankan kode ini.
 *      Penambang data tinggal tidak memakai aplikasinya.
 *
 * Konsekuensinya: ambang/alerting di sisi klien tidak akan mengikat siapa pun — itulah
 * sebabnya kontrolnya tidak ditaruh di berkas ini. Jangan "memperbaiki" catatan ini
 * dengan menaikkan level peristiwa ke `warn` agar lolos ke Sentry: itu opsi 1, ditolak
 * owner karena tetap tidak mengikat pemanggil langsung sekaligus membanjiri kuota satu
 * peristiwa per pencarian.
 *
 * Opsi + ongkos + alasan penolakan: `wiki/concepts/feature-gap-backlog.md` §BL-18.
 * ---------------------------------------------------------------------------
 */
const log = createLogger('SearchGlobal');

export async function searchGlobal(params: SearchGlobalParams): Promise<SearchHit[]> {
  // Argumen opsional dikirim sebagai `undefined`, bukan `null`.
  //
  // `database.types.ts` memodelkan argumen ber-DEFAULT sebagai `p_x?: T` (yaitu
  // `T | undefined`), sehingga `null` ditolak tsc. Secara perilaku keduanya identik:
  // supabase-js men-serialisasi payload lewat JSON, `undefined` gugur, argumennya
  // tidak terkirim, dan DEFAULT di tanda tangan SQL (null) yang berlaku.
  const startedAt = Date.now();
  const { data, error } = await supabase.rpc('search_global', {
    p_query: params.query,                       // UTUH — tanpa trim, tanpa escape klien
    p_scopes: params.scopes ?? undefined,
    p_include_archived: params.includeArchived ?? false,
    p_limit: params.limit ?? 5,
    p_cursor_ts: params.cursorTs ?? undefined,
    p_cursor_id: params.cursorId ?? undefined,
  });

  // Error dilempar UTUH, termasuk PGRST202 (RPC belum ada di schema cache) — pemanggil
  // yang memutuskan cara menampilkannya; menelannya di sini menyembunyikan skew app-vs-DB.
  if (error) {
    log.warn({
      event: 'search_global_error',
      actorId: params.actorId ?? null,
      queryLength: params.query.length,
      scopesRequested: params.scopes ?? null,
      code: (error as { code?: string }).code ?? null,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }

  const hits = (data ?? []).map(mapSearchHit);
  log.info({
    event: 'search_global',
    actorId: params.actorId ?? null,
    queryLength: params.query.length,          // ANGKA, bukan isinya
    scopesRequested: params.scopes ?? null,    // taksonomi, bukan data
    resultCount: hits.length,
    scopesWithResults: new Set(hits.map((h) => h.scope)).size,
    durationMs: Date.now() - startedAt,
  });
  return hits;
}
