# BUS 14 — Multiplayer LAN + Online

Game horor bus 3D (Three.js) dengan dua mode multiplayer:

- **MULTIPLAYER LAN** – bermain bersama dengan kode room (4 huruf), tanpa server sendiri.
- **MULTIPLAYER ONLINE** – daftar server nyata dari backend; pilih server lalu GABUNG, atau pakai Room ID.

Gameplay singleplayer, kustomisasi, chat, kontrol HP/PC tidak diubah.

---

## 1. Cara kerja (3 bagian, jangan tertukar)

| Bagian | Tugas | Di mana |
|---|---|---|
| **Frontend** (`index.html` + `config.js`) | Game itu sendiri | itch.io (atau server.js untuk LAN) |
| **Backend registry** (`/api/rooms`, `/health`) | Menyimpan *daftar* server: nama, jumlah pemain, status. **Tidak** membawa data gameplay. | Suga (`server.js`) |
| **Signaling PeerJS** (`/peerjs`) | “Perkenalan” antar pemain agar WebRTC bisa tersambung. Setelah itu data gameplay lewat **P2P** antar-browser. | Suga (`server.js`, proses yang sama) |

Topologi P2P: **bintang**. Pembuat room = **host** (otoritas gameplay: pemungutan suara, mulai game, pemilihan anomali via seed). Pemain lain terhubung ke host; host merelay pesan dan daftar pemain.

Alur ONLINE: host membuat peer `b14o-KODE` di signaling → mendaftarkan room ke `/api/rooms` → mengirim heartbeat tiap ±8 dtk (jumlah pemain, status LOBBY/BERMAIN). Room dihapus dari daftar jika: host keluar, signaling melaporkan host putus, atau tidak ada heartbeat 25 dtk.

---

## 2. Menjalankan di komputer sendiri

```bash
npm install
npm start          # http://localhost:3000  (port dari process.env.PORT, default 3000)
```

- Cek: `http://localhost:3000/health` → `{"ok":true,"app":"bus14-server",...}` dan `http://localhost:3000/api/rooms`.
- Jalankan tes: `npm test`.
- Server mengikat `0.0.0.0` (ubah dengan env `HOST`).

### LAN dengan server lokal (opsional, paling andal)
1. Satu orang menjalankan `npm start` di laptop.
2. Semua pemain di Wi-Fi yang sama membuka `http://IP-LAPTOP:3000` (mis. `http://192.168.1.5:3000`).
3. Di **MULTIPLAYER LAN** game otomatis mendeteksi server lokal itu: sesi LAN tampil sebagai daftar dan signaling memakai laptop tersebut.
4. Pemain yang membuka game dari tempat lain bisa mengisi kolom **SERVER LAN LOKAL** dengan `192.168.1.5:3000`. (Halaman `https://` tidak boleh memanggil alamat `http://` — pembatasan browser; buka game via `http://` di LAN.)

### LAN tanpa server sendiri
Pembuat room menekan **BUAT ROOM**, lalu memberi 4 huruf ID ke teman → teman mengisi ID → **GABUNG ROOM**. Browser **tidak bisa** menemukan perangkat LAN otomatis, jadi tidak ada penemuan otomatis di mode ini. Signaling memakai server publik PeerJS bawaan (butuh internet ringan untuk “perkenalan”); data gameplay tetap P2P.

---

## 3. Deploy backend: GitHub → Suga

> Catatan jujur: saya **tidak punya akses** ke akun GitHub/Suga kamu dan **tidak menemukan dokumentasi resmi Suga** saat menyusun ini, jadi langkah di bawah bersifat umum untuk platform Node.js. Nama menu bisa berbeda — ikuti dashboard Suga.

1. Buat repository GitHub baru, lalu unggah **seluruh isi folder ini** (`.gitignore` sudah menolak `node_modules`).
   ```bash
   git init && git add . && git commit -m "BUS 14 online"
   git branch -M main
   git remote add origin https://github.com/USERNAME/NAMA-REPO.git
   git push -u origin main
   ```
2. Di Suga: buat proyek/layanan baru dari repository GitHub tersebut (hubungkan akun GitHub bila diminta).
3. Pengaturan yang dibutuhkan:
   - **Runtime**: Node.js 18 atau lebih baru
   - **Install**: `npm install` (biasanya otomatis)
   - **Start command / entry point**: `npm start` (atau `node server.js`)
   - **Port**: jangan diubah di kode. Server memakai `process.env.PORT` dari Suga (lokal: 3000).
   - **Health check** (jika ada kolomnya): path `/health`
4. Setelah deploy, salin **URL publik** (harus `https://`). Uji di browser:
   - `https://URL-KAMU/health` → JSON `ok: true`
   - `https://URL-KAMU/api/rooms` → `{"rooms":[],...}`
5. **Pastikan WebSocket didukung Suga.** Signaling PeerJS memakai WebSocket (`wss://URL-KAMU/peerjs`). Jika Suga tidak mendukung WebSocket, ONLINE tidak akan bisa tersambung. Solusinya: jalankan signaling PeerJS di layanan lain dan isi `PEERJS_HOST`/`PEERJS_PATH` ke sana (registry `/api` tetap di Suga).
6. Hosting gratis sering “tidur” saat sepi: request pertama bisa lambat; game akan menampilkan OFFLINE/timeout sampai server bangun — tekan REFRESH.

**Variabel lingkungan (opsional, tidak berisi rahasia wajib):**

| Variabel | Fungsi |
|---|---|
| `PORT` | Diberikan Suga. Default 3000. |
| `ALLOWED_ORIGINS` | Daftar origin yang boleh memanggil API, pisah koma. Default `*`. Setelah tahu origin itch.io kamu, boleh dibatasi. |
| `ROOM_TTL_MS` | Batas waktu room tanpa heartbeat (default 25000). |

UDP/broadcast LAN **tidak** dipakai di cloud (tidak didukung hosting umum). Semua koneksi ke backend memakai HTTP(S) dan WebSocket.

---

## 4. Mengisi `config.js`

Buka `config.js` dan ganti setiap `"link kamu"`. Jangan menaruh password/secret di file ini — file ini publik.

| Kunci | Isi | Contoh bentuk |
|---|---|---|
| `SERVER_URL` | URL publik backend (Suga), `https://`, tanpa `/` di akhir. Dipakai untuk `/health` (ONLINE/OFFLINE + ping). | `https://nama-app.contoh.app` |
| `API_BASE_URL` | URL dasar API daftar server. Biasanya `SERVER_URL` + `/api`. Boleh `""` agar otomatis. | `https://nama-app.contoh.app/api` |
| `PEERJS_HOST` | Hostname signaling saja (tanpa `https://`, tanpa path). Dengan `server.js` bawaan = hostname yang sama dengan Suga. | `nama-app.contoh.app` |
| `PEERJS_PORT` | Port signaling. Untuk HTTPS biasanya `443`. | `443` |
| `PEERJS_SECURE` | `true` untuk `wss://`. | `true` |
| `PEERJS_PATH` | Path signaling. `server.js` memakai `/peerjs`. | `"/peerjs"` |
| `ICE_SERVERS` | Opsional: server TURN (lihat bagian 6). | `[]` |

Ketiga URL **tidak dianggap otomatis sama**: kamu bisa memisahkan API dan signaling ke host berbeda. Jika `config.js` masih berisi `"link kamu"`/kosong, layar ONLINE menampilkan **KONFIGURASI BELUM LENGKAP** beserta kunci yang harus diisi, dan tidak mencoba terhubung diam-diam. Tidak ada fallback ke `localhost`.

---

## 5. Publikasi frontend di itch.io

1. Isi `config.js` dengan URL Suga kamu.
2. Buat ZIP berisi **`index.html` dan `config.js` di akar ZIP** (bukan di dalam subfolder). Hanya dua file itu yang dibutuhkan frontend.
3. itch.io → *Create new project* → *Kind of project*: **HTML** → unggah ZIP → centang **This file will be played in the browser** → atur ukuran viewport (mis. 960×540 atau “Fullscreen button”) → Save → buka halaman untuk menguji.
4. Game memuat Three.js dan PeerJS dari CDN (cdnjs/unpkg/jsdelivr); pemain butuh internet.
5. Semua alamat backend wajib **HTTPS/WSS** (halaman itch.io berjalan di HTTPS; HTTP akan diblokir sebagai *mixed content*).
6. Jika API menolak karena CORS, set `ALLOWED_ORIGINS` di Suga ke origin yang muncul di pesan error console browser (atau biarkan `*`).
7. Game berjalan di iframe: tombol layar penuh game tetap tersedia; WebRTC umumnya berjalan di iframe itch.io, tetapi hasilnya tetap bergantung pada jaringan pemain.

---

## 6. Batasan yang perlu kamu ketahui

- **WebRTC tidak selalu tembus.** Dengan hanya STUN, sebagian jaringan (NAT ketat, data seluler, Wi-Fi kampus/kantor) gagal tersambung langsung. Perbaikannya server **TURN**; isi `ICE_SERVERS` di `config.js`. Kredensial TURN akan terlihat publik, jadi pakai kredensial terbatas/sementara. Backend ini **tidak** menyediakan TURN.
- **Tidak ada pergantian host.** Jika host putus, room ditutup dan pemain kembali ke menu/daftar (aman, tapi ronde hilang).
- **Tidak bisa bergabung saat game sudah berjalan** (status BERMAIN). Pemain baru hanya masuk di lobi, jadi tidak ada snapshot tengah-game.
- Daftar room disimpan di **memori** server: restart/redeploy mengosongkan daftar (host otomatis mendaftar ulang saat heartbeat berikutnya jika masih hidup).
- Ping yang ditampilkan adalah ping **ke server backend**, bukan ke host room (koneksi ke host adalah P2P dan baru terbentuk saat bergabung).
- Maksimal 4 pemain per room. Satu alamat IP dibatasi 5 room aktif.
- Mengikuti sifat WebRTC, alamat IP pemain dapat terlihat oleh pemain lain di room yang sama.

---

## 7. Yang berubah dari BUS_14_v3.html

- `index.html`: menu → **MULTIPLAYER LAN** + **MULTIPLAYER ONLINE**; layar daftar server (cari, refresh, buat server, gabung via daftar atau ID, status ONLINE/OFFLINE + ping, penuh/bermain); lobi menampilkan nama server; penanganan error/loading yang jelas.
- Mesin room (`mkRoom`): prefix ID terpisah (`b14l-` LAN, `b14o-` ONLINE), opsi signaling dari `config.js`, TURN opsional, reconnect signaling, validasi/penjepitan data pemain, daftar putih jenis pesan dari klien, batas ukuran & laju pesan.
- Baru: `config.js`, `server.js`, `server/rooms.js`, `server/http.js`, `package.json`, `test/`, `.gitignore`, README ini.
- Tidak diubah: gameplay, anomali, suara, kontrol, kustomisasi, chat, singleplayer.

Struktur:

```
BUS14-ONLINE/
  index.html        game (frontend)
  config.js         alamat backend (edit ini)
  server.js         entry point Node.js (Express + signaling PeerJS)
  server/rooms.js   registry daftar room
  server/http.js    /health dan /api/rooms
  test/             tes otomatis (npm test)
  package.json  .gitignore  README.md
```
`package-lock.json` tidak disertakan (dibuat otomatis saat kamu menjalankan `npm install` pertama kali; commit file itu).

---

## 8. Pengujian

`npm test` menjalankan:
- `test/rooms.test.js` – logika registry (validasi, TTL, token, batas).
- `test/http.test.js` – server HTTP sungguhan: health, buat room → muncul di daftar → heartbeat → penuh → BERMAIN → host keluar, LAN/ONLINE terpisah, CORS, input rusak.
- `test/p2p.test.js` – protokol room dari `index.html` memakai **Peer tiruan di memori** (bukan WebRTC sungguhan): bergabung, room penuh, started, pemain keluar, host putus, relay & penolakan pesan palsu, sanitasi data, rate limit.

**Belum diuji** (butuh internet/perangkat nyata): `npm install`+`npm start` dengan Express/peer asli, koneksi WebRTC antar dua perangkat/jaringan, deployment Suga, upload itch.io, serta gameplay di browser. Lakukan uji manual dengan 2 perangkat (satu Wi-Fi, lalu data seluler) sebelum merilis.
