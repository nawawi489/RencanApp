# Spec: Sweeper Otomatis Objek Orphan di `chat-attachments`

Status: DEFERRED — bergantung telemetri 4 minggu pasca-landing V2 lampiran chat.
Milestone target: V2.x (post-attachments), TIDAK dalam scope V2 attachments awal.
Sumber yang dihormati: `specs/inbox-chat-attachments.md` §6.5/§6.6/FR-ATT-1.5, keputusan owner OWNER-F (2026-07-15, opsi a = defer), pola pg_cron di `supabase/migrations/0043_activity_logs_retention.sql`, pola append-only+DEFINER di `supabase/migrations/0008_fase3_collab.sql:1037-1044`.

---

## 1. Konteks & keputusan yang mengikat

Dua garis pertahanan sudah ada terhadap objek orphan di bucket `chat-attachments`:

1. **Pre-commit cleanup (klien)** — FR-ATT-1.5: bila RPC `send_chat_message_with_attachments` gagal, klien menjalankan `Promise.allSettled` untuk `storage.remove()` seluruh path yang sudah ter-upload. Ini menutup kegagalan yang terdeteksi klien (validasi server, RLS reject, network mid-RPC).
2. **Immutability by design (bucket)** — §6.5: bucket `chat-attachments` **tidak memiliki policy UPDATE/DELETE**. Delete hanya boleh via RPC SECURITY DEFINER yang eksplisit di-grant. Konsekuensinya, objek yatim (upload sukses → chat message tidak commit karena crash klien, kill-process, hilang jaringan setelah upload) **tidak dapat dibersihkan** tanpa jalur baru.

**OWNER-F (2026-07-15, terkunci):** sweeper otomatis **DEFER**. Alasan mengikat — jangan direnegosiasi tanpa data baru:
- (a) Menambah komponen operasional (schedule + monitoring + failure mode) di atas bucket yang immutability-nya baru saja dibangun.
- (b) Auto-delete berbasis retensi manual bertentangan dengan immutability by design; menempatkan "jam-berapa-hapus" sebagai bug surface baru.
- (c) Retensi tanpa telemetri = tebakan. Sebelum ada angka volume nyata, tidak ada dasar memilih 24 jam vs 7 hari vs 30 hari, dan tidak ada dasar menerima trade-off `false-delete` (menghapus objek yang path-nya belum sempat di-persist tapi in-flight).

Spec ini karena itu **bukan** rencana implementasi. Ia adalah:
- Prasyarat data yang harus dikumpulkan sebelum sweeper boleh dibangun (§3).
- Rancangan sweeper **bersyarat** — hanya diaktifkan jika telemetri melewati ambang batas (§4).
- Test kontrak yang HARUS dipenuhi sebelum sweeper apapun landing (§5).

---

## 2. Non-Goals

- Bukan pengganti pre-commit cleanup klien — FR-ATT-1.5 tetap first line.
- Bukan pengganti immutability — sweeper adalah **satu-satunya** pengecualian eksplisit terhadap §6.5, bukan pintu masuk untuk delete lain.
- Bukan retensi konten aktif — sweeper HANYA menghapus objek yang tidak terreferensi di manapun.
- Bukan penggantian bucket dengan lifecycle policy S3-style — Supabase Storage tidak mengekspos itu di semua tier, dan lifecycle policy tidak bisa cek referensi ke tabel aplikasi.

---

## 3. Prasyarat telemetri (WAJIB sebelum §4 boleh dieksekusi)

Sebelum sweeper apapun dibangun, kumpulkan minimum **4 minggu** data pasca-landing fitur V2 lampiran chat. Metrik yang harus tersedia:

| Metrik | Sumber | Ambang keputusan |
|---|---|---|
| Total objek `chat-attachments` per minggu | `storage.objects` count | baseline |
| Total bytes objek `chat-attachments` per minggu | `sum(metadata->>'size')` di `storage.objects` | baseline |
| **Jumlah objek orphan** (di storage, tidak di `chat_messages.attachments` manapun) per minggu | anti-join (§4.b) dijalankan **read-only** sebagai query telemetri | ambang keputusan build |
| **Bytes objek orphan** per minggu | idem, sum size | ambang keputusan build |
| Rasio orphan/total (obyek dan bytes) | derived | health signal |

**Aturan keputusan build:**

- Jika rasio orphan **< 5%** DAN volume orphan absolut **< 500 MB/bulan** → sweeper **tidak dibangun**. Biaya storage cukup diterima. Spec ini ditutup permanen. Tulis catatan penutup di `wiki/log.md`.
- Jika rasio orphan **≥ 5%** ATAU volume orphan absolut **≥ 500 MB/bulan** → lanjut ke §4.
- Angka ambang di atas adalah **default rekomendasi** — owner boleh mengkalibrasi ulang saat evaluasi telemetri berdasarkan biaya Supabase storage aktual di paket berjalan. Yang tidak boleh: memutuskan tanpa data.

**Instrumentasi telemetri** (murah, boleh dibangun bersama V2 attachments):
- Query anti-join disimpan sebagai view read-only `v_chat_attachment_orphan_audit` (SECURITY INVOKER, grant service_role only).
- Cron mingguan menulis snapshot count+bytes ke `activity_logs` (event=`telemetry_orphan_snapshot`) — reuse pola `write_activity` yang sudah ada.
- Tidak ada delete apapun di fase telemetri. Read-only murni.

---

## 4. Rancangan sweeper (bersyarat, hanya jika §3 melewati ambang)

### 4.a Mekanisme: pg_cron vs Edge Function scheduled

| Aspek | pg_cron (rekomendasi) | Edge Function scheduled |
|---|---|---|
| Sudah dipakai di repo | Ya (`0007`, `0008`, `0043`) | Belum untuk cleanup |
| Biaya operasional | Nol tambahan (satu extension) | Invocation + cold start per run |
| Auditability | `cron.job_run_details` + `activity_logs` dari fungsi | Edge Function logs (terpisah) + `activity_logs` |
| Akses storage | Perlu `storage.delete_object()` atau REST via `pg_net` (owner sudah setujui pg_net di push-notif spec) | Native Supabase JS `storage.remove()` — lebih ergonomis |
| Failure mode | Rollback SQL transaction bersih; delete storage non-transaksional → butuh dedupe (§4.d) | Sama untuk storage, plus jaringan Edge |
| Skala | Batch DB-native | Terikat 150s Edge timeout |

**Pilih pg_cron**, dipanggilkan RPC DEFINER `sweep_orphan_chat_attachments()` yang menggunakan `pg_net` untuk memanggil Supabase Storage REST endpoint `DELETE /storage/v1/object/chat-attachments/{path}` per objek (pattern konsisten dengan push-notif outbox+drainer). Alternatif Edge Function baru dievaluasi jika pg_net terbukti tidak reliable pada volume nyata.

### 4.b Predikat "orphan"

Objek `o` di bucket `chat-attachments` dikategorikan orphan jika **semua** benar:

1. `o.bucket_id = 'chat-attachments'`
2. `o.created_at < now() - interval 'X'` — nilai `X` = keputusan retensi berbasis telemetri §3, bukan tebakan. Batas bawah aman: **≥ 24 jam** (memberi ruang klien retry pre-commit, jaringan hunian sesi mobile).
3. `o.name` tidak muncul di ekstraksi path dari `chat_messages.attachments` manapun. Asumsi format `attachments` = `jsonb` array of objects dengan field `path` (dikunci di spec inbox-chat-attachments §6.5).

Query anti-join (referensi implementasi):

```sql
select o.name, o.bucket_id, o.created_at
from storage.objects o
where o.bucket_id = 'chat-attachments'
  and o.created_at < now() - make_interval(hours => p_retention_hours)
  and not exists (
    select 1
    from public.chat_messages m,
         jsonb_array_elements(m.attachments) att
    where att->>'path' = o.name
  )
order by o.created_at
limit p_batch_size;
```

Catatan penting:
- **Anti-join lintas-org, by design.** Path terreferensi di org manapun melindungi objek. Ini jaring pengaman: kalau ternyata path pernah ter-share lintas-org via bug, sweeper tidak akan menghapus. Isolasi org tetap ditegakkan di lapisan RPC baca (`read_chat_attachment_url`), bukan di sweeper.
- **`chat_messages.attachments` harus punya GIN index** pada `(attachments jsonb_path_ops)` sebelum sweeper diaktifkan — anti-join tanpa index akan mem-full-scan tabel chat setiap run.
- Batch `LIMIT p_batch_size` (default 500) untuk hindari lock lama dan hindari melebihi rate limit Supabase Storage.

### 4.c Audit trail

Tabel baru `public.chat_attachment_orphan_sweeps`:

```sql
create table public.chat_attachment_orphan_sweeps (
  id uuid primary key default gen_random_uuid(),
  swept_at timestamptz not null default now(),
  object_name text not null,
  object_created_at timestamptz not null,
  object_size_bytes bigint,
  delete_http_status int,
  delete_error text
);
create index on public.chat_attachment_orphan_sweeps (swept_at);
create index on public.chat_attachment_orphan_sweeps (object_name);
```

Setiap kandidat orphan yang di-attempt-delete → satu baris. `delete_error` non-null bila HTTP call gagal. Retensi tabel ini: 90 hari (pola `0043_activity_logs_retention.sql`, cron terpisah).

Alasan tabel tersendiri (bukan `activity_logs`): volume tinggi dan skema tetap; mencampur dengan `activity_logs` akan mengotori index (0042) yang dioptimalkan untuk admin browsing kronologis.

**Rekonsiliasi "gambar saya hilang":** support/admin bisa `select * from chat_attachment_orphan_sweeps where object_name like '%<hint>%'` untuk konfirmasi apakah objek pernah di-sweep — bukan "hilang misterius", ada jejak.

### 4.d Interaksi dengan §6.5

Sweeper adalah **satu-satunya pengecualian eksplisit** terhadap "hapus hanya via RPC DEFINER". Yang **tidak boleh**:

- Membuka policy DELETE pada `storage.objects` untuk role manapun (authenticated, service_role di RLS bucket).
- Menambah RPC lain yang bisa delete storage tanpa predikat anti-join yang sama.

Yang **wajib**:

- RPC `public.sweep_orphan_chat_attachments(p_retention_hours int, p_batch_size int, p_dry_run boolean)` SECURITY DEFINER.
- `revoke execute ... from public, anon, authenticated`.
- `grant execute ... to service_role`. Cron dijadwalkan dengan `select cron.schedule(...)` yang berjalan sebagai owner cron (setara service_role internal).
- Parameter `p_dry_run = true` mem-return kandidat tanpa delete — kunci untuk debugging.
- Failure mode: kegagalan `pg_net` DELETE tidak menghapus baris kandidat dari `chat_attachment_orphan_sweeps` (yang sudah di-insert dulu), sehingga run berikutnya melihat ada attempt sebelumnya dan bisa dedupe (`where not exists (select 1 from chat_attachment_orphan_sweeps s where s.object_name = o.name and s.delete_http_status = 204)` — skip yang sudah sukses terhapus). Pola ini mencegah loop retry tak berujung untuk objek yang gagal HTTP 5xx permanent.

Jadwal: harian **04:00 UTC = 11:00 WIB** (jam sepi, tidak konflik dengan `mark-overdue-instances`, `backfill-instances`, `emit-deadline-notifications`, `purge-activity-logs` di `0043`).

---

## 5. Test kontrak (wajib sebelum landing sweeper apapun)

Ditulis sebagai DB contract test (pola `mobile/__tests__/db-contracts/` yang ada, dijalankan lewat harness Supabase lokal).

1. **`sweep_does_not_delete_referenced`**
   - Setup: upload 3 objek ke `chat-attachments`, commit 2 lewat RPC `send_chat_message_with_attachments` (path tersimpan di `chat_messages.attachments`), 1 orphan.
   - Advance clock via `p_retention_hours = 0` (atau seed `created_at` di masa lalu jika `advance clock` tidak tersedia).
   - Call `sweep_orphan_chat_attachments(0, 100, false)` sebagai service_role.
   - Assert: 2 objek terreferensi TETAP ADA di `storage.objects`; 1 orphan HILANG; 1 row baru di `chat_attachment_orphan_sweeps` dengan `delete_http_status = 204`.

2. **`sweep_does_not_delete_referenced_cross_org`**
   - Setup: 2 orgs. Upload 1 objek dengan path `orgA/room1/xxx.png`. Buat `chat_messages` di **orgB** yang referensi path yang sama via `attachments` jsonb (skenario paranoid: kalau ternyata path lintas-org pernah bocor via bug).
   - Call sweeper.
   - Assert: objek TETAP ADA. Anti-join tidak boleh terfilter oleh org.

3. **`sweep_rejects_non_service_role`**
   - Call `sweep_orphan_chat_attachments(24, 100, true)` sebagai `authenticated` user (dua persona: workspace-owner dan viewer).
   - Assert: kedua persona menerima `permission denied for function` (42501).
   - Call sebagai `anon` (tanpa sesi).
   - Assert: sama.

4. **`sweep_dry_run_does_not_delete`**
   - Setup: 1 orphan berumur > retention.
   - Call `sweep_orphan_chat_attachments(24, 100, true)` sebagai service_role.
   - Assert: return berisi 1 kandidat; objek TETAP ADA di storage; TIDAK ADA row baru di `chat_attachment_orphan_sweeps`.

5. **`sweep_respects_retention_window`**
   - Setup: 1 orphan berumur `retention_hours - 1`.
   - Call sweeper dengan `p_retention_hours = 24`.
   - Assert: objek TETAP ADA (belum kadaluarsa).

6. **`sweep_batch_limit`**
   - Setup: 10 orphans, `p_batch_size = 3`.
   - Call sweeper.
   - Assert: tepat 3 objek terhapus, 7 tersisa. Run kedua menghapus 3 berikutnya. Deterministic order: paling tua dulu.

7. **`sweep_idempotent_on_http_failure`** (dengan mock `pg_net`)
   - Setup: 1 orphan; mock `pg_net` return HTTP 500.
   - Call sweeper. Assert: row `chat_attachment_orphan_sweeps` dengan `delete_http_status = 500`; objek TETAP ADA.
   - Call sweeper lagi tanpa reset mock. Assert: kandidat yang sama TIDAK diretry pada window yang sama (dedupe via existing row), atau strategy retry terbatas — apapun keputusan, harus deterministik dan ter-dokumentasi.

---

## 6. Pertanyaan terbuka untuk owner (jangan dibuka sampai §3 selesai)

- **OS-1** — Angka ambang keputusan build (§3): apakah 5% / 500 MB/bulan cukup atau perlu disesuaikan berdasarkan paket Supabase aktual saat evaluasi?
- **OS-2** — Retensi `X` di §4.b: mulai dengan 24 jam atau 72 jam? Terlalu pendek → risiko false-delete pada upload yang commit-nya tertunda oleh koneksi. Terlalu panjang → volume orphan menumpuk.
- **OS-3** — Notifikasi ke admin bila sweep run gagal atau menghapus > threshold per run (sinyal ada bug ekstraksi path di klien)? Reuse `emit_notification` atau kirim ke channel ops eksternal?

---

## 7. Referensi

- `specs/inbox-chat-attachments.md` §6.5 (immutability), §6.6 (path scheme), FR-ATT-1.5 (pre-commit cleanup)
- `supabase/migrations/0008_fase3_collab.sql:1037-1044` (pola append-only + revoke + RPC DEFINER)
- `supabase/migrations/0043_activity_logs_retention.sql` (pola pg_cron retention + delayed activation + batch delete + audit via row_count)
- `supabase/migrations/0007_fase2_repeat.sql`, `0008_fase3_collab.sql` (jadwal cron eksisting, hindari konflik)
- Memory: `push-notifications-spec.md` (pola pg_net + pg_cron owner-approved)
