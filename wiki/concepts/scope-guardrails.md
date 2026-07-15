---
type: concept
tags: [scope, guardrails, anti-scope-creep, decision]
updated: 2026-07-13
sources: 3
---

# Scope Guardrails

Batas scope permanen [[overview|EMS V1.8.2]] (PRD V1.8.2 §6). Berfungsi sebagai guardrail anti-scope-creep: **jika ada usulan fitur dalam daftar "ditolak", tolak.**

## Masuk V1.8.2

Auth, User profile, Organization/Department/Position/Team, Role template & permission, dua [[workspace]], Goal & Strategy Template Library, semua [[card-model|card]], [[action-plan|Task One Time/Repeat/Instance]], **Period Focus Engine** (periode aktif Bulan/Quarter, Goal tahunan konteks — §7.6), **Strategy Target Breakdown** (target tahunan dipecah ke Quarter/Bulan, total wajib 100% — §12), Kelengkapan Card (backend rule + popup), Keterangan Card, [[minimum-breakdown-rule|MBR]], Kelengkapan Perencanaan (backend rule + popup), [[execution-loop|Bukti/Nilai Hasil/Review]], [[audit-governance|Activity Log & Governance Violation]], Notifications, Inbox Initiative Chat, People (di dalam [[surfaces#Menu slot 5 V1.8.2 §7.1 §31|Menu]]), [[score-formula|Score Formula]], Repeat Compliance, basic ranking, Menu, Settings, Archive, Search, Confidential Access, Manual Score Override.

## Ditolak (jangan bangun)

Feed, Company News, Announcement, CEO Broadcast, SOP Center penuh, Knowledge Center, HRIS penuh, Payroll, Inventory, CRM, WhatsApp integration, Google Calendar integration, AI Assistant, AI Review, Native Android/iOS, Routine entity, Checklist Routine, Watcher, **Area Goal layer**, **KPI child table di bawah Area Goal**, **Bobot planning card**, **Social reaction feed / Story / Reels** (pola broadcast + popularitas).

> [!info] Pengecualian sempit — Reaction pill Initiative Chat (owner 2026-07-13)
> "Reaction pill tingkat-pesan" pada [[surfaces|Initiative Chat]] (PRD §30 komponen 6) **dikecualikan** dari larangan "Social reaction" di atas dan **diizinkan** dibangun, dengan syarat semua invarian berikut terpenuhi:
> - **Zero bobot governance/skor** — tidak masuk [[score-formula]], ranking People, atau Governance Discipline; tidak dicatat sebagai `governance_violation`/`activity_log`.
> - **Tanpa feed / leaderboard / agregasi lintas-room** — reaksi hanya tampil di bawah pesannya sendiri di dalam room; tidak ada surface "trending"/"popular".
> - **Bukan approval** — tidak menyentuh Bukti/Nilai Hasil/Review; tidak ada emoji yang diberi makna "approve" oleh sistem.
> - **Set emoji tertutup & ack-only** — whitelist server-side dibatasi ke emoji acknowledgment kerja (mis. `👍 ✅ 👀 🙏`); tanpa emoji kustom/upload; ekspresi sosial (`❤️`/`🎉`) tidak diseed di V1.
> - **Otorisasi = keanggotaan room**, sama dengan pesan (`is_chat_member`); bukan peran governance.
>
> Rasional: yang dilarang guardrail adalah *pola medsos* (broadcast, konsumsi pasif, sinyal popularitas). Reaction pill tingkat-pesan yang memenuhi invarian di atas adalah *micro-acknowledgment* antar-anggota room yang sudah saling melihat pesannya — beda kategori. Amandemen ini **memperkuat** guardrail dengan menajamkan garisnya, bukan melonggarkannya.
>
> Spec teknis: [inbox-chat-reactions](../../specs/inbox-chat-reactions.md). Milestone build tetap V2 (specs/inbox-chat-ui.md L27).

> [!info] Pengecualian sempit — Lampiran diskusi Initiative Chat (owner 2026-07-15)
> "Lampiran diskusi (gambar) tingkat-pesan" pada [[surfaces|Initiative Chat]] (PRD §30 komponen 11 pasca-amandemen) **dikecualikan** dari rule "Bukti tetap dikirim melalui Task" (PRD §30 Rule 4) yang **dipersempit** menjadi "Bukti *formal* tetap dikirim melalui Task; lampiran diskusi informal boleh di chat." Fitur ini **diizinkan** dibangun, dengan syarat semua invarian berikut terpenuhi:
> - **Zero bobot governance/skor** — tidak masuk [[score-formula]], ranking People, atau Governance Discipline; tidak dicatat sebagai `governance_violation`/`activity_log`.
> - **Tanpa promosi ke Bukti** — tidak ada tombol/RPC/pointer yang mengubah lampiran chat menjadi Bukti Task; whitelist `evidence_files.kind` tidak bertambah.
> - **Bukan input Review** — lampiran chat tidak pernah muncul di layar Review; Reviewer menilai dari Bukti Task, bukan dari foto di chat.
> - **Batas ditegakkan struktural di database**, bukan hanya konvensi UI: bucket terpisah (`chat-attachments`), tanpa FK ke `evidence_files`/`action_plan_submissions`, Score Formula buta terhadap kolom lampiran.
> - **Otorisasi = keanggotaan room + workspace-viewer + confidential-aware** (bukan member-only seperti Reaction pill): CEO/audit yang punya `can_view_workspace` boleh melihat, kecuali action plan confidential — di situ hanya CEO/PIC/grantee yang lolos.
>
> Rasional: yang dilarang Rule 4 lama adalah *bukti informal masuk jalur formal dan mencemari Review/Score* (integritas scoring). Larangan tumpul "semua file di chat dilarang" ikut memblokir klarifikasi visual yang sah — dan pihak yang paling mungkin butuh (Reviewer, PIC induk) justru yang paling pasti ditolak alur Bukti Task karena bukan PIC. Amandemen ini **memperkuat** garis formal/informal: memindahkannya dari "aturan yang dihafal" ke "invarian yang ditegakkan Postgres."
>
> Spec teknis: [inbox-chat-attachments](../../specs/inbox-chat-attachments.md). Milestone build V2; larangan `specs/inbox-chat-ui.md` L192 tetap berlaku sampai V2 dijadwalkan.

## Guardrail filosofis

- **Tanpa bobot pada planning card** — bobot hanya ada di [[score-formula]].
- Card "diaktifkan", bukan "dipublish/diposting".
- UI Bahasa Indonesia; hindari istilah Parent/Child/Publish/Validation Error di UI bisnis.

> [!info] Kontribusi/Target Breakdown ≠ Bobot planning card
> V1.8.2 memasukkan **Strategy Target Breakdown** (§12.2: total kontribusi periode wajib 100%) **dan tetap menolak** "Bobot planning card". Keduanya beda konsep dan sengaja dipisah:
> - **Diizinkan** — *target-phasing satu kartu atas dirinya sendiri*: target tahunan Strategy dipecah lintas Quarter/Bulan (baris breakdown ber-key `strategy_id + periode`). Bukan layer/hierarki baru.
> - **Ditolak** — *bobot antar-kartu untuk skor*: kartu turunan membawa bobot yang mengakumulasi ke skor parent. Itu hanya ada di [[score-formula]].
> Implementasi Target Breakdown **wajib** sebagai baris pada Strategy, **bukan** tabel kartu anak (kalau jadi tabel kartu anak = melanggar "KPI child table di bawah Area Goal").

> [!warning] Tafsiran "Native app"
> PRD melarang "Native app" sebagai scope creep. [?] Tafsiran tim: ini melarang penambahan fitur native berlebih, bukan melarang React Native sebagai fondasi mobile ([[tech-stack]]). Perlu konfirmasi pemilik produk.

Berkaitan dengan: [[overview]], [[tech-stack]], [[database-blueprint]], [[card-model]].
