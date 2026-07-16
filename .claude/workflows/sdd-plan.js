export const meta = {
  name: 'sdd-plan',
  description: 'Ubah intent fitur yang masih kabur menjadi spec eksekutabel RencanApp (Spec-Driven Development) lewat orkestrasi multi-agent',
  whenToUse: 'Sebelum coding/TDD: saat sebuah fitur masih vague dan butuh spec presisi (requirement, acceptance criteria, data contract) yang selaras PRD/wiki. Output-nya bisa disambung ke workflow tdd-plan.',
  phases: [
    { title: 'Research', detail: 'Agent paralel menambang PRD/wiki/kode/skema sebagai dasar spec' },
    { title: 'Draft', detail: 'Tulis tiap bagian spec secara paralel' },
    { title: 'Grill', detail: 'Kritik adversarial dari 3 sudut: produk, engineering, governance' },
    { title: 'Synthesize', detail: 'Rakit spec final + handoff ke TDD' },
  ],
}

// ----------------------------------------------------------------- input
// args bisa string (intent fitur) atau objek { feature, paths? }.
const feature = typeof args === 'string' ? args : args?.feature
if (!feature || !String(feature).trim()) {
  return {
    error:
      'Butuh intent fitur. Panggil ulang dengan args, mis. "Pengguna bisa menyaring action plan per status & PIC di tab Workspace".',
  }
}
const hintPaths = (typeof args === 'object' && Array.isArray(args?.paths)) ? args.paths : []

const CONTEXT = `Project: RencanApp — aplikasi Rencanapp (Execution Project Management) mobile.
SUMBER SPEC yang sudah ada (jadikan dasar, JANGAN bertentangan dengannya — tandai jika kontradiksi):
- Produk: PRD.md, prd/01-konsep-dan-fondasi.md, prd/02-spesifikasi-card-dan-eksekusi.md, prd/03-sistem-permission-data-governance.md.
- Wiki: wiki/overview.md, wiki/index.md, wiki/concepts/* (architecture, execution-loop, permission-model, scope-guardrails, audit-governance, minimum-breakdown-rule, tech-stack), wiki/entities/* (card-model, action-plan, database-blueprint, score-formula, surfaces, workspace).
- Rencana: BUILD-PLAN.md.
- Kode saat ini: mobile/ (Expo SDK 56 + expo-router, RN 0.85, React 19). Data layer mobile/src/lib/cards.ts (pemanggil tipis ke Supabase; RLS+RPC menegakkan otorisasi di server). Skema/migrasi: supabase/.
- Spec harus menghormati invarian governance: RLS, anti-self-approval, evidence locking (hanya RPC yang menulis), aturan minimum-breakdown, scope guardrails.
INTENT FITUR yang akan dispesifikasi: "${feature}".${hintPaths.length ? `\nFile/area yang ditunjuk user: ${hintPaths.join(', ')}.` : ''}`

const RESEARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lens', 'findings', 'constraints', 'decisions', 'contradictions', 'sources_read'],
  properties: {
    lens: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } },
    constraints: { type: 'array', items: { type: 'string' }, description: 'batasan yang membatasi spec (skema, RLS, governance, teknis)' },
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['decision', 'source'],
        properties: { decision: { type: 'string' }, source: { type: 'string' } },
      },
      description: 'keputusan produk/teknis yang sudah ada + sumbernya',
    },
    contradictions: { type: 'array', items: { type: 'string' }, description: 'tempat intent fitur bentrok dengan sumber yang ada' },
    sources_read: { type: 'array', items: { type: 'string' } },
  },
}

const SECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['section', 'markdown', 'open_questions'],
  properties: {
    section: { type: 'string' },
    markdown: { type: 'string', description: 'isi bagian ini dalam markdown' },
    open_questions: { type: 'array', items: { type: 'string' } },
  },
}

const GRILL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['perspective', 'ambiguities', 'contradictions', 'missing_acceptance_criteria', 'must_fix', 'verdict'],
  properties: {
    perspective: { type: 'string' },
    ambiguities: { type: 'array', items: { type: 'string' } },
    contradictions: { type: 'array', items: { type: 'string' } },
    missing_acceptance_criteria: { type: 'array', items: { type: 'string' } },
    must_fix: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string', enum: ['siap', 'perlu-perbaikan'] },
  },
}

const SPEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'non_goals', 'acceptance_criteria', 'open_questions', 'testable_behaviors', 'tdd_handoff', 'markdown'],
  properties: {
    summary: { type: 'string' },
    non_goals: { type: 'array', items: { type: 'string' } },
    acceptance_criteria: { type: 'array', items: { type: 'string' }, description: 'kriteria Given/When/Then yang dapat diuji' },
    open_questions: { type: 'array', items: { type: 'string' } },
    testable_behaviors: { type: 'array', items: { type: 'string' }, description: 'perilaku konkret yang siap dijadikan test (umpan ke tdd-plan)' },
    tdd_handoff: {
      type: 'object',
      additionalProperties: false,
      required: ['feature', 'paths'],
      properties: {
        feature: { type: 'string', description: 'ringkasan fitur padat untuk args workflow tdd-plan' },
        paths: { type: 'array', items: { type: 'string' }, description: 'file/area yang kemungkinan tersentuh' },
      },
    },
    markdown: { type: 'string', description: 'dokumen spec lengkap, siap disimpan ke file' },
  },
}

// ----------------------------------------------------------------- Phase 1: Research
phase('Research')
const LENSES = [
  { key: 'product-intent', prompt: `${CONTEXT}\n\nLENS: PRODUK. Baca PRD.md, prd/*, wiki/overview.md dan wiki concept/entity yang relevan. Apa yang produk inginkan dari fitur ini? Keputusan & batasan produk apa yang sudah ditetapkan? Adakah intent yang bertentangan dengan sumber?` },
  { key: 'current-impl', prompt: `${CONTEXT}\n\nLENS: IMPLEMENTASI SAAT INI. Baca mobile/src/* (lib, hooks, components, app, providers) yang relevan. Apa yang sudah ada, apa gap-nya terhadap intent, dan pola apa yang harus diikuti?` },
  { key: 'data-constraints', prompt: `${CONTEXT}\n\nLENS: DATA & SKEMA. Baca supabase/ (migrasi), mobile/src/lib/database.types.ts, wiki/entities/database-blueprint.md. Tabel/kolom/RPC/RLS apa yang membatasi atau perlu berubah untuk fitur ini?` },
  { key: 'governance', prompt: `${CONTEXT}\n\nLENS: GOVERNANCE. Baca wiki/concepts/{permission-model,scope-guardrails,audit-governance,minimum-breakdown-rule}. Invarian/aturan apa yang WAJIB dipatuhi spec (permission, anti-self-approval, evidence locking, audit)?` },
]
const research = (await parallel(
  LENSES.map((l) => () =>
    agent(l.prompt, { label: `research:${l.key}`, phase: 'Research', schema: RESEARCH_SCHEMA, agentType: 'Explore' }),
  ),
)).filter(Boolean)

if (!research.length) {
  return { error: 'Riset gagal — tidak ada hasil dari agent Research.' }
}
const researchJson = JSON.stringify(research, null, 2)
const allContradictions = research.flatMap((r) => r.contradictions || [])
log(`Research selesai: ${research.length} lens; ${allContradictions.length} potensi kontradiksi terdeteksi.`)

// ----------------------------------------------------------------- Phase 2: Draft
phase('Draft')
const SECTIONS = [
  { key: 'problem-goals', desc: 'Problem statement, tujuan, dan ringkasan nilai. Sebutkan Non-goals secara eksplisit.' },
  { key: 'user-stories', desc: 'User stories & alur utama per peran (CEO/Manager/PIC/Reviewer sesuai permission model).' },
  { key: 'functional-reqs', desc: 'Functional requirements bernomor — perilaku yang harus ada, termasuk aturan governance yang berlaku.' },
  { key: 'data-contracts', desc: 'Data contracts: perubahan skema/RPC/tipe, bentuk request/response, dan dampak RLS.' },
  { key: 'acceptance', desc: 'Acceptance criteria gaya Given/When/Then yang dapat diuji, satu per perilaku.' },
  { key: 'edge-errors', desc: 'Edge case, state error, jalur izin ditolak, dan empty/loading states.' },
]
const sections = (await parallel(
  SECTIONS.map((S) => () =>
    agent(
      `${CONTEXT}\n\nHasil riset (JSON):\n${researchJson}\n\nTUGAS: Tulis BAGIAN SPEC "${S.key}" — ${S.desc}\nGrounded pada riset; jangan bertentangan dengan sumber (tandai jika perlu). Tandai hal yang belum jelas sebagai open_questions, jangan dikarang.`,
      { label: `draft:${S.key}`, phase: 'Draft', schema: SECTION_SCHEMA },
    ),
  ),
)).filter(Boolean)

const sectionsJson = JSON.stringify(sections, null, 2)
log(`Draft selesai: ${sections.length} bagian spec.`)

// ----------------------------------------------------------------- Phase 3: Grill (adversarial, perspektif beragam)
phase('Grill')
const PERSPECTIVES = [
  { key: 'produk', lens: 'Apakah spec menjawab intent & selaras PRD? Adakah scope creep atau non-goal yang kabur?' },
  { key: 'engineering', lens: 'Apakah requirement cukup presisi untuk diimplementasi & dites? Data contract lengkap? Acceptance criteria benar-benar teruji?' },
  { key: 'governance', lens: 'Apakah ada celah permission/RLS, risiko self-approval, evidence locking, atau audit yang terlewat?' },
]
const grill = (await parallel(
  PERSPECTIVES.map((P) => () =>
    agent(
      `${CONTEXT}\n\nDraft spec (JSON per bagian):\n${sectionsJson}\n\nKontradiksi dari riset:\n${JSON.stringify(allContradictions, null, 2)}\n\nTUGAS: Audit spec secara skeptis dari PERSPEKTIF ${P.key.toUpperCase()}. ${P.lens} Kembalikan ambiguities, contradictions, missing_acceptance_criteria, must_fix, dan verdict.`,
      { label: `grill:${P.key}`, phase: 'Grill', schema: GRILL_SCHEMA },
    ),
  ),
)).filter(Boolean)

const grillJson = JSON.stringify(grill, null, 2)
const needsWork = grill.some((g) => g.verdict === 'perlu-perbaikan')
log(`Grill selesai: ${grill.reduce((n, g) => n + (g.must_fix?.length || 0), 0)} must-fix; status ${needsWork ? 'perlu-perbaikan' : 'siap'}.`)

// ----------------------------------------------------------------- Phase 4: Synthesize
phase('Synthesize')
const spec = await agent(
  `${CONTEXT}\n\nDraft spec:\n${sectionsJson}\n\nTemuan grill (must-fix WAJIB ditangani atau diangkat sebagai open_question):\n${grillJson}\n\nTUGAS: Rakit SPEC FINAL yang koheren dan eksekutabel. Integrasikan perbaikan dari grill, hapus duplikasi, dan pastikan setiap acceptance criterion dapat diuji. Hasilkan:\n- summary, non_goals, acceptance_criteria (Given/When/Then), open_questions, testable_behaviors.\n- tdd_handoff: { feature (ringkasan padat untuk diumpankan ke workflow tdd-plan), paths (file/area yang kemungkinan tersentuh) }.\n- markdown: dokumen spec lengkap siap disimpan (judul, problem/goals/non-goals, user stories, functional requirements, data contracts, acceptance criteria, edge cases, open questions, dan bagian "Handoff ke TDD").`,
  { label: 'synthesize:spec', phase: 'Synthesize', schema: SPEC_SCHEMA },
)

return {
  feature,
  research,
  sections,
  grill,
  spec,
  markdown: spec?.markdown,
  tdd_handoff: spec?.tdd_handoff,
}
