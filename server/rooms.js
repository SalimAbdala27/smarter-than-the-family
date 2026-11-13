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
    if (this._pending) return;
    this._pending = true;
    setImmediate(() => { this._pending = false; this.broadcast(); });
  }

  baseView() {
    const vip = this.vip;
    return {
      code: this.code,
      vipId: vip ? vip.id : null,
      players: this.players.map((p) => ({ id: p.id, name: p.name, colour: p.colour, score: p.score, connected: p.connected })),
      games: Object.values(GAMES).map((G) => G.meta),
      lastGameId: this.lastGameId,
      ai: ai.enabled(),
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
      me: { id: p.id, name: p.name, colour: p.colour, score: p.score, isVIP: this.vip && this.vip.id === p.id },
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
