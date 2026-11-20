'use strict';
const crypto = require('crypto');
const { GAMES } = require('./games');
const ai = require('./ai');

// No vowels → codes can't spell anything rude.
const CODE_CHARS = 'BCDFGHJKLMNPQRSTVWXZ';
const COLOURS = ['#ff5d73', '#ffb627', '#3ddc97', '#4cc9f0', '#b388ff', '#ff8fab', '#f9f871', '#00f5d4', '#ff9e00', '#9bf6ff'];
const MAX_PLAYERS = 10;
const MAX_NAME = 14;
const IDLE_ROOM_MS = 45 * 60 * 1000;
const MAX_PHOTOS = 40;
const MAX_PHOTOS_EACH = 6;
const MAX_PHOTO_BYTES = 450 * 1024;
// Who chases you in the Final Chase. Also sets the title: "Are You Smarter Than <name>?"
const CREWS = {
  family: 'The Family',
  mates: 'The Group Chat',
  knowalls: 'The Know-It-Alls',
};

const token = () => crypto.randomBytes(16).toString('hex');
const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).toUpperCase();

class Room {
  constructor(io, code) {
    this.io = io;
    this.code = code;
    this.hostToken = token();
    this.hostSockets = new Set();
    this.players = []; // ordered by join
    this.game = null;
    this.lastGameId = null;
    this.history = {}; // per game type: used content ids so you don't see repeats
    this.lastActivity = Date.now();
    this._pending = false;
    this.crew = { id: 'family', name: '' };
    this.stats = {}; // pid → { statKey: count } for the end-of-night awards
    this.photos = []; // players' own photos for the quiz: { id, by, kind: baby|other, q, answer, mime, data }
    this.gamesPlayed = 0;
  }

  stat(pid, key, n = 1) {
    const s = (this.stats[pid] = this.stats[pid] || {});
    s[key] = Math.max(0, (s[key] || 0) + n);
  }

  // When a game reaches its final screen, count the win and everyone's points (once per game).
  noteGameEnd() {
    const g = this.game;
    if (!g || g._ended || g.constructor.meta.hidden || !['over', 'results'].includes(g.screen)) return;
    g._ended = true;
    this.gamesPlayed += 1;
    const ranked = this.players.filter((p) => p.score > 0).sort((a, b) => b.score - a.score);
    if (ranked.length) ranked.filter((p) => p.score === ranked[0].score).forEach((p) => this.stat(p.id, 'wins'));
    this.players.forEach((p) => this.stat(p.id, 'points', p.score));
    this.lastResult = { gameId: g.constructor.meta.id, gid: g.gid, at: Date.now(), scores: this.players.map((p) => ({ name: p.name, score: p.score })) };
  }

  get connectedPlayers() { return this.players.filter((p) => p.connected); }
  get vip() { return this.players.find((p) => p.connected) || this.players[0] || null; }
  player(id) { return this.players.find((p) => p.id === id); }

  addPlayer(name, socketId) {
    const nm = cleanName(name);
    if (!nm) return { error: 'Pick a name first' };

    // Same name, currently disconnected → treat as a rejoin (phone lost its storage).
    const existing = this.players.find((p) => p.name === nm);
    if (existing) {
      if (existing.connected) return { error: 'Someone already has that name' };
      existing.socketId = socketId;
      existing.connected = true;
      return { player: existing };
    }
    if (this.game) return { error: 'Game in progress, wait for the next one' };
    if (this.players.length >= MAX_PLAYERS) return { error: `Room is full (${MAX_PLAYERS} max)` };

    const used = new Set(this.players.map((p) => p.colour));
    const player = {
      id: crypto.randomBytes(4).toString('hex'),
      token: token(),
      name: nm,
      colour: COLOURS.find((c) => !used.has(c)) || COLOURS[this.players.length % COLOURS.length],
      socketId,
      connected: true,
      score: 0,
      look: null, // null = drawn from their id; a number once they press Shuffle
    };
    this.players.push(player);
    return { player };
  }

  removePlayer(id) {
    const p = this.player(id);
    if (!p) return;
    if (p.socketId) this.io.to(p.socketId).emit('kicked');
    this.players = this.players.filter((x) => x.id !== id);
    if (this.game && this.game.onPlayerRemoved) this.game.onPlayerRemoved(p);
  }

  // Lobby-only tweaks a player can make to themselves.
  shuffleLook(p) {
    if (this.game) return { error: 'Wait for the lobby' };
    let n;
    do { n = crypto.randomInt(1, 100000); } while (n === p.look);
    p.look = n;
    return { ok: true };
  }

  nextColour(p) {
    if (this.game) return { error: 'Wait for the lobby' };
    const used = new Set(this.players.filter((x) => x !== p).map((x) => x.colour));
    const free = COLOURS.filter((c) => !used.has(c));
    const i = free.indexOf(p.colour);
    p.colour = free[(i + 1) % free.length] || p.colour;
    return { ok: true };
  }

  addPhoto(p, d = {}) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(d.data || ''));
    if (!m) return { error: 'That photo did not upload properly' };
    const data = Buffer.from(m[2], 'base64');
    if (data.length > MAX_PHOTO_BYTES) return { error: 'Photo is too big' };
    if (this.photos.length >= MAX_PHOTOS) return { error: `The room already has ${MAX_PHOTOS} photos` };
    if (this.photos.filter((x) => x.by === p.id).length >= MAX_PHOTOS_EACH) return { error: `Max ${MAX_PHOTOS_EACH} photos each` };
    const kind = d.kind === 'baby' ? 'baby' : 'other';
    const answer = String(d.answer || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const q = String(d.q || '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'What is this?';
    if (kind === 'other' && !answer) return { error: 'Add the answer' };
    const photo = { id: crypto.randomBytes(5).toString('hex'), by: p.id, kind, q: kind === 'baby' ? 'Whose baby photo is this?' : q, answer, mime: m[1], data, at: Date.now() };
    this.photos.push(photo);
    return { ok: true, id: photo.id };
  }

  removePhoto(p, id) {
    this.photos = this.photos.filter((x) => !(x.id === id && x.by === p.id));
    return { ok: true };
  }

  photoView(p) {
    return this.photos.filter((x) => x.by === p.id).map((x) => ({ id: x.id, kind: x.kind, q: x.q, answer: x.answer, url: `/room-photo/${this.code}/${x.id}` }));
  }

  setCrew(d = {}) {
    if (CREWS[d.id]) this.crew.id = d.id;
    if (d.name !== undefined) {
      let n = String(d.name || '').replace(/\s+/g, ' ').trim().replace(/\?+$/, '').slice(0, 24);
      const plural = /s$/i.test(n);
      if (n && plural && !/^the\s/i.test(n)) n = `The ${n}`; // "Johnsons" → "The Johnsons"
      if (/^the\s/.test(n)) n = `T${n.slice(1)}`;
      this.crew.name = n;
    }
    return { ok: true };
  }

  get crewView() { return { id: this.crew.id, name: this.crew.name || CREWS[this.crew.id], defaultName: CREWS[this.crew.id] }; }

  startGame(gameId, options = {}) {
    const Game = GAMES[gameId];
    if (!Game) return { error: 'Unknown game' };
    const count = this.connectedPlayers.length;
    if (count < Game.meta.minPlayers) return { error: `${Game.meta.name} needs at least ${Game.meta.minPlayers} players` };
    // Drop anyone who left during the lobby so turns aren't wasted on them.
    this.players = this.players.filter((p) => p.connected);
    this.players.forEach((p) => { p.score = 0; });
    if (this.game) this.game.dispose();
    this.history[gameId] = this.history[gameId] || new Set();
    this.game = new Game(this, options, this.history[gameId]);
    this.lastGameId = gameId;
    Promise.resolve(this.game.start()).catch((e) => { console.error('[game start]', e); this.endGame(); });
    this.update();
    return { ok: true };
  }

  endGame() {
    if (this.game) this.game.dispose();
    this.game = null;
    this.update();
  }

  touch() { this.lastActivity = Date.now(); }

  // Coalesce many state changes in one tick into one broadcast.
  update() {
    this.touch();
    this.noteGameEnd();
    if (this._pending) return;
    this._pending = true;
    setImmediate(() => { this._pending = false; this.broadcast(); });
  }

  baseView() {
    const vip = this.vip;
    return {
      code: this.code,
      vipId: vip ? vip.id : null,
      players: this.players.map((p) => ({ id: p.id, name: p.name, colour: p.colour, look: p.look, score: p.score, connected: p.connected })),
      games: Object.values(GAMES).map((G) => G.meta).filter((m) => !m.hidden),
      gamesPlayed: this.gamesPlayed,
      photoCount: this.photos.length,
      lastResult: this.lastResult || null,
      lastGameId: this.lastGameId,
      ai: ai.enabled(),
      crew: this.crewView,
      crews: Object.entries(CREWS).map(([id, name]) => ({ id, name })),
      now: Date.now(),
    };
  }

  hostView() {
    return { ...this.baseView(), role: 'host', game: this.game ? this.game.hostView() : null };
  }

  playerView(p) {
    return {
      ...this.baseView(),
      role: 'player',
      me: { id: p.id, name: p.name, colour: p.colour, look: p.look, score: p.score, isVIP: this.vip && this.vip.id === p.id, photos: this.photoView(p) },
      game: this.game ? this.game.playerView(p) : null,
    };
  }

  broadcast() {
    const hv = this.hostView();
    for (const sid of this.hostSockets) this.io.to(sid).emit('state', hv);
    for (const p of this.players) if (p.connected && p.socketId) this.io.to(p.socketId).emit('state', this.playerView(p));
  }

  isIdle() {
    const anyone = this.hostSockets.size > 0 || this.players.some((p) => p.connected);
    return !anyone && Date.now() - this.lastActivity > IDLE_ROOM_MS;
  }

  dispose() { if (this.game) this.game.dispose(); }
}

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    setInterval(() => this.sweep(), 60 * 1000).unref();
  }

  create() {
    let code;
    do {
      code = Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Room(this.io, code);
    this.rooms.set(code, room);
    return room;
  }

  get(code) { return this.rooms.get(String(code || '').toUpperCase().trim()); }

  sweep() {
    for (const [code, room] of this.rooms) {
      if (room.isIdle()) { room.dispose(); this.rooms.delete(code); }
    }
  }
}

module.exports = { RoomManager, Room, cleanName };
