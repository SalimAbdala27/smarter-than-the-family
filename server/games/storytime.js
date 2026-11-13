'use strict';
const { BaseGame, shuffle, pickFresh, clean } = require('./base');
const STORIES = require('../content/stories');
const ai = require('../ai');

const TOKEN_RE = /\[([^\]]+)\]|\{([A-Z])\}/g;

function parse(text) {
  const parts = [];
  let last = 0;
  let m;
  while ((m = TOKEN_RE.exec(text))) {
    if (m.index > last) parts.push({ t: 'text', v: text.slice(last, m.index) });
    if (m[1]) parts.push({ t: 'blank', hint: m[1] });
    else parts.push({ t: 'name', key: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: 'text', v: text.slice(last) });
  return parts;
}

const exampleFor = (hint) => (STORIES.EXAMPLES.find(([re]) => re.test(hint)) || [null, ''])[1];

class StoryTime extends BaseGame {
  static meta = {
    id: 'storytime',
    name: 'Story Time',
    tagline: 'Fill in the blanks blind. Read the disaster out loud.',
    minPlayers: 2,
    maxPlayers: 10,
  };

  start() { this.nextStory(); }

  async nextStory() {
    let story = null;
    if (this.fresh) {
      const recent = [...STORIES, ...ai.store.stories].slice(-15).map((s) => s.title);
      story = await this.load('Claude is writing you a story…', () => ai.story(recent));
      if (this._disposed) return;
      if (story) { ai.remember('stories', [story]); this.seen.add(story.id); }
    }
    if (!story) [story] = pickFresh([...STORIES, ...ai.store.stories], 1, this.seen);
    this.newStory(story);
    this.room.update();
  }

  newStory(story) {
    this.story = story;
    this.parts = parse(story.text);
    this.blanks = []; // { idx (into parts), hint, by, value, filled }
    this.parts.forEach((p, i) => { if (p.t === 'blank') this.blanks.push({ part: i, hint: p.hint, by: null, value: '', filled: false }); });

    // Deal blanks out round-robin so everyone gets an even share.
    const ps = shuffle(this.players);
    shuffle(this.blanks.map((_, i) => i)).forEach((bi, n) => { this.blanks[bi].by = ps[n % ps.length].id; });

    // Name slots get real players, different ones where possible.
    const names = {};
    const order = shuffle(this.players);
    let k = 0;
    this.parts.forEach((p) => {
      if (p.t === 'name' && !names[p.key]) names[p.key] = order[k++ % order.length].name;
    });
    this.names = names;
    this.votes = {}; // voterId → blank index
    this.screen = 'write';
    const perPlayer = Math.ceil(this.blanks.length / ps.length);
    this.timer(Math.min(240, 40 + perPlayer * 20) * 1000, () => this.toReveal());
  }

  tasksFor(pid) {
    return this.blanks
      .map((b, i) => ({ i, hint: b.hint, example: exampleFor(b.hint), filled: b.filled, by: b.by }))
      .filter((b) => b.by === pid)
      .map(({ by, ...rest }) => rest);
  }

  allFilled() {
    return this.blanks.every((b) => b.filled || !this.player(b.by) || !this.player(b.by).connected);
  }

  toReveal() {
    this.clearTimer();
    this.blanks.forEach((b) => { if (!b.filled) { b.value = b.hint.replace(/^(an?|the) /, '').toUpperCase(); b.missed = true; } });
    this.screen = 'reveal';
  }

  toVote() {
    this.screen = 'vote';
    const voters = this.players.filter((p) => p.connected && this.voteOptions(p).length);
    if (!voters.length) return this.toResults();
    this.timer(40000, () => this.toResults());
  }

  voteOptions(p) {
    return this.blanks.map((b, i) => ({ i, value: b.value, hint: b.hint, by: b.by, missed: b.missed }))
      .filter((b) => !b.missed && b.by !== p.id);
  }

  toResults() {
    this.clearTimer();
    const tally = {};
    Object.values(this.votes).forEach((bi) => { tally[bi] = (tally[bi] || 0) + 1; });
    this.tally = tally;
    for (const [bi, n] of Object.entries(tally)) {
      const p = this.player(this.blanks[bi].by);
      if (p) p.score += n * 100;
    }
    const max = Math.max(0, ...Object.values(tally));
    this.best = max ? Object.keys(tally).filter((bi) => tally[bi] === max).map(Number) : [];
    this.best.forEach((bi) => { const p = this.player(this.blanks[bi].by); if (p) p.score += 200; });
    this.screen = 'results';
  }

  onPlayerAction(p, type, d) {
    if (type === 'fill' && this.screen === 'write') {
      const b = this.blanks[d.i];
      const v = clean(d.value, 40);
      if (!b || b.by !== p.id || !v) return;
      b.value = v;
      b.filled = true;
      if (this.allFilled()) this.toReveal();
    } else if (type === 'vote' && this.screen === 'vote') {
      const b = this.blanks[d.i];
      if (!b || b.by === p.id || b.missed) return;
      this.votes[p.id] = Number(d.i);
      const voters = this.players.filter((x) => x.connected && this.voteOptions(x).length);
      if (voters.every((x) => this.votes[x.id] != null)) this.toResults();
    }
  }

  onHostAction(type) {
    if (type === 'skip' || type === 'next') {
      if (this.screen === 'write') this.toReveal();
      else if (this.screen === 'reveal') this.toVote();
      else if (this.screen === 'vote') this.toResults();
    } else if (type === 'again' && this.screen === 'results') {
      this.nextStory();
    }
  }

  onPlayerDisconnect() { if (this.screen === 'write' && this.allFilled()) this.toReveal(); }

  storyView() {
    return this.parts.map((p, i) => {
      if (p.t === 'text') return p;
      if (p.t === 'name') return { t: 'name', v: this.names[p.key] };
      const bi = this.blanks.findIndex((b) => b.part === i);
      const b = this.blanks[bi];
      return { t: 'blank', i: bi, v: b.value, hint: b.hint, missed: !!b.missed, by: this.pub(this.player(b.by)) };
    });
  }

  hostView() {
    if (this.screen === 'loading') return this.common();
    const v = { ...this.common(), title: this.story.title };
    if (this.screen === 'write') {
      v.progress = this.players.map((p) => {
        const mine = this.blanks.filter((b) => b.by === p.id);
        return { ...this.pub(p), done: mine.filter((b) => b.filled).length, total: mine.length };
      });
    } else {
      v.story = this.storyView();
    }
    if (this.screen === 'vote') v.voted = Object.keys(this.votes);
    if (this.screen === 'results') {
      v.best = this.best.map((bi) => ({ value: this.blanks[bi].value, hint: this.blanks[bi].hint, by: this.pub(this.player(this.blanks[bi].by)), votes: this.tally[bi] }));
      v.scores = this.scoreboard();
    }
    return v;
  }

  playerView(p) {
    if (this.screen === 'loading') return this.common();
    const v = { ...this.common(), title: this.story.title };
    if (this.screen === 'write') v.tasks = this.tasksFor(p.id);
    if (this.screen === 'reveal' || this.screen === 'results') v.story = this.storyView();
    if (this.screen === 'vote') {
      v.options = this.voteOptions(p).map(({ by, ...o }) => o);
      v.myVote = this.votes[p.id] ?? null;
    }
    if (this.screen === 'results') {
      v.best = this.best.map((bi) => ({ value: this.blanks[bi].value, by: this.pub(this.player(this.blanks[bi].by)) }));
      v.scores = this.scoreboard();
    }
    return v;
  }
}

module.exports = StoryTime;
