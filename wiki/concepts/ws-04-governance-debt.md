---
type: concept
tags: [governance, ws-04, archive-gating, tech-debt, security]
updated: 2026-07-05
sources: 3
---

# WS-04 Governance Debt — Archive-Period Gating Server-Side Absent

Layar Workspace mem-block aksi tambah turunan (Goal/KPI/Strategy/Initiative/Action Plan) di layer UI saat periode fokus arsip dipilih. **Enforcement server-side untuk gating ini tidak ada** dan sengaja ditunda per keputusan owner 2026-07-05 (OQ-1 Opsi A: UI-only + governance debt tercatat).

## Batas UI-only landed

Yang **sudah** ditegakkan client-side di `mobile/src/app/(app)/workspace-screen.tsx` (commit `6037a7f`):

- Helper murni `focusPeriodStatus(focus, now)` di `mobile/src/lib/period-focus.ts` menghitung apakah periode fokus = `past|active|future` dari `enumerateMonths/enumerateQuarters(...).status`.
- Section-level `+ Goal`/`+ Development Area` + empty-state action + row-level `+ Child` menerima `accessibilityState.disabled=true` + popup "Periode sudah lewat" bila `focusPeriodStatus === 'past'`.
- Detail card tetap read-only (bukan write).

## Batas server-side yang TIDAK ada (governance debt)

Create card memakai `.insert()` langsung ber-RLS di `mobile/src/lib/cards.ts` (bukan RPC):

- **Goal:** `cards.ts:325/329` — `supabase.from('goals').insert({...}).select().single()`.
- **Strategy:** `cards.ts:355/359` — `supabase.from('strategies').insert(...)`.
- **KPI Area, Development Area, Problem Statement, Initiative, Action Plan:** pola sejenis.

RLS INSERT policy di migrasi 0005 (Fase 2 Goal/Strategy), 0010 (Fase 5 Development), 0012 (Fase 6 Development Workspace) **hanya memvalidasi:**

- `organization_id = current_org()` (viewer di org yang benar).
- `created_by = auth.uid()` (kreditasi kreator).
- `has_permission('create_*')` (peran punya izin bikin card kelas itu).

**Tidak ada policy WITH CHECK atau trigger yang menolak INSERT bila periode fokus/parent-nya lewat.** Artinya:

- **Bypass path:** pemegang permission `create_*` yang meng-issue INSERT via Supabase client langsung (mis. lewat script terpisah atau devtools), atau lewat rute UI eventual di masa depan yang lupa panggil `focusPeriodStatus`, **dapat berhasil membuat card baru di periode arsip**.
- **Audit trail:** tidak ada baris `governance_violations` yang otomatis tercatat karena governance violation table baru bereaksi ke RPC yang eksplisit meng-emit, dan tidak ada RPC di sini.

## Kenapa dipilih Opsi A (UI-only)

Trade-off yang dipertimbangkan owner (2026-07-05):

- **Cost menambah server gate:** butuh migrasi baru (policy WITH CHECK atau RPC `create_goal/create_kpi/create_strategy` yang gantikan `.insert()`), refactor client cards.ts, update seluruh test contract insert, dan bikin path emit `governance_violations` untuk rejected insert. **Non-trivial scope** yang di luar batch bug UI 2026-07-05.
- **Cost governance debt saat ini:** bypass path realistis hanya lewat access langsung Supabase (mis. supabase-js custom script atau devtools). User biasa mengakses aplikasi lewat mobile client yang sudah gate UI, jadi eksposur di path normal = nol.
- **Risiko sisa:** insider dengan credential + technical know-how bisa bypass. Untuk aplikasi internal EMS dengan permission model berbasis org role dan RLS org-scope, ini **risiko terkendali** — bukan risiko compliance seperti mengeluarkan data lintas-org.

Owner memilih menunda backend hardening sampai:

1. Ada audit atau incident nyata yang menuntut governance server-side lebih ketat.
2. Ada kebutuhan lain yang juga menuntut migrasi ke RPC (mis. server-side validation lainnya) sehingga cost migrasi terbagi.
3. Ada sprint governance/audit tersendiri.

## Signal untuk re-open

Backend hardening **wajib** di-open kembali bila:

- Terlihat baris tercipta di periode arsip via query DB (tanpa UI gate melewatinya).
- Audit compliance menuntut enforcement server-side untuk archive semantics.
- Migrasi ke pola RPC-per-create dilakukan untuk kebutuhan lain (piggyback gating periode).
- Fitur baru mengizinkan create card dari surface non-UI (mis. bulk import, API integrasi).

## Referensi

- Spec: `docs/spec-ui-testfix-2026-07-05.md` §WS-04 + §8 OQ-1 RESOLVED.
- UI implementation: commit `6037a7f fix(ws-04): archive-period gating section-level + empty-state [AC-WS04-1..7]`.
- Helper murni: `mobile/src/lib/period-focus.ts` (`focusPeriodStatus`).
- Related: [[audit-governance]] — pola violation logging append-only yang ADA untuk area lain (score override, dsb.) tapi belum menutupi archive-period create.
- Related: [[permission-model]] — permission `create_*` yang jadi satu-satunya server check saat ini.
