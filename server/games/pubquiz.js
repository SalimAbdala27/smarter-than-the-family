'use strict';
const { BaseGame, shuffle, pickFresh, clean } = require('./base');
const quizBank = require('../content/quiz');
const { isCorrect } = require('../answers');
const ai = require('../ai');

const CHOICE_MS = 20000;
const TYPED_MS = 30000;
const REVEAL_MS = 8000;
const BOARD_MS = 7000;
const BOARD_EVERY = 5;

function bankFor(catIds) {
  const no = ai.banned();
  const out = [];
  for (const id of catIds) {
    const builtIn = quizBank.bank(id);
    const generated = (ai.store.quiz[id] || []).map((row) => quizBank.toQuestion(id, row));
    for (const q of builtIn.concat(generated)) {
      if (!no.has(`${q.q}|${q.answer}`)) out.push({ ...q, id: `${id}:${q.q}:${q.emoji || q.image || q.answer}` });
    }
  }
  return out;
}

class PubQuiz extends BaseGame {
  static get meta() {
    return {
      id: 'pubquiz',
      name: 'Pub Quiz',
      tagline: 'General knowledge, emoji puzzles and picture rounds. Faster answers score more.',
      minPlayers: 1,
      maxPlayers: 10,
      categories: quizBank.categories(),
    };
  }

  async start() {
    const o = this.options;
    const count = [10, 15, 20, 30].includes(Number(o.count)) ? Number(o.count) : 15;
    const allCats = quizBank.categories().map((c) => c.id);
    const cats = (Array.isArray(o.categories) ? o.categories : []).filter((c) => allCats.includes(c));
    const catIds = cats.length ? cats : allCats;
    const catName = Object.fromEntries(quizBank.categories().map((c) => [c.id, `${c.emoji} ${c.name}`]));
    const custom = clean(o.custom, 60);
    let picked = [];

    if (custom && ai.enabled()) {
      const k = `custom:${custom.toLowerCase()}`;
      const have = (ai.store.quiz[k] || []).map((r) => r[0]);
      const rows = await this.load(`Claude is writing ${count} questions on "${custom}"…`, () => ai.quiz([custom], count, have));
      if (this._disposed) return;
      if (rows && rows.length) {
        ai.remember('quiz', rows.map((r) => r.row), k);
        picked = rows.map((r) => ({ ...quizBank.toQuestion(k, r.row), label: `✨ ${custom}` }));
      } else {
        this.notice = `Couldn't reach Claude for "${custom}", so here's the regular quiz instead.`;
      }
    } else if (this.fresh) {
      const textCats = catIds.filter((c) => c !== 'pictures' && c !== 'emoji');
      const names = textCats.map((id) => catName[id].replace(/^\S+\s/, ''));
      const aiCount = Math.ceil(count * 0.6); // keep some emoji/picture/bank questions in the mix
      if (names.length) {
        const have = bankFor(textCats).map((q) => q.q);
        const rows = await this.load('Claude is writing fresh questions…', () => ai.quiz(names, aiCount, have));
        if (this._disposed) return;
        const byName = Object.fromEntries(textCats.map((id) => [catName[id].replace(/^\S+\s/, '').toLowerCase(), id]));
        for (const r of rows || []) {
          const cat = byName[String(r.topic || '').toLowerCase()] || textCats[0];
          ai.remember('quiz', [r.row], cat);
          picked.push(quizBank.toQuestion(cat, r.row));
        }
      }
    }

    if (picked.length < count) {
      // Spread questions across the chosen categories rather than letting the biggest one dominate.
      const pool = bankFor(catIds).filter((q) => !picked.some((p) => p.q === q.q));
      const byCat = {};
      pool.forEach((q) => { (byCat[q.cat] = byCat[q.cat] || []).push(q); });
      const cs = shuffle(Object.keys(byCat));
      const need = count - picked.length;
      const per = Math.max(1, Math.ceil(need / Math.max(1, cs.length)));
      let fill = [];
      for (const c of cs) fill = fill.concat(pickFresh(byCat[c], Math.min(per, byCat[c].length), this.seen));
      picked = picked.concat(shuffle(fill).slice(0, need));
    }

    this.questions = shuffle(picked).slice(0, count).map((q) => {
      const base = { q: q.q, kind: q.kind, emoji: q.emoji, image: q.image, answer: q.answer, accept: q.accept, category: q.label || catName[q.cat] || '' };
      if (q.kind === 'choice') {
        base.options = shuffle([q.answer, ...q.wrong]);
        base.correct = base.options.indexOf(q.answer);
      }
      return base;
    });
    if (!this.questions.length) { this.notice = 'No questions found for those categories.'; this.screen = 'over'; this.room.update(); return; }
    this.qi = -1;
    this.nextQuestion();
    this.room.update();
  }

  get current() { return this.questions[this.qi]; }
  get limit() { return this.current.kind === 'typed' ? TYPED_MS : CHOICE_MS; }

  nextQuestion() {
    this.qi += 1;
    if (!this.current) { this.clearTimer(); this.screen = 'over'; return; }
    this.answers = {}; // pid → { choice | text, at }
    this.result = {}; // pid → { right, pts }
    this.askedAt = Date.now();
    this.screen = 'question';
    this.timer(this.limit, () => this.reveal());
  }

  speedPoints(at) {
    const left = Math.max(0, this.limit - (at - this.askedAt)) / this.limit;
    return 500 + Math.round((500 * left) / 10) * 10;
  }

  reveal() {
    this.clearTimer();
    const q = this.current;
    for (const [pid, a] of Object.entries(this.answers)) {
      const right = q.kind === 'choice' ? a.choice === q.correct : isCorrect(a.text, q.accept);
      const pts = this.speedPoints(a.at);
      this.result[pid] = { right, pts };
      const p = this.player(pid);
      if (p && right) p.score += pts;
    }
    this.screen = 'reveal';
    this.timer(q.kind === 'typed' ? REVEAL_MS + 3000 : REVEAL_MS, () => this.afterReveal());
  }

  afterReveal() {
    const last = this.qi === this.questions.length - 1;
    if (!last && (this.qi + 1) % BOARD_EVERY === 0) {
      this.screen = 'board';
      return this.timer(BOARD_MS, () => this.nextQuestion());
    }
    return this.nextQuestion();
  }

  allIn() { return this.players.filter((x) => x.connected).every((x) => this.answers[x.id]); }

  onPlayerAction(p, type, d) {
    if (type !== 'answer' || this.screen !== 'question' || this.answers[p.id]) return;
    const q = this.current;
    if (q.kind === 'choice') {
      const c = Number(d.choice);
      if (!(c >= 0 && c < q.options.length)) return;
      this.answers[p.id] = { choice: c, at: Date.now() };
    } else {
      const text = clean(d.text, 60);
      if (!text) return;
      this.answers[p.id] = { text, at: Date.now() };
    }
    if (this.allIn()) this.reveal();
  }

  onHostAction(type, d) {
    if (type === 'flag' && this.screen === 'reveal') {
      const q = this.current;
      ai.ban(`${q.q}|${q.answer}`);
      this.flagged = this.qi;
      return;
    }
    // Host overrules the auto-marking of a typed answer (e.g. a typo we were too strict on).
    if (type === 'toggle' && this.screen === 'reveal') {
      const r = this.result[d.pid];
      const p = this.player(d.pid);
      if (!r || !p) return;
      r.right = !r.right;
      r.overruled = !r.overruled;
      p.score += r.right ? r.pts : -r.pts;
      this.timer(REVEAL_MS, () => this.afterReveal()); // give the room a moment to see it
      return;
    }
    if (type !== 'skip' && type !== 'next') return;
    if (this.screen === 'question') this.reveal();
    else if (this.screen === 'reveal') this.afterReveal();
    else if (this.screen === 'board') this.nextQuestion();
  }

  onPlayerDisconnect() { if (this.screen === 'question' && this.allIn()) this.reveal(); }

  questionView() {
    const q = this.current;
    return { q: q.q, kind: q.kind, emoji: q.emoji, image: q.image, options: q.options, category: q.category };
  }

  hostView() {
    const v = { ...this.common(), notice: this.notice };
    if (!this.questions) return v;
    v.n = this.qi + 1;
    v.of = this.questions.length;
    if (this.current && (this.screen === 'question' || this.screen === 'reveal')) {
      v.question = this.questionView();
      v.answered = this.players.filter((p) => this.answers[p.id]).map((p) => p.id);
    }
    if (this.screen === 'reveal') {
      const q = this.current;
      v.correct = q.correct;
      v.answer = q.answer;
      if (q.kind === 'choice') v.counts = q.options.map((_, i) => Object.values(this.answers).filter((a) => a.choice === i).length);
      v.results = this.players.filter((p) => this.answers[p.id]).map((p) => ({
        ...this.pub(p),
        text: this.answers[p.id].text,
        right: this.result[p.id].right,
        overruled: !!this.result[p.id].overruled,
        gained: this.result[p.id].right ? this.result[p.id].pts : 0,
      }));
      v.flagged = this.flagged === this.qi;
    }
    if (this.screen === 'board' || this.screen === 'over') v.scores = this.scoreboard();
    return v;
  }

  playerView(p) {
    const v = this.common();
    if (!this.questions) return v;
    v.n = this.qi + 1;
    v.of = this.questions.length;
    const q = this.current;
    if (q && (this.screen === 'question' || this.screen === 'reveal')) {
      v.question = this.questionView();
      const a = this.answers[p.id];
      v.myAnswer = a ? (q.kind === 'choice' ? a.choice : a.text) : null;
    }
    if (this.screen === 'reveal') {
      v.correct = q.correct;
      v.answer = q.answer;
      const r = this.result[p.id];
      v.right = r ? r.right : false;
      v.gained = r && r.right ? r.pts : 0;
    }
    if (this.screen === 'board' || this.screen === 'over') v.scores = this.scoreboard();
    return v;
  }
}

module.exports = PubQuiz;
