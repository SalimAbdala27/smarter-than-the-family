/* Colour Lab: a solo colour-mixing game for kids. Runs entirely in the browser (no room needed).
   Paint mixes like real paint: red + yellow = orange, yellow + blue = green, and so on. */
(function () {
  const { esc, avatar, beep, jingle } = window.CW;
  const app = document.getElementById('app');

  // ---------- paint mixing ----------
  // RYB → RGB via the corners of the RYB colour cube (Gossett & Chen), then tint/shade with white/black.
  const CUBE = [
    [1, 1, 1], [1, 0, 0], [1, 1, 0], [1, 0.5, 0], // white, red, yellow, red+yellow
    [0.163, 0.373, 0.6], [0.5, 0, 0.5], [0, 0.66, 0.2], [0.45, 0.27, 0.12], // blue, red+blue, yellow+blue, all three (brown)
  ];
  function ryb(r, y, b) {
    const out = [0, 0, 0];
    for (let i = 0; i < 8; i++) {
      const w = (i & 1 ? r : 1 - r) * (i & 2 ? y : 1 - y) * (i & 4 ? b : 1 - b);
      for (let c = 0; c < 3; c++) out[c] += w * CUBE[i][c];
    }
    return out;
  }
  function mix(p) {
    const total = p.r + p.y + p.b + p.w + p.k;
    if (!total) return null;
    const n = Math.max(p.r, p.y, p.b);
    const base = n ? ryb(p.r / n, p.y / n, p.b / n) : [0, 0, 0];
    const chroma = (p.r + p.y + p.b) / total;
    const wf = p.w / total;
    return base.map((v) => Math.min(1, v * chroma + wf));
  }
  const hex = (rgb) => (rgb ? `#${rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}` : 'transparent');
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / Math.sqrt(3);

  const POTS = [
    { id: 'r', name: 'Red', rgb: [1, 0, 0] },
    { id: 'y', name: 'Yellow', rgb: [1, 1, 0] },
    { id: 'b', name: 'Blue', rgb: [0.163, 0.373, 0.6] },
    { id: 'w', name: 'White', rgb: [1, 1, 1] },
    { id: 'k', name: 'Black', rgb: [0, 0, 0] },
  ];
  const potById = Object.fromEntries(POTS.map((p) => [p.id, p]));
  const MAX_DROPS = 12;

  // Challenges. Each is a recipe, so the target is always exactly makeable with the same mixer.
  const LEVELS = [
    { name: 'Orange', recipe: { r: 1, y: 1 } },
    { name: 'Green', recipe: { y: 1, b: 1 } },
    { name: 'Purple', recipe: { r: 1, b: 1 } },
    { name: 'Pink', recipe: { r: 1, w: 1 } },
    { name: 'Sky Blue', recipe: { b: 1, w: 1 } },
    { name: 'Grey', recipe: { w: 1, k: 1 } },
    { name: 'Brown', recipe: { r: 1, y: 1, b: 1 } },
    { name: 'Lemon', recipe: { y: 1, w: 1 } },
    { name: 'Lime', recipe: { y: 2, b: 1 } },
    { name: 'Lilac', recipe: { r: 1, b: 1, w: 2 } },
    { name: 'Peach', recipe: { r: 1, y: 1, w: 2 } },
    { name: 'Teal', recipe: { y: 1, b: 2 } },
    { name: 'Navy', recipe: { b: 2, k: 1 } },
    { name: 'Golden Yellow', recipe: { r: 1, y: 3 } },
    { name: 'Mint', recipe: { y: 1, b: 1, w: 2 } },
    { name: 'Berry', recipe: { r: 2, b: 1, k: 1 } },
  ].map((l) => ({ ...l, rgb: mix({ r: 0, y: 0, b: 0, w: 0, k: 0, ...l.recipe }) }));

  // For free mixing: name whatever they make.
  const NAMES = [
    ['Tomato Red', '#ff2a1a'], ['Cherry Red', '#c8102e'], ['Pumpkin Orange', '#ff7f00'], ['Sunshine Yellow', '#ffe600'],
    ['Banana Yellow', '#fff27a'], ['Lime Green', '#8cc63f'], ['Grass Green', '#2e9a3a'], ['Frog Green', '#4a7a2a'],
    ['Mint Green', '#9fe0b5'], ['Sea Green', '#1d8a6e'], ['Teal', '#1a6e74'], ['Sky Blue', '#8fbbe0'],
    ['Ocean Blue', '#29609a'], ['Navy Blue', '#152a4a'], ['Grape Purple', '#7a2a7a'], ['Plum', '#5a1f4a'],
    ['Lilac', '#c9a6d6'], ['Bubblegum Pink', '#ff9ec4'], ['Rose Pink', '#f07a8a'], ['Peach', '#ffc29a'],
    ['Coral', '#ff7f6a'], ['Chocolate Brown', '#4a2a10'], ['Mud Brown', '#6e4a2a'], ['Toffee', '#a0662a'],
    ['Sandy Beige', '#e0c9a0'], ['Mustard', '#d0a020'], ['Olive', '#707a2a'], ['Storm Grey', '#7a7a7a'],
    ['Cloud Grey', '#c8c8c8'], ['Snow White', '#ffffff'], ['Coal Black', '#141414'], ['Maroon', '#7a1020'],
  ].map(([n, h]) => [n, [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)]);
  const nameFor = (rgb) => NAMES.reduce((best, [n, c]) => (dist(rgb, c) < best[1] ? [n, dist(rgb, c)] : best), ['', 9])[0];

  // ---------- state ----------
  let stars = {};
  try { stars = JSON.parse(localStorage.getItem('colourLabStars') || '{}'); } catch (e) { stars = {}; }
  const saveStars = () => { try { localStorage.setItem('colourLabStars', JSON.stringify(stars)); } catch (e) { /* private mode */ } };
  const unlocked = (i) => i === 0 || (stars[i - 1] || 0) > 0;
  const MASCOT = { id: 'colour-lab-mascot', name: 'Splodge', colour: '#ff8fab' };

  let screen = 'home';
  let level = 0;
  let bowl = { r: 0, y: 0, b: 0, w: 0, k: 0 };
  let hint = false;
  const drops = () => Object.values(bowl).reduce((a, b) => a + b, 0);

  // ---------- sound & voice ----------
  function say(text) {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = speechSynthesis.getVoices().find((x) => x.lang === 'en-GB') || null;
    if (v) u.voice = v;
    u.lang = 'en-GB'; u.rate = 0.95; u.pitch = 1.15;
    speechSynthesis.speak(u);
  }
  const bloop = () => { beep(520, 0.08, 'sine', 0.2); setTimeout(() => beep(780, 0.1, 'sine', 0.15), 60); };

  // ---------- pieces ----------
  const potSvg = (p) => `<svg viewBox="0 0 80 96" class="pot-svg">
      <rect x="10" y="22" width="60" height="66" rx="14" fill="#fff8ec" stroke="#14112b" stroke-width="4"/>
      <path d="M12 46 Q40 36 68 46 L68 74 Q68 86 56 86 L24 86 Q12 86 12 74 Z" fill="${hex(p.rgb)}" stroke="#14112b" stroke-width="3"/>
      <rect x="6" y="10" width="68" height="16" rx="6" fill="${hex(p.rgb)}" stroke="#14112b" stroke-width="4"/>
      <ellipse cx="28" cy="58" rx="6" ry="9" fill="#fff" opacity=".35"/>
    </svg>`;

  const starRow = (n, size = '') => `<span class="stars ${size}">${[1, 2, 3].map((i) => `<span class="${i <= n ? 'on' : ''}">★</span>`).join('')}</span>`;
  const totalStars = () => Object.values(stars).reduce((a, b) => a + b, 0);

  // ---------- screens ----------
  function render() {
    if (screen === 'home') return home();
    if (screen === 'levels') return levels();
    return play();
  }

  function home() {
    app.innerHTML = `
      <div class="kid-top"><a class="kid-back" href="/">← Games</a><span class="grow"></span><span class="kid-total">★ ${totalStars()}</span></div>
      <div class="kid-home">
        <div class="kid-logo">Colour <b>Lab</b></div>
        <div class="kid-mascot wobble">${avatar(MASCOT, 'happy')}</div>
        <p class="kid-sub">Mix the paint pots to make new colours!</p>
        <button class="kid-big" data-go="levels">⭐ Colour challenges</button>
        <button class="kid-big alt" data-go="free">🖌️ Free mixing</button>
      </div>`;
    app.querySelector('[data-go=levels]').onclick = () => { screen = 'levels'; beep(660); render(); };
    app.querySelector('[data-go=free]').onclick = () => { screen = 'free'; reset(); say('Mix any colours you like!'); render(); };
  }

  function levels() {
    app.innerHTML = `
      <div class="kid-top"><button class="kid-back" data-back>← Back</button><span class="grow"></span><span class="kid-total">★ ${totalStars()} / ${LEVELS.length * 3}</span></div>
      <h1 class="kid-h">Pick a colour to make</h1>
      <div class="level-grid">${LEVELS.map((l, i) => `
        <button class="level-tile ${unlocked(i) ? '' : 'locked'}" data-l="${i}" ${unlocked(i) ? '' : 'disabled'}>
          <span class="blob" style="background:${unlocked(i) ? hex(l.rgb) : '#3a3270'}">${unlocked(i) ? '' : '🔒'}</span>
          <span class="nm">${unlocked(i) ? esc(l.name) : '???'}</span>
          ${starRow(stars[i] || 0, 'small')}
        </button>`).join('')}</div>`;
    app.querySelector('[data-back]').onclick = () => { screen = 'home'; render(); };
    app.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => startLevel(Number(b.dataset.l))));
  }

  function reset() { bowl = { r: 0, y: 0, b: 0, w: 0, k: 0 }; hint = false; }

  function startLevel(i) {
    level = i; screen = 'play'; reset();
    render();
    say(`Can you make ${LEVELS[i].name}?`);
  }

  function play() {
    const challenge = screen === 'play';
    const L = LEVELS[level];
    const rgb = mix(bowl);
    const recipe = challenge ? Object.entries(L.recipe).map(([id, n]) => `<span class="hint-pot" style="background:${hex(potById[id].rgb)}"></span>×${n}`).join(' <b>+</b> ') : '';
    app.innerHTML = `
      <div class="kid-top"><button class="kid-back" data-back>← Back</button><span class="grow"></span>
        ${challenge ? `<span class="kid-total">Level ${level + 1}</span>` : '<span class="kid-total">Free mixing</span>'}</div>
      <div class="lab">
        ${challenge ? `
          <div class="target">
            <div class="target-blob" style="background:${hex(L.rgb)}"></div>
            <div><div class="kid-sub" style="margin:0">Make this colour!</div>
            <div class="target-name">${esc(L.name)} <button class="say" data-say="${esc(L.name)}">🔊</button></div>
            ${hint ? `<div class="hint-line">${recipe}</div>` : ''}</div>
          </div>` : `
          <div class="target"><div><div class="kid-sub" style="margin:0">You made…</div>
            <div class="target-name">${rgb ? esc(nameFor(rgb)) : 'Nothing yet!'} ${rgb ? `<button class="say" data-say="${esc(nameFor(rgb))}">🔊</button>` : ''}</div></div></div>`}
        <div class="bowl-wrap">
          <div class="bowl"><div class="paint ${rgb ? 'full' : ''}" style="background:${hex(rgb)}"></div></div>
          <div class="drop-count">${[...Array(MAX_DROPS)].map((_, i) => `<i class="${i < drops() ? 'on' : ''}"></i>`).join('')}</div>
        </div>
        <div class="pots">${POTS.map((p) => `<button class="pot" data-pot="${p.id}" aria-label="${p.name}">${potSvg(p)}<span>${p.name}</span></button>`).join('')}</div>
        <div class="lab-actions">
          <button class="kid-btn ghost" data-empty>🔄 Empty</button>
          ${challenge ? `<button class="kid-btn ghost" data-hint ${hint ? 'disabled' : ''}>💡 Hint</button><button class="kid-btn go" data-done ${drops() ? '' : 'disabled'}>✅ Done!</button>` : ''}
        </div>
      </div>
      <div id="overlay"></div>`;
    app.querySelector('[data-back]').onclick = () => { if (window.speechSynthesis) speechSynthesis.cancel(); screen = challenge ? 'levels' : 'home'; render(); };
    app.querySelectorAll('[data-say]').forEach((b) => b.addEventListener('click', () => say(b.dataset.say)));
    app.querySelectorAll('[data-pot]').forEach((b) => b.addEventListener('click', () => addDrop(b)));
    app.querySelector('[data-empty]').onclick = () => { reset(); beep(300, 0.15, 'sine'); render(); };
    const h = app.querySelector('[data-hint]');
    if (h) h.onclick = () => { hint = true; say(`Try ${Object.entries(L.recipe).map(([id, n]) => `${n} ${potById[id].name}`).join(' and ')}`); render(); };
    const d = app.querySelector('[data-done]');
    if (d) d.onclick = finish;
  }

  function addDrop(btn) {
    if (drops() >= MAX_DROPS) { beep(200, 0.2, 'square', 0.08); return; }
    const id = btn.dataset.pot;
    // Little paint drop falling from the pot into the bowl.
    const from = btn.getBoundingClientRect();
    const to = app.querySelector('.bowl').getBoundingClientRect();
    const dot = document.createElement('div');
    dot.className = 'falling';
    dot.style.background = hex(potById[id].rgb);
    dot.style.left = `${from.left + from.width / 2 - 14}px`;
    dot.style.top = `${from.top}px`;
    dot.style.setProperty('--dx', `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
    dot.style.setProperty('--dy', `${to.top + to.height * 0.45 - from.top}px`);
    document.body.appendChild(dot);
    btn.classList.remove('tip'); void btn.offsetWidth; btn.classList.add('tip');
    setTimeout(() => {
      dot.remove();
      bowl[id] += 1;
      bloop();
      render();
      const paint = app.querySelector('.paint');
      if (paint) { paint.classList.remove('swirl'); void paint.offsetWidth; paint.classList.add('swirl'); }
      if (screen === 'free') say(nameFor(mix(bowl)));
    }, 420);
  }

  function finish() {
    const L = LEVELS[level];
    const d = dist(mix(bowl), L.rgb);
    const got = d <= 0.05 ? 3 : d <= 0.12 ? 2 : d <= 0.18 ? 1 : 0;
    const ov = app.querySelector('#overlay');
    if (got) {
      stars[level] = Math.max(stars[level] || 0, got);
      saveStars();
      jingle(got === 3 ? [523, 659, 784, 1047, 1319] : [523, 659, 784]);
      say(got === 3 ? `Perfect! You made ${L.name}!` : `Well done! That's nearly ${L.name}!`);
      confetti();
    } else {
      beep(330, 0.25, 'sine'); setTimeout(() => beep(262, 0.3, 'sine'), 200);
      say('Ooh, not quite. Try again!');
    }
    const next = level + 1 < LEVELS.length;
    ov.innerHTML = `<div class="result pop">
        <div class="kid-mascot">${avatar(MASCOT, got ? 'happy' : 'scared')}</div>
        <h2>${got === 3 ? 'Perfect!' : got ? 'Well done!' : 'Not quite!'}</h2>
        ${starRow(got, 'big')}
        <div class="compare"><div><span style="background:${hex(mix(bowl))}"></span>Yours</div><div><span style="background:${hex(L.rgb)}"></span>${esc(L.name)}</div></div>
        <div class="lab-actions">
          <button class="kid-btn ghost" data-retry>🔄 Try again</button>
          ${got && next ? '<button class="kid-btn go" data-next>Next colour →</button>' : ''}
          ${got && !next ? '<button class="kid-btn go" data-all>🏆 All done!</button>' : ''}
        </div>
      </div>`;
    ov.querySelector('[data-retry]').onclick = () => startLevel(level);
    const n = ov.querySelector('[data-next]');
    if (n) n.onclick = () => startLevel(level + 1);
    const a = ov.querySelector('[data-all]');
    if (a) a.onclick = () => { screen = 'levels'; render(); };
  }

  function confetti() {
    const cols = ['#ff5d73', '#ffd23f', '#3ddc97', '#4cc9f0', '#b388ff'];
    for (let i = 0; i < 50; i++) {
      const c = document.createElement('i');
      c.className = 'kid-confetti';
      c.style.left = `${Math.random() * 100}vw`;
      c.style.background = cols[i % cols.length];
      c.style.animationDelay = `${Math.random() * 0.4}s`;
      c.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 2600);
    }
  }

  render();
}());
