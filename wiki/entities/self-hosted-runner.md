---
type: entity
tags: [ci, infrastructure, github-actions, wsl, docker]
updated: 2026-07-21
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

Seluruh job CI — `changes`, `no-old-names`, `quality`, dan sejak 2026-07-21 juga `db-contract` — memakai `runs-on: [self-hosted, wsl-ubuntu]`.

`db-contract` sempat tertinggal di `ubuntu-latest` karena `supabase start` mem-boot sembilan container dan mengikat port `54321/54322`, sementara runner berbagi daemon Docker dengan mesin developer yang menjalankan stack dev di port sama — `supabase stop` akan merobohkannya. Selama itu job tersebut **tidak pernah jalan** (gagal dengan `steps=0`, bukan merah), sehingga perubahan DB masuk tanpa verifikasi.

Jalan keluarnya bukan memindahkan `supabase start`, melainkan menggantinya: **satu** container `supabase/postgres` **tanpa port ter-publish** (psql lewat `docker exec`), sehingga bentrok port mustahil secara struktural. Entry point `scripts/ci/start-db-container.sh`, dipakai CI maupun repro lokal. Yang tidak dibawa image itu ditambal `scripts/ci/db-bootstrap.sql` — `auth.users` bentuk GoTrue, tabel `storage`, `auth.uid()` yang membaca `request.jwt.claims`, dan default privileges yang sudah diperketat. Ketiganya gagal **senyap** bila hilang; yang terakhir bahkan membuat kontrak ACL lolos palsu.

Baseline yang harus dipertahankan: **29 passed, 0 failed** — sama dengan run `supabase start` hijau terakhir. Durasi **1 m 52 s** vs 2 m 54 s versi hosted lama (satu container, bukan sembilan).

## Prasyarat Docker (dua-duanya pernah menggagalkan job)

1. **WSL integration Docker Desktop aktif** untuk distro `Ubuntu`. Tanpa itu `docker` di PATH hanyalah binary Windows lewat interop yang menolak jalan. `command -v docker` tetap lolos dalam kasus ini — karena itu preflight di `start-db-container.sh` menguji `docker info`, bukan keberadaan CLI-nya.
2. **User `runner` anggota grup `docker`** (`usermod -aG docker runner`, lalu **restart** service runner — keanggotaan grup hanya terbaca proses yang start sesudahnya).

Yang **tidak** perlu diulang setelah restart: `IntegratedWslDistros = Ubuntu` tersimpan permanen di `%APPDATA%\Docker\settings-store.json`, jadi WSL integration bertahan. Keanggotaan grup `docker` juga permanen.

> [!warning] Kelemahan struktural yang tersisa
> Gate DB kini bergantung pada **daemon Docker yang sedang melayani** di mesin developer. Bila mati, `db-contract` gagal di preflight tanpa sinyal apa pun ke GitHub sampai job-nya benar-benar jalan. Gejalanya: `FATAL: daemon Docker tak terjangkau dari sini`.
>
> **Yang harus dicek adalah engine, bukan aplikasinya.** Proses `Docker Desktop.exe` bisa berjalan (bahkan enam proses) sementara engine WSL-nya mati — teramati langsung 2026-07-21. Konfirmasi yang benar: distro **`docker-desktop`** berstatus `Running` di `wsl -l -v`, atau `docker info` dijawab dari dalam distro runner.

### Autostart Docker Desktop

Setting internal `AutoStart` bernilai `False`, sehingga aplikasi tidak nyala saat login. Penahannya `rencanapp-docker-autostart.vbs` di Startup folder user — bersebelahan dengan keepalive runner:

`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`

Skrip itu menjalankan Docker Desktop bila prosesnya belum ada, lalu menunggu sampai `docker info` **dijawab dari dalam distro sebagai user `runner`** — bukan berhenti pada "proses aplikasinya ada", karena justru itu yang terbukti menyesatkan. Ia **pemanas saat login, bukan pengawas**: berhenti begitu daemon siap, atau menyerah setelah 5 menit. Looping abadi ala keepalive tidak dipakai di sini karena tidak ada yang perlu dilawan setelah daemon hidup.

Alternatif resmi: Docker Desktop → Settings → General → *"Start Docker Desktop when you sign in"*. Bila itu diaktifkan, file `.vbs` di atas boleh dihapus — konfigurasi Docker sendiri sengaja tidak disentuh agar kedua mekanisme tidak bentrok.

**Atribusi terverifikasi (2026-07-21).** VBS disingkirkan sementara lalu mesin di-restart. Hasilnya: pada boot+4,4 menit Docker Desktop **nol proses** — bukan "hidup tapi error", melainkan tidak pernah diluncurkan. Entri HKCU Run `Docker Desktop` ada tapi tidak efektif, konsisten dengan `AutoStart=False`. Kontrol positifnya: Chrome dari entri Run yang sama start di boot+21 detik, jadi mekanisme Run memang berjalan di login itu. Kesimpulan: skrip ini *load-bearing*, bukan pelengkap.

Keepalive runner ikut terverifikasi pada reboot yang sama: runner kembali `online` dan service `active` tanpa intervensi.

> [!warning] Autostart tidak menjamin daemon siap
> Yang ditutup skrip ini hanya penyebab **"tidak diluncurkan"**. Penyebab **"gagal start"** di bawah tetap bisa merobohkan daemon meski autostart bekerja sempurna.

### Socket AF_UNIX yatim setelah mati mendadak

Reboot mendadak meninggalkan file socket yang Docker sendiri tidak bisa hapus, dan aplikasinya menutup diri saat start:

```
starting services: initializing Inference manager:
remove …\Docker\run\dockerInference: The file cannot be accessed by the system
→ "Docker Desktop encountered an unexpected error and needs to close"
```

Dialognya hanya menawarkan **Quit** atau **Reset to factory defaults**.

> [!danger] Jangan pilih "Reset to factory defaults"
> Reset menghapus container dan volume — termasuk stack Supabase dev di mesin ini. Masalahnya bisa diselesaikan tanpa itu.

Yang **tidak** berhasil: `File.Delete`, `del /f`, maupun path mentah `\\?\`. Semuanya membalas *"The file cannot be accessed by the system"*. Yang berhasil hanya **menyingkirkan folder induknya**.

Tiap percobaan start yang gagal meninggalkan bangkai baru yang memblokir percobaan berikutnya, dan lokasinya berpindah — teramati di `%LOCALAPPDATA%\Docker\run` lalu `%LOCALAPPDATA%\docker-secrets-engine`. Karena itu bersihkan **keduanya sekaligus**, bukan satu per satu:

```powershell
Get-Process 'Docker Desktop','com.docker.backend' -EA SilentlyContinue | Stop-Process -Force
foreach ($d in @("$env:LOCALAPPDATA\Docker\run", "$env:LOCALAPPDATA\docker-secrets-engine")) {
  if (Test-Path $d) { [System.IO.Directory]::Move($d, "$d.stale-$(Get-Random -Maximum 99999)") }
}
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
```

Verifikasi **dengan menjalankan perintah**, bukan membaca log — log memuat error dari percobaan sebelumnya sementara daemon sudah sehat, dan itu sempat menyesatkan diagnosis:

```bash
wsl -d Ubuntu -u runner -- docker info --format 'server={{.ServerVersion}}'
```

Di CI, mode kegagalan ini muncul hanya sebagai `FATAL: daemon Docker tak terjangkau dari sini` — tidak ada petunjuk soal socket. Kalau pesan itu muncul setelah mesin mati mendadak, mulai dari sini.

> [!warning] Grup `docker` setara root
> Anggota grup itu bisa `docker run -v /:/host` dan efektif menjadi root di mesin developer — melewati pagar "user `runner` tanpa sudo" di bawah. Ini **menguatkan**, bukan menggantikan, larangan menjadikan repo publik.

## Gate DB di `deploy-staging.yml`

Workflow deploy memakai gate yang **dipertajam, bukan dilonggarkan**. Maksud aslinya tetap: *staging tidak boleh deploy di atas DB contract yang merah*. Yang ditambahkan hanya kemampuan membedakan "tak relevan" dari "gagal":

| Kondisi push | `db-contract` | Deploy |
|---|---|---|
| Tidak menyentuh `supabase/**` | `skipped` | **lanjut** |
| Menyentuh DB, contract hijau | success | **lanjut** |
| Menyentuh DB, contract merah | failure | **tertahan** |
| Menyentuh DB, hosted terblokir | failure | **tertahan** (perilaku yang benar) |

Dua jebakan di kondisi `if` job `deploy` yang wajib dipertahankan:

1. `always()` **wajib** — tanpa itu satu `needs` yang `skipped` membuat deploy ikut `skipped`.
2. Karena `always()` mem-bypass gerbang bawaan `needs`, `quality` **harus** dicek eksplisit (`needs.quality.result == 'success'`). Tanpa baris itu deploy bisa jalan di atas test merah.
3. `changes` juga dicek — bila job itu gagal, `db-contract` ter-skip karena output kosong, dan gate DB akan lenyap diam-diam justru saat kita paling tidak tahu apa yang berubah.

Job `deploy` jalan di runner self-hosted, artinya secret `EXPO_TOKEN` dan `STAGING_SUPABASE_ANON_KEY` **dieksekusi di mesin developer**. Ini konsekuensi lain dari kenapa repo tidak boleh publik.

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

## Memantau status secara manual

Empat lapisan; tiga di antaranya tidak terlihat dari GitHub.

**1. Runner hidup atau tidak** — penyebab tersering "job menggantung".

```bash
gh api repos/:owner/:repo/actions/runners \
  -q '.runners[] | "\(.name) status=\(.status) busy=\(.busy)"'
```

UI: repo → Settings → Actions → Runners.

**2. Service di dalam WSL** — dipakai bila lapisan 1 melaporkan `offline`.

```bash
wsl -d Ubuntu -u root -- systemctl is-active actions.runner.nawawi489-RencanApp.rencanapp-wsl.service
wsl -d Ubuntu -u root -- journalctl -u actions.runner.nawawi489-RencanApp.rencanapp-wsl.service -n 50 --no-pager
```

Log mentah per job: `/home/runner/actions-runner/_diag/Worker_*.log` (file terbaru = job terakhir).

**3. Antrean dan job**

```bash
gh run list --limit 5
gh run view <run-id> --json jobs -q '.jobs[] | "\(.name): \(.status) \(.conclusion)"'
gh run watch <run-id>
gh run view --job <job-id> --log
```

**4. Khusus `db-contract`** — container hanya ada selama job berjalan:

```bash
wsl -d Ubuntu -u runner -- docker ps --filter name=rencan-ci-db
```

### Membaca gejalanya

| Yang terlihat | Artinya |
|---|---|
| Job `queued` lama, runner `offline` | Distro/WSL mati; keepalive belum memulihkan |
| Job `queued` tapi runner `busy=true` | Normal — runner tunggal, job berjalan berurutan |
| `Checkout: cancelled` di tengah step | Distro mati saat job berjalan |
| Job gagal dengan `steps=0` | Kuota/billing — job tak pernah mulai, bukan bug kode |
| `FATAL: daemon Docker tak terjangkau` | Engine Docker mati (cek distro `docker-desktop`, bukan proses aplikasinya) atau WSL integration non-aktif |
| `/usr/bin/docker: Input/output error` | Mount `cli-tools` basi setelah Docker Desktop restart |
| `FATAL: daemon Docker…` **sesudah mesin mati mendadak** | Socket AF_UNIX yatim — Docker gagal start, lihat bagian di atas |

Alasan `steps=0` hanya terbaca lewat `gh api repos/<o>/<r>/check-runs/<id>/annotations` — log job-nya kosong.

## Yang belum diuji

**Ketahanan terhadap reboot Windows belum diverifikasi** — mekanisme Startup folder itu standar, tapi mesin belum di-restart sejak pemasangan. Setelah reboot pertama, cek `wsl -l --running` memuat `Ubuntu` dan runner `online` di Settings → Actions → Runners.

Lihat [[tech-stack]].
