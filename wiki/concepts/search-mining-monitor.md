---
type: concept
tags: [governance, search, observability, runbook, bl-18]
updated: 2026-07-23
sources: 0
---

# Pemantauan penambangan data lewat Search (BL-18, opsi 3)

Runbook untuk kontrol kompensasi `BL10-OQ-09`. Keputusan owner 2026-07-23: **opsi 3** — jangan menulis emisi baru, baca jejak yang **sudah** dicatat platform. Latar belakang dan tiga opsi yang ditolak ada di [[feature-gap-backlog]] §BL-18.

## Kenapa jejak platform, bukan telemetri aplikasi

Search sengaja **nol-emisi audit** (G6): mencari tidak menulis baris ke `activity_logs`. Konsekuensinya penambangan data organisasi lewat pencarian berulang tidak meninggalkan jejak di jalur audit biasa, dan `BL10-OQ-09` menuntut kontrol pengganti.

Penghitung per-aktor FR-34 di `mobile/src/lib/search.ts` **bukan** kontrol itu, dan tidak bisa menjadi kontrol itu:

1. Ia ditulis pada level `info`, sementara satu-satunya transport terpusat (`createSentryTransport`) hanya meneruskan `error` + `warn`. Emisinya berhenti di `console.log` perangkat pemakai.
2. Lebih menentukan: `search_global` di-`grant execute … to authenticated`, jadi pemegang sesi mana pun dapat memanggil RPC-nya langsung lewat PostgREST tanpa menjalankan kode klien. Telemetri yang diemisikan klien tidak mengikat pihak yang justru ingin diawasi.

Jejak yang **tidak** dapat dihindari pemanggil adalah jejak di sisi platform: setiap panggilan harus melewati API Edge Network sebelum sampai ke Postgres, dan Logflare mencatatnya di `edge_logs` tanpa aplikasi diminta apa pun.

## Sumber data: `edge_logs`, bukan `pg_stat_statements`

`pg_stat_statements` **terpasang** (v1.11) tapi **tidak dapat dipakai untuk ini**: ia mengagregasi per `(userid, dbid, queryid)`, dan seluruh request PostgREST yang terautentikasi berjalan sebagai satu role Postgres yang sama — `authenticated`. Semua aktor melebur jadi satu baris. Ia menjawab "seberapa berat query ini", bukan "siapa yang menjalankannya".

`edge_logs` membawa identitas aktornya: `metadata.request.sb.auth_user` berisi `sub` dari JWT, yaitu `auth.users.id` — kunci yang sama dengan `actorId` FR-34, dan kunci yang sama yang dipakai RLS. Ia diisi gateway, bukan klien.

## Kueri dasar — Log Explorer

Jalankan di **Dashboard → Logs → Log Explorer** (subset sintaks BigQuery). Pola `cross join unnest` dan field `sb.auth_user` mengikuti dokumentasi Supabase untuk `edge_logs`.

```sql
select
  sb.auth_user as actor_id,
  count(*)     as calls
from
  edge_logs
  cross join unnest(metadata) as metadata
  cross join unnest(request)  as request
  cross join unnest(sb)       as sb
where
  path = '/rest/v1/rpc/search_global'
group by actor_id
order by calls desc;
```

Jendela waktu diatur lewat pemilih rentang Log Explorer, bukan di `where` — itu yang menjadikannya "per aktor per jendela waktu".

> [!warning] Kueri ini **belum pernah dijalankan terhadap proyek ini**
> Ia diturunkan dari pola resmi `edge_logs` Supabase, bukan dari eksekusi nyata. Sampel `api` log staging 24 jam terakhir hanya memuat cron `claim_push_deliveries`; **nol** panggilan `search_global`. Langkah pertama siapa pun yang memegang runbook ini: jalankan sekali di lingkungan yang benar-benar dipakai dan pastikan ia mengembalikan baris. Kueri yang mengembalikan nol karena salah nama field terlihat persis sama dengan "tidak ada penambangan".

Turunan yang berguna sesudah kueri dasar hijau:

- **Ganti `count(*)` dengan `count(distinct …)` per jam** untuk melihat pola sebaran, bukan hanya total — 300 panggilan dalam satu menit dan 300 panggilan dalam sehari adalah dua cerita berbeda.
- **Tambah `status_code`** (dari `response`) untuk memisahkan panggilan sukses dari yang ditolak.
- **Jangan tambahkan isi query.** `edge_logs` mencatat `path` + query string; badan POST tidak ikut, dan itu memang yang diinginkan. Menarik isi pencarian ke tampilan pemantauan mengembalikan jejak yang G6 sengaja hilangkan, lewat pintu dengan aturan akses berbeda — larangan yang sama dengan `[MUST NOT]` FR-34.

## Menentukan ambang

Ambang **tidak dapat ditentukan sebelum baseline ada**, dan baseline tidak dapat dibangun dari staging (nol trafik pencarian nyata). Urutannya:

1. Jalankan kueri dasar terhadap lingkungan yang dipakai; pastikan ia mengembalikan baris.
2. Kumpulkan **minimal 2 minggu** distribusi panggilan per aktor per hari. Catat persentil, bukan rata-rata — pemakaian pencarian miring: sedikit power user jauh di atas median.
3. Tetapkan ambang di atas p99 pemakaian sah, bukan pada angka bulat yang enak dilihat. Ambang yang memicu tiap minggu akan diabaikan dalam sebulan, dan kontrol yang diabaikan sama nilainya dengan kontrol yang tidak ada — persis cacat yang BL-18 keluhkan.
4. Tinjau ulang setelah perubahan besar pada UX pencarian (mis. pencarian otomatis saat mengetik akan menggandakan hitungan tanpa perubahan perilaku pengguna).

**Retensi log membatasi langkah 2.** Retensi `edge_logs` bergantung paket Supabase proyek. Periksa retensi paket yang berlaku sebelum menjanjikan jendela baseline dua minggu; kalau retensinya lebih pendek, snapshot hasil kueri harus disimpan berkala ke luar Logflare, dan itu pekerjaan tersendiri.

## Bagian yang BELUM tertutup: siapa yang membaca

Log Explorer adalah alat **tarik**, bukan dorong — ia tidak mengirim apa pun ke siapa pun. Selama tidak ada yang menjadwalkan pembacaannya, runbook ini mewarisi cacat asli BL-18: kontrol yang tidak diawasi.

Tiga bentuk penutup, urut dari yang paling murah:

| Bentuk | Ongkos | Catatan |
|---|---|---|
| Tinjauan manual terjadwal (mis. mingguan, satu penanggung jawab bernama) | XS | Sah selama **ada namanya** dan tercatat; "tim akan meninjau" bukan penanggung jawab |
| Kueri terjadwal via Management API → sink yang sudah dipantau | S | Butuh token + tempat menaruhnya; jangan taruh di klien |
| Aturan alert di sisi platform observability | S–M | Bergantung apakah organisasi sudah punya platform yang benar-benar dibaca |

Sentry **bukan** kandidat untuk ini apa adanya: transportnya hanya menerima `error`/`warn` dari klien, dan menaikkan level peristiwa FR-34 agar lolos ke sana mengembalikan masalah nomor 2 di atas (dilaporkan sendiri oleh pihak yang diawasi) sekaligus membanjiri kuota satu peristiwa per pencarian.

## Yang TIDAK ditutup runbook ini

- **Pembacaan sah dalam jumlah besar.** Kontrol ini menghitung panggilan, bukan niat. Ia menandai anomali untuk ditinjau manusia; ia bukan penegakan dan tidak boleh dijadikan gerbang otomatis.
- **Permukaan lain.** Hanya `search_global` yang dihitung. Jalur baca lain yang dapat dipakai memanen data secara berulang (mis. RPC pencarian lain, atau paging biasa atas tabel yang dapat diakses) tidak masuk kueri ini. Menambahkannya berarti menambah `path` ke `where`, bukan membangun ulang runbook.
- **Kebocoran otorisasi.** Kalau ada baris yang seharusnya tidak terlihat, itu bug otorisasi di `search_global` (FR-11 fail-closed, gate per cabang di migrasi 0085-0089) — bukan sesuatu yang dijawab dengan menghitung panggilan.

## Rujukan

- [[feature-gap-backlog]] §BL-18 — diagnosis, empat opsi, dan alasan opsi 3 dipilih.
- [[audit-governance]] — model Activity Log & Governance Violation, dan kenapa Search berada di luarnya.
- `mobile/src/lib/search.ts` — penghitung FR-34 + catatan status BL-18 di tempatnya.
