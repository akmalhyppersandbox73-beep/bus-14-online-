'use strict';
// Uji logika protokol room (mkRoom) dari index.html dengan Peer TIRUAN di memori.
// CATATAN: ini menguji protokol lobi/validasi/relay, BUKAN WebRTC/NAT sungguhan.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = /const ICE=\{config[\s\S]*?(?=\nlet RM=null)/.exec(html);
assert.ok(m, 'blok mkRoom tidak ditemukan di index.html');

function world() {
  const NET = new Map();
  class Conn {
    constructor(remote) { this.peer = remote; this.h = {}; this.open = false; }
    on(e, f) { (this.h[e] = this.h[e] || []).push(f); }
    emit(e, ...a) { (this.h[e] || []).forEach(f => f(...a)); }
    send(d) { if (!this.open) throw new Error('closed'); const o = this.other; const c = JSON.parse(JSON.stringify(d)); setImmediate(() => o.open && o.emit('data', c)); }
    close() { if (!this.open) return; this.open = false; const o = this.other; o.open = false; setImmediate(() => { this.emit('close'); o.emit('close'); }); }
  }
  class Peer {
    constructor(id, opts) {
      this.id = id || 'anon' + Math.random().toString(36).slice(2); this.h = {}; this.opts = opts; this.conns = [];
      setImmediate(() => { if (NET.has(this.id)) { this.emit('error', { type: 'unavailable-id' }); return; } NET.set(this.id, this); this.emit('open', this.id); });
    }
    on(e, f) { (this.h[e] = this.h[e] || []).push(f); }
    emit(e, ...a) { (this.h[e] || []).forEach(f => f(...a)); }
    connect(rid) {
      const c = new Conn(rid); this.conns.push(c);
      setImmediate(() => {
        const r = NET.get(rid); if (!r) { this.emit('error', { type: 'peer-unavailable' }); return; }
        const rc = new Conn(this.id); r.conns.push(rc); c.other = rc; rc.other = c; c.open = rc.open = true;
        r.emit('connection', rc); c.emit('open'); rc.emit('open');
      });
      return c;
    }
    destroy() { NET.delete(this.id); this.conns.forEach(c => c.close()); }
  }
  const ctx = { Peer, setTimeout, clearTimeout, setInterval, clearInterval, Date, JSON, Math, Object, Array, String, Number, Map, Set, window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(m[0] + '\nthis.mkRoom=mkRoom;this.peerOpts2=peerOpts2;', ctx);
  return { NET, mkRoom: ctx.mkRoom, peerOpts2: ctx.peerOpts2, ctx };
}
const NETC = { prefix: 'b14o-', peer: { host: 'x', port: 443, secure: true, path: '/peerjs' } };
const initH = (n) => ({ name: n, hat: 0, sh: 0, pn: 0, rdy: 0, host: 1, g: 0, t0: 1, sn: 'Server Uji' });
const initC = (n, t) => ({ name: n, hat: 1, sh: 2, pn: 3, rdy: 0, host: 0, g: 0, t0: t });
const tick = (ms = 150) => new Promise(r => setTimeout(r, ms));

test('host membuat room, klien kedua bergabung, daftar pemain sinkron di kedua sisi', async () => {
  const w = world();
  const H = await w.mkRoom('ABCD', true, initH('Host'), {}, 4, NETC);
  assert.ok(w.NET.has('b14o-abcd'), 'ID peer memakai prefix online');
  const C = await w.mkRoom('ABCD', false, initC('Budi', 2), {}, undefined, NETC);
  await tick();
  assert.strictEqual(H._cur.peers.length, 2);
  assert.strictEqual(C._cur.peers.length, 2);
  const host = C._cur.peers.find(p => p.presence.host);
  assert.strictEqual(host.presence.sn, 'Server Uji', 'nama server sampai ke klien');
  assert.strictEqual(C._cur.peers.find(p => p.isMe).presence.name, 'Budi');
  H.leave(); C.leave();
});

test('LAN dan ONLINE memakai ruang ID terpisah (prefix berbeda)', async () => {
  const w = world();
  const A = await w.mkRoom('ABCD', true, initH('A'), {}, 4, { prefix: 'b14o-', peer: {} });
  const B = await w.mkRoom('ABCD', true, initH('B'), {}, 4, { prefix: 'b14l-', peer: {} });
  assert.ok(w.NET.has('b14o-abcd') && w.NET.has('b14l-abcd'));
  A.leave(); B.leave();
});

test('ID bentrok ditolak (unavailable-id) dan room tak ada -> peer-unavailable', async () => {
  const w = world();
  const A = await w.mkRoom('ABCD', true, initH('A'), {}, 4, NETC);
  await assert.rejects(w.mkRoom('ABCD', true, initH('B'), {}, 4, NETC), { type: 'unavailable-id' });
  await assert.rejects(w.mkRoom('ZZZZ', false, initC('C', 3), {}, undefined, NETC), { type: 'peer-unavailable' });
  A.leave();
});

test('room penuh: pemain ke-3 ditolak pada kapasitas 2', async () => {
  const w = world();
  const H = await w.mkRoom('ABCD', true, initH('Host'), {}, 2, NETC);
  const C = await w.mkRoom('ABCD', false, initC('B', 2), {}, undefined, NETC);
  await assert.rejects(w.mkRoom('ABCD', false, initC('C', 3), {}, undefined, NETC), { type: 'full' });
  await tick();
  assert.strictEqual(H._cur.peers.length, 2);
  H.leave(); C.leave();
});

test('game sudah dimulai: pemain baru ditolak (started)', async () => {
  const w = world();
  let started = false;
  const H = await w.mkRoom('ABCD', true, initH('Host'), { can: () => started ? 'started' : 0 }, 4, NETC);
  started = true;
  await assert.rejects(w.mkRoom('ABCD', false, initC('B', 2), {}, undefined, NETC), { type: 'started' });
  H.leave();
});

test('pemain keluar -> hilang dari daftar host; host terputus -> klien menerima close', async () => {
  const w = world();
  let closed = 0;
  const H = await w.mkRoom('ABCD', true, initH('Host'), {}, 4, NETC);
  const C = await w.mkRoom('ABCD', false, initC('B', 2), { close: () => closed++ }, undefined, NETC);
  const D = await w.mkRoom('ABCD', false, initC('D', 3), {}, undefined, NETC);
  await tick();
  assert.strictEqual(H._cur.peers.length, 3);
  D.leave();
  await tick(200);
  assert.strictEqual(H._cur.peers.length, 2, 'pemain yang keluar dihapus');
  H.leave(); // host putus
  await tick(200);
  assert.strictEqual(closed, 1, 'klien diberi tahu host terputus');
  C.leave();
});

test('relay pesan: chat sampai ke semua; pesan "start"/jenis tak dikenal dari klien DIBUANG; payload besar dibuang', async () => {
  const w = world();
  const got = { H: [], C: [], D: [] };
  const H = await w.mkRoom('ABCD', true, initH('Host'), {}, 4, NETC);
  const C = await w.mkRoom('ABCD', false, initC('B', 2), {}, undefined, NETC);
  const D = await w.mkRoom('ABCD', false, initC('D', 3), {}, undefined, NETC);
  H.on('b14', x => got.H.push(x)); C.on('b14', x => got.C.push(x)); D.on('b14', x => got.D.push(x));
  await tick();
  await C.emit('b14', { t: 'chat', m: 'halo' });
  await C.emit('b14', { t: 'start' });                 // hanya host yang boleh memulai
  await C.emit('b14', { t: 'do', k: 'exit' });         // klien tidak boleh memaksa aksi
  await C.emit('b14', { t: 'chat', m: 'x'.repeat(5000) }); // terlalu besar
  await tick(250);
  for (const k of ['H', 'C', 'D']) {
    assert.strictEqual(got[k].length, 1, 'penerima ' + k + ' hanya menerima 1 pesan sah');
    assert.strictEqual(got[k][0].data.t, 'chat');
  }
  const cid = C._cur.peers.find(p => p.isMe).peer;
  assert.strictEqual(got.H[0].peer, cid, 'pengirim diisi host dari koneksi asli (tidak bisa dipalsukan)');
  await H.emit('b14', { t: 'start' });                 // host boleh
  await tick(200);
  assert.ok(got.C.some(x => x.data.t == 'start'));
  H.leave(); C.leave(); D.leave();
});

test('presence disanitasi: koordinat dijepit, flag host/mx/sn dari klien diabaikan', async () => {
  const w = world();
  const H = await w.mkRoom('ABCD', true, initH('Host'), {}, 3, NETC);
  const C = await w.mkRoom('ABCD', false, initC('B', 2), {}, undefined, NETC);
  await tick();
  await C.presence({ x: 1e9, z: '<x>', r: -1e9, hat: 99, sh: -5, rdy: 'yes', host: 1, mx: 4, sn: 'palsu', name: 'N'.repeat(50) });
  await tick(250);
  const me = H._cur.peers.find(p => !p.isMe).presence;
  assert.strictEqual(me.x, 500); assert.strictEqual(me.z, 0); assert.strictEqual(me.r, -500);
  assert.strictEqual(me.hat, 8); assert.strictEqual(me.sh, 0); assert.strictEqual(me.rdy, 1);
  assert.strictEqual(me.name.length, 16);
  assert.ok(!me.host, 'klien tidak bisa menjadi host'); assert.ok(!me.sn);
  const hostP = H._cur.peers.find(p => p.isMe).presence;
  assert.strictEqual(hostP.mx, 3);
  H.leave(); C.leave();
});

test('rate limit: banjir pesan dari satu klien dibatasi', async () => {
  const w = world();
  const got = [];
  const H = await w.mkRoom('ABCD', true, initH('Host'), {}, 4, NETC);
  const C = await w.mkRoom('ABCD', false, initC('B', 2), {}, undefined, NETC);
  H.on('b14', x => got.push(x));
  await tick();
  for (let i = 0; i < 300; i++) await C.emit('b14', { t: 'chat', m: 'spam' + i });
  await tick(300);
  assert.ok(got.length > 0 && got.length <= 65, 'diterima ' + got.length);
  H.leave(); C.leave();
});

test('opsi signaling & TURN dari config diteruskan ke PeerJS', async () => {
  const w = world();
  w.ctx.window.GAME_CONFIG = { ICE_SERVERS: [{ urls: 'turn:t.example:3478', username: 'u', credential: 'c' }, { bukan: 'valid' }] };
  const o = w.peerOpts2(NETC);
  assert.strictEqual(o.host, 'x'); assert.strictEqual(o.port, 443); assert.strictEqual(o.secure, true); assert.strictEqual(o.path, '/peerjs');
  const urls = o.config.iceServers.map(s => s.urls);
  assert.ok(urls.includes('turn:t.example:3478') && urls.some(u => /^stun:/.test(u)));
  assert.strictEqual(o.config.iceServers.length, 3, 'entri tanpa urls dibuang');
});
