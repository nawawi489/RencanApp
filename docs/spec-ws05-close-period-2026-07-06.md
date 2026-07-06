# WS-5 — Surface UI "Tutup Periode" (Close-Period Snapshot)

> Spec final, siap disambung ke `tdd-plan`. Semua klaim kode di bawah telah diverifikasi terhadap repo (branch `fix/ap03-repeat-instance-flow`, 2026-07-06).

## 1. Problem & Goals

### Problem
Backend penutupan periode skor sudah selesai sejak Fase 7: RPC `public.close_period_snapshot(p_period_id uuid) returns int` ada di `supabase/migrations/0013_fase7_people_score.sql` dan dibungkus data layer `closePeriodSnapshot(periodId)` di `mobile/src/lib/people-score.ts:368`. Namun **tidak ada satu pun entry point UI admin** untuk memanggilnya. Akibatnya sebuah periode tidak pernah bisa berpindah `active → closed` dari dalam aplikasi. Karena keputusan produk **D9** mengunci ranking hanya muncul setelah periode ditutup, tanpa surface ini **PPL-07**, **SCORE-\***, dan **PPL-05** terblokir. Ini gap tooling admin, bukan bug logika.

### Goals
1. Sediakan entry point admin untuk menutup periode aktif di `mobile/src/app/(app)/settings-score-formula.tsx` — tanpa layar baru (owner poin 1).
2. Gate render tombol via `useProfile().can('manage_score_formula')` (defense-in-depth); otorisasi otoritatif di RPC.
3. Konfirmasi destruktif dua-langkah (owner poin 3): modal ringkasan dampak → tombol final "Saya paham, tutup periode".
4. Patuhi DESIGN §4: tombol final solid `bg-brand-dark` `#1564b3` + teks putih (AA 5.99:1), touch target ≥44px, a11y eksplisit, dark-mode aware.
5. Surface hasil RPC jujur: sukses menyebut jumlah user ter-ranking (nilai balik `int`); n=0 valid; error disurface apa adanya.
6. Invalidasi cache periode pasca-sukses agar UI konsisten.

## 2. Fakta kode terverifikasi (mengoreksi draft)

| Klaim draft | Realita terverifikasi | Konsekuensi spec |
|---|---|---|
| "execute dicabut dari public, anon (0013:672) → anon tak bisa execute" | **Migration 0036** (`0036_fix_grant_public_tables.sql`) me-`GRANT EXECUTE` **setiap** fungsi public ke `authenticated` **dan** `anon`, membatalkan revoke 0013. | Satu-satunya gerbang = `has_permission` in-RPC. AC/TDD **tidak boleh** berasumsi "anon tidak bisa execute". |
| S7: tombol disabled saat `period.status==='closed'` | `getActivePeriod()` (`people-score.ts:79-88`) hard-filter `.eq('status','active')`. Query `['active_period']` **tak pernah** mengembalikan baris closed. | Cabang "disabled untuk closed" **UNREACHABLE** → dihapus. Finalitas dinyatakan via refetch→null (tombol hilang) + race E1 di jalur mutasi. |
| Reuse `Button variant="primary"` cukup untuk a11y | `Button` (`ui.tsx:53-55`) meng-hardcode `accessibilityLabel={label}`, tanpa prop `accessibilityLabel`/`accessibilityRole`. | Kontrak a11y (label menyebut period_name) **tidak bisa** dipenuhi Button apa adanya → perluas `Button` atau tombol kustom. |
| "reopen via jalur Super Admin aplikasi" | Tidak ada RPC reopen; `period_snapshots` punya trigger `tg_block_delete_append_only` + status check constraint satu-arah. | Satu-satunya reopen = intervensi DB manual privileged. Copy tidak boleh menjanjikan undo. |
| `has_permission` = "CEO saja" | `has_permission` (`0005:21-33`) true untuk `role_level='ceo'` **atau** pemegang grant eksplisit `user_permissions`. c_level/management default **hanya** create_*. `manage_score_formula` ke non-CEO hanya via grant eksplisit (0017). RPC **tidak** cek role_level. | Gate efektif = "pemegang `manage_score_formula`". Owner harus memutuskan (open question binding #1). |

## 3. Non-Goals
Lihat daftar `non_goals` terstruktur. Ringkas: tanpa layar baru; tanpa perubahan backend/skema; tanpa reopen/undo UI; tanpa gate `role_level='ceo'` baru (kecuali owner pilih Opsi B); tanpa membangun ranking/People view; tanpa open-period UI (diangkat sebagai risiko); tanpa mengandalkan pertahanan grant-level yang sudah hilang.

## 4. User Stories

- **US-1 (happy path):** CEO/Owner (pemegang `manage_score_formula`) menutup periode `active` → dua-langkah konfirmasi → RPC → pesan sukses menyebut jumlah ter-ranking → tombol hilang.
- **US-2 (tidak ada periode aktif):** kartu menampilkan state kosong; tombol tidak dirender; tidak ada RPC. Copy kosong **tidak** menjanjikan "Buka periode skoring" selama tak ada UI-nya.
- **US-3 (batal):** batal di langkah 1/2 sebelum submit → tidak ada efek samping.
- **US-4 (error/race):** periode sudah closed / tak ditemukan / tak berwenang → pesan error disurface + refetch; atomik, tanpa state parsial.
- **US-5 (non-pemegang permission):** guard layar existing memblokir; jika non-CEO di-grant `manage_score_formula`, mereka mengikuti US-1 (permission, bukan role). RPC menolak bypass.
- **US-6 (PIC/Reviewer):** tidak terkait; anti-self-approval N/A (aksi org-level). Setelah close, ranking (PPL-05) terlihat sesuai RLS `ranking_snapshots`.

### Matriks peran × kemampuan
| Peran | Lihat layar Score Formula | Lihat tombol Tutup Periode | Menutup periode |
|---|---|---|---|
| CEO / Super Admin | Ya | Ya (saat ada periode active) | Ya |
| C-Level/Manager tanpa grant | Tidak | Tidak | Tidak |
| C-Level/Manager di-grant `manage_score_formula` | Ya | Ya | Ya (via permission) [lihat OQ #1] |
| Staff/PIC/Reviewer | Tidak | Tidak | Tidak |

## 5. Functional Requirements

**Penempatan**
- FR-1 Surface berada di `settings-score-formula.tsx` dalam `SectionCard` "Periode aktif" (sekitar baris 455-476). Tanpa layar baru.
- FR-2 Tombol pemicu hanya dirender saat `getActivePeriod()` mengembalikan baris `status='active'` (bukan null, bukan isError). Tidak ada cabang "disabled untuk closed" (unreachable).
- FR-3 Tombol pemicu bergaya sekunder/netral (non-destruktif — hanya membuka dialog).

**Permission**
- GOV-1 Render tombol digate `useProfile().can('manage_score_formula')`, konsisten guard layar induk (baris 438).
- GOV-2 Gate UI = kenyamanan; otorisasi otoritatif di RPC `has_permission('manage_score_formula')` (`0013:629`). Klien tidak menebak aturan bisnis.

**Konfirmasi dua-langkah**
- FR-4 Wajib dua-langkah: (1) modal ringkasan dampak dengan tombol lanjut non-final + batal; (2) tombol final "Saya paham, tutup periode".
- FR-5 Modal langkah-1 menampilkan minimal: `period_name` + rentang tanggal, dan ringkasan dampak (ranking di-freeze, skor final, tidak dapat dibuka kembali dari aplikasi). Copy memparafrase perilaku faktual RPC.
- FR-6 Kedua langkah dapat dibatalkan tanpa efek samping sebelum submit.

**RPC & data layer**
- FR-7 Konsumsi wrapper `closePeriodSnapshot` (`people-score.ts:368`), bukan `supabase.rpc` langsung.
- FR-8 Mutation hook baru `useClosePeriod()` (standalone; rekomendasi). onSuccess invalidate `['active_period']`, `['latest_closed_period']`, `['ranking']`.
- FR-9 Tombol final loading/disabled selama in-flight; cegah double-submit; **modal tidak dapat ditutup pengguna selama pending** (gesture back/Escape/overlay-tap terkunci).
- FR-10 Sukses menampilkan jumlah ter-ranking (nilai `int`); n=0 ditangani sebagai sukses.

**Styling & a11y (DESIGN §4)**
- FR-11 Tombol final solid `bg-brand-dark #1564b3` + `text-white` (setara `variant="primary"`). BUKAN `brand #208aef` (gagal AA), BUKAN `variant="danger"` (outline merah). Semantik destruktif dibawa label + alur.
- FR-12 Semua kontrol touch target ≥44px.
- FR-13 Modal & tombol theme-aware (`dark:*`).
- FR-14 **Kontrak a11y tombol final tidak bisa dipenuhi `Button` apa adanya** (`accessibilityLabel` hardcoded = teks tampak; tak ada `accessibilityRole`). Implementasi WAJIB salah satu: (a) perluas `Button` untuk menerima `accessibilityLabel` opsional (dan `accessibilityRole` bila perlu), atau (b) tombol kustom di modal. Kontainer konfirmasi `accessibilityRole="alert"`; tombol final `accessibilityLabel` menyebut periode; `accessibilityState={{disabled,busy}}`.
- FR-15 Muat pada viewport ~390px tanpa tabel/daftar besar.

**Umpan-balik (dikunci)**
- FR-16 Mekanisme umpan-balik sukses **dan** error = **inline di dalam modal** (bukan toast — tidak ada toast standar di codebase). Error terminal (E1/E2) tetap memicu refetch `['active_period']`.

**Idempotensi, error, governance**
- GOV-3 Aksi final append-only; tanpa reopen UI; copy mencerminkan finalitas.
- GOV-4 Audit `period_closed` + `ranked_users` ditulis server; tanpa audit sisi klien.
- GOV-5 Anti-self-approval N/A; `closed_by=auth.uid()` untuk audit.
- GOV-6 Org-scoped implicit via RLS SELECT (RPC tidak re-check organization_id — lihat AC-WS5-23).
- NEG-1..3 Periode sudah closed / tak ditemukan / error tak terduga ditangkap, disurface, tanpa state optimistik; atomik.

## 6. Data Contracts

**Tidak ada perubahan skema atau RPC.** Backend final di 0013.

RPC (dipakai apa adanya):
```sql
public.close_period_snapshot(p_period_id uuid) returns int
  language plpgsql security definer set search_path = ''
```
- Sukses: `int` = jumlah baris `ranking_snapshots` (bisa 0).
- Error (Bahasa Indonesia, surface apa adanya): `Anda tidak berwenang mengelola Score Formula.` / `Periode tidak ditemukan.` / `Periode ini sudah ditutup dan tidak bisa diubah.`
- **Grant:** revoke 0013:672 **sudah dibatalkan** oleh 0036 (execute ke authenticated+anon). Satu-satunya barrier = `has_permission` in-RPC.

Wrapper lib (tanpa perubahan):
```ts
export async function closePeriodSnapshot(periodId: string): Promise<number> {
  const { data, error } = await supabase.rpc('close_period_snapshot', { p_period_id: periodId });
  if (error) throw error;
  return data as number;
}
```

Hook baru (satu-satunya kode data):
```ts
export function useClosePeriod() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (periodId: string) => closePeriodSnapshot(periodId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active_period'] });
      qc.invalidateQueries({ queryKey: ['latest_closed_period'] });
      qc.invalidateQueries({ queryKey: ['ranking'] });
    },
  });
  return { closePeriod: (id: string) => m.mutateAsync(id), isPending: m.isPending };
}
```

RLS (kontrak, tanpa perubahan): `period_snapshots_select` = `organization_id = current_user_org()` (semua anggota org bisa membaca; gate hanya di tombol close). Write hanya via RPC definer. `ranking_snapshots_select` restriktif (self / `manage_score_formula` / supervisor). Cross-org: satu-satunya batas adalah RLS SELECT yang menyembunyikan baris org lain (RPC tidak re-check organization_id).

## 7. Acceptance Criteria
Lihat daftar `acceptance_criteria` terstruktur (AC-WS5-01 … AC-WS5-24). Semua Given/When/Then dan dapat diuji. Sorotan yang diubah dari draft:
- AC-WS5-03: copy state-kosong pasca-close tidak menyesatkan (mengganti "Buka periode skoring...").
- AC-WS5-10/14: mekanisme umpan-balik terkunci inline-di-modal; a11y label butuh Button diperluas/tombol kustom.
- AC-WS5-15: n=0 = sukses (bukan error), tetap teraudit.
- AC-WS5-20: cabang isError baru + "Coba lagi".
- AC-WS5-23: isolasi lintas-org dites eksplisit (satu-satunya tenant boundary).
- AC-WS5-24: append-only ditegakkan; tidak ada Undo.

## 8. Edge Cases & Error States

| Kode | Skenario | Perilaku RPC | Perilaku UI |
|---|---|---|---|
| S1 | profileLoading | — | SkeletonCard existing |
| S2 | tanpa `manage_score_formula` | — | Guard layar existing; tombol tak dirender |
| S3 | periodLoading | — | "Memuat…" existing; tombol tak dirender |
| S4 | period == null | — | State kosong (copy tidak menyesatkan); tombol tak dirender |
| S5 | isError fetch periode | — | Pesan + "Coba lagi" (refetch); tombol tak dirender |
| S6 | status='active' | prasyarat | Tombol enabled → dialog dua-langkah |
| E1 | sudah closed (race) | raise "sudah ditutup" | Pesan inline + refetch; tanpa retry otomatis |
| E2 | id tidak ada | raise "tidak ditemukan" | Pesan inline + invalidate |
| E3 | race dua admin | `FOR UPDATE` serialisasi; yang kalah → E1 | Pesan E1; tanpa korup (atomik) |
| E4 | tidak ada skor current | sukses, v_count=0 | Sukses dengan copy "0 pengguna" (AC-WS5-15) |
| E5 | gagal mid-transaction | rollback; status tetap active | Error inline + refetch; bisa coba lagi |
| — | S7 (disabled untuk closed) | — | **Tidak diimplementasikan — unreachable** |

Aturan pending: saat mutasi in-flight, tombol final disabled + indikator, modal tidak bisa ditutup pengguna, tanpa retry otomatis untuk aksi destruktif.

## 9. Open Questions

> [!done] Resolusi owner (2026-07-06) — binding OQ diputuskan:
> - **Gate izin** → **Opsi A**: permission `manage_score_formula` sebagai definisi resmi (tanpa perubahan backend; default seed = hanya CEO). JANGAN implementasi gate `role_level='ceo'`.
> - **Open-period (risiko produk)** → **WS-5 tetap close-only**; open-period ditangani terpisah (owner sadar aksi satu-arah).
> - **Kebijakan n=0** → **Opsi A**: izinkan close menghasilkan 0 ranking; copy sukses "0 pengguna" (AC-WS5-15).
> - **Copy final** → kandidat di AC dipakai sebagai default; owner approve/tweak saat review PR.
> - **Governance (audit penolakan)** & **grant-level 0036** → diterima apa adanya (di luar scope WS-5); TDD tidak berasumsi "anon tak bisa execute".

Detail lengkap tiap OQ di Lampiran C.

## 10. Handoff ke TDD
Lihat `tdd_handoff` terstruktur. Ringkas: tulis test-first untuk (a) render conditional + cabang isError di `settings-score-formula.tsx`, (b) hook `useClosePeriod()` + invalidasi, (c) modal dua-langkah + a11y (butuh `Button` diperluas / tombol kustom), (d) inline feedback sukses/n=0/error, (e) double-submit + dismiss-lock saat pending, (f) DB contract test menegakkan invarian RPC (atomik, unauthorized, re-close, cross-org → "Periode tidak ditemukan.", audit fields actor/org/ranked_users termasuk n=0, append-only). Jangan implementasi gate `role_level='ceo'` kecuali owner memilih Opsi B (memperluas scope ke backend). Jangan berasumsi "anon tidak bisa execute". Jangan implementasi state S7.

---

## Lampiran A — Acceptance Criteria (lengkap)

- AC-WS5-01 (Tombol muncul di kartu Periode aktif): GIVEN user dengan permission manage_score_formula membuka settings-score-formula.tsx AND ada satu period_snapshots berstatus 'active' untuk org-nya, WHEN SectionCard 'Periode aktif' dirender, THEN tombol pemicu 'Tutup Periode' tampil di dalam kartu berdekatan dengan nama periode/badge status.
- AC-WS5-02 (Tidak ada periode aktif → tombol tidak dirender): GIVEN getActivePeriod() mengembalikan null (state 'Belum ada periode skoring'), WHEN kartu dirender, THEN tombol 'Tutup Periode' TIDAK dirender.
- AC-WS5-03 (Post-close copy kosong tidak menyesatkan): GIVEN sebuah periode baru saja ditutup sehingga active_period kini null, WHEN kartu 'Periode aktif' menampilkan state kosong, THEN copy GuidanceNote TIDAK menjanjikan aksi yang tak punya UI (mis. bukan 'Buka periode skoring...' selama tidak ada UI open-period) dan menyatakan bahwa periode telah ditutup / tidak ada periode aktif.
- AC-WS5-04 (Gate permission UI, defense-in-depth): GIVEN user tanpa permission manage_score_formula, WHEN membuka layar Score Formula, THEN guard layar existing (settings-score-formula.tsx:438-447) menampilkan 'Anda tidak memiliki akses untuk mengelola Score Formula.' AND tombol 'Tutup Periode' tidak pernah dirender.
- AC-WS5-05 (Langkah 1 modal ringkasan dampak): GIVEN kartu dengan periode 'active' dan user ber-permission, WHEN user menekan tombol pemicu 'Tutup Periode', THEN muncul modal berisi nama periode + ringkasan dampak (ranking di-freeze, skor tiap user final, periode tidak dapat dibuka kembali dari aplikasi) AND tombol batal AND tombol lanjut non-final.
- AC-WS5-06 (Langkah 2 tombol konfirmasi final): GIVEN modal langkah 1 terbuka, WHEN user menekan tombol lanjut, THEN tombol final berlabel 'Saya paham, tutup periode' tersedia AND HANYA tombol final ini yang memicu RPC.
- AC-WS5-07 (Batal di langkah manapun tidak memanggil RPC): GIVEN modal terbuka (langkah 1 atau 2), WHEN user menekan batal/tutup/(web) Escape SEBELUM submit, THEN closePeriodSnapshot TIDAK dipanggil AND status periode tetap 'active', tidak ada baris ranking_snapshots/activity_logs baru.
- AC-WS5-08 (Tombol final: fill solid brand-dark + teks putih): GIVEN tombol final dirender, WHEN style dievaluasi, THEN background = brand-dark #1564b3 (AA 5.99:1) dan teks putih (setara variant='primary'), BUKAN brand #208aef (3.53:1 gagal AA) dan BUKAN variant='danger' (outline merah).
- AC-WS5-09 (Touch target ≥44px): GIVEN tombol pemicu, lanjut, final, dan batal, WHEN dimensi diukur, THEN tinggi/target sentuh masing-masing ≥44px (DESIGN §4 rule 1).
- AC-WS5-10 (A11y tombol final memenuhi kontrak yang tidak bisa dipenuhi Button apa adanya): GIVEN tombol final, WHEN dibaca screen reader, THEN accessibilityLabel eksplisit menyebut periode (mis. 'Tutup periode {period_name}') — bukan sekadar teks tombol — AND accessibilityState={{disabled,busy}} merefleksikan state; karena komponen Button meng-hardcode accessibilityLabel=label, implementasi WAJIB memperluas Button (prop accessibilityLabel opsional) atau memakai tombol kustom.
- AC-WS5-11 (Kontainer konfirmasi mengumumkan intent destruktif): GIVEN modal konfirmasi, WHEN dibaca screen reader, THEN kontainer/ringkasan dampak memakai accessibilityRole='alert' (konsisten pola baris 442/330 ui.tsx).
- AC-WS5-12 (Dark mode aware): GIVEN perangkat mode gelap, WHEN modal+tombol dirender, THEN warna background/border memakai varian dark:* yang benar dan fill tombol final tetap brand-dark + teks putih di kedua mode.
- AC-WS5-13 (Sukses memanggil RPC dengan period id aktif): GIVEN user menekan 'Saya paham, tutup periode' untuk periode active id=P, WHEN aksi dieksekusi, THEN closePeriodSnapshot(P) memanggil rpc('close_period_snapshot',{p_period_id:P}) AND mengembalikan integer n = jumlah baris ranking_snapshots (GET DIAGNOSTICS v_count, 0013:661).
- AC-WS5-14 (Umpan balik sukses inline-di-modal menyebut jumlah, n>0): GIVEN RPC mengembalikan n>0, WHEN UI memproses hasil, THEN pesan sukses inline (di dalam modal sebelum ditutup — mekanisme umpan-balik terkunci = inline-in-modal, bukan toast) menyebut jumlah pengguna ter-ranking (mis. 'Ranking untuk {n} pengguna telah dibekukan') AND modal tertutup setelah dikonfirmasi/otomatis.
- AC-WS5-15 (Sukses n=0 diperlakukan sukses, bukan error): GIVEN RPC mengembalikan n=0 (belum ada user_score_results is_current), WHEN UI memproses hasil, THEN status akhir = sukses (periode benar-benar closed dan teraudit) DAN copy jujur bahwa tidak ada ranking dibekukan (mis. 'Periode ditutup, tetapi belum ada skor terhitung sehingga tidak ada ranking (0 pengguna).') — n=0 TIDAK di-framing sebagai kegagalan.
- AC-WS5-16 (Invalidasi cache setelah sukses): GIVEN penutupan berhasil, WHEN mutasi selesai, THEN query key ['active_period'], ['latest_closed_period'], dan ['ranking'] di-invalidate/refetch AND kartu 'Periode aktif' memperbarui tampilan (periode tidak lagi active; per AC-WS5-02 tombol menghilang).
- AC-WS5-17 (Idle→loading→hasil; double-submit tercegah; dismiss terkunci saat pending): GIVEN tombol final ditekan, WHEN RPC in-flight, THEN tombol final disabled + indikator loading AND penekanan berulang TIDAK memicu RPC kedua AND modal tidak dapat ditutup pengguna (gesture back/Escape/overlay-tap dinonaktifkan) selama pending.
- AC-WS5-18 (Error periode sudah tertutup → pesan + refetch): GIVEN periode target sudah 'closed' (race dengan admin lain), WHEN RPC dipanggil, THEN RPC raise 'Periode ini sudah ditutup dan tidak bisa diubah.' (0013:634-635) AND UI menampilkan pesan itu inline-di-modal AND meng-invalidate/refetch ['active_period'] sehingga tombol close hilang; UI tidak berpindah diam-diam ke state sukses.
- AC-WS5-19 (Error tanpa izin di server / bypass UI): GIVEN klien tanpa manage_score_formula memanggil RPC langsung, WHEN RPC dieksekusi, THEN RPC raise 'Anda tidak berwenang mengelola Score Formula.' (0013:629-630) AND UI menyurface pesan itu apa adanya (tidak di-swallow) AND tidak ada baris ranking_snapshots/activity_logs tertulis.
- AC-WS5-20 (Error memuat periode: cabang isError baru + Coba lagi): GIVEN useActivePeriod().isError === true, WHEN kartu 'Periode aktif' dirender, THEN tampil pesan ringkas 'Gagal memuat periode. Coba lagi.' dengan accessibilityRole='alert' AND tombol 'Coba lagi' memanggil refetch() AND tombol 'Tutup Periode' TIDAK dirender di atas data yang gagal dimuat.
- AC-WS5-21 (Atomik: kegagalan tidak meninggalkan state parsial): GIVEN insert ranking_snapshots gagal di tengah transaksi, WHEN RPC di-rollback, THEN period_snapshots.status TETAP 'active', tidak ada ranking parsial, dan tidak ada entri period_closed (AC-7.19) AND UI menampilkan error dan periode tetap dapat ditutup ulang.
- AC-WS5-22 (Audit trail actor+org+ranked_users pada sukses): GIVEN penutupan berhasil, WHEN transaksi commit, THEN period_snapshots di-update status='closed', closed_at=now(), closed_by=auth.uid() (0013:663-665) AND satu activity_logs ditulis via write_activity(...,'period_closed',{ranked_users:n}) dengan actor_id=auth.uid() dan organization_id=current_user_org() (write_activity 0005) — termasuk saat n=0.
- AC-WS5-23 (Isolasi lintas-org — satu-satunya tenant boundary): GIVEN caller pada org A memanggil close_period_snapshot dengan p_period_id milik org B, WHEN RPC dieksekusi, THEN 'SELECT ... FOR UPDATE' tidak menemukan baris (disembunyikan RLS period_snapshots_select organization_id=current_user_org(), 0013:793) sehingga RPC raise 'Periode tidak ditemukan.' — RPC TIDAK me-recheck organization_id secara eksplisit, jadi RLS SELECT adalah satu-satunya batas; AC ini menjaga batas tersebut.
- AC-WS5-24 (Append-only ditegakkan; tidak ada Undo): GIVEN periode telah ditutup, WHEN klien mencoba UPDATE/DELETE langsung period_snapshots/ranking_snapshots, THEN ditolak (tidak ada RLS write policy + trigger tg_block_delete_append_only 0013) AND UI tidak menampilkan tombol Undo/Buka kembali.

## Lampiran B — Non-Goals (lengkap)

- Tidak membuat layar baru — surface menumpang di settings-score-formula.tsx di dalam SectionCard 'Periode aktif' (keputusan owner poin 1).
- Tidak mengubah backend/skema — RPC close_period_snapshot, tabel period_snapshots/ranking_snapshots, trigger append-only, dan RLS sudah final di migration 0013; WS-5 tidak menambah/mengubah RPC, kolom, atau policy.
- Tidak menambah gate role_level='ceo' baru di RPC — kecuali owner memilih Opsi B pada open question izin, yang secara eksplisit MEMPERLUAS scope ke perubahan backend di luar WS-5.
- Tidak menyediakan 'Buka kembali / Undo / reopen periode' dari UI — tidak ada RPC reopen; penutupan final by design (D9). Tidak ada override Super Admin yang diekspos di frontend; satu-satunya jalur reopen adalah intervensi DB manual privileged (bukan 'jalur Super Admin aplikasi' — koreksi klaim draft).
- Tidak membangun/mengubah tampilan ranking, People tab, atau visibilitas skor (itu PPL-05/PPL-07/SCORE-* yang WS-5 hanya buka gerbangnya).
- Tidak menambah 'Buka Periode' (open_period_snapshot) — TAPI ketiadaan UI open-period diangkat sebagai risiko/dependensi produk (lihat open questions), bukan disingkirkan diam-diam.
- Tidak menyentuh calculate_period_scores maupun override_user_score.
- Tidak menambah gate/audit anti-self-approval untuk close (aksi org-level, bukan override skor pribadi); audit sukses via closed_by=auth.uid() + activity_logs sudah cukup untuk jalur sukses.
- Tidak membangun modal/tabel besar — ringkasan dampak berupa teks ringkas yang muat di viewport ~390px, tanpa render daftar peserta ranking.
- Tidak mengandalkan pertahanan grant-level ('anon/public tidak bisa execute') — pertahanan itu sudah dibatalkan migration 0036; TDD/AC tidak boleh berasumsi demikian.

## Lampiran C — Open Questions (lengkap)

1. BINDING — Gate izin literal 'CEO/Owner saja' vs permission 'manage_score_formula'. Terverifikasi di kode: has_permission (0005:21-33) true untuk role_level='ceo' ATAU pemegang grant eksplisit user_permissions; c_level/management HANYA dapat create_* by default (bukan manage_score_formula) — jadi non-CEO bisa memegang manage_score_formula hanya via grant eksplisit (migration 0017). RPC TIDAK mengecek role_level='ceo'. Owner harus memilih: (A) terima 'manage_score_formula' sebagai definisi resmi izin (status quo, tanpa kode baru) — DEFAULT SPEC; atau (B) tambah gate role_level='ceo' di UI dan RPC (perubahan backend di luar scope WS-5, memperluas scope). Spec memilih (A) agar TDD deterministik; pilihan B harus dinyatakan eksplisit oleh owner sebelum implementasi karena mengubah scope.

2. BINDING — Kebijakan n=0 (belum ada user_score_results is_current; calculate_period_scores belum dijalankan). RPC mengizinkan close menghasilkan 0 ranking. Owner harus memilih: (A) izinkan close dengan copy sukses '0 pengguna' — DEFAULT SPEC (AC-WS5-15); atau (B) blokir/peringatkan pra-close, yang membutuhkan query pra-close user_score_results is_current (belum ada wrapper lib — tambahan scope). Spec memilih (A).

3. BINDING — Copy final Bahasa Indonesia untuk: (1) modal Langkah 1 ringkasan dampak, (2) sukses n>0, (3) sukses n=0, (4) error periode-sudah-tertutup, (5) copy state-kosong pasca-close (mengganti 'Buka periode skoring...' yang menyesatkan). Spec menyediakan kandidat konkret di AC; owner meng-approve/menolak wording sebelum merge.

4. RISIKO PRODUK — Tidak ada UI 'Buka Periode' (open_period_snapshot hanya di lib/types/tests, tidak di satu layar pun). Menutup periode via WS-5 membuat org masuk state tanpa periode aktif dan tanpa cara membuat yang baru dari aplikasi — WS-5 menjadi aksi satu-arah yang mematikan loop skoring sampai open-period UI ada. Owner harus konfirmasi: apakah 'Buka Periode' harus menyertai WS-5, atau dijamin ada di tempat lain sebelum WS-5 dipakai di produksi?

5. GOVERNANCE — Audit jalur penolakan. close_period_snapshot menulis activity_logs HANYA pada sukses (0013:667); percobaan tak-berwenang hanya raise tanpa jejak apa pun — berbeda dari override_user_score yang meng-eskalasi ke governance_violations 'critical'. Owner harus memutuskan: (A) terima 'tidak ada audit pada penolakan' secara eksplisit; atau (B) wajibkan tulisan governance_violations/activity_logs pada jalur ditolak (perubahan backend di luar scope WS-5).

6. GOVERNANCE/FAKTA — Pertahanan grant-level sudah hilang. Terverifikasi: migration 0036 (do-block, 0036:~46-56) me-GRANT EXECUTE setiap fungsi public ke authenticated DAN anon, membatalkan 'revoke ... from public, anon' di 0013:672. Satu-satunya gerbang tersisa adalah has_permission in-RPC. TDD/AC tidak boleh berasumsi 'anon tidak bisa execute'. Konfirmasi bahwa mengandalkan has_permission tunggal dapat diterima (tidak butuh perbaikan grant terpisah dalam WS-5).

7. Bentuk hook: standalone useClosePeriod() (rekomendasi spec — close adalah period action tanpa templateId) vs perluasan useFormulaActions; dan apakah invalidasi ranking memakai prefix ['ranking'] (semua view) atau spesifik ['ranking', periodId]. Spec memilih standalone + prefix ['ranking']; keputusan final diserahkan ke TDD.


## Lampiran D — TDD Handoff

**Paths:**
- `mobile/src/app/(app)/settings-score-formula.tsx`
- `mobile/src/hooks/use-people-score.ts`
- `mobile/src/hooks/use-profile.ts`
- `mobile/src/lib/people-score.ts`
- `mobile/src/components/ui.tsx`
- `mobile/src/components/workspace-help-modal.tsx`
- `supabase/migrations/0013_fase7_people_score.sql`
- `supabase/tests/` (DB contract harness untuk `close_period_snapshot`)
- `DESIGN.md`

**Ringkasan:**

WS-5 surface UI admin 'Tutup Periode' (close-period snapshot) di layar Score Formula. Pembungkus UI tipis di atas RPC close_period_snapshot(p_period_id uuid) returns int (migration 0013) — TANPA perubahan backend/skema. Tambah: (1) mutation hook standalone useClosePeriod() di mobile/src/hooks/use-people-score.ts yang memanggil closePeriodSnapshot (lib/people-score.ts:368) dan onSuccess meng-invalidate ['active_period','latest_closed_period','ranking']; (2) di settings-score-formula.tsx dalam SectionCard 'Periode aktif': render tombol pemicu 'Tutup Periode' hanya saat period.status==='active' (getActivePeriod hard-filter status active → never closed), cabang isError baru dengan tombol 'Coba lagi'→refetch, dan copy state-kosong pasca-close yang tidak menyesatkan (ganti 'Buka periode skoring...' selama tak ada open-period UI); (3) modal konfirmasi dua-langkah (pola Modal RN seperti workspace-help-modal): langkah-1 ringkasan dampak, langkah-2 tombol final 'Saya paham, tutup periode' solid bg-brand-dark #1564b3 + text-white (DESIGN §4, AA 5.99:1), accessibilityRole='alert' pada kontainer, accessibilityLabel menyebut period_name. Komponen Button (ui.tsx) meng-hardcode accessibilityLabel=label dan tanpa accessibilityRole → PERLU diperluas (prop accessibilityLabel opsional) ATAU tombol kustom untuk memenuhi kontrak a11y. Umpan-balik sukses/error = inline-di-modal (bukan toast; tidak ada toast standar di codebase). Tangani n=0 sebagai sukses; double-submit dan dismiss-saat-pending dikunci. Gate izin klien via can('manage_score_formula') sebagai defense-in-depth; otorisasi otoritatif di RPC. Tiga keputusan owner (gate izin literal, kebijakan n=0, copy final) default sudah dipilih agar test deterministik; jangan implementasi gate role_level='ceo' kecuali owner memilih Opsi B (perubahan backend, di luar scope). DB contract test menegakkan invarian RPC (atomik, unauthorized, re-close, cross-org, audit fields, append-only).
