'use strict';
// Registry room in-memory. Tanpa dependensi, mudah diuji.
// Registry HANYA menyimpan metadata (nama, jumlah pemain, status). Data gameplay tidak lewat sini: itu P2P (WebRTC).
const crypto = require('crypto');

const ID_RE = /^[A-Z]{4}$/;
const MODES = ['online', 'lan'];
const STATUSES = ['LOBBY', 'BERMAIN'];

function cleanText(v, max, fallback) {
  const s = String(v == null ? '' : v)
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return s || fallback;
}

class RoomError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class Registry {
  constructor(opts = {}) {
    this.ttlMs = opts.ttlMs || 25000;      // room dihapus bila tidak ada heartbeat selama ini
    this.maxRooms = opts.maxRooms || 300;
    this.now = opts.now || (() => Date.now());
    this.rooms = new Map();
  }

  create(input, ip) {
    input = input || {};
    const id = String(input.id || '').toUpperCase();
    if (!ID_RE.test(id)) throw new RoomError(400, 'bad_id', 'ID room harus 4 huruf A-Z.');
    const mode = input.mode == null ? 'online' : input.mode;
    if (!MODES.includes(mode)) throw new RoomError(400, 'bad_mode', 'Mode tidak valid.');
    const max = Math.min(4, Math.max(2, parseInt(input.max, 10) || 4));
    const hostName = cleanText(input.hostName, 16, 'Pemain');
    const name = cleanText(input.name, 24, 'Server ' + hostName);
    this.sweep();
    if (this.rooms.has(id + ':' + mode)) throw new RoomError(409, 'id_taken', 'ID room sudah dipakai.');
    if (this.rooms.size >= this.maxRooms) throw new RoomError(503, 'full', 'Server penuh, coba lagi nanti.');
    if (ip && this._countByIp(ip) >= 5) throw new RoomError(429, 'too_many', 'Terlalu banyak room dari alamat ini.');
    const t = this.now();
    const room = {
      id, mode, name, hostName, max,
      players: 1, status: 'LOBBY',
      token: crypto.randomBytes(16).toString('hex'),
      ip: ip || null, createdAt: t, updatedAt: t,
    };
    this.rooms.set(id + ':' + mode, room);
    return room;
  }

  _countByIp(ip) {
    let n = 0;
    for (const r of this.rooms.values()) if (r.ip === ip) n++;
    return n;
  }

  _auth(id, mode, token) {
    const r = this.rooms.get(String(id).toUpperCase() + ':' + mode);
    if (!r) throw new RoomError(404, 'not_found', 'Room tidak ditemukan.');
    const a = Buffer.from(String(token || ''));
    const b = Buffer.from(r.token);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new RoomError(403, 'bad_token', 'Token tidak valid.');
    return r;
  }

  heartbeat(id, mode, token, data) {
    const r = this._auth(id, mode, token);
    data = data || {};
    if (data.players != null) r.players = Math.min(r.max, Math.max(1, parseInt(data.players, 10) || 1));
    if (data.status != null) {
      if (!STATUSES.includes(data.status)) throw new RoomError(400, 'bad_status', 'Status tidak valid.');
      r.status = data.status;
    }
    r.updatedAt = this.now();
    return r;
  }

  remove(id, mode, token) {
    const r = this._auth(id, mode, token);
    this.rooms.delete(r.id + ':' + r.mode);
    return true;
  }

  // dipakai saat PeerServer melaporkan peer host terputus (tanpa token)
  removeByPeerId(peerId) {
    const m = /^b14([ol])-([a-z]{4})$/.exec(String(peerId));
    if (!m) return false;
    return this.rooms.delete(m[2].toUpperCase() + ':' + (m[1] === 'o' ? 'online' : 'lan'));
  }

  sweep() {
    const t = this.now();
    let n = 0;
    for (const [k, r] of this.rooms) {
      if (t - r.updatedAt > this.ttlMs) { this.rooms.delete(k); n++; }
    }
    return n;
  }

  list(mode) {
    this.sweep();
    const t = this.now();
    return [...this.rooms.values()]
      .filter(r => !mode || r.mode === mode)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(r => ({
        id: r.id, name: r.name, hostName: r.hostName, mode: r.mode,
        players: r.players, max: r.max, status: r.status,
        full: r.players >= r.max, ageSec: Math.round((t - r.createdAt) / 1000),
      }));
  }

  size() { return this.rooms.size; }
}

module.exports = { Registry, RoomError, cleanText };
