'use strict';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick n items, preferring ones this room hasn't seen yet. Resets once the pool runs dry.
function pickFresh(pool, n, seen, idOf = (x) => x.id) {
  let fresh = pool.filter((x) => !seen.has(idOf(x)));
  if (fresh.length < n) { pool.forEach((x) => seen.delete(idOf(x))); fresh = pool.slice(); }
  const chosen = shuffle(fresh).slice(0, n);
  chosen.forEach((x) => seen.add(idOf(x)));
  return chosen;
}

const clean = (s, max = 80) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);

class BaseGame {
  constructor(room, options = {}, seen = new Set()) {
    this.room = room;
    this.options = options;
    this.seen = seen;
    this.screen = 'intro';
    this.deadline = null;
    this._timer = null;
    this._disposed = false;
  }

  // Run an async content fetch behind a "loading" screen. Resolves null on failure so callers fall back.
  async load(label, fn) {
    this.screen = 'loading';
    this.loadingLabel = label;
    this.room.update();
    let out = null;
    try { out = await fn(); } catch (e) { console.warn(`[${this.constructor.meta.id}] AI content failed, using built-in bank:`, e.message); }
    if (this._disposed) return undefined;
    return out;
  }

  get fresh() { return !!this.options.fresh && require('../ai').enabled(); }

  get players() { return this.room.players; }
  player(id) { return this.room.player(id); }
  pub(p) { return p ? { id: p.id, name: p.name, colour: p.colour } : null; }

  // One phase timer at a time: setting a new one replaces the old.
  timer(ms, fn) {
    this.clearTimer();
    this.deadline = Date.now() + ms;
    this._timer = setTimeout(() => {
      this._timer = null;
      this.deadline = null;
      if (this._disposed) return;
      fn();
      this.room.update();
    }, ms);
  }

  clearTimer() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
    this.deadline = null;
  }

  scoreboard() {
    return this.players
      .map((p) => ({ ...this.pub(p), score: p.score }))
      .sort((a, b) => b.score - a.score);
  }

  common() {
    return { id: this.constructor.meta.id, screen: this.screen, deadline: this.deadline, loadingLabel: this.screen === 'loading' ? this.loadingLabel : undefined };
  }

  onHostAction() {}
  onPlayerAction() {}
  hostView() { return this.common(); }
  playerView() { return this.common(); }
  dispose() { this._disposed = true; this.clearTimer(); }
}

module.exports = { BaseGame, shuffle, pickFresh, clean };
