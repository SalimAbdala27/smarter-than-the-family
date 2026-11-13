'use strict';
const { BaseGame, shuffle, pickFresh, clean } = require('./base');
const { PROMPTS, FINAL, SAFETY } = require('../content/prompts');
const ai = require('../ai');

const WRITE_MS = 90000;
const VOTE_MS = 20000;
const RESULT_MS = 7000;
const SCORES_MS = 8000;
const FINAL_WRITE_MS = 75000;
const FINAL_VOTE_MS = 30000;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const asPrompt = (s) => ({ id: s, text: s });

class HeadToHead extends BaseGame {
  static meta = {
    id: 'headtohead',
    name: 'Head to Head',
    tagline: 'Two players, one prompt. The room votes for the funniest.',
    minPlayers: 3,
    maxPlayers: 10,
  };

  async start() {
    this.round = 0;
    this.aiPrompts = [];
    this.aiFinal = null;
    if (this.fresh) {
      const avoid = [...PROMPTS, ...ai.store.prompts];
      const out = await this.load('Claude is writing fresh prompts…', () => ai.prompts(this.players.length * 2, avoid));
      if (this._disposed) return;
      if (out) {
        this.aiPrompts = shuffle(out.prompts);
        this.aiFinal = out.final;
        ai.remember('prompts', out.prompts);
        if (out.final) ai.remember('finals', [out.final]);
      }
    }
    this.nextRound();
    this.room.update();
  }

  get mult() { return this.round; }
  connected() { return this.players.filter((p) => p.connected); }

  nextRound() {
    this.round += 1;
    if (this.round === 3) return this.startFinal();
    const ps = shuffle(this.players);
    const fromAi = this.aiPrompts.splice(0, ps.length).map(asPrompt);
    fromAi.forEach((p) => this.seen.add(p.id));
    const prompts = fromAi.concat(pickFresh([...PROMPTS, ...ai.store.prompts].map(asPrompt), ps.length - fromAi.length, this.seen));
    this.matchups = prompts.map((pr, k) => ({
      prompt: pr.text,
      a: ps[k].id,
      b: ps[(k + 1) % ps.length].id,
      answers: {}, // pid → { text, safety }
      votes: {}, // voterId → pid
    }));
    this.battle = -1;
    this.screen = 'write';
    this.timer(WRITE_MS, () => this.startBattles());
  }

  tasksFor(pid) {
    return this.matchups
      .map((m, mi) => ({ mi, prompt: m.prompt, mine: m.a === pid || m.b === pid, answered: !!m.answers[pid] }))
      .filter((t) => t.mine)
      .map(({ mine, ...t }) => t);
  }

  allWritten() {
    return this.connected().every((p) => this.tasksFor(p.id).every((t) => t.answered));
  }

  startBattles() {
    this.clearTimer();
    this.matchups = shuffle(this.matchups);
    this.battle = -1;
    this.nextBattle();
  }

  get current() { return this.matchups[this.battle]; }

  votersFor(m) { return this.connected().filter((p) => p.id !== m.a && p.id !== m.b); }

  nextBattle() {
    this.battle += 1;
    const m = this.current;
    if (!m) {
      this.screen = 'scores';
      return this.timer(SCORES_MS, () => this.nextRound());
    }
    const A = m.answers[m.a];
    const B = m.answers[m.b];
    if (!A || !B) return this.settle('forfeit');
    if (norm(A.text) === norm(B.text)) return this.settle('jinx');
    if (!this.votersFor(m).length) return this.settle();
    this.screen = 'battle';
    this.timer(VOTE_MS, () => this.settle());
  }

  settle(kind = 'vote') {
    const m = this.current;
    this.clearTimer();
    const res = { kind, points: { [m.a]: 0, [m.b]: 0 }, votes: { [m.a]: [], [m.b]: [] }, sweep: null };
    if (kind === 'forfeit') {
      const winner = m.answers[m.a] ? m.a : m.answers[m.b] ? m.b : null;
      if (winner) res.points[winner] = 100 * this.mult;
    } else if (kind === 'vote') {
      for (const [voter, pid] of Object.entries(m.votes)) res.votes[pid].push(voter);
      for (const pid of [m.a, m.b]) {
        const per = (m.answers[pid].safety ? 50 : 100) * this.mult;
        res.points[pid] = res.votes[pid].length * per;
      }
      const total = res.votes[m.a].length + res.votes[m.b].length;
      for (const pid of [m.a, m.b]) {
        if (total >= 2 && res.votes[pid].length === total) {
          res.sweep = pid;
          res.points[pid] += 100 * this.mult;
        }
      }
    }
    for (const [pid, pts] of Object.entries(res.points)) { const p = this.player(pid); if (p) p.score += pts; }
    m.result = res;
    this.screen = 'battleResult';
    this.timer(RESULT_MS, () => this.nextBattle());
  }

  startFinal() {
    const [pr] = this.aiFinal ? [asPrompt(this.aiFinal)] : pickFresh([...FINAL, ...ai.store.finals].map(asPrompt), 1, this.seen);
    this.final = { prompt: pr.text, answers: {}, votes: {} };
    this.screen = 'finalWrite';
    this.timer(FINAL_WRITE_MS, () => this.startFinalVote());
  }

  startFinalVote() {
    this.clearTimer();
    this.final.order = shuffle(Object.keys(this.final.answers));
    if (this.final.order.length < 2) return this.finishFinal();
    this.screen = 'finalVote';
    this.timer(FINAL_VOTE_MS, () => this.finishFinal());
  }

  finalVoters() { return this.connected().filter((p) => this.final.order.some((id) => id !== p.id)); }

  finishFinal() {
    this.clearTimer();
    const tally = {};
    Object.values(this.final.votes).forEach((pid) => { tally[pid] = (tally[pid] || 0) + 1; });
    for (const [pid, n] of Object.entries(tally)) { const p = this.player(pid); if (p) p.score += n * 300; }
    this.final.tally = tally;
    this.screen = 'finalResult';
    this.timer(12000, () => { this.screen = 'over'; });
  }

  onPlayerAction(p, type, d) {
    if ((type === 'answer' || type === 'safety') && this.screen === 'write') {
      const m = this.matchups[d.mi];
      if (!m || (m.a !== p.id && m.b !== p.id) || m.answers[p.id]) return;
      const text = type === 'safety' ? SAFETY[Math.floor(Math.random() * SAFETY.length)] : clean(d.value, 80);
      if (!text) return;
      m.answers[p.id] = { text, safety: type === 'safety' };
      if (this.allWritten()) this.startBattles();
    } else if (type === 'vote' && this.screen === 'battle') {
      const m = this.current;
      if (p.id === m.a || p.id === m.b || (d.pid !== m.a && d.pid !== m.b)) return;
      m.votes[p.id] = d.pid;
      if (this.votersFor(m).every((v) => m.votes[v.id])) this.settle();
    } else if ((type === 'answer' || type === 'safety') && this.screen === 'finalWrite') {
      if (this.final.answers[p.id]) return;
      const text = type === 'safety' ? SAFETY[Math.floor(Math.random() * SAFETY.length)] : clean(d.value, 80);
      if (!text) return;
      this.final.answers[p.id] = { text, safety: type === 'safety' };
      if (this.connected().every((x) => this.final.answers[x.id])) this.startFinalVote();
    } else if (type === 'vote' && this.screen === 'finalVote') {
      if (d.pid === p.id || !this.final.answers[d.pid]) return;
      this.final.votes[p.id] = d.pid;
      if (this.finalVoters().every((v) => this.final.votes[v.id])) this.finishFinal();
    }
  }

  onHostAction(type) {
    if (type !== 'skip' && type !== 'next') return;
    switch (this.screen) {
      case 'write': return this.startBattles();
      case 'battle': return this.settle();
      case 'battleResult': return this.nextBattle();
      case 'scores': return this.nextRound();
      case 'finalWrite': return this.startFinalVote();
      case 'finalVote': return this.finishFinal();
      case 'finalResult': this.clearTimer(); this.screen = 'over'; return undefined;
      default: return undefined;
    }
  }

  onPlayerDisconnect() {
    if (this.screen === 'write' && this.allWritten()) this.startBattles();
  }

  battleView(reveal) {
    const m = this.current;
    const side = (pid) => ({
      text: m.answers[pid] ? m.answers[pid].text : null,
      safety: m.answers[pid] ? m.answers[pid].safety : false,
      ...(reveal ? { by: this.pub(this.player(pid)), points: m.result.points[pid], voters: m.result.votes[pid].map((id) => this.pub(this.player(id))) } : {}),
      pid,
    });
    return {
      prompt: m.prompt,
      a: side(m.a),
      b: side(m.b),
      index: this.battle + 1,
      of: this.matchups.length,
      voted: Object.keys(m.votes).length,
      voters: this.votersFor(m).length,
      ...(reveal ? { kind: m.result.kind, sweep: m.result.sweep } : {}),
    };
  }

  finalView(reveal) {
    const f = this.final;
    return {
      prompt: f.prompt,
      answers: (f.order || []).map((pid) => ({
        pid,
        text: f.answers[pid].text,
        ...(reveal ? { by: this.pub(this.player(pid)), votes: f.tally[pid] || 0 } : {}),
      })),
    };
  }

  hostView() {
    const v = { ...this.common(), round: this.round };
    if (this.screen === 'write') {
      v.progress = this.players.map((p) => {
        const t = this.tasksFor(p.id);
        return { ...this.pub(p), done: t.filter((x) => x.answered).length, total: t.length };
      });
    }
    if (this.screen === 'battle') v.battle = this.battleView(false);
    if (this.screen === 'battleResult') v.battle = this.battleView(true);
    if (this.screen === 'finalWrite') {
      v.prompt = this.final.prompt;
      v.progress = this.players.map((p) => ({ ...this.pub(p), done: this.final.answers[p.id] ? 1 : 0, total: 1 }));
    }
    if (this.screen === 'finalVote') { v.final = this.finalView(false); v.voted = Object.keys(this.final.votes).length; }
    if (this.screen === 'finalResult') v.final = this.finalView(true);
    if (['scores', 'finalResult', 'over'].includes(this.screen)) v.scores = this.scoreboard();
    return v;
  }

  playerView(p) {
    const v = { ...this.common(), round: this.round };
    if (this.screen === 'write') v.tasks = this.tasksFor(p.id);
    if (this.screen === 'battle' || this.screen === 'battleResult') {
      const m = this.current;
      v.inBattle = m.a === p.id || m.b === p.id;
      v.battle = this.battleView(this.screen === 'battleResult');
      v.myVote = m.votes[p.id] || null;
    }
    if (this.screen === 'finalWrite') {
      v.tasks = [{ mi: 0, prompt: this.final.prompt, answered: !!this.final.answers[p.id] }];
    }
    if (this.screen === 'finalVote') {
      v.final = this.finalView(false);
      v.final.answers = v.final.answers.filter((a) => a.pid !== p.id);
      v.myVote = this.final.votes[p.id] || null;
    }
    if (['scores', 'finalResult', 'over'].includes(this.screen)) v.scores = this.scoreboard();
    return v;
  }
}

module.exports = HeadToHead;
