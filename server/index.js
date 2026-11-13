'use strict';
const path = require('path');
const http = require('http');
const os = require('os');
const express = require('express');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const { RoomManager } = require('./rooms');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || ''; // e.g. https://family.example.com when deployed

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000 });
const rooms = new RoomManager(io);

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return 'localhost';
}

// Work out the URL phones should open. If the host screen is on localhost, phones can't use that,
// so swap in this machine's LAN address.
function joinBase(req) {
  if (PUBLIC_URL) return PUBLIC_URL.replace(/\/$/, '');
  const host = req.get('host') || `localhost:${PORT}`;
  const proto = req.get('x-forwarded-proto') || req.protocol;
  if (/^(localhost|127\.|\[::1\])/.test(host)) return `${proto}://${lanAddress()}:${PORT}`;
  return `${proto}://${host}`;
}

const PICTURES_DIR = process.env.FAMILY_PICTURES_DIR || path.join(__dirname, '..', 'public', 'pictures');
app.use('/pictures', express.static(PICTURES_DIR));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

app.get('/api/join-info', async (req, res) => {
  const code = String(req.query.code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  const base = joinBase(req);
  const url = code ? `${base}/?code=${code}` : base;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#14112b', light: '#ffffff' } });
  res.json({ base, url, qr });
});

app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.rooms.size }));

const ack = (cb, payload) => { if (typeof cb === 'function') cb(payload); };

io.on('connection', (socket) => {
  let room = null;
  let role = null; // 'host' | 'player'
  let playerId = null;

  const attachHost = (r) => {
    room = r; role = 'host';
    r.hostSockets.add(socket.id);
    r.update();
  };
  const attachPlayer = (r, p) => {
    room = r; role = 'player'; playerId = p.id;
    p.socketId = socket.id;
    p.connected = true;
    if (r.game && r.game.onPlayerReconnect) r.game.onPlayerReconnect(p);
    r.update();
  };

  socket.on('host:create', (_d, cb) => {
    const r = rooms.create();
    attachHost(r);
    ack(cb, { ok: true, code: r.code, hostToken: r.hostToken });
  });

  socket.on('host:resume', (d = {}, cb) => {
    const r = rooms.get(d.code);
    if (!r || r.hostToken !== d.hostToken) return ack(cb, { error: 'Room not found' });
    attachHost(r);
    ack(cb, { ok: true, code: r.code, hostToken: r.hostToken });
  });

  socket.on('player:join', (d = {}, cb) => {
    const r = rooms.get(d.code);
    if (!r) return ack(cb, { error: 'No room with that code' });
    const res = r.addPlayer(d.name, socket.id);
    if (res.error) return ack(cb, { error: res.error });
    attachPlayer(r, res.player);
    ack(cb, { ok: true, code: r.code, token: res.player.token, id: res.player.id });
  });

  socket.on('player:resume', (d = {}, cb) => {
    const r = rooms.get(d.code);
    const p = r && r.players.find((x) => x.token === d.token);
    if (!p) return ack(cb, { error: 'Session expired' });
    attachPlayer(r, p);
    ack(cb, { ok: true, code: r.code, token: p.token, id: p.id });
  });

  // Room-level controls work from the host screen or the VIP's phone, so a TV with no keyboard still works.
  function roomControl(type, data = {}, fromHost) {
    if (type === 'start') return room.startGame(data.gameId, data.options || {});
    if (type === 'lobby') return room.endGame();
    if (type === 'crew') return room.setCrew(data);
    if (type === 'kick' && fromHost) return room.removePlayer(data.playerId);
    return null;
  }

  socket.on('host:action', (msg = {}, cb) => {
    if (!room || role !== 'host') return ack(cb, { error: 'Not a host' });
    const res = roomControl(msg.type, msg.data, true);
    if (res !== null) { room.update(); return ack(cb, res || { ok: true }); }
    if (room.game) room.game.onHostAction(msg.type, msg.data || {});
    room.update();
    ack(cb, { ok: true });
  });

  socket.on('player:action', (msg = {}, cb) => {
    if (!room || role !== 'player') return ack(cb, { error: 'Not in a room' });
    const p = room.player(playerId);
    if (!p) return ack(cb, { error: 'Not in a room' });
    const isVIP = room.vip && room.vip.id === p.id;
    const type = String(msg.type || '');
    if (isVIP && type.startsWith('ctl:')) {
      const t = type.slice(4);
      const res = roomControl(t, msg.data, false);
      if (res !== null) { room.update(); return ack(cb, res || { ok: true }); }
      if (room.game) room.game.onHostAction(t, msg.data || {});
    } else if (room.game) {
      room.game.onPlayerAction(p, type, msg.data || {});
    }
    room.update();
    ack(cb, { ok: true });
  });

  socket.on('disconnect', () => {
    if (!room) return;
    if (role === 'host') room.hostSockets.delete(socket.id);
    if (role === 'player') {
      const p = room.player(playerId);
      if (p && p.socketId === socket.id) {
        p.connected = false;
        if (room.game && room.game.onPlayerDisconnect) room.game.onPlayerDisconnect(p);
      }
    }
    room.update();
  });
});

server.listen(PORT, () => {
  console.log(`\n  Are You Smarter Than The Family? is running`);
  console.log(`  Host screen (TV/laptop): http://localhost:${PORT}/host`);
  console.log(`  Phones join at:         ${PUBLIC_URL || `http://${lanAddress()}:${PORT}`}\n`);
});

module.exports = { server, io, rooms };
