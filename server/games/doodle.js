'use strict';
const { BaseGame, shuffle, pickFresh, clean } = require('./base');
const PROMPTS = require('../content/doodle-prompts');
const { isCorrect, norm } = require('../answers');

// Doodle Bluff: everyone draws a secret prompt on their phone. For each drawing, everyone else writes a
// fake title, then everybody tries to spot the real one.
// Scoring: spot the real title +1000 (and the artist gets +500 for each person who spots it);
// +500 for every person your fake title fools.
const DRAW_MS = 90000;
const LIE_MS = 50000;
const PICK_MS = 30000;
const SCORES_MS = 9000;
const MAX_STROKES = 400;
const MAX_POINTS = 8000;
const COLOURS = 8;

function cleanDrawing(d) {
  if (!d || !Array.isArray(d.s)) return null;
  let total = 0;
  const s = [];
  for (const st of d.s.slice(0, MAX_STROKES)) {
    if (!st || !Array.isArray(st.p)) continue;
    const p = st.p.slice(0, 2 * 2000).map((n) => Math.max(0, Math.min(1000, Math.round(Number(n) || 0))));
    if (p.length < 2) continue;
    total += p.length / 2;
    if (total > MAX_POINTS) break;
    s.push({ c: Math.max(0, Math.min(COLOURS - 1, Math.floor(Number(st.c) || 0))), w: Math.max(4, Math.min(60, Math.round(Number(st.w) || 10))), p });
  }
  return s.length ? { s } : null;
}

class Doodle extends BaseGame {
  static get meta() {
    return { id: 'doodle', name: 'Doodle Bluff', tagline: 'Draw something daft on your phone. Everyone writes a fake title. Spot the real one.', minPlayers: 3, maxPlayers: 10 };
  }

  start() {
    this.rounds = [1, 2].includes(Number(this.options.drawRounds)) ? Number(this.options.drawRounds) : 1;
    this.round = 0;
    this.nextRound();
    this.room.update();
  }

  get active() { return this.players.filter((p) => p.connected); }

  nextRound() {
    this.round += 1;
    if (this.round > this.rounds) { this.clearTimer(); this.screen = 'over'; return; }
    const ps = this.active;
    const prompts = pickFresh(PROMPTS.map((t) => ({ id: t, t })), ps.length, this.seen);
    this.prompts = Object.fromEntries(ps.map((p, i) => [p.id, prompts[i].t]));
    this.drawings = {};
    this.screen = 'draw';
    this.timer(DRAW_MS, () => this.endDraw());
  }

  endDraw() {
    this.clearTimer();
    this.order = shuffle(Object.keys(this.drawings).filter((pid) => this.player(pid)));
    this.di = -1;
    if (!this.order.length) { this.screen = 'scores'; this.timer(SCORES_MS, () => this.nextRound()); return; }
    this.nextDrawing();
  }

  nextDrawing() {
    this.di += 1;
    if (this.di >= this.order.length) {
      this.cur = null;
      this.screen = 'scores';
      this.timer(SCORES_MS, () => this.nextRound());
      return;
    }
    const artist = this.order[this.di];
    this.cur = { artist, prompt: this.prompts[artist], drawing: this.drawings[artist], lies: {}, picks: {}, options: null, result: null };
    this.screen = 'lie';
    this.timer(LIE_MS, () => this.toPick());
  }

  guessers() { return this.active.filter((p) => p.id !== this.cur.artist); }

  toPick() {
    this.clearTimer();
    const c = this.cur;
    const groups = new Map();
    for (const [pid, text] of Object.entries(c.lies)) {
      const k = norm(text);
      if (!groups.has(k)) groups.set(k, { id: `L${groups.size}`, text, authors: [] });
      groups.get(k).authors.push(pid);
    }
    c.options = shuffle([{ id: 'T', text: c.prompt, authors: [] }, ...groups.values()]);
    this.screen = 'pick';
    if (c.options.length < 2) return this.reveal();
    this.timer(PICK_MS, () => this.reveal());
    return undefined;
  }

  reveal() {
    this.clearTimer();
    const c = this.cur;
    const gained = {};
    const add = (pid, n) => { gained[pid] = (gained[pid] || 0) + n; const p = this.player(pid); if (p) p.score += n; };
    for (const [pid, oid] of Object.entries(c.picks)) {
      const opt = c.options.find((o) => o.id === oid);
      if (!opt) continue;
      if (opt.id === 'T') { add(pid, 1000); add(c.artist, 500); this.stat(pid, 'spotter'); this.stat(c.artist, 'artist'); }
      else opt.authors.forEach((a) => { add(a, 500); this.stat(a, 'fooler'); });
    }
    c.result = gained;
    this.screen = 'pickReveal';
    // Long enough for the TV to reveal each option in turn, the real one last.
    this.timer(4500 + c.options.length * 1700, () => this.nextDrawing());
  }

  onPlayerAction(p, type, d) {
    if (type === 'drawing' && this.screen === 'draw' && this.prompts[p.id] && !this.drawings[p.id]) {
      const drawing = cleanDrawing(d);
      if (!drawing) return { error: 'Draw something first!' };
      this.drawings[p.id] = drawing;
      if (this.active.every((x) => this.drawings[x.id] || !this.prompts[x.id])) this.endDraw();
      return undefined;
    }
    if (!this.cur) return undefined;
    const c = this.cur;
    if (type === 'lie' && this.screen === 'lie' && p.id !== c.artist && !c.lies[p.id]) {
      const text = clean(d.text, 45);
      if (!text) return undefined;
      if (isCorrect(text, [c.prompt]) || norm(text) === norm(c.prompt)) return { error: "That's too close to the real title! Make something else up." };
      c.lies[p.id] = text;
      if (this.guessers().every((x) => c.lies[x.id])) this.toPick();
      return undefined;
    }
    if (type === 'pick' && this.screen === 'pick' && p.id !== c.artist && !c.picks[p.id]) {
      const opt = c.options.find((o) => o.id === d.id);
      if (!opt || opt.authors.includes(p.id)) return undefined;
      c.picks[p.id] = opt.id;
      if (this.guessers().every((x) => c.picks[x.id])) this.reveal();
    }
    return undefined;
  }

  onPlayerDisconnect() {
    if (this.screen === 'draw' && this.active.length && this.active.every((x) => this.drawings[x.id] || !this.prompts[x.id])) this.endDraw();
    else if (this.screen === 'lie' && this.guessers().every((x) => this.cur.lies[x.id])) this.toPick();
    else if (this.screen === 'pick' && this.guessers().every((x) => this.cur.picks[x.id])) this.reveal();
  }

  onHostAction(type) {
    if (type !== 'next' && type !== 'skip') return;
    if (this.screen === 'draw') this.endDraw();
    else if (this.screen === 'lie') this.toPick();
    else if (this.screen === 'pick') this.reveal();
    else if (this.screen === 'pickReveal') this.nextDrawing();
    else if (this.screen === 'scores') this.nextRound();
  }

  base() {
    const v = { ...this.common(), round: this.round, rounds: this.rounds };
    if (this.screen === 'draw') v.done = Object.keys(this.drawings);
    if (this.cur) {
      const c = this.cur;
      v.di = this.di;
      v.of = this.order.length;
      v.artist = this.pub(this.player(c.artist));
      v.drawing = c.drawing;
      if (this.screen === 'lie') v.lied = Object.keys(c.lies);
      if (this.screen === 'pick') { v.picked = Object.keys(c.picks); v.options = c.options.map((o) => ({ id: o.id, text: o.text })); }
      if (this.screen === 'pickReveal') {
        v.prompt = c.prompt;
        // Lies first (least fooled first), the truth last.
        const lies = c.options.filter((o) => o.id !== 'T').sort((a, b) => this.pickers(a).length - this.pickers(b).length);
        v.reveal = [...lies, c.options.find((o) => o.id === 'T')].map((o) => ({
          id: o.id, text: o.text, truth: o.id === 'T',
          authors: o.authors.map((pid) => this.pub(this.player(pid))).filter(Boolean),
          pickers: this.pickers(o).map((pid) => this.pub(this.player(pid))).filter(Boolean),
        }));
        v.gained = c.result;
      }
    }
    if (this.screen === 'scores' || this.screen === 'over') v.scores = this.scoreboard();
    return v;
  }

  pickers(o) { return Object.keys(this.cur.picks).filter((pid) => this.cur.picks[pid] === o.id); }

  hostView() { return this.base(); }

  playerView(p) {
    const v = this.base();
    if (this.screen === 'draw') { v.prompt = this.prompts[p.id] || null; v.myDrawn = !!this.drawings[p.id]; }
    if (this.cur) {
      const c = this.cur;
      v.isArtist = c.artist === p.id;
      if (this.screen === 'lie') v.myLie = c.lies[p.id] || null;
      if (this.screen === 'pick') {
        v.myPick = c.picks[p.id] || null;
        v.options = c.options.map((o) => ({ id: o.id, text: o.text, mine: o.authors.includes(p.id) }));
      }
      if (this.screen === 'pickReveal') {
        const pick = c.picks[p.id];
        v.myResult = v.isArtist ? null : pick === 'T' ? 'good' : pick ? 'bad' : null;
        v.myGain = (c.result || {})[p.id] || 0;
      }
    }
    return v;
  }
}

module.exports = Doodle;
