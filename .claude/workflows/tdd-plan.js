export const meta = {
  name: 'tdd-plan',
  description: 'Susun rencana TDD (red-green-refactor) untuk sebuah fitur RencanApp lewat orkestrasi multi-agent',
  whenToUse: 'Saat memulai fitur baru di mobile/ dan ingin rencana test-first yang konkret sebelum menulis kode.',
  phases: [
    { title: 'Map', detail: 'Agent paralel memetakan kode & pola yang relevan' },
    { title: 'Tests', detail: 'Rancang test merah per layer (data/hook/UI)' },
    { title: 'Plan', detail: 'Sintesa langkah red→green→refactor berurutan' },
    { title: 'Critic', detail: 'Audit kelengkapan & strategi mocking' },
  ],
}

// ----------------------------------------------------------------- input
// args bisa berupa string (deskripsi fitur) atau objek { feature, paths? }.
const feature = typeof args === 'string' ? args : args?.feature
if (!feature || !String(feature).trim()) {
  return {
    error:
      'Butuh deskripsi fitur. Panggil ulang dengan args, mis. "Filter action plan berdasarkan status di tab Workspace".',
  }
}
const hintPaths = (typeof args === 'object' && Array.isArray(args?.paths)) ? args.paths : []

// Konteks project yang dibagikan ke semua agent supaya rencana akurat.
const CONTEXT = `Project: RencanApp — aplikasi EMS mobile.
- Kode app ada di mobile/ (Expo SDK 56 + expo-router, React Native 0.85, React 19).
- Data layer: mobile/src/lib/cards.ts — pemanggil tipis ke Supabase (RLS + RPC menegakkan otorisasi di server).
- Supabase client: mobile/src/lib/supabase.ts; tipe DB: mobile/src/lib/database.types.ts.
- Hooks: mobile/src/hooks/*; providers: mobile/src/providers/*; komponen: mobile/src/components/*; layar: mobile/src/app/* (expo-router).
- Skema/migrasi DB: supabase/.
- Test runner: jest-expo (preset "jest-expo"), perintah \`npm test\`. RNTL: @testing-library/react-native.
- Pola test yang sudah ada: mobile/src/lib/__tests__/cards.test.ts — modul yang meng-import ./supabase di-mock dengan \`jest.mock('../supabase', ...)\` agar tak butuh env/native saat import.
Fitur yang akan dikerjakan (test-first): "${feature}".${hintPaths.length ? `\nFile/area yang ditunjuk user: ${hintPaths.join(', ')}.` : ''}`

const MAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['area', 'summary', 'files', 'patterns', 'testability_notes'],
  properties: {
    area: { type: 'string' },
    summary: { type: 'string' },
    files: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'role'],
        properties: { path: { type: 'string' }, role: { type: 'string' } },
      },
    },
    patterns: { type: 'array', items: { type: 'string' } },
    testability_notes: { type: 'array', items: { type: 'string' } },
  },
}

const TESTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['layer', 'test_file', 'cases'],
  properties: {
    layer: { type: 'string' },
    test_file: { type: 'string', description: 'path test yang diusulkan, mis. mobile/src/lib/__tests__/x.test.ts' },
    cases: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'target', 'arrange', 'act', 'assert', 'why_red'],
        properties: {
          name: { type: 'string', description: 'nama test (it/describe)' },
          target: { type: 'string', description: 'unit/fungsi/komponen yang diuji' },
          arrange: { type: 'string' },
          act: { type: 'string' },
          assert: { type: 'string' },
          why_red: { type: 'string', description: 'kenapa test ini GAGAL sebelum implementasi' },
        },
      },
    },
  },
}

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mocking_strategy', 'steps', 'risks', 'markdown'],
  properties: {
    mocking_strategy: { type: 'string', description: 'cara mock Supabase/native untuk tiap layer' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['order', 'type', 'description', 'files_touched'],
        properties: {
          order: { type: 'number' },
          type: { type: 'string', enum: ['red', 'green', 'refactor'] },
          description: { type: 'string' },
          test_ref: { type: 'string' },
          files_touched: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    risks: { type: 'array', items: { type: 'string' } },
    markdown: { type: 'string', description: 'rencana TDD lengkap dalam markdown, siap disimpan ke file' },
  },
}

const CRITIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['missing_cases', 'concerns', 'verdict'],
  properties: {
    missing_cases: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string', enum: ['siap', 'perlu-perbaikan'] },
  },
}

// ----------------------------------------------------------------- Phase 1: Map
phase('Map')
const LENSES = [
  {
    key: 'data-layer',
    prompt: `${CONTEXT}\n\nLENS: DATA LAYER. Baca mobile/src/lib/cards.ts, supabase.ts, database.types.ts, dan migrasi terkait di supabase/. Petakan fungsi/RPC/tabel yang relevan dengan fitur ini dan bagaimana mereka diuji (apa yang murni vs butuh mock Supabase).`,
  },
  {
    key: 'hooks-state',
    prompt: `${CONTEXT}\n\nLENS: HOOKS & STATE. Baca mobile/src/hooks/* dan mobile/src/providers/*. Petakan hook/react-query/context yang akan tersentuh fitur ini dan pola pengujiannya (renderHook, wrapper provider).`,
  },
  {
    key: 'ui-screens',
    prompt: `${CONTEXT}\n\nLENS: UI & SCREENS. Baca mobile/src/components/* dan layar relevan di mobile/src/app/*. Petakan komponen/layar yang berubah dan apa yang bisa diuji via @testing-library/react-native (render, query, interaksi).`,
  },
]
const map = (await parallel(
  LENSES.map((l) => () =>
    agent(l.prompt, { label: `map:${l.key}`, phase: 'Map', schema: MAP_SCHEMA, agentType: 'Explore' }),
  ),
)).filter(Boolean)

if (!map.length) {
  return { error: 'Pemetaan kode gagal — tidak ada hasil dari agent Map.' }
}
const mapJson = JSON.stringify(map, null, 2)
log(`Map selesai: ${map.length} area, ${map.reduce((n, m) => n + (m.files?.length || 0), 0)} file dipetakan.`)

// ----------------------------------------------------------------- Phase 2: Tests
phase('Tests')
const LAYERS = [
  { key: 'data', desc: 'Layer data (lib/cards.ts & util murni). Mock ../supabase. Fokus: transformasi data, label/tone map, argumen RPC, error handling.' },
  { key: 'hooks', desc: 'Layer hooks. Uji hook dengan renderHook + wrapper provider; mock data layer.' },
  { key: 'ui', desc: 'Layer UI/screen. Uji render & interaksi via @testing-library/react-native; mock data/hook.' },
]
const tests = (await parallel(
  LAYERS.map((L) => () =>
    agent(
      `${CONTEXT}\n\nHasil pemetaan kode (JSON):\n${mapJson}\n\nTUGAS: Rancang daftar TEST MERAH untuk ${L.desc}\nHanya test yang masuk akal untuk fitur ini di layer ini (boleh kosong jika tak relevan — kembalikan cases: []). Setiap case harus konkret: arrange/act/assert nyata dan alasan kenapa GAGAL sebelum implementasi. Jangan menulis kode implementasi.`,
      { label: `tests:${L.key}`, phase: 'Tests', schema: TESTS_SCHEMA },
    ),
  ),
))
  .filter(Boolean)
  .filter((t) => (t.cases?.length || 0) > 0)

const testsJson = JSON.stringify(tests, null, 2)
const totalCases = tests.reduce((n, t) => n + t.cases.length, 0)
log(`Test dirancang: ${totalCases} case di ${tests.length} layer.`)

// ----------------------------------------------------------------- Phase 3: Plan
phase('Plan')
const plan = await agent(
  `${CONTEXT}\n\nPemetaan kode:\n${mapJson}\n\nDaftar test merah:\n${testsJson}\n\nTUGAS: Susun RENCANA TDD red→green→refactor yang berurutan dan dapat dieksekusi. Untuk tiap langkah sebutkan: jenis (red/green/refactor), file yang disentuh, dan test yang dirujuk. Tentukan strategi mocking konkret per layer (cara mock ../supabase, native modules, provider). Hasilkan juga field \`markdown\`: dokumen rencana lengkap siap disimpan — berisi ringkasan fitur, daftar file test, urutan langkah red-green-refactor, strategi mocking, dan risiko.`,
  { label: 'plan:synthesize', phase: 'Plan', schema: PLAN_SCHEMA },
)

// ----------------------------------------------------------------- Phase 4: Critic
phase('Critic')
const critic = await agent(
  `${CONTEXT}\n\nRencana TDD yang diusulkan:\n${JSON.stringify(plan, null, 2)}\n\nDaftar test:\n${testsJson}\n\nTUGAS: Audit secara skeptis. Apa edge case / jalur error / aturan RLS-RPC yang belum tercakup test? Apakah strategi mocking realistis untuk jest-expo? Apa bagian yang sulit/ tak teruji? Kembalikan missing_cases, concerns, dan verdict.`,
  { label: 'critic:completeness', phase: 'Critic', schema: CRITIC_SCHEMA },
)

return {
  feature,
  map,
  tests,
  plan,
  critic,
  markdown: plan?.markdown,
}
