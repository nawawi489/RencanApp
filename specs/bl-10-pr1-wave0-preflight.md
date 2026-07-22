# BL-10 PR-1 — Hasil Wave 0 (preflight)

**Dijalankan:** 2026-07-22 · worktree `.claude/worktrees/bl10-pr1-search-global` · base `origin/staging` (`c2b2fdd`)
**Rencana sumber:** `specs/bl-10-pr1-tdd-plan.md` §2 + §5 Wave 0

---

## Ringkasan

| # | Item | Hasil |
|---|---|---|
| P1 | Baseline jest | ✅ **6 suite / 63 test lolos** |
| P2 | Baseline tsc | ✅ **0 error** |
| P3 | Baseline DB contract | ⚠️ **33 lolos · 1 gagal** — kegagalannya pra-ada & tak terkait BL-10 (lihat §P3) |
| **P4** | **GATE `EXPLAIN` BL10-OQ-11** | ✅ **LOLOS** — bentuk FR-2 bertahan (lihat §P4) |
| P5 | Digest NG-6 | ✅ `e8d46e73c3144369b20d872f89e39ad2` |
| P6 | Fixture dua org | ✅ 2 `insert into public.organizations` di `_fixtures.sql` |
| P7 | Slot migrasi | ✅ tertinggi di repo `0084`; **`0085` bebas** |

**Kesimpulan: Wave 1 boleh dimulai.** Gerbang keras P4 lolos, jadi bentuk delegasi FR-2 tidak perlu ditinjau ulang.

---

## P4 — Gerbang `EXPLAIN` (BL10-OQ-11)

Aktor: `11111111-1111-1111-1111-000000000001` (anggota room dengan 4 pesan terlihat). Bukti mentah: `oq11-explain-a.txt`, `oq11-explain-b.txt` di scratchpad sesi.

**Kriteria 1 — Function Scan ber-LIMIT internal.** Lolos.

```
Function Scan on public.search_chat_messages m (actual time=107.575..107.579 rows=2 loops=1)
  Function Call: search_chat_messages('dr'::text, NULL::uuid, 5, NULL::timestamptz, NULL::uuid)
```

`actual rows=2` ≤ `lim=5`. Diverifikasi juga bahwa `search_chat_messages` memang `language plpgsql` (`pg_language` → `plpgsql`), sehingga **tidak inlinable** — persis premis yang dipakai rencana.

**Kriteria 2 — cursor diteruskan sebagai argumen, bukan filter luar.** Lolos.

```
Function Call: search_chat_messages('dr'::text, NULL::uuid, 5, (now() - '1 day'::interval), '1111…1111'::uuid)
```

Nol baris `Filter:` di atas Function Scan. Cursor benar-benar masuk sebagai argumen ke-4/5.

### Catatan: `EXPLAIN` saja tidak membuktikan cursor menyaring

Kedua rencana `EXPLAIN` mengembalikan `rows=2` — sama dengan tanpa cursor. Sebabnya data: pesan bertanggal 15–17 Juli sedangkan cursor `now() - 1 day` = 21 Juli, jadi seluruh baris lolos keyset `<`. Artinya `EXPLAIN` di atas membuktikan **bentuk rencana**, bukan perilaku penyaringan.

Dibuktikan terpisah dengan cursor diskriminatif:

| Cursor | Posisi relatif ke 2 baris (15 Juli 12:42) | Hasil |
|---|---|---|
| — | — | 2 |
| `2026-07-16` | lebih baru → keduanya lolos `<` | 2 |
| `2026-07-15 00:00` | lebih tua → keduanya terpotong | **0** |

Keyset `(created_at, id) < (cursor_ts, cursor_id)` bekerja benar. **Konsekuensi untuk Wave 4:** `DB-64` versi chat (Concern #11 §9.2) tetap wajib — gerbang ini tidak menggantikannya.

---

## P3 — Baseline DB contract: 33 lolos, 1 gagal

### Dua kegagalan awal, satu terselesaikan

Jalan pertama: **32 lolos, 2 gagal** (`0079`, `0083`).

`0083` gagal karena **DB lokal tertinggal migrasi**. `supabase_migrations.schema_migrations` melaporkan `0079` sebagai terakhir, tetapi tabel itu tidak dapat dipercaya (lihat memori `staging-db-migrasi-tertinggal`). Verifikasi efek di schema yang menentukan:

```sql
select position('raw_app_meta_data ->> ''organization_id''' in prosrc) > 0,
       position('P0001' in prosrc) > 0
from pg_proc where proname='handle_new_user';   -- → f | f
```

Kedua penanda 0083 absen. Migrasi `0080`–`0084` diterapkan manual (`docker exec … psql -f`), lalu `0083` hijau. Baseline naik ke **33 lolos, 1 gagal**.

### Sisa satu kegagalan: sisa data, bukan bug

`0079_score_finalize_advisory_lock_contract.sql` gagal pada:

```
Key (organization_id)=(52b0ebe1…b70) already exists.
insert into public.period_snapshots (…, '0079-T6', …, 'active', …)
```

Isi tabel untuk org itu:

| period_name | status | created_at |
|---|---|---|
| Uji Checkbox | **active** | 2026-07-20 |
| Juli 2026 (Smoke Fase 5) | closed | 2026-07-19 |
| Agustus 2026 (Smoke Retest) | closed | 2026-07-19 |

Baris `Uji Checkbox` adalah **sisa uji manual 20 Juli**, bukan produk suite kontrak. Ia memicu guard satu-periode-aktif-per-org sehingga `0079` tak bisa membuat periode aktifnya sendiri.

**Sengaja tidak disentuh.** Menutup periode bersifat ireversibel per ADR [[score-period-immutability]], dan menghapus baris milik orang lain bukan keputusan yang boleh diambil diam-diam demi memhijaukan baseline.

**Konsekuensi yang harus diingat saat Wave 1+:** baseline BL-10 adalah **33 lolos, 1 gagal-diketahui**. Kegagalan `0079` bukan sinyal. Kegagalan **baru mana pun** adalah sinyal.

---

## Catatan lingkungan

- Worktree dibuat dengan `baseRef: fresh` → lahir dari `origin/main` dan **tidak memuat spec BL-10**. Di-`reset --hard` ke `origin/staging` sebelum dipakai. Perlu diingat untuk worktree berikutnya.
- `mobile/node_modules` tidak ada di worktree; dibuat *junction* ke checkout utama, `.env` disalin (pola memori `worktree-run-tests-preview`).
- Docker Desktop + stack Supabase lokal berjalan normal di sesi ini — masalah socket yatim yang tercatat sebelumnya tidak muncul.
