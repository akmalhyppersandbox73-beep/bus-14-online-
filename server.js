'use strict';
// BUS 14 — backend: registry daftar server + signaling PeerJS (WebRTC) + (opsional) static host untuk LAN.
// Jalankan: npm start   (port dari process.env.PORT, default 3000)
const path = require('path');
const http = require('http');
const express = require('express');
const { ExpressPeerServer } = require('peer');
const { Registry } = require('./server/rooms');
const { createHandler } = require('./server/http');
const pkg = require('./package.json');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ALLOWED = (process.env.ALLOWED_ORIGINS || '*').split(',');
const TTL = parseInt(process.env.ROOM_TTL_MS, 10) || 25000;

const registry = new Registry({ ttlMs: TTL });
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// /health dan /api/rooms (lihat server/http.js)
app.use(createHandler(registry, { allowedOrigins: ALLOWED, version: pkg.version }));

// Frontend statis (berguna untuk LAN: buka http://IP-LAPTOP:3000). Hanya file game yang dibuka, bukan seluruh folder.
const ROOT = __dirname;
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get('/config.js', (req, res) => res.sendFile(path.join(ROOT, 'config.js')));

const server = http.createServer(app);

// Signaling PeerJS di /peerjs  (WebSocket upgrade ditangani oleh peer)
const peerServer = ExpressPeerServer(server, {
  path: '/',
  proxied: true,            // di belakang reverse proxy (Suga) -> hormati X-Forwarded-*
  allow_discovery: false,   // jangan bocorkan daftar peer; daftar room lewat /api/rooms
  corsOptions: { origin: ALLOWED.includes('*') ? true : ALLOWED },
});
app.use('/peerjs', peerServer);

// Host terputus dari signaling -> hapus room dari daftar (tanpa menunggu TTL)
peerServer.on('disconnect', client => {
  const id = client && client.getId && client.getId();
  if (id && registry.removeByPeerId(id)) console.log('[room] host terputus, room dihapus:', id);
});

app.use((req, res) => res.status(404).json({ error: 'Tidak ditemukan.' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[express] error:', err && err.message);
  res.status(500).json({ error: 'Kesalahan server.' });
});

const sweeper = setInterval(() => {
  const n = registry.sweep();
  if (n) console.log('[room] dibersihkan (kedaluwarsa):', n);
}, 5000);
sweeper.unref();

server.listen(PORT, HOST, () => {
  console.log(`BUS 14 server berjalan di http://${HOST}:${PORT}  (health: /health, daftar: /api/rooms, signaling: /peerjs)`);
});

function shutdown(sig) {
  console.log(sig + ' diterima, menutup server...');
  clearInterval(sweeper);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
