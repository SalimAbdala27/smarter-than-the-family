'use strict';
// Stop the Bus (a.k.a. Name, Place, Animal, Thing).
// A random letter; everyone fills in one answer per category starting with it.
// First to fill every box can STOP THE BUS: everyone else gets 5 seconds.
// Then each category is reviewed on the TV and players can 👎 dodgy answers.
// Scoring: unique valid answer 10, shared answer 5, blank / wrong letter / vetoed 0.
const { BaseGame, shuffle, clean } = require('./base');
const { norm } = require('../answers');

const CLASSIC = ["Boy's name", "Girl's name", 'Animal', 'Country', 'City or town', 'Food', 'Drink', 'Famous person'];
const POOL = [
  "Boy's name", "Girl's name", 'Animal', 'Country', 'City or town', 'Food', 'Drink', 'Famous person',
  'Football club', 'Band or singer', 'Film', 'TV show', 'Something in a kitchen', 'Brand', 'Job',
  'Colour', 'Sport', 'Car make', 'Fruit or veg', 'Body part', 'Something in a pub', 'Item of clothing',
  'Something in a supermarket', 'Cartoon character', 'Musical instrument', 'Something in a bathroom',
  'Footballer', 'Hobby', 'Dessert', 'Insect or bug', 'Something cold', 'Something you can throw',
  'Excuse for being late', 'Place on holiday', 'Thing in a school', 'Takeaway food',
];
const LETTERS = 'ABCDEFGHIJKLMNOPRSTW'.split(''); // no Q, U, V, X, Y, Z: too cruel
const WRITE_MS = 120000;
const STOP_MS = 6000;
const REVIEW_MS = 15000;
const SCORES_MS = 9000;
const PER_ROUND = 8;

const firstLetter = (s) => norm(s).replace(/^(the|a|an) /, '').charAt(0).toUpperCase();

class StopTheBus extends BaseGame {
  static meta = {
    id: 'stopthebus',
    name: 'Stop the Bus',
    tagline: 'Random letter, eight categories, beat the bus. Name, Place, Animal, Thing…',
    minPlayers: 2,
    maxPlayers: 10,
    options: true,
  };

  start() {
    this.rounds = [3, 5].includes(Number(this.options.rounds)) ? Number(this.options.rounds) : 3;
    this.mode = this.options.mode === 'random' ? 'random' : 'classic';
    this.used = new Set();
    this.round = 0;
    this.nextRound();
  }

  nextRound() {
    this.round += 1;
    if (this.round > this.rounds) { this.clearTimer(); this.screen = 'over'; return; }
    const fresh = LETTERS.filter((l) => !this.used.has(l));
    this.letter = shuffle(fresh.length ? fresh : LETTERS)[0];
    this.used.add(this.letter);
    this.categories = this.mode === 'classic' ? CLASSIC.slice() : shuffle(POOL).slice(0, PER_ROUND);
    this.answers = {}; // pid → [strings]
    this.players.forEach((p) => { this.answers[p.id] = this.categories.map(() => ''); });
    this.stoppedBy = null;
    this.vetoes = {}; // `${ci}:${pid}` → Set(voterIds)
    this.ci = -1;
    this.screen = 'write';
    this.timer(WRITE_MS, () => this.startReview());
  }

  filledAll(pid) {
    const a = this.answers[pid] || [];
    return this.categories.every((_, i) => a[i] && firstLetter(a[i]) === this.letter);
  }

  startReview() {
    this.clearTimer();
    this.ci = -1;
    this.nextCategory();
  }

  nextCategory() {
    this.ci += 1;
    if (this.ci >= this.categories.length) return this.scoreRound();
    this.screen = 'review';
    this.timer(REVIEW_MS, () => this.nextCategory());
    return undefined;
  }

  // Validity for one answer: right letter and not vetoed by more than half of the other players.
  status(ci, pid) {
    const text = (this.answers[pid] || [])[ci] || '';
    if (!text) return 'blank';
    if (firstLetter(text) !== this.letter) return 'wrong-letter';
    const v = this.vetoes[`${ci}:${pid}`];
    const others = this.players.filter((p) => p.connected && p.id !== pid).length;
    if (v && v.size > 0 && v.size * 2 > others) return 'vetoed';
    return 'ok';
  }

  categoryResults(ci) {
    const valid = this.players.filter((p) => this.status(ci, p.id) === 'ok');
    const counts = {};
    valid.forEach((p) => { const k = norm(this.answers[p.id][ci]); counts[k] = (counts[k] || 0) + 1; });
    return this.players.map((p) => {
      const st = this.status(ci, p.id);
      const text = (this.answers[p.id] || [])[ci] || '';
      const shared = st === 'ok' && counts[norm(text)] > 1;
      return { ...this.pub(p), text, status: st, shared, points: st === 'ok' ? (shared ? 5 : 10) : 0, vetoes: (this.vetoes[`${ci}:${p.id}`] || new Set()).size };
    });
  }

  scoreRound() {
    this.clearTimer();
    this.roundPoints = {};
    this.categories.forEach((_, ci) => this.categoryResults(ci).forEach((r) => {
      this.roundPoints[r.id] = (this.roundPoints[r.id] || 0) + r.points;
    }));
    if (this.stoppedBy && this.roundPoints[this.stoppedBy] != null) this.roundPoints[this.stoppedBy] += 10; // bonus for stopping the bus
    for (const [pid, pts] of Object.entries(this.roundPoints)) { const p = this.player(pid); if (p) p.score += pts; }
    this.screen = 'roundScores';
    this.timer(SCORES_MS, () => this.nextRound());
  }

  onPlayerAction(p, type, d) {
    if (type === 'fill' && (this.screen === 'write' || this.screen === 'stopping')) {
      const i = Number(d.ci);
      if (!(i >= 0 && i < this.categories.length)) return;
      if (!this.answers[p.id]) this.answers[p.id] = this.categories.map(() => '');
      this.answers[p.id][i] = clean(d.value, 40);
    } else if (type === 'stop' && this.screen === 'write' && this.filledAll(p.id)) {
      this.stoppedBy = p.id;
      this.screen = 'stopping';
      this.timer(STOP_MS, () => this.startReview());
    } else if (type === 'veto' && this.screen === 'review') {
      if (d.pid === p.id || !this.player(d.pid)) return;
      const k = `${this.ci}:${d.pid}`;
      const set = this.vetoes[k] || (this.vetoes[k] = new Set());
      if (set.has(p.id)) set.delete(p.id); else set.add(p.id);
    }
  }

  onHostAction(type) {
    if (type !== 'skip' && type !== 'next') return;
    if (this.screen === 'write') {
      this.screen = 'stopping';
      this.timer(STOP_MS, () => this.startReview());
    } else if (this.screen === 'stopping') this.startReview();
    else if (this.screen === 'review') this.nextCategory();
    else if (this.screen === 'roundScores') this.nextRound();
  }

  hostView() {
    const v = { ...this.common(), round: this.round, rounds: this.rounds, letter: this.letter, categories: this.categories };
    if (this.screen === 'write' || this.screen === 'stopping') {
      v.progress = this.players.map((p) => ({ ...this.pub(p), done: (this.answers[p.id] || []).filter((a, i) => a && firstLetter(a) === this.letter && i < this.categories.length).length, total: this.categories.length }));
      v.stoppedBy = this.pub(this.player(this.stoppedBy));
    }
    if (this.screen === 'review') { v.ci = this.ci; v.results = this.categoryResults(this.ci); }
    if (this.screen === 'roundScores') {
      v.roundPoints = this.players.map((p) => ({ ...this.pub(p), points: this.roundPoints[p.id] || 0, stopped: p.id === this.stoppedBy })).sort((a, b) => b.points - a.points);
    }
    if (['roundScores', 'over'].includes(this.screen)) v.scores = this.scoreboard();
    return v;
  }

  playerView(p) {
    const v = { ...this.common(), round: this.round, rounds: this.rounds, letter: this.letter, categories: this.categories };
    if (this.screen === 'write' || this.screen === 'stopping') {
      v.mine = this.answers[p.id] || [];
      v.canStop = this.screen === 'write' && this.filledAll(p.id);
      v.stoppedBy = this.pub(this.player(this.stoppedBy));
    }
    if (this.screen === 'review') {
      v.ci = this.ci;
      v.results = this.categoryResults(this.ci).map((r) => ({ ...r, myVeto: !!(this.vetoes[`${this.ci}:${r.id}`] && this.vetoes[`${this.ci}:${r.id}`].has(p.id)) }));
    }
    if (this.screen === 'roundScores') v.myPoints = this.roundPoints[p.id] || 0;
    if (['roundScores', 'over'].includes(this.screen)) v.scores = this.scoreboard();
    return v;
  }
}

module.exports = StopTheBus;
