'use strict';
// The Final Chase: played at the end of the Pub Quiz.
// Your quiz score buys a head start on a track. "The Family" (the computer chaser) starts at the back
// and gets most questions right. Answer right to move forward (fastest right answer moves 2).
// Get caught and you're out. Reach HOME to escape. First one home wins the big bonus.

const TRACK = 10; // steps to HOME
const MAX_HEAD_START = 4;
const Q_MS = 12000;
const REVEAL_MS = 7000; // long enough for the run / chase / catch animation
const INTRO_MS = 10000;
const FAMILY_ACCURACY = 0.7; // tweak to make The Family harder or easier
const BONUS_FIRST = 2000;
const BONUS_ESCAPED = 1000;
const BONUS_SURVIVED = 500;

class Chase {
  constructor(game, questions) {
    this.game = game;
    this.questions = questions;
    this.qi = -1;
    this.family = 0;
    this.runners = {}; // pid → { pos, start, status: running|home|caught|survived, order, moved }
    this.homeCount = 0;
    this.log = null;
  }

  get current() { return this.questions[this.qi]; }

  start() {
    const g = this.game;
    // Dense ranking by quiz score: leader gets the biggest head start.
    const scores = [...new Set(g.players.map((p) => p.score))].sort((a, b) => b - a);
    for (const p of g.players) {
      const rank = scores.indexOf(p.score);
      const start = Math.max(1, MAX_HEAD_START - rank);
      this.runners[p.id] = { pos: start, start, status: 'running', order: null, moved: 0 };
    }
    g.screen = 'chaseIntro';
    g.timer(INTRO_MS, () => this.ask());
  }

  running() { return this.game.players.filter((p) => this.runners[p.id] && this.runners[p.id].status === 'running'); }

  ask() {
    const g = this.game;
    this.qi += 1;
    if (!this.running().length || !this.current) return this.finish();
    this.answers = {};
    this.askedAt = Date.now();
    g.screen = 'chaseQ';
    g.timer(Q_MS, () => this.reveal());
  }

  answer(p, choice) {
    const r = this.runners[p.id];
    if (this.game.screen !== 'chaseQ' || !r || r.status !== 'running' || this.answers[p.id]) return;
    const c = Number(choice);
    if (!(c >= 0 && c < this.current.options.length)) return;
    this.answers[p.id] = { choice: c, at: Date.now() };
    if (this.allIn()) this.reveal();
  }

  allIn() { return this.running().filter((p) => p.connected).every((p) => this.answers[p.id]); }

  reveal() {
    const g = this.game;
    g.clearTimer();
    const q = this.current;
    const right = this.running().filter((p) => this.answers[p.id] && this.answers[p.id].choice === q.correct);
    right.sort((a, b) => this.answers[a.id].at - this.answers[b.id].at);
    Object.values(this.runners).forEach((r) => { r.moved = 0; });
    right.forEach((p, i) => {
      const step = i === 0 && this.running().length > 1 ? 2 : 1;
      const r = this.runners[p.id];
      r.pos = Math.min(TRACK, r.pos + step);
      r.moved = step;
    });
    // Whoever crosses the line first (by answer speed) gets the better finishing place.
    right.forEach((p) => {
      const r = this.runners[p.id];
      if (r.pos >= TRACK) { r.status = 'home'; r.order = this.homeCount++; }
    });
    const familyRight = Math.random() < FAMILY_ACCURACY;
    if (familyRight) this.family += 1;
    const caught = [];
    for (const p of this.running()) {
      const r = this.runners[p.id];
      if (this.family >= r.pos) { r.status = 'caught'; caught.push(p.id); }
    }
    this.log = { familyRight, right: right.map((p) => p.id), caught };
    g.screen = 'chaseReveal';
    g.timer(REVEAL_MS, () => this.ask());
  }

  finish() {
    const g = this.game;
    g.clearTimer();
    for (const p of g.players) {
      const r = this.runners[p.id];
      if (!r) continue;
      if (r.status === 'running') r.status = 'survived';
      r.bonus = r.status === 'home' ? (r.order === 0 ? BONUS_FIRST : BONUS_ESCAPED) : r.status === 'survived' ? BONUS_SURVIVED : 0;
      p.score += r.bonus;
    }
    this.finished = true;
    g.screen = 'over';
  }

  onNext() {
    const s = this.game.screen;
    if (s === 'chaseIntro' || s === 'chaseReveal') this.ask();
    else if (s === 'chaseQ') this.reveal();
  }

  track() {
    return {
      length: TRACK,
      family: this.family,
      runners: this.game.players.filter((p) => this.runners[p.id]).map((p) => ({ ...this.game.pub(p), ...this.runners[p.id] })),
    };
  }

  hostView() {
    const v = { track: this.track(), n: this.qi + 1 };
    if (this.game.screen === 'chaseQ' || this.game.screen === 'chaseReveal') {
      const q = this.current;
      v.question = { q: q.q, options: q.options, category: q.category, kind: 'choice' };
      v.answered = Object.keys(this.answers);
    }
    if (this.game.screen === 'chaseReveal') { v.correct = this.current.correct; v.log = this.log; }
    return v;
  }

  playerView(p) {
    const r = this.runners[p.id];
    const v = { track: this.track(), me: r ? { ...r, gap: r.pos - this.family } : null, n: this.qi + 1 };
    if (this.game.screen === 'chaseQ' && r && r.status === 'running') {
      v.question = { q: this.current.q, options: this.current.options, kind: 'choice' };
      v.myAnswer = this.answers[p.id] ? this.answers[p.id].choice : null;
    }
    if (this.game.screen === 'chaseReveal') {
      v.correct = this.current.correct;
      v.answer = this.current.options[this.current.correct];
      v.log = this.log;
    }
    return v;
  }
}

Chase.TRACK = TRACK;
Chase.CHASER = 'The Family';
module.exports = Chase;
