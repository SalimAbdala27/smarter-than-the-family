/* Effects shared by the TV and the phones:
   - CW.sfx.*            synth sound effects (no audio files)
   - CW.music(theme)     a quiet generated backing track per game (TV only)
   - CW.scene(theme)     animated background per game (TV only)
   - CW.confetti(), CW.flash(), CW.buzz(), CW.feedback()   juice
   - CW.animateBoards()  leaderboard rows slide to their new place and scores count up
   - CW.crowd(items)     a row of players' characters that react (typing, done, right, wrong) */
(function () {
  const CW = window.CW;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- audio
  const A = { ctx: null, sfx: null, mus: null, sfxOn: true, musicOn: true };
  function ac() {
    try {
      if (!A.ctx) {
        A.ctx = new (window.AudioContext || window.webkitAudioContext)();
        A.sfx = A.ctx.createGain(); A.sfx.gain.value = 0.55; A.sfx.connect(A.ctx.destination);
        A.mus = A.ctx.createGain(); A.mus.gain.value = 0; A.mus.connect(A.ctx.destination);
      }
      if (A.ctx.state === 'suspended') A.ctx.resume();
    } catch (e) { return null; }
    return A.ctx;
  }
  // Browsers only allow sound after a tap or key press.
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => { ac(); }, { passive: true }));

  function tone(freq, dur, o = {}) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + (o.at || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    if (o.vib) { const l = c.createOscillator(); const lg = c.createGain(); l.frequency.value = o.vib; lg.gain.value = freq * 0.03; l.connect(lg).connect(osc.frequency); l.start(t); l.stop(t + dur); }
    const v = o.vol == null ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(o.dest || A.sfx);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  let noiseBuf = null;
  function noise(dur, o = {}) {
    const c = ac(); if (!c) return;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = c.currentTime + (o.at || 0);
    const src = c.createBufferSource(); src.buffer = noiseBuf;
    const f = c.createBiquadFilter(); f.type = o.filter || 'highpass'; f.frequency.setValueAtTime(o.freq || 6000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(o.vol == null ? 0.15 : o.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(o.dest || A.sfx);
    src.start(t); src.stop(t + dur + 0.02);
  }
  const midi = (n) => 440 * 2 ** ((n - 69) / 12);

  const sfx = {
    tick(last) { tone(last ? 1568 : 1175, 0.06, { type: 'square', vol: 0.07 }); noise(0.03, { freq: 7000, vol: 0.06 }); },
    whoosh() { noise(0.45, { filter: 'bandpass', freq: 400, to: 4000, vol: 0.2 }); },
    pop() { tone(900, 0.12, { type: 'sine', to: 300, vol: 0.18 }); },
    blip() { tone(1046, 0.07, { type: 'sine', vol: 0.12 }); },
    drumroll(sec = 1.2) {
      const n = Math.floor(sec / 0.045);
      for (let i = 0; i < n; i++) noise(0.05, { at: i * 0.045, filter: 'bandpass', freq: 1800, vol: 0.05 + (0.12 * i) / n });
      noise(0.5, { at: sec, filter: 'highpass', freq: 5000, vol: 0.22 }); // cymbal
      tone(70, 0.3, { at: sec, type: 'sine', vol: 0.35, to: 40 }); // kick
    },
    ding(at = 0) { tone(1318.5, 0.9, { at, type: 'sine', vol: 0.22 }); tone(2637, 0.5, { at, type: 'sine', vol: 0.06 }); tone(1975.5, 0.7, { at: at + 0.09, type: 'sine', vol: 0.12 }); },
    wah(at = 0) { [392, 370, 349, 330].forEach((f, i) => tone(f, i === 3 ? 0.9 : 0.32, { at: at + i * 0.33, type: 'sawtooth', vol: 0.07, vib: i === 3 ? 6 : 0 })); },
    buzzer() { tone(110, 0.45, { type: 'square', vol: 0.12 }); tone(116, 0.45, { type: 'square', vol: 0.1 }); },
    cheer(at = 0) { [60, 64, 67, 72, 76].forEach((n, i) => tone(midi(n + 12), 0.25, { at: at + i * 0.06, type: 'square', vol: 0.06 })); noise(0.8, { at: at + 0.1, filter: 'bandpass', freq: 2500, vol: 0.12 }); },
    fanfare(at = 0) { [[67, 0, 0.16], [67, 0.16, 0.16], [67, 0.32, 0.16], [72, 0.48, 0.7], [76, 0.48, 0.7], [79, 0.48, 0.7]].forEach(([n, t, d]) => tone(midi(n), d, { at: at + t, type: 'square', vol: 0.07 })); },
    sting() { tone(midi(72), 0.5, { type: 'sawtooth', vol: 0.06 }); tone(midi(75), 0.5, { type: 'sawtooth', vol: 0.05 }); tone(midi(79), 0.5, { type: 'sawtooth', vol: 0.05 }); tone(midi(48), 0.6, { type: 'sine', vol: 0.3, to: midi(36) }); },
    swoosh() { noise(0.25, { filter: 'bandpass', freq: 3000, to: 600, vol: 0.12 }); },
    count(at = 0) { tone(midi(84), 0.05, { at, type: 'square', vol: 0.04 }); },
  };
  // Every effect respects the sound switch.
  Object.keys(sfx).forEach((k) => { const f = sfx[k]; sfx[k] = (...a) => { if (A.sfxOn) f(...a); }; });

  // ---------------------------------------------------------------- music
  // A tiny step sequencer. Each theme is a tempo, a chord loop and a feel.
  const THEMES = {
    lobby: { bpm: 108, key: 60, prog: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], bass: [0, 7, 10], hat: 2, arp: 0.35, wave: 'triangle' },
    pubquiz: { bpm: 118, key: 57, prog: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], bass: [0, 6, 8, 14], hat: 2, arp: 0.25, wave: 'triangle' },
    chase: { bpm: 150, key: 52, prog: [[0, 3, 7], [0, 3, 7], [1, 5, 8], [-1, 2, 7]], bass: [0, 2, 4, 6, 8, 10, 12, 14], hat: 1, arp: 0.2, wave: 'sawtooth' },
    stopthebus: { bpm: 138, key: 62, prog: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [5, 9, 12]], bass: [0, 4, 8, 12], hat: 2, arp: 0.4, wave: 'square' },
    imposter: { bpm: 78, key: 50, prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 2, 5]], bass: [0, 10], hat: 4, arp: 0.18, wave: 'sine' },
    storytime: { bpm: 92, key: 65, prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], bass: [0, 8], hat: 4, arp: 0.3, wave: 'triangle' },
    headtohead: { bpm: 124, key: 55, prog: [[0, 4, 7], [10, 14, 17], [5, 9, 12], [7, 11, 14]], bass: [0, 3, 8, 11], hat: 2, arp: 0.3, wave: 'square' },
    doodle: { bpm: 104, key: 64, prog: [[0, 4, 7], [5, 9, 12], [9, 12, 16], [7, 11, 14]], bass: [0, 6, 10], hat: 2, arp: 0.45, wave: 'triangle' },
    awards: { bpm: 96, key: 60, prog: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], bass: [0, 8], hat: 4, arp: 0.5, wave: 'triangle' },
  };
  const M = { theme: null, next: null, step: 0, at: 0, timer: null, seed: 1 };
  const rnd = () => { M.seed = (M.seed * 16807) % 2147483647; return M.seed / 2147483647; };
  function schedule() {
    const c = A.ctx;
    if (!c || !M.theme) return;
    while (M.at < c.currentTime + 0.25) {
      if (M.step % 64 === 0 && M.next) { M.theme = M.next; M.next = null; }
      const th = THEMES[M.theme];
      const s16 = 60 / th.bpm / 4;
      const bar = Math.floor(M.step / 16) % th.prog.length;
      const st = M.step % 16;
      const chord = th.prog[bar];
      const at = M.at - c.currentTime;
      if (at >= 0) {
        if (th.bass.includes(st)) tone(midi(th.key - 12 + chord[0]), s16 * 1.8, { at, type: 'triangle', vol: 0.16, dest: A.mus });
        if (st === 0 || st === 8) tone(65, 0.18, { at, type: 'sine', to: 38, vol: 0.32, dest: A.mus });
        if (st % (th.hat * 2) === th.hat) noise(0.04, { at, freq: 8000, vol: 0.05, dest: A.mus });
        if (st === 0) chord.forEach((n) => tone(midi(th.key + n), s16 * 15, { at, type: 'sine', vol: 0.025, attack: 0.3, dest: A.mus }));
        if (st % 2 === 0 && rnd() < th.arp) tone(midi(th.key + 12 + chord[Math.floor(rnd() * 3)]), s16 * 1.5, { at, type: th.wave, vol: 0.035, dest: A.mus });
      }
      M.at += s16;
      M.step += 1;
    }
  }
  function music(theme) {
    if (!THEMES[theme]) theme = 'lobby';
    if (M.theme === theme || M.next === theme) return;
    if (!M.theme) { M.theme = theme; M.step = 0; M.seed = 7; }
    else M.next = theme;
    if (!M.timer) M.timer = setInterval(() => { if (A.ctx && A.musicOn && A.ctx.state === 'running') { if (M.at < A.ctx.currentTime) M.at = A.ctx.currentTime + 0.05; schedule(); } }, 60);
    setMusicVol();
  }
  function setMusicVol(duck) {
    if (!A.ctx) return;
    const v = A.musicOn && A.sfxOn ? (duck ? 0.18 : 0.42) : 0;
    A.mus.gain.setTargetAtTime(v, A.ctx.currentTime, 0.4);
  }
  const audio = {
    get sfxOn() { return A.sfxOn; },
    set sfxOn(v) { A.sfxOn = v; setMusicVol(); },
    get musicOn() { return A.musicOn; },
    set musicOn(v) { A.musicOn = v; setMusicVol(); },
    duck(on) { setMusicVol(on); },
  };

  // ---------------------------------------------------------------- juice
  function layer(id) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.id = id; document.body.appendChild(el); }
    return el;
  }
  const CONF = ['#ff5d73', '#ffd23f', '#3ddc97', '#4cc9f0', '#b388ff', '#fff8ec'];
  function confetti(n = 80, opts = {}) {
    if (reduced) return;
    const box = layer('fx-confetti');
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      const fromX = opts.x == null ? Math.random() * 100 : opts.x + (Math.random() - 0.5) * 10;
      p.style.left = `${fromX}vw`;
      p.style.top = opts.y == null ? '-4vh' : `${opts.y}vh`;
      p.style.background = CONF[i % CONF.length];
      p.style.setProperty('--dx', `${(Math.random() - 0.5) * 40}vw`);
      p.style.setProperty('--dy', `${70 + Math.random() * 50}vh`);
      p.style.setProperty('--r', `${(Math.random() - 0.5) * 1440}deg`);
      p.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
      p.style.animationDelay = `${Math.random() * (opts.spread || 0.4)}s`;
      if (Math.random() < 0.3) p.style.borderRadius = '50%';
      box.appendChild(p);
      setTimeout(() => p.remove(), 4000);
    }
  }
  function flash(colour) {
    const el = layer('fx-flash');
    el.style.background = colour;
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  }
  const buzz = (pattern) => { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* not supported */ } };
  function shake(el) { if (!el || reduced) return; el.classList.remove('shake-x'); void el.offsetWidth; el.classList.add('shake-x'); }

  // One call for "that went well/badly" on a phone.
  function feedback(kind, el) {
    if (kind === 'good') { buzz([25, 40, 25]); flash('rgba(61,220,151,.45)'); confetti(30, { spread: 0.2 }); sfx.ding(); }
    else if (kind === 'big') { buzz([40, 60, 40, 60, 120]); flash('rgba(255,210,63,.5)'); confetti(110, { spread: 0.8 }); sfx.fanfare(); }
    else if (kind === 'bad') { buzz(260); flash('rgba(255,93,115,.45)'); shake(el); sfx.buzzer(); }
  }

  // Scene wipe on the TV between screens.
  function wipe() {
    if (reduced) return;
    const el = layer('fx-wipe');
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  }

  // ---------------------------------------------------------------- leaderboards
  // Remember where everyone was last time a board was drawn, then slide rows from there and count scores up.
  const lastBoard = new Map();
  function animateBoards(root) {
    root.querySelectorAll('.board').forEach((board) => {
      const gid = board.dataset.gid || '';
      const rows = [...board.querySelectorAll('.rowp[data-pid]')];
      if (!rows.length) return;
      const step = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : rows[0].offsetHeight + 10;
      rows.forEach((row, rank) => {
        const pid = row.dataset.pid;
        const score = Number(row.dataset.score) || 0;
        const prev = lastBoard.get(pid);
        const fresh = !prev || prev.gid !== gid;
        const from = fresh ? { rank: rows.length, score: 0 } : prev;
        if (prev && prev.gid === gid && prev.score === score && prev.rank === rank) return;
        lastBoard.set(pid, { gid, score, rank });
        if (reduced) return;
        const sc = row.querySelector('.sc');
        if (sc && from.score !== score) {
          const t0 = performance.now();
          const dur = 1100 + rank * 120;
          sc.textContent = from.score;
          const tick = (t) => {
            const k = Math.min(1, (t - t0) / dur);
            const e = 1 - (1 - k) ** 3;
            sc.textContent = Math.round(from.score + (score - from.score) * e);
            if (k < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          if (!fresh && score > from.score) {
            const plus = document.createElement('span');
            plus.className = 'gain';
            plus.textContent = `+${score - from.score}`;
            row.appendChild(plus);
          }
        }
        if (!fresh && from.rank !== rank) {
          row.style.transition = 'none';
          row.style.transform = `translateY(${(from.rank - rank) * step}px)`;
          row.style.zIndex = from.rank > rank ? 2 : 1;
          if (from.rank > rank) row.classList.add('climb');
          requestAnimationFrame(() => requestAnimationFrame(() => {
            row.style.transition = 'transform .9s cubic-bezier(.3,.1,.2,1) .35s';
            row.style.transform = '';
          }));
        }
      });
    });
  }

  // ---------------------------------------------------------------- crowd
  // items: { id, name, colour, look, state: typing|done|right|wrong|asleep|idle, note }
  const MOOD = { typing: 'idle', done: 'happy', right: 'happy', wrong: 'sad', asleep: 'sad', idle: 'idle', ready: 'happy' };
  function crowd(items, cls = '') {
    return `<div class="crowd ${cls}">${items.map((p, i) => `
      <div class="cm st-${p.state}" data-a="cm-${CW.esc(p.id || p.name)}-${p.state}" style="--i:${i}">
        ${p.state === 'typing' ? '<span class="bubble-dots"><i></i><i></i><i></i></span>' : ''}
        ${p.state === 'done' || p.state === 'ready' ? '<span class="tick">✓</span>' : ''}
        ${p.state === 'asleep' ? '<span class="zzz">z<b>z</b><i>z</i></span>' : ''}
        ${p.note ? `<span class="note">${CW.esc(p.note)}</span>` : ''}
        <span class="pic">${CW.avatar(p, MOOD[p.state] || 'idle')}</span>
        <span class="nm">${CW.esc(p.name)}</span>
      </div>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------- backgrounds
  const r = (a, b) => a + Math.random() * (b - a);
  const SCENES = {
    party: () => Array.from({ length: 6 }, (_, i) => `<b class="blob" style="--c:${['#7b2ff7', '#ff5d73', '#3ddc97', '#4cc9f0', '#ffd23f', '#b388ff'][i]};left:${r(-10, 80)}%;top:${r(-10, 70)}%;--s:${r(30, 50)}vmax;animation-duration:${r(18, 32)}s;animation-delay:-${r(0, 20)}s"></b>`).join(''),
    pub: () => `<div class="warm"></div>${Array.from({ length: 18 }, () => `<b class="bokeh" style="left:${r(0, 100)}%;--s:${r(2, 9)}vmax;--c:${['#ffb347', '#ffd23f', '#ff8a5c', '#ffe7a3', '#4cc9f0'][Math.floor(r(0, 5))]};animation-duration:${r(16, 34)}s;animation-delay:-${r(0, 30)}s;opacity:${r(0.15, 0.4).toFixed(2)}"></b>`).join('')}`,
    road: () => `<div class="sky"></div>${Array.from({ length: 4 }, (_, i) => `<b class="cloud" style="top:${6 + i * 9}%;animation-duration:${r(50, 90)}s;animation-delay:-${r(0, 80)}s;--s:${r(0.7, 1.4).toFixed(2)}"></b>`).join('')}<div class="road"><i class="dashes"></i></div><span class="bus">🚌</span><span class="bus b2">🚕</span>`,
    spot: () => `<div class="dark"></div><b class="beam l"></b><b class="beam r"></b>${Array.from({ length: 5 }, () => `<b class="fog" style="left:${r(-20, 80)}%;animation-duration:${r(25, 45)}s;animation-delay:-${r(0, 40)}s"></b>`).join('')}`,
    night: () => `<div class="moon"></div>${Array.from({ length: 70 }, () => `<b class="star" style="left:${r(0, 100)}%;top:${r(0, 85)}%;--s:${r(1, 3.2).toFixed(1)}px;animation-duration:${r(2, 6).toFixed(1)}s;animation-delay:-${r(0, 6).toFixed(1)}s"></b>`).join('')}<b class="shooting"></b>`,
    arena: () => '<b class="lamp pink"></b><b class="lamp blue"></b><div class="split"></div>',
    paper: () => `<div class="grid"></div>${Array.from({ length: 10 }, (_, i) => `<b class="doodle" style="left:${r(0, 92)}%;top:${r(0, 88)}%;animation-duration:${r(10, 20)}s;animation-delay:-${r(0, 20)}s;--rot:${r(-30, 30)}deg">${['✏️', '⭐', '🖍️', '☁️', '❤️', '🌀', '✨', '🎨', '💥', '🙂'][i]}</b>`).join('')}`,
    stage: () => `<div class="curtain l"></div><div class="curtain r"></div>${Array.from({ length: 40 }, () => `<b class="sparkle" style="left:${r(0, 100)}%;top:${r(0, 100)}%;animation-duration:${r(1.5, 4).toFixed(1)}s;animation-delay:-${r(0, 4).toFixed(1)}s"></b>`).join('')}`,
  };
  let currentScene = null;
  function scene(name) {
    if (!SCENES[name]) name = 'party';
    if (name === currentScene) return;
    currentScene = name;
    const box = layer('fx-scene');
    const next = document.createElement('div');
    next.className = `scene scene-${name}`;
    next.innerHTML = SCENES[name]();
    box.appendChild(next);
    requestAnimationFrame(() => next.classList.add('on'));
    [...box.children].slice(0, -1).forEach((old) => { old.classList.remove('on'); setTimeout(() => old.remove(), 1200); });
  }

  Object.assign(CW, { sfx, music, audio, confetti, flash, buzz, shake, feedback, wipe, animateBoards, crowd, scene, reducedMotion: reduced });
}());
