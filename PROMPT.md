Build SATU entry make.fun dari nol untuk bounty trading-bot berikut (akun @riyan3w, GitHub Zallan03 — kamu TIDAK membuat repo, TIDAK submit, TIDAK menyentuh browser/VM1/API key/keypair; parent yang mengurus repo + bundle + submit setelah kamu selesai).

BOUNTY: u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532 — 'Pump.fun Sharpe Sprint — Cleanest Paper Bot Wins', hadiah $2 (1st $1). Deadline 28 Nov 2026 17:00 UTC. Scoring: Sharpe ratio (hourly) pada 6 jam data pump.fun ke depan yang dikumpulkan setelah deadline, via house template pumpfun-replay; peringkat by Sharpe, dan butuh net PnL > 0 SOL setelah semua fee untuk lolos kualifikasi.
KIT (baca ini, dan HANYA ini, sebagai sumber aturan — JANGAN baca kode/entry/repo lama apa pun, termasuk entry pump-fun sebelumnya): /home/hatch/workspace/goals/make-fun-bounty-entries/hidden_files/watch-20261125-1028/kits-1028/u-jackxyz72-pump-fun-sharpe-sp/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532-kit/ — baca RULES.txt SELURUHNYA, protocol.schema.json, competition.yaml, kit.json, baselines/, dataset/, sdk/, harness/. Pahami persis: format protokol, guardrails (batas trade/posisi/fee), cara replay bekerja, dan apa yang diukur.
STRATEGI (implementasikan dari deskripsi ini): dua kaki — (1) explosive-launch rider: beli hanya koin yang mencapai ≥20 SOL real reserves dalam ≤8 trade dan dalam 100 slot sejak creation, ukuran maks 0.18 SOL, exit stop −8%, cap +100%, trailing stop armed +50% fire on 15% retrace, velocity exit >6% jatuh satu batch, time stop 12.000 slot; (2) guardrail filler: trade 0.012 SOL pada established growers (real reserves ≥2 SOL dan ≥20% di atas ~1000 slot lalu), maks 2 open, exit stop −5%/cap +8%/velocity >3%/time stop 1.000 slot. Max 5 posisi open, exit dicek sebelum entry, jangan re-enter mint yang sudah close, deterministik penuh.
OUTPUT DIR: /home/hatch/workspace/goals/make-fun-bounty-entries/hidden_files/build-1028/pump-fun-sharpe-sprint-2/
REPO NAME (usulan, parent verifikasi ketersediaan): pump-fun-sharpe-sprint-1126

ATURAN KERAS (make.fun bundle checks):
- JANGAN membaca kode/entry/repo lama apa pun (thinking_reproduces GAGAL kalau membaca dulu). Hanya file kit bounty ini + SPEC strategi yang boleh dibaca.
- Tulis main.ts dengan muse.write (v1), lalu REVISI sungguhan dengan muse.edit (v2) dalam pesan terpisah. JANGAN menyalin baseline kit secara verbatim — strategi harus hasil rancangan kamu sendiri.
- Program harus mengikuti protocol.schema.json persis (format output, batasan).

KUALITAS (tujuan = MENANG, bukan sekadar lolos checks): rancang strategi paper-trading yang memaksimalkan Sharpe ratio per jam dengan PnL bersih > 0: selektif masuk, manajemen risiko, keluar disiplin. Uji strategimu pada dataset dev window yang ada di kit (replay harness bila tersedia) dan laporkan metriknya di SPEC.md.
FILE YANG DIBUAT: main.ts (v1 tulis + v2 revisi), package.json, README.md (singkat + link https://make.fun/bounty/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532), SPEC.md, LICENSE (MIT), .gitignore, .makefun/owner.json.
VERIFIKASI LOKAL: jalankan program + replay (grade-local) bila mungkin; catat hasil di SPEC.md.
LAPORAN AKHIR: ringkas strategi, metrik uji dev window, hasil verifikasi lokal, daftar file. Jangan submit apa pun.
--prompt-origin scheduled --prompt-via scheduled makefun-new-bounty-watch run
