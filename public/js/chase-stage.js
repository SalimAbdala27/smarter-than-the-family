/* The Final Chase street scene on the TV. The DOM is kept between state updates so characters
   actually run between squares instead of teleporting. */
(function () {
  const { esc, avatar, family } = window.CW;

  const TAUNTS = {
    intro: ["Right, you lot. Tea's on the table in ten minutes.", "Nobody's leaving until the washing up's done!", "Your Nan's been revising. Run."],
    right: ['Nan knew that one!', 'Even Uncle Dave got that.', 'Easy. Pass the gravy.', "Your dad and I are very disappointed.", 'Back in my day we knew that.', "That's on the Christmas quiz every year!"],
    wrong: ["Hmm. I'll blame the telly.", 'Who moved my reading glasses?', 'That one was rigged!', "We'll have a word about that later.", 'Nan says that was a trick question.'],
    caught: ["GOTCHA! You're grounded!", 'Caught you! Now hoover the stairs.', 'In you come. Wash your hands.', "Got you! You're doing the big shop."],
    home: ['Fine. Text us when you get in.', 'Go on then. Take a coat.', 'Hmph. Lucky guess.'],
    allCaught: ["Right, everyone's in. Tea's ready!", 'Nobody outruns this family.'],
  };
  const pick = (list, n) => list[Math.abs(n) % list.length];

  // A row of terraced houses for the skyline, with a few lights on.
  function terraces() {
    let s = '';
    let x = 0;
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    while (x < 2000) {
      const w = 70 + Math.floor(rnd() * 30);
      const h = 120 + Math.floor(rnd() * 50);
      const y = 200 - h;
      s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#241a45"/>`;
      s += `<path d="M${x - 4} ${y} L${x + w / 2} ${y - 34} L${x + w + 4} ${y} Z" fill="#1b1338"/>`;
      s += `<rect x="${x + w * 0.62}" y="${y - 40}" width="12" height="26" fill="#1b1338"/>`;
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          const lit = rnd() < 0.45;
          s += `<rect x="${x + 12 + c * (w / 2 - 6)}" y="${y + 18 + r * 46}" width="${w / 2 - 22}" height="26" rx="3" fill="${lit ? '#ffcf6b' : '#3a2f63'}" ${lit ? 'opacity=".9"' : ''}/>`;
        }
      }
      x += w + 2;
    }
    return `<svg viewBox="0 0 2000 200" preserveAspectRatio="xMidYMax slice">${s}</svg>`;
  }

  // HOME: a front door with a light on.
  const house = () => `<svg viewBox="0 0 160 300" preserveAspectRatio="xMidYMax meet">
    <path d="M0 70 L80 10 L160 70 Z" fill="#7a2e2e" stroke="#14112b" stroke-width="5"/>
    <rect x="8" y="68" width="152" height="232" fill="#b5523b" stroke="#14112b" stroke-width="5"/>
    <g stroke="#8c3a2a" stroke-width="2">${[95, 125, 155, 185, 215, 245, 275].map((y) => `<line x1="8" y1="${y}" x2="160" y2="${y}"/>`).join('')}</g>
    <rect x="28" y="88" width="104" height="44" rx="4" fill="#ffd96b" stroke="#14112b" stroke-width="5"/>
    <line x1="80" y1="88" x2="80" y2="132" stroke="#14112b" stroke-width="4"/>
    <rect x="44" y="160" width="72" height="140" rx="6" fill="#2c6e4f" stroke="#14112b" stroke-width="5"/>
    <circle cx="104" cy="232" r="5" fill="#ffd23f"/>
    <rect x="62" y="178" width="36" height="16" rx="3" fill="#ffd23f" stroke="#14112b" stroke-width="3"/>
    <text x="80" y="191" font-size="12" font-family="Arial Black, sans-serif" text-anchor="middle" fill="#14112b">HOME</text>
    <circle cx="80" cy="150" r="7" fill="#fff3c4"/>
  </svg>`;

  class Stage {
    constructor() { this.el = null; this.key = null; this.state = null; this.timers = []; this.done = new Set(); }

    xFor(i, L) { return 8 + (i * 77) / L; } // step L (HOME) lands at the door

    later(ms, fn) { this.timers.push(setTimeout(fn, ms)); }
    clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }

    attach(holder, key, track) {
      if (!this.el || this.key !== key) this.build(key, track);
      if (this.el.parentNode !== holder) holder.appendChild(this.el);
    }

    build(key, track) {
      this.clearTimers();
      this.key = key;
      this.state = null;
      this.done = new Set();
      const L = track.length;
      const n = track.runners.length;
      const el = document.createElement('div');
      el.className = 'stage';
      const laneTop = 42; const laneH = 58;
      const size = Math.min(30, (laneH / n) * 1.65); // character height as % of stage
      let lanes = '';
      for (let i = 0; i < n; i++) {
        let slabs = '';
        for (let s = 0; s < L; s++) slabs += `<div class="slab" data-s="${s}" style="left:${this.xFor(s, L)}%"></div>`;
        lanes += `<div class="lane2">${slabs}</div>`;
      }
      el.innerHTML = `
        <div class="stars"></div><div class="moon"></div>
        <div class="terraces">${terraces()}</div>
        <div class="road">${lanes}</div>
        <div class="house">${house()}</div>
        <div class="fam-wrap"><div class="famsvg" style="width:100%;height:100%"></div></div>
        ${track.runners.map((r, i) => `
          <div class="runner" data-id="${esc(r.id)}" style="top:${laneTop + ((i + 0.88) / n) * laneH}%;height:${size}%;aspect-ratio:100/114;z-index:${10 + i}">
            <div class="pic"></div><div class="tag">${esc(r.name)}</div>
          </div>`).join('')}`;
      this.el = el;
      this.L = L;
    }

    runnerEl(id) { return this.el.querySelector(`.runner[data-id="${CSS.escape(id)}"]`); }

    setMood(id, r, mood) {
      const el = this.runnerEl(id);
      if (!el || el.dataset.mood === mood) return;
      el.dataset.mood = mood;
      el.querySelector('.pic').innerHTML = avatar(r, mood, 'pic');
    }

    setFamily(mood) {
      const w = this.el.querySelector('.famsvg');
      if (w.dataset.mood === mood) return;
      w.dataset.mood = mood;
      w.innerHTML = family(mood);
    }

    say(text) {
      const wrap = this.el.querySelector('.fam-wrap');
      const old = wrap.querySelector('.bubble');
      if (old) old.remove();
      if (!text) return;
      const b = document.createElement('div');
      b.className = 'bubble';
      b.textContent = text;
      wrap.appendChild(b);
    }

    placeFamily(f, instant) {
      const wrap = this.el.querySelector('.fam-wrap');
      if (instant) wrap.style.transition = 'none';
      wrap.style.left = `${this.xFor(f, this.L) - 15}%`;
      this.el.querySelectorAll('.slab').forEach((s) => s.classList.toggle('gone', Number(s.dataset.s) < f));
      if (instant) { void wrap.offsetWidth; wrap.style.transition = ''; }
    }

    placeRunner(r, instant) {
      const el = this.runnerEl(r.id);
      if (!el) return;
      if (instant) el.style.transition = 'none';
      const home = r.status === 'home';
      el.style.left = `${home ? this.xFor(this.L, this.L) + 1.5 : this.xFor(r.pos, this.L)}%`;
      el.classList.toggle('caught', r.status === 'caught');
      el.classList.toggle('home', home);
      el.querySelector('.tag').textContent = r.status === 'caught' ? `${r.name} 👻` : home ? `${r.name} 🏠` : r.name;
      if (instant) { void el.offsetWidth; el.style.transition = ''; }
    }

    restingMood(r, f) {
      if (r.status === 'caught') return 'ghost';
      if (r.status === 'home' || r.status === 'survived') return 'happy';
      return r.pos - f <= 1 ? 'scared' : 'idle';
    }

    // Snap everything to the given state (first mount, reconnect, question screens).
    snap(track) {
      this.placeFamily(track.family, !this.state);
      track.runners.forEach((r) => { this.placeRunner(r, !this.state); this.setMood(r.id, r, this.restingMood(r, track.family)); });
      this.state = JSON.parse(JSON.stringify(track));
    }

    intro(track) {
      if (this.done.has('intro')) return this.snap(track);
      this.done.add('intro');
      this.snap(track);
      const wrap = this.el.querySelector('.fam-wrap');
      wrap.classList.remove('enter'); void wrap.offsetWidth; wrap.classList.add('enter');
      this.setFamily('stomp');
      track.runners.forEach((r) => this.setMood(r.id, r, 'scared'));
      this.later(2000, () => this.say(pick(TAUNTS.intro, track.runners.length)));
      this.later(4200, () => track.runners.forEach((r) => this.setMood(r.id, r, this.restingMood(r, track.family))));
    }

    question(track) {
      this.clearTimers();
      this.snap(track);
      this.setFamily('stomp');
      this.say('');
    }

    // Play one question's result as a little sequence: runners move, then The Family, then catches.
    reveal(track, log, n) {
      const k = `rev${n}`;
      if (this.done.has(k)) return;
      this.done.add(k);
      const prev = this.state;
      if (!prev) return this.snap(track);
      this.clearTimers();
      const byId = Object.fromEntries(track.runners.map((r) => [r.id, r]));

      this.later(700, () => {
        track.runners.filter((r) => r.moved).forEach((r) => {
          const el = this.runnerEl(r.id);
          this.setMood(r.id, r, 'run');
          this.placeRunner({ ...r, status: r.status === 'home' ? 'home' : 'running' });
          const plus = document.createElement('div');
          plus.className = 'plus';
          plus.textContent = `+${r.moved}`;
          el.appendChild(plus);
          this.later(1500, () => plus.remove());
          this.later(950, () => {
            if (r.status === 'home') { this.setMood(r.id, r, 'happy'); this.confetti(); this.placeRunner(r); }
            else this.setMood(r.id, r, 'idle');
          });
        });
      });

      this.later(1900, () => {
        if (log.familyRight) {
          this.setFamily('stomp');
          this.placeFamily(track.family);
          this.say(pick(TAUNTS.right, n));
        } else {
          this.setFamily('sulk');
          this.say(pick(TAUNTS.wrong, n));
        }
      });

      this.later(3100, () => {
        if (log.caught.length) {
          this.setFamily('gloat');
          this.say(pick(TAUNTS.caught, n));
          this.el.classList.remove('shake'); void this.el.offsetWidth; this.el.classList.add('shake');
          log.caught.forEach((id) => {
            const r = byId[id];
            this.setMood(id, r, 'ghost');
            this.placeRunner(r);
            const st = document.createElement('div');
            st.className = 'stamp';
            st.textContent = 'CAUGHT!';
            this.runnerEl(id).appendChild(st);
          });
        } else if (track.runners.some((r) => r.moved && r.status === 'home')) {
          this.say(pick(TAUNTS.home, n));
        }
        track.runners.filter((r) => r.status === 'running').forEach((r) => this.setMood(r.id, r, this.restingMood(r, track.family)));
        this.state = JSON.parse(JSON.stringify(track));
      });
    }

    finale(track) {
      if (this.done.has('finale')) return;
      this.done.add('finale');
      this.clearTimers();
      this.snap(track);
      const anyHome = track.runners.some((r) => r.status === 'home' || r.status === 'survived');
      this.setFamily(anyHome ? 'sulk' : 'gloat');
      this.say(anyHome ? pick(TAUNTS.home, 1) : pick(TAUNTS.allCaught, track.runners.length));
      if (anyHome) this.confetti();
    }

    confetti() {
      const box = document.createElement('div');
      box.className = 'confetti';
      const cols = ['#ffd23f', '#ff5d73', '#3ddc97', '#4cc9f0', '#b388ff'];
      for (let i = 0; i < 40; i++) {
        const c = document.createElement('i');
        c.style.background = cols[i % cols.length];
        c.style.left = `${40 + Math.random() * 20}%`;
        c.style.top = `${40 + Math.random() * 20}%`;
        c.style.setProperty('--dx', `${(Math.random() - 0.5) * 400}px`);
        c.style.setProperty('--dy', `${-80 - Math.random() * 260}px`);
        c.style.animationDelay = `${Math.random() * 0.3}s`;
        box.appendChild(c);
      }
      this.el.appendChild(box);
      setTimeout(() => box.remove(), 2400);
    }
  }

  window.CW.ChaseStage = Stage;
}());
