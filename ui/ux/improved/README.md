# Mockup "10/10" — Pola yang diperbaiki

Dibuat untuk menutup 2 dimensi terlemah dari review desain: **interaction states (4/10)** dan **semantik warna skor**. Memakai design system asli `design.html` (token CSS, Inter, biru `#1877f2`, aksen hijau, kartu rounded, shadow lembut) supaya langsung bisa diangkat jadi komponen React Native di `mobile/`.

Sumber editable: [`design-improved.html`](design-improved.html) · capture ulang: `node .claude/shoot-improved.js`

| File | Pola | Menutup gap |
|---|---|---|
| `01-empty-governance.png` | Empty/zero state "semua bersih" — ikon, headline menenangkan, status chip, aksi sekunder. Mengisi layar, tidak ada dead space. | Governance kosong (sebelumnya ratusan px blank) |
| `02-search-initial.png` | Search sebelum mengetik — scope berlabel warna + pencarian terakhir. | Search lengang tanpa arahan |
| `03-search-zero.png` | 0 hasil — menjelaskan kemungkinan sebab (di luar scope / diarsipkan) + jalan keluar. | Tidak ada state "0 hasil" |
| `04-loading-skeleton.png` | Skeleton shimmer + banner sync, bukan spinner kosong. | Loading state tidak terdesain |
| `05-people-legend.png` | Legenda Skala Score (On track ≥85 / Stabil 70–84 / Perlu perhatian <70) + avatar berwarna deterministik per orang. | Warna skor tanpa makna; avatar identik |

## Prinsip yang diterapkan
- **Empty states are features** — tiap state kosong punya kehangatan, konteks, dan satu aksi.
- **Warna = makna yang disengaja** — skala skor punya legenda eksplisit, bukan tebakan.
- **Loading jujur** — skeleton menggambarkan bentuk konten yang akan datang.
- **Scannability** — avatar deterministik + chip berlabel mempercepat baca dalam 1 detik.
