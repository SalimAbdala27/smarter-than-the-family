'use strict';
// Imposter: everyone gets the same secret word except one player, who only knows the category.
// Players take turns giving a one-word clue, discuss, then vote. If the imposter is caught they
// get one chance to guess the word and steal the round.
const { BaseGame, shuffle, pickFresh, clean } = require('./base');
const WORDS = require('../content/imposter-words');
const { isCorrect, norm } = require('../answers');

const REVEAL_MS = 30000;
const CLUE_MS = 35000;
const DISCUSS_MS = 75000;
const VOTE_MS = 40000;
const VOTE_REVEAL_MS = 7000;
const GUESS_MS = 30000;
const RESULT_MS = 12000;

const ALL = Object.entries(WORDS).flatMap(([category, words]) => words.map((w) => ({ id: `${category}:${w}`, category, word: w })));

class Imposter extends BaseGame {
  static meta = {
    id: 'imposter',
    name: 'Imposter',
    tagline: "Everyone gets the secret word, apart from the imposter. Clue, bluff, vote them out.",
    minPlayers: 3,
    maxPlayers: 10,
  };

  start() {
    this.rounds = [3, 5].includes(Number(this.options.rounds)) ? Number(this.options.rounds) : 3;
    this.passes = Number(this.options.passes) === 2 ? 2 : 1;
    this.timesImposter = {};
    this.round = 0;
    this.nextRound();
  }

  connected() { return this.players.filter((p) => p.connected); }

  nextRound() {
    this.round += 1;
    if (this.round > this.rounds) { this.clearTimer(); this.screen = 'over'; return; }
    const [pick] = pickFresh(ALL, 1, this.seen);
    this.category = pick.category;
    this.word = pick.word;
    // Rotate the imposter: pick from whoever has had the role least.
    const ps = this.connected();
    const least = Math.min(...ps.map((p) => this.timesImposter[p.id] || 0));
    const imp = shuffle(ps.filter((p) => (this.timesImposter[p.id] || 0) === least))[0];
    this.imposter = imp.id;
    this.timesImposter[imp.id] = (this.timesImposter[imp.id] || 0) + 1;
    // Turn order: the imposter never goes first, so they always hear at least one clue.
    let order = shuffle(ps.map((p) => p.id));
    if (order[0] === this.imposter) order = order.slice(1).concat(order[0]);
    this.order = order;
    this.clues = {}; // pid → [clue per pass]
    this.ready = new Set();
    this.votes = {};
    this.turn = -1;
    this.pass = 1;
    this.guess = null;
    this.outcome = null;
    this.screen = 'reveal';
    this.timer(REVEAL_MS, () => this.startClues());
  }

  startClues() {
    this.clearTimer();
    this.turn = -1;
    this.pass = 1;
    this.nextTurn();
  }

  get turnPid() { return this.order[this.turn]; }

  nextTurn() {
    this.turn += 1;
    if (this.turn >= this.order.length) {
      if (this.pass < this.passes) { this.pass += 1; this.turn = 0; } else return this.startDiscuss();
    }
    const p = this.player(this.turnPid);
    if (!p || !p.connected) return this.nextTurn(); // skip anyone who's dropped out
    this.screen = 'clue';
    this.timer(CLUE_MS, () => { this.addClue(this.turnPid, '…'); this.nextTurn(); });
    return undefined;
  }

  addClue(pid, text) {
    if (!this.clues[pid]) this.clues[pid] = [];
    this.clues[pid][this.pass - 1] = text;
  }

  startDiscuss() {
    this.screen = 'discuss';
    this.timer(DISCUSS_MS, () => this.startVote());
  }

  startVote() {
    this.screen = 'vote';
    this.timer(VOTE_MS, () => this.revealVotes());
  }

  revealVotes() {
    this.clearTimer();
    const tally = {};
    Object.values(this.votes).forEach((pid) => { tally[pid] = (tally[pid] || 0) + 1; });
    const max = Math.max(0, ...Object.values(tally));
    const top = Object.keys(tally).filter((pid) => tally[pid] === max);
    this.tally = tally;
    this.accused = max > 0 && top.length === 1 ? top[0] : null; // a tie means nobody is thrown out
    this.caught = this.accused === this.imposter;
    this.screen = 'votereveal';
    this.timer(VOTE_REVEAL_MS, () => {
      if (this.caught) { this.screen = 'guess'; this.timer(GUESS_MS, () => this.finishRound()); } else this.finishRound();
    });
  }

  finishRound() {
    this.clearTimer();
    const stole = this.caught && this.guess && isCorrect(this.guess, [this.word]);
    this.outcome = !this.caught ? 'escaped' : stole ? 'stole' : 'caught';
    this.gained = {};
    const add = (pid, n) => { this.gained[pid] = (this.gained[pid] || 0) + n; const p = this.player(pid); if (p) p.score += n; };
    if (this.outcome !== 'caught') this.stat(this.imposter, 'liar');
    if (this.accused && !this.caught) this.stat(this.accused, 'suspicious');
    Object.entries(this.votes).forEach(([voter, pid]) => { if (pid === this.imposter && voter !== this.imposter) this.stat(voter, 'detective'); });
    if (this.outcome === 'escaped') add(this.imposter, 300);
    else if (this.outcome === 'stole') add(this.imposter, 200);
    else {
      this.order.filter((pid) => pid !== this.imposter).forEach((pid) => add(pid, 100));
      Object.entries(this.votes).forEach(([voter, pid]) => { if (pid === this.imposter && voter !== this.imposter) add(voter, 100); });
    }
    this.screen = 'roundResult';
    this.timer(RESULT_MS, () => this.nextRound());
  }

  onPlayerAction(p, type, d) {
    if (type === 'ready' && this.screen === 'reveal') {
      this.ready.add(p.id);
      if (this.connected().every((x) => this.ready.has(x.id))) this.startClues();
    } else if (type === 'clue' && this.screen === 'clue' && p.id === this.turnPid) {
      const text = clean(d.text, 30);
      if (!text) return;
      if (p.id !== this.imposter && norm(text).includes(norm(this.word))) return; // no saying the word!
      this.addClue(p.id, text);
      this.nextTurn();
    } else if (type === 'vote' && this.screen === 'vote') {
      if (d.pid === p.id || !this.order.includes(d.pid)) return;
      this.votes[p.id] = d.pid;
      if (this.connected().every((x) => this.votes[x.id])) this.revealVotes();
    } else if (type === 'guess' && this.screen === 'guess' && p.id === this.imposter) {
      this.guess = clean(d.text, 40);
      if (this.guess) this.finishRound();
    }
  }

  onHostAction(type) {
    if (type !== 'skip' && type !== 'next') return;
    switch (this.screen) {
      case 'reveal': return this.startClues();
      case 'clue': this.addClue(this.turnPid, '…'); return this.nextTurn();
      case 'discuss': return this.startVote();
      case 'vote': return this.revealVotes();
      case 'votereveal': this.clearTimer(); if (this.caught) { this.screen = 'guess'; return this.timer(GUESS_MS, () => this.finishRound()); } return this.finishRound();
      case 'guess': return this.finishRound();
      case 'roundResult': return this.nextRound();
      default: return undefined;
    }
  }

  onPlayerDisconnect(p) {
    if (this.screen === 'clue' && p.id === this.turnPid) this.nextTurn();
    if (this.screen === 'reveal' && this.connected().every((x) => this.ready.has(x.id))) this.startClues();
    if (this.screen === 'vote' && this.connected().every((x) => this.votes[x.id])) this.revealVotes();
  }

  table() {
    return this.order.map((pid) => ({ ...this.pub(this.player(pid)), clues: this.clues[pid] || [] })).filter((x) => x.id);
  }

  shared() {
    const v = { ...this.common(), round: this.round, rounds: this.rounds, category: this.category, pass: this.pass, passes: this.passes };
    if (['clue', 'discuss', 'vote', 'votereveal', 'guess', 'roundResult'].includes(this.screen)) v.table = this.table();
    if (this.screen === 'clue') v.turn = this.pub(this.player(this.turnPid));
    if (this.screen === 'reveal') v.ready = [...this.ready];
    if (this.screen === 'vote') v.voted = Object.keys(this.votes);
    if (['votereveal', 'guess', 'roundResult'].includes(this.screen)) {
      v.tally = this.order.map((pid) => ({ ...this.pub(this.player(pid)), votes: this.tally[pid] || 0, voters: Object.keys(this.votes).filter((x) => this.votes[x] === pid).map((x) => this.pub(this.player(x))) })).filter((x) => x.id);
      v.accused = this.pub(this.player(this.accused));
    }
    if (this.screen === 'guess' || this.screen === 'roundResult') v.imposter = this.pub(this.player(this.imposter));
    if (this.screen === 'roundResult') {
      Object.assign(v, { word: this.word, outcome: this.outcome, guess: this.guess, gained: this.gained });
    }
    if (['roundResult', 'over'].includes(this.screen)) v.scores = this.scoreboard();
    return v;
  }

  hostView() { return this.shared(); }

  playerView(p) {
    const v = this.shared();
    const isImp = p.id === this.imposter;
    v.isImposter = isImp;
    if (!isImp && this.screen !== 'over') v.word = this.word;
    if (this.screen === 'reveal') v.amReady = this.ready.has(p.id);
    if (this.screen === 'clue') v.myTurn = p.id === this.turnPid;
    if (this.screen === 'vote') v.myVote = this.votes[p.id] || null;
    return v;
  }
}

module.exports = Imposter;
