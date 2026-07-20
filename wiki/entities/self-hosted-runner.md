---
type: entity
tags: [ci, infrastructure, github-actions, wsl]
updated: 2026-07-20
sources: 0
---

# Self-hosted Runner `rencanapp-wsl`

Runner GitHub Actions milik sendiri untuk repo `nawawi489/RencanApp`, dipasang karena menit GitHub-hosted terblokir (repo privat + paket Free = 2.000 menit/bulan, terpakai habis). Menit self-hosted **tidak dihitung** terhadap kuota itu — sudah dibuktikan: job self-hosted jalan normal saat semua job hosted menolak start.

## Spesifikasi

| | |
|---|---|
| Nama runner | `rencanapp-wsl` |
| Label | `self-hosted`, `Linux`, `X64`, `wsl-ubuntu` |
| OS | Ubuntu 26.04 LTS di WSL2 (host Windows 11) |
| User | `runner` (tak berhak root) |
| Direktori | `/home/runner/actions-runner`, kerja di `_work` |
| Service | systemd `actions.runner.nawawi489-RencanApp.rencanapp-wsl.service` |

## Job yang memakainya

`changes`, `no-old-names`, `quality` → `runs-on: [self-hosted, wsl-ubuntu]`.

`db-contract` **tetap di `ubuntu-latest`** dan sengaja tidak dipindah. Job itu menjalankan `supabase start` lalu `supabase stop --no-backup`, sementara runner berbagi daemon Docker dengan mesin developer yang biasanya menjalankan stack Supabase lokal di port sama (54321/54322). Memindahkannya = bentrok port saat start, dan `stop` berpotensi merobohkan stack dev developer sendiri.

> [!warning] Konsekuensi aktif
> Selama kuota hosted terblokir, `db-contract` **tidak jalan**. Ia tergating ke perubahan `supabase/**`, jadi PR non-DB tidak terpengaruh — tapi **perubahan DB butuh verifikasi manual** sampai kuota pulih atau job ini diisolasi ke port/project id terpisah.

## Keputusan keamanan

1. **User `runner` TIDAK diberi sudo tanpa password.** Itu akan membuat workflow apa pun bisa jadi root di mesin developer. `ripgrep` dan `postgresql-client` dipasang sekali di distro; step ripgrep memakai yang sudah ada dan hanya jatuh ke `apt-get` sebagai fallback.
2. **Repo TIDAK boleh dijadikan publik selama runner ini terpasang.** Di repo publik, siapa pun bisa membuka PR berisi workflow dan mengeksekusinya di mesin developer. Ini meniadakan opsi "jadikan repo publik untuk Actions gratis" — dua jalur itu saling eksklusif.

## Keepalive (wajib, bukan pelengkap)

WSL mematikan distro saat idle, dan service runner ikut mati. Gejalanya **senyap dan menyesatkan**: job menggantung `queued` selamanya, atau ter-*cancel* di tengah step (`Checkout: cancelled` padahal skripnya benar). Teramati dua kali saat setup.

Penahannya: `rencanapp-runner-keepalive.vbs` di Startup folder user —
`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`.

Skrip itu menahan satu proses hidup di dalam distro dan memanggil `systemctl start` (idempoten), dalam loop yang memulihkan diri — kalau `wsl.exe` keluar karena apa pun, penahannya dipasang ulang. Terverifikasi: setelah `wsl --terminate Ubuntu`, distro kembali sendiri dalam ~25 detik dan runner kembali `online`.

Mematikannya: hapus file `.vbs` itu lalu logout (atau akhiri `wscript.exe`).

## Kinerja — lebih lambat, bukan lebih cepat

| Job | Self-hosted (WSL) | GitHub-hosted |
|---|---|---|
| `quality` | **9,3 mnt** | 6,9 mnt |
| `no-old-names` | 0,3 mnt | 0,3 mnt |

Sekitar **35% lebih lambat**. Yang dibeli adalah *ketersediaan* (jalan sama sekali saat kuota habis) dan biaya nol — bukan kecepatan. Mesin ini juga berbagi CPU dengan stack dev + Docker milik developer.

## Cache npm Actions dicabut

`cache: npm` di `setup-node` dihapus untuk job self-hosted. Step `Post Setup Node` mengunggah `~/.npm` (177 MB) ke layanan cache GitHub dan **menggantung sampai run harus dibatalkan**, dengan load average runner hanya 0,33 — bukan CPU-bound, melainkan menunggu layanan yang ikut terdampak blokir billing. Di mesin yang selalu sama, `~/.npm` memang sudah persisten antar-run, jadi perjalanan ke cache GitHub murni overhead. Kembalikan bila job ini pindah lagi ke runner hosted.

## Yang belum diuji

**Ketahanan terhadap reboot Windows belum diverifikasi** — mekanisme Startup folder itu standar, tapi mesin belum di-restart sejak pemasangan. Setelah reboot pertama, cek `wsl -l --running` memuat `Ubuntu` dan runner `online` di Settings → Actions → Runners.

Lihat [[tech-stack]].
