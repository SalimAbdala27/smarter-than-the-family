'use strict';
const { BaseGame } = require('./base');

// End-of-night awards, built from what happened in every game this room played.
// [stat key, title, emoji, line about the winner]
const AWARDS = [
  ['fastest', 'Fastest Finger', '⚡', (n) => `Fastest right answer ${n} time${n === 1 ? '' : 's'}`],
  ['laughs', 'Comedy Gold', '😂', (n) => `${n} vote${n === 1 ? '' : 's'} for their answers`],
  ['liar', 'Best Liar', '😈', (n) => `Got away with being the imposter ${n} time${n === 1 ? '' : 's'}`],
  ['fooler', 'Master Bluffer', '🎭', (n) => `Fooled people with fake titles ${n} time${n === 1 ? '' : 's'}`],
  ['artist', 'Picasso', '🎨', (n) => `People guessed their drawings ${n} time${n === 1 ? '' : 's'}`],
  ['detective', 'Sherlock', '🔍', (n) => `Voted for the imposter ${n} time${n === 1 ? '' : 's'}`],
  ['quizRight', 'Brain Box', '🧠', (n) => `${n} quiz answer${n === 1 ? '' : 's'} right`],
  ['busStops', 'Bus Driver', '🚌', (n) => `Stopped the bus ${n} time${n === 1 ? '' : 's'}`],
  ['original', 'Original Thinker', '💡', (n) => `${n} Stop the Bus answer${n === 1 ? '' : 's'} nobody else had`],
  ['firstHome', 'Escape Artist', '🏃', () => 'First home in the Final Chase'],
  ['whitewash', 'Whitewash', '🧹', (n) => `Won every single vote ${n} time${n === 1 ? '' : 's'}`],
  ['spotter', 'Eagle Eye', '👁️', (n) => `Spotted the real title ${n} time${n === 1 ? '' : 's'}`],
  ['suspicious', 'Most Suspicious', '🕵️', (n) => `Wrongly accused ${n} time${n === 1 ? '' : 's'}. Shifty.`],
  ['vetoed', 'Chancer', '🤥', (n) => `${n} answer${n === 1 ? '' : 's'} thrown out by the group`],
  ['quizWrong', 'Bless Them', '🙈', (n) => `${n} wrong answer${n === 1 ? '' : 's'}. Lovely effort.`],
  ['asleep', 'Asleep at the Wheel', '😴', (n) => `Didn't answer ${n} time${n === 1 ? '' : 's'}`],
  ['caught', 'Roadkill', '🚗', () => 'Caught in the Final Chase'],
  ['safety', 'Played It Safe', '🛟', (n) => `Used ${n} safety answer${n === 1 ? '' : 's'}`],
];
const CHAMPION = ['wins', 'Champion of the Night', '🏆', (n) => `${n} game${n === 1 ? '' : 's'} won`];
const POINTS = ['points', 'Points Machine', '💯', (n) => `${n.toLocaleString('en-GB')} points across the night`];
const MAX_AWARDS = 7;
const INTRO_MS = 5000;
const AWARD_MS = 8000;
const FINAL_MS = 10000;

class Awards extends BaseGame {
  static get meta() {
    return { id: 'awards', name: 'Awards', tagline: '', minPlayers: 1, maxPlayers: 10, hidden: true };
  }

  start() {
    this.list = this.pick();
    this.ai = -1;
    this.screen = 'intro';
    this.timer(INTRO_MS, () => this.next());
    this.room.update();
  }

  winnersOf(key) {
    const here = this.players.map((p) => ({ p, n: (this.room.stats[p.id] || {})[key] || 0 })).filter((x) => x.n > 0);
    if (!here.length) return null;
    const max = Math.max(...here.map((x) => x.n));
    return { n: max, ids: here.filter((x) => x.n === max).map((x) => x.p.id) };
  }

  // Spread the awards around: first give awards to people who haven't won one yet, then fill up.
  pick() {
    const got = new Set();
    const chosen = [];
    const candidates = AWARDS.map((a) => ({ a, w: this.winnersOf(a[0]) })).filter((x) => x.w);
    for (const pass of [0, 1]) {
      for (const c of candidates) {
        if (chosen.length >= MAX_AWARDS || chosen.includes(c)) continue;
        if (pass === 0 && c.w.ids.every((id) => got.has(id))) continue;
        chosen.push(c);
        c.w.ids.forEach((id) => got.add(id));
      }
    }
    chosen.sort((x, y) => AWARDS.indexOf(x.a) - AWARDS.indexOf(y.a));
    const champ = this.winnersOf('wins') ? { a: CHAMPION, w: this.winnersOf('wins') } : this.winnersOf('points') ? { a: POINTS, w: this.winnersOf('points') } : null;
    if (champ) chosen.push({ ...champ, final: true });
    return chosen.map(({ a, w, final }) => ({ key: a[0], title: a[1], emoji: a[2], line: a[3](w.n), winners: w.ids, final: !!final }));
  }

  next() {
    this.ai += 1;
    if (this.ai >= this.list.length) { this.clearTimer(); this.screen = 'finale'; return; }
    this.screen = 'award';
    this.timer(this.list[this.ai].final ? FINAL_MS : AWARD_MS, () => this.next());
  }

  onHostAction(type) {
    if ((type === 'next' || type === 'skip') && this.screen !== 'finale') this.next();
  }

  view(p) {
    const v = { ...this.common(), ai: this.ai, of: this.list.length };
    const show = (a) => ({ ...a, winners: a.winners.map((id) => this.pub(this.player(id))).filter(Boolean) });
    if (this.screen === 'award') v.award = show(this.list[this.ai]);
    if (this.screen === 'finale') v.all = this.list.map(show);
    if (p) v.mine = this.list.filter((a, i) => i <= this.ai && a.winners.includes(p.id)).map((a) => `${a.emoji} ${a.title}`);
    return v;
  }

  hostView() { return this.view(); }
  playerView(p) { return this.view(p); }
}

module.exports = Awards;
