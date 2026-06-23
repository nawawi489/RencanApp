---
type: concept
tags: [architecture, decision, supabase, rls, serverless, adr]
updated: 2026-06-23
sources: 3
---

# Architecture — Thick Database, Thin Client

Pola arsitektur menyeluruh [[overview|RencanApp]] (EMS V1.8.1). Bukan monolith server, bukan microservice — melainkan **DB-centric serverless** di atas [[tech-stack|Supabase BaaS]], dengan prinsip inti: **aturan yang tidak boleh dilanggar diturunkan ke lapisan yang tidak bisa dilewati (Postgres).**

## Verdict

| Aspek | Keputusan |
|---|---|
| Gaya arsitektur | DB-centric serverless (BaaS), bukan monolith/microservice |
| Tempat business logic | Postgres (RLS + trigger + RPC) sebagai sumber kebenaran; Edge Functions hanya untuk orchestration |
| Peran client | Presentation + cache; nyaris tanpa business logic |
| Pola ringkas | **Thick database, thin client** |

## Kenapa bukan alternatif lain

- **Microservice — ditolak.** Tim internal, satu produk, 53 tabel saling-relasi erat ([[database-blueprint]], card hierarki). Memecah jadi service menambah overhead jaringan + transaksi distributed tanpa manfaat. Over-engineering.
- **Monolith server (NestJS/Express + DB) — ditolak.** Berarti [[permission-model|permission]] & [[audit-governance|audit]] ditulis ulang di application layer dan bisa bocor jika ada query yang lupa cek izin. PRD menuntut "search wajib ikut permission" dan "user tak lihat semua card".
- **Client-heavy (logic di React Native) — fatal.** Permission, evidence locking, audit append-only tidak boleh dipegang client karena client bisa dibongkar.

## Pemetaan goal → keputusan arsitektur

1. **[[permission-model|Permission]] (PIC/Reviewer/turunan) → Postgres RLS, bukan kode aplikasi.** Setiap query termasuk Search otomatis tunduk RLS; tak ada jalan pintas dari client. Aturan "PIC induk lihat seluruh turunan" pakai **SECURITY DEFINER function** agar tidak rekursif lambat di policy.
2. **[[audit-governance|Audit append-only]] → trigger + cabut hak UPDATE/DELETE.** `REVOKE UPDATE, DELETE` pada tabel audit; tulis hanya via trigger `AFTER INSERT/UPDATE` pada tabel bisnis. Trail tak bisa dirusak, bahkan oleh Super Admin lewat app.
3. **[[execution-loop|Evidence locking + submission versioning]] → INSERT-only + Storage RLS.** Submission tak pernah di-UPDATE; revisi = baris versi baru. Bukti di Supabase Storage dengan policy yang melarang overwrite. Locking jadi sifat skema, bukan disiplin developer.
4. **Mutasi kompleks (buat card + set PIC/Reviewer, submit+nilai, approve/reject) → Postgres RPC (`SECURITY DEFINER`).** Tiap aksi multi-tabel dibungkus satu fungsi transaksional; client cukup panggil `rpc(...)`. Aturan "PIC tak boleh approve kerjaannya sendiri" hidup di satu tempat.
5. **Job terjadwal (generate [[action-plan|Instance]] Repeat, tandai Terlewat) → `pg_cron` + Edge Function.** `pg_cron` untuk yang murni SQL; Edge Function untuk yang butuh logic/notif.
6. **Client (Expo) → presentation + cache.** TanStack Query untuk cache/optimistic update, Supabase Realtime untuk [[surfaces|Inbox & Notifications]]. Client tahu *cara menampilkan*, bukan *aturan siapa boleh apa*.

## ADR — Batas business logic: Postgres vs Edge Functions

**Keputusan:**
- **Postgres (RLS + trigger + RPC SQL/plpgsql):** semua yang menyentuh permission, audit, transaksi card, scoring ([[score-formula]]). Mayoritas logic di sini.
- **Edge Functions (TypeScript):** hanya orchestration yang tidak natural di SQL — kirim push notif Expo, API eksternal masa depan, cron kompleks.

**Konsekuensi:** Hindari menaruh logic bisnis di Edge Functions "karena lebih nyaman ngoding TypeScript" — itu menggeser kebenaran keluar dari DB dan membuka celah bypass yang justru ingin dihindari PRD.

## Diagram lapisan

```
┌─────────────────────────────────────────────┐
│  Expo (React Native) — thin client          │
│  Surfaces, TanStack Query cache, Realtime    │
│  → tahu CARA MENAMPILKAN, bukan ATURAN       │
└───────────────┬─────────────────────────────┘
                │ supabase-js (rpc / select / realtime / storage)
┌───────────────▼─────────────────────────────┐
│  Supabase (BaaS)                             │
│  ┌─────────────────────────────────────────┐ │
│  │ Edge Functions — orchestration only     │ │  push notif, cron kompleks
│  └─────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────┐ │
│  │ POSTGRES — sumber kebenaran             │ │
│  │  • RLS policies  (permission, search)   │ │
│  │  • triggers      (audit append-only)    │ │
│  │  • RPC functions (mutasi transaksional) │ │
│  │  • pg_cron       (Instance Repeat)      │ │
│  │  • Storage RLS   (evidence locking)     │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## Risiko & mitigasi

- **RLS recursive/lambat** pada hierarki dalam (Goal→…→Instance). → Helper function + index pada kolom PIC/parent; pertimbangkan materialized path / closure table jika query turunan berat.
- **Policy RLS sulit di-test.** → Wajib pgTAP / test SQL untuk policy sejak awal. Permission bug = kebocoran data, bukan sekadar bug UI.
- **Vendor lock-in Supabase.** → Dapat ditoleransi: ini Postgres standar, bisa self-host bila perlu. Trade-off layak demi kecepatan V1, sejalan dengan [[scope-guardrails]].

Berkaitan dengan: [[tech-stack]], [[permission-model]], [[execution-loop]], [[audit-governance]], [[database-blueprint]], [[overview]].
