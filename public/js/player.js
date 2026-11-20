/* Phone controller. Joins a room, then shows whatever this player needs to do right now. */
(function () {
  const { esc, $, SHAPES, setNow, runTimers, render, scoreboard } = window.CW;
  const socket = io();
  const main = $('#main');
  const top = $('#top');
  let state = null;
  let joined = false;
  let error = '';
  let lastPhase = '';
  let wakeLock = null;
  window.CW.audio.sfxOn = false; // the TV does the sound; phones buzz and flash instead

  const params = new URLSearchParams(location.search);
  const session = () => JSON.parse(localStorage.getItem('cwPlayer') || 'null');
  const send = (type, data) => new Promise((r) => socket.emit('player:action', { type, data }, r));

  // ---------- join / resume ----------
  socket.on('connect', async () => {
    const s = session();
    if (s && (!params.get('code') || params.get('code').toUpperCase() === s.code)) {
      const r = await new Promise((res) => socket.emit('player:resume', s, res));
      if (r.ok) { joined = true; return; }
    }
    if (!joined) drawJoin();
  });
  socket.on('disconnect', () => { top.innerHTML = '<span class="dim">Reconnecting…</span>'; });
  socket.on('kicked', () => { localStorage.removeItem('cwPlayer'); joined = false; state = null; error = 'You were removed from the room.'; drawJoin(); });

  socket.on('state', (s) => {
    state = s;
    setNow(s.now);
    draw();
  });

  async function keepAwake() {
    try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { /* not supported */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && joined) keepAwake(); });

  function drawJoin() {
    top.innerHTML = '';
    const s = session();
    render(main, `
      <div style="text-align:center;margin:5vh 0 4vh"><div class="logo" style="font-size:2.3em;line-height:1.05">ARE YOU<br><b>SMARTER</b><br>THAN…<b>?</b></div>
      <div class="dim" style="margin-top:10px">Party games for your phone</div></div>
      <div class="stack">
        ${error ? `<div class="err">${esc(error)}</div>` : ''}
        <input class="field" data-key="code" id="code" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="ROOM CODE" style="text-align:center;letter-spacing:.3em;font-family:var(--display);text-transform:uppercase" value="${esc(params.get('code') || '')}">
        <input class="field" data-key="name" id="name" maxlength="14" autocomplete="nickname" placeholder="YOUR NAME" style="text-align:center;text-transform:uppercase" value="${esc((s && s.name) || '')}">
        <button class="btn block" id="join">Join</button>
      </div>
      <div class="host-cta">
        <div class="dim">No room code yet?</div>
        <a class="btn ghost block" href="/host">📺 Host a game</a>
        <div class="dim" style="font-size:.8em;margin-top:6px">Open this on the TV or laptop everyone can see. It shows the room code and a QR code for everyone's phones.</div>
        <a class="btn block kids-cta" href="/kids">🎨 Kids' corner: Colour Lab</a>
      </div>`);
    const go = async () => {
      const code = $('#code').value.trim().toUpperCase();
      const name = $('#name').value.trim();
      if (code.length !== 4) { error = 'Room codes are 4 letters'; return drawJoin(); }
      if (!name) { error = 'Pop your name in'; return drawJoin(); }
      $('#join').disabled = true;
      const r = await new Promise((res) => socket.emit('player:join', { code, name }, res));
      if (!r.ok) { error = r.error; $('#join').disabled = false; return drawJoin(); }
      error = '';
      joined = true;
      localStorage.setItem('cwPlayer', JSON.stringify({ code: r.code, token: r.token, name: name.toUpperCase() }));
      history.replaceState(null, '', '/');
      keepAwake();
    };
    $('#join').onclick = go;
    $('#name').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    $('#code').oninput = (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); };
  }

  // ---------- main draw ----------
  function draw() {
    if (!state || !state.me) return;
    const { me } = state;
    const g = state.game;
    top.innerHTML = `<span class="me"><span class="face">${window.CW.avatar(me, 'idle')}</span>${esc(me.name)}${me.isVIP ? ' 👑' : ''}</span>
      <span class="dim" style="font-size:.85em">${state.code}</span><span class="score">${me.score}</span>`;

    window.CW.gid = g ? g.gid : '';
    // Buzz on a new phase so people look down at their phones.
    const phase = g ? `${g.gid}${g.screen}${g.n || (g.chase && g.chase.n) || ''}${g.round || ''}${g.battle ? g.battle.index : ''}${g.ci != null ? `c${g.ci}` : ''}${g.di != null ? `d${g.di}` : ''}${g.turn ? g.turn.id + g.pass : ''}` : 'lobby';
    const newPhase = phase !== lastPhase;
    if (newPhase) { lastPhase = phase; if (!reaction(g)) window.CW.buzz(40); }

    let html;
    if (!g) html = lobby();
    else if (g.screen === 'loading') html = wait('✍️', g.loadingLabel || 'Loading…');
    else html = (VIEWS[g.id] && VIEWS[g.id][g.screen] ? VIEWS[g.id][g.screen](g) : wait('👀', 'Look at the big screen'));
    if (g && me.isVIP && g.screen !== 'loading') html += vipControls(g);
    // While someone is typing, don't rebuild the same form (it would close the phone keyboard).
    const inputKeys = (html.match(/data-key="[^"]*"/g) || []).join('|');
    const formKey = `${phase}#${inputKeys}`;
    const typing = document.activeElement && main.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
    if (typing && inputKeys && formKey === lastFormKey) {
      runTimers(main, g && g.deadline);
      return;
    }
    lastFormKey = formKey;
    render(main, html, phase);
    bind(g);
    runTimers(main, g && g.deadline);
  }
  let lastFormKey = '';

  // Right, wrong, caught, won: buzz, flash and confetti on your own phone. Returns true if it reacted.
  function reaction(g) {
    if (!g) return false;
    const me = state.me.id;
    let kind = null;
    if (g.id === 'pubquiz' && g.screen === 'reveal' && g.myAnswer != null) kind = g.right ? 'good' : 'bad';
    else if (g.id === 'pubquiz' && g.screen === 'chaseReveal' && g.chase && g.chase.me) {
      const m = g.chase.me;
      if (g.chase.log.caught.includes(me)) kind = 'bad';
      else if (m.status === 'home' && m.moved) kind = 'big';
      else if (m.status === 'running') kind = m.moved ? 'good' : 'bad';
    } else if (g.id === 'stopthebus' && g.screen === 'roundScores') kind = g.myPoints > 0 ? 'good' : null;
    else if (g.id === 'imposter' && g.screen === 'roundResult') kind = g.gained && g.gained[me] > 0 ? 'good' : 'bad';
    else if (g.id === 'doodle' && g.screen === 'pickReveal' && g.myResult) kind = g.myResult;
    else if (g.id === 'awards' && g.screen === 'award' && g.award.winners.some((w) => w.id === me)) { setTimeout(() => window.CW.feedback('big', main), 2050); return true; }
    else if ((g.screen === 'over' || g.screen === 'results') && g.scores && g.scores[0] && g.scores[0].id === me && g.scores[0].score > 0) kind = 'big';
    if (!kind) return false;
    setTimeout(() => window.CW.feedback(kind, main), 60);
    return true;
  }

  const wait = (icon, text, sub = '') => `<div class="wait"><div><div class="big wobble">${icon}</div><h2 style="margin-top:12px">${esc(text)}</h2>${sub ? `<p class="dim">${sub}</p>` : ''}</div></div>`;
  const meBig = (mood, text, sub = '') => `<div class="wait"><div><div class="me-big ${mood}">${window.CW.avatar(state.me, mood)}</div><h1 style="margin-top:12px">${esc(text)}</h1>${sub ? `<p class="dim">${sub}</p>` : ''}</div></div>`;
  const timer = () => '<div class="timer" data-timer style="margin-bottom:14px"><i></i></div>';

  // ---------- photos for the quiz ----------
  const ph = { open: false, pending: null, kind: 'baby', err: '', busy: false };
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 720 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        let q = 0.82;
        let d = c.toDataURL('image/jpeg', q);
        while (d.length > 560000 && q > 0.4) { q -= 0.12; d = c.toDataURL('image/jpeg', q); }
        resolve(d);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo')); };
      img.src = url;
    });
  }
  function photoPanel() {
    const mine = state.me.photos || [];
    return `<div class="row"><h1 class="grow" style="margin:0">📸 Your photos</h1><button class="btn small ghost" data-ph="close">Done</button></div>
      <p class="dim" style="margin-top:4px">They pop up in the Pub Quiz. Nobody sees them till then!</p>
      ${mine.length ? `<div class="ph-list">${mine.map((x) => `<div class="ph-item"><img src="${esc(x.url)}" alt=""><div class="grow"><small>${esc(x.q)}</small><b>${x.kind === 'baby' ? 'You!' : esc(x.answer)}</b></div><button class="veto" data-ph-del="${esc(x.id)}">🗑</button></div>`).join('')}</div>` : ''}
      <div class="card stack ph-form">
        <div class="ph-kinds"><button class="toggle ${ph.kind === 'baby' ? 'on' : ''}" data-ph-kind="baby">👶 Baby photo of me</button><button class="toggle ${ph.kind === 'other' ? 'on' : ''}" data-ph-kind="other">📷 Something else</button></div>
        ${ph.pending ? `<img class="ph-preview" src="${ph.pending}" alt=""><button class="btn small ghost" data-ph="clear">Choose a different one</button>` : '<label class="btn block ghost ph-pick">📁 Choose a photo<input type="file" accept="image/*" id="phFile" hidden></label>'}
        ${ph.kind === 'other' ? `<input class="field" data-key="phq" id="phQ" maxlength="80" placeholder="Question, e.g. Where was this taken?">
          <input class="field" data-key="pha" id="phA" maxlength="60" placeholder="Answer (use / for alternatives)" autocomplete="off">` : '<p class="dim" style="margin:0">Everyone guesses whose baby photo it is. You sit that one out.</p>'}
        ${ph.err ? `<div class="err">${esc(ph.err)}</div>` : ''}
        <button class="btn block" id="phAdd" ${ph.pending && !ph.busy ? '' : 'disabled'}>${ph.busy ? 'Uploading…' : 'Add to the quiz'}</button>
      </div>`;
  }
  const photoButton = () => `<button class="btn block ghost" data-ph="open" style="margin-top:12px">📸 Add photos to the quiz${state.me.photos && state.me.photos.length ? ` (${state.me.photos.length} added)` : ''}</button>`;

  function bindPhotos() {
    main.querySelectorAll('[data-ph]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.ph;
      if (a === 'open') ph.open = true;
      if (a === 'close') { ph.open = false; ph.err = ''; }
      if (a === 'clear') ph.pending = null;
      lastFormKey = ''; draw();
    }));
    main.querySelectorAll('[data-ph-kind]').forEach((b) => b.addEventListener('click', () => { ph.kind = b.dataset.phKind; lastFormKey = ''; draw(); }));
    main.querySelectorAll('[data-ph-del]').forEach((b) => b.addEventListener('click', () => send('photo:del', { id: b.dataset.phDel })));
    const file = $('#phFile');
    if (file) file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      ph.err = '';
      try { ph.pending = await shrink(f); } catch (e) { ph.err = e.message; }
      lastFormKey = ''; draw();
    });
    const add = $('#phAdd');
    if (add) add.addEventListener('click', async () => {
      const q = $('#phQ') ? $('#phQ').value.trim() : '';
      const answer = $('#phA') ? $('#phA').value.trim() : '';
      if (ph.kind === 'other' && !answer) { ph.err = 'Pop the answer in'; lastFormKey = ''; return draw(); }
      ph.busy = true; lastFormKey = ''; draw();
      const r = await send('photo:add', { data: ph.pending, kind: ph.kind, q, answer });
      ph.busy = false;
      if (r && r.error) ph.err = r.error;
      else { ph.pending = null; ph.err = ''; if ($('#phA')) $('#phA').value = ''; window.CW.buzz(30); }
      lastFormKey = ''; draw();
      return undefined;
    });
  }

  function lobby() {
    if (ph.open) return photoPanel();
    const others = state.players.map((p) => `<span class="avatar-chip ${p.connected ? '' : 'off'}" style="font-size:.8em"><span class="pic">${window.CW.avatar(p, 'idle')}</span><span class="nm">${esc(p.name)}</span></span>`).join(' ');
    if (state.me.isVIP) {
      return `<h1>You're the VIP 👑</h1><p class="dim">Pick a game and start when everyone's in.</p>
        <div class="row" style="gap:6px;margin-bottom:8px">${others}</div>
        ${lookButtons()}
        ${photoButton()}
        <div id="picker" style="margin-top:14px">${window.CW.lobby.html(state)}</div>`;
    }
    return `<div class="wait"><div><div class="pop" data-a="me-${state.me.look}-${state.me.colour}" style="width:150px;height:165px;margin:0 auto">${window.CW.avatar(state.me, 'happy')}</div>${lookButtons()}<h2 style="margin-top:12px">You're in!</h2><p class="dim">This is you. Tonight: are you smarter than <b style="color:var(--yellow)">${esc(state.crew.name)}</b>?</p><p class="dim">Waiting for the VIP to start the game.</p>${photoButton()}</div></div><div class="row" style="gap:6px;justify-content:center">${others}</div>`;
  }

  const lookButtons = () => '<div class="lobby-me"><button class="btn small ghost" data-me="look">🔀 New look</button><button class="btn small ghost" data-me="colour">🎨 Colour</button></div>';

  function vipControls(g) {
    const done = g.screen === 'over' || g.screen === 'results';
    return `<div class="vip-ctl row">
      <span class="dim" style="font-size:.8em">VIP controls</span><span class="grow"></span>
      ${g.id === 'storytime' && g.screen === 'results' ? '<button class="btn small" data-ctl="again">Another story</button>' : ''}
      ${done ? '' : '<button class="btn small ghost" data-ctl="next">Skip →</button>'}
      <button class="btn small ghost" data-ctl="lobby">Lobby</button>
    </div>`;
  }

  // A single text box, used by Story Time and Head to Head.
  const writer = (key, label, sub, placeholder, extra = '') => `
    <div class="stack">
      <h2>${esc(label)}</h2>${sub ? `<div class="hint-ex">${esc(sub)}</div>` : ''}
      <input class="field" data-key="${esc(key)}" id="answer" maxlength="${key.startsWith('st') ? 40 : 80}" placeholder="${esc(placeholder)}" autocomplete="off" enterkeyhint="send">
      <button class="btn block" id="submit">Send</button>${extra}
    </div>`;

  const storyText = (parts) => parts.map((p) => {
    if (p.t === 'text') return esc(p.v);
    if (p.t === 'name') return `<span class="nm">${esc(p.v)}</span>`;
    return `<span class="w" style="background:${p.missed ? '#776f9e' : p.by.colour}">${esc(p.v)}</span>`;
  }).join('');

  // ---------- per-game views ----------
  const VIEWS = {
    storytime: {
      write: (g) => {
        const next = g.tasks.find((t) => !t.filled);
        if (!next) return wait('✅', 'All done!', 'Waiting for everyone else…');
        const done = g.tasks.filter((t) => t.filled).length;
        return `${timer()}<div class="counter" style="text-align:left;margin-bottom:8px">Blank ${done + 1} of ${g.tasks.length}</div>
          ${writer(`st${g.title}${next.i}`, `Give me ${next.hint}`, next.example, 'Type it here…')}`;
      },
      reveal: (g) => `<h1>${esc(g.title)}</h1><p class="dim">Look at the big screen! (Here's a copy if you're reading it out.)</p><div class="mini-story">${storyText(g.story)}</div>`,
      vote: (g) => `${timer()}<h2>Which was the best word?</h2><p class="dim" style="margin-top:0">You can't vote for your own.</p>
        ${g.options.map((o) => `<button class="opt-btn ${g.myVote === o.i ? 'sel' : ''}" data-vote="${o.i}"><small>${esc(o.hint)}</small>${esc(o.value)}</button>`).join('')}`,
      results: (g) => `<h1>Word of the night</h1>${g.best.map((b) => `<h2 style="color:${b.by.colour}">“${esc(b.value)}” — ${esc(b.by.name)}</h2>`).join('') || '<p class="dim">No votes!</p>'}${scoreboard(g.scores)}`,
    },
    headtohead: {
      write: (g) => {
        const next = g.tasks.find((t) => !t.answered);
        if (!next) return wait('✅', 'Answers in!', 'Waiting for everyone else…');
        const done = g.tasks.filter((t) => t.answered).length;
        return `${timer()}<div class="counter" style="text-align:left;margin-bottom:8px">Prompt ${done + 1} of ${g.tasks.length}</div>
          ${writer(`h2h${g.round}${next.mi}${next.prompt}`, next.prompt, '', 'Be funny…', `<button class="btn ghost block" id="safety" data-mi="${next.mi}">I've got nothing — safety answer (half points)</button>`)}`;
      },
      battle: (g) => {
        if (g.inBattle) return wait('😬', 'Your answer is up!', 'Sit tight while everyone votes.');
        const b = g.battle;
        return `${timer()}<h2>${esc(b.prompt)}</h2><p class="dim" style="margin-top:0">Tap the funnier one</p>
          <div class="vote-ab">
            <button class="${g.myVote === b.a.pid ? 'sel' : ''}" data-pid="${b.a.pid}">${esc(b.a.text)}</button>
            <button class="${g.myVote === b.b.pid ? 'sel' : ''}" data-pid="${b.b.pid}">${esc(b.b.text)}</button>
          </div>`;
      },
      battleResult: () => wait('👀', 'Look at the big screen'),
      scores: (g) => `<h1>Scores</h1>${scoreboard(g.scores)}`,
      finalWrite: (g) => {
        const t = g.tasks[0];
        if (t.answered) return wait('✅', 'Answer in!', 'Waiting for everyone else…');
        return `${timer()}<div class="kicker" style="text-align:left;margin-bottom:8px">FINAL ROUND</div>
          ${writer(`final${t.prompt}`, t.prompt, 'Everyone answers this one. Votes are worth triple.', 'Make it count…', '<button class="btn ghost block" id="safety" data-mi="0">Safety answer (half points)</button>')}`;
      },
      finalVote: (g) => `${timer()}<h2>${esc(g.final.prompt)}</h2><p class="dim" style="margin-top:0">Vote for your favourite (not your own)</p>
        ${g.final.answers.map((a) => `<button class="opt-btn ${g.myVote === a.pid ? 'sel' : ''}" data-pid="${a.pid}">${esc(a.text)}</button>`).join('')}`,
      finalResult: () => wait('👀', 'Look at the big screen'),
      over: (g) => `<h1>Final scores</h1>${scoreboard(g.scores)}`,
    },
    imposter: {
      reveal: (g) => `${timer()}<div class="counter" style="text-align:left">Round ${g.round} of ${g.rounds}</div>
        ${secretCard(g, true)}
        ${g.amReady ? '<p class="center dim">Waiting for everyone else…</p>' : '<button class="btn block" id="impReady" style="margin-top:14px">Got it 👍</button>'}
        <p class="center dim" style="font-size:.85em">Keep your screen hidden from everyone else!</p>`,
      clue: (g) => {
        if (g.myTurn) {
          return `${timer()}<h1>Your turn!</h1>
            <p class="dim" style="margin-top:0">Give a one-word clue. Not too obvious, or the imposter will catch on${g.isImposter ? '. (You\'re the imposter: bluff it!)' : ''}.</p>
            ${secretCard(g, false)}
            <div class="stack" style="margin-top:12px"><input class="field" data-key="impclue${g.round}-${g.pass}" id="impClue" maxlength="30" placeholder="Your clue" autocomplete="off" autocorrect="off" enterkeyhint="send">
            <div class="err hidden" id="impErr">Don't say the actual word!</div>
            <button class="btn block" id="impSend">Send clue</button></div>`;
        }
        return `${timer()}<h2>${esc(g.turn.name)} is giving a clue…</h2>${secretCard(g, false)}${clueList(g)}`;
      },
      discuss: (g) => `${timer()}<h1>Discuss! 🗣️</h1><p class="dim" style="margin-top:0">Who's the imposter? Argue it out, then vote.</p>${secretCard(g, false)}${clueList(g)}`,
      vote: (g) => `${timer()}<h1>Who's the imposter?</h1>
        ${g.table.filter((p) => p.id !== state.me.id).map((p) => `
          <button class="opt-btn ${g.myVote === p.id ? 'sel' : ''}" data-pid="${p.id}"><small>${esc(p.clues.join(' · ') || 'no clue')}</small>${esc(p.name)}</button>`).join('')}`,
      votereveal: () => wait('👀', 'Look at the big screen'),
      guess: (g) => (g.isImposter
        ? `${timer()}<h1>You've been caught!</h1><p>Guess the secret word to steal the round. Category: <b>${esc(g.category)}</b></p>
          <div class="stack"><input class="field" data-key="impguess${g.round}" id="impGuess" maxlength="40" placeholder="The word was…" autocomplete="off" enterkeyhint="send">
          <button class="btn block pink" id="impGuessBtn">Lock in my guess</button></div>`
        : wait('😬', `${esc(g.imposter.name)} is guessing the word…`, 'Fingers crossed they get it wrong')),
      roundResult: (g) => `<h1>${{ escaped: g.imposter.id === state.me.id ? 'You got away with it! 😈' : 'The imposter escaped!', stole: g.imposter.id === state.me.id ? 'You stole it! 🎯' : 'They guessed the word!', caught: g.imposter.id === state.me.id ? 'Caught! 👻' : 'Imposter caught! 🎉' }[g.outcome]}</h1>
        <p>The word was <b>${esc(g.word)}</b>. The imposter was <b>${esc(g.imposter.name)}</b>.${g.gained[state.me.id] ? ` You got <b>+${g.gained[state.me.id]}</b>.` : ''}</p>${scoreboard(g.scores)}`,
      over: (g) => `<h1>Final scores</h1>${scoreboard(g.scores)}`,
    },
    stopthebus: {
      write: (g) => stbForm(g),
      stopping: (g) => stbForm(g),
      review: (g) => `${timer()}<div class="counter" style="text-align:left">Letter <b>${esc(g.letter)}</b> · ${g.ci + 1} of ${g.categories.length}</div>
        <h1>${esc(g.categories[g.ci])}</h1><p class="dim" style="margin-top:0">Tap 👎 on any answer you don't accept.</p>
        ${g.results.map((r) => `
          <div class="stb-row ${r.status}">
            <span class="dot" style="background:${r.colour}"></span>
            <span class="grow"><b>${esc(r.name)}</b><br>${r.text ? esc(r.text) : '<span class="dim">—</span>'}</span>
            ${r.id === state.me.id ? '<span class="dim">you</span>' : r.text ? `<button class="veto ${r.myVeto ? 'on' : ''}" data-veto="${r.id}">👎${r.vetoes ? ` ${r.vetoes}` : ''}</button>` : ''}
          </div>`).join('')}`,
      roundScores: (g) => `<h1>+${g.myPoints} this round</h1>${scoreboard(g.scores)}`,
      over: (g) => `<h1>Final scores</h1>${scoreboard(g.scores)}`,
    },
    awards: {
      intro: () => wait('🏆', 'Awards time!', 'Look at the big screen'),
      award: (g) => `<div class="wait"><div><div class="big">${g.award.emoji}</div><h1 style="margin-top:12px">${esc(g.award.title)}</h1><p class="dim">Look at the big screen…</p>${g.mine.length ? `<p>Your awards: <b>${g.mine.map(esc).join(', ')}</b></p>` : ''}</div></div>`,
      finale: (g) => `<h1>Tonight's awards</h1>${g.all.map((a) => `<div class="opt-btn ${a.winners.some((w) => w.id === state.me.id) ? 'sel' : ''}"><small>${esc(a.line)}</small>${a.emoji} ${esc(a.title)}: ${a.winners.map((w) => esc(w.name)).join(' & ')}</div>`).join('')}`,
    },
    pubquiz: {
      question: (g) => {
        const q = g.question;
        if (g.isMine) return wait('🤫', "It's your photo!", 'Sit this one out and watch everyone else squirm');
        const media = q.image ? `<div class="center"><img class="quiz-img" src="${esc(q.image)}" alt=""></div>` : q.emoji ? `<div class="emoji-q center">${esc(q.emoji)}</div>` : '';
        if (q.kind === 'typed') {
          if (g.myAnswer != null) return wait('🔒', 'Locked in', `You said: “${esc(g.myAnswer)}”`);
          return `${timer()}<div class="counter" style="text-align:left">Q${g.n} of ${g.of}</div><h2>${esc(q.q)}</h2>${media}
            <div class="stack"><input class="field" data-key="quiz${g.n}" id="answer" maxlength="60" placeholder="Type your answer" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="send">
            <button class="btn block" id="submitQuiz">Lock it in</button></div>`;
        }
        const mine = g.myAnswer;
        return `${timer()}<div class="counter" style="text-align:left">Q${g.n} of ${g.of} · ${mine == null ? 'answer on here' : 'locked in'}</div>
          <div class="hint-ex" style="margin:0 0 10px;color:var(--ink)">${esc(q.q)}</div>
          <div class="quiz-btns">${q.options.map((o, i) => `
            <button class="ans-${i} ${mine == null ? '' : (mine === i ? 'mine' : 'faded')}" data-choice="${i}" ${mine == null ? '' : 'disabled'}><span class="sh">${SHAPES[i]}</span>${esc(o)}</button>`).join('')}
          </div>`;
      },
      reveal: (g) => {
        if (g.isMine) return wait('📸', 'That was your photo!', `The answer: ${esc(g.answer)}`);
        if (g.myAnswer == null) return meBig('sad', 'Too slow!', `It was: ${esc(g.answer)}`);
        return g.right ? meBig('happy', `Correct! +${g.gained}`, `It was: ${esc(g.answer)}`) : meBig('sad', 'Wrong!', `It was: ${esc(g.answer)}`);
      },
      board: (g) => `<h1>Leaderboard</h1>${scoreboard(g.scores)}`,
      chaseIntro: (g) => {
        const m = g.chase.me;
        return `<h1>The Final Chase</h1>
          ${meCard(m, 'scared', `You start <b>${m.start} step${m.start === 1 ? '' : 's'}</b> ahead of ${esc(state.crew.name)}.`)}
          <p>Right answers move you towards HOME, and the fastest right answer moves 2. Get caught and you're out. First one home wins <b>+2000</b>.</p>
          ${roadMini(g.chase)}`;
      },
      chaseQ: (g) => {
        const c = g.chase;
        if (!c.question) return `${statusCard(c.me)}${roadMini(c)}`;
        const mine = c.myAnswer;
        return `${timer()}<div class="counter" style="text-align:left">Chase Q${c.n} · ${esc(state.crew.name)}: <b>${c.me.gap}</b> step${c.me.gap === 1 ? '' : 's'} behind${c.me.gap <= 1 ? ' 😱' : ''}</div>
          <div class="hint-ex" style="margin:0 0 10px;color:var(--ink)">${esc(c.question.q)}</div>
          <div class="quiz-btns">${c.question.options.map((o, i) => `
            <button class="ans-${i} ${mine == null ? '' : (mine === i ? 'mine' : 'faded')}" data-choice="${i}" ${mine == null ? '' : 'disabled'}><span class="sh">${SHAPES[i]}</span>${esc(o)}</button>`).join('')}</div>`;
      },
      chaseReveal: (g) => {
        const c = g.chase;
        const m = c.me;
        if (!m) return wait('👀', 'Look at the big screen');
        const sub = `It was: <b>${esc(c.answer)}</b><br>${esc(state.crew.name)} ${c.log.familyRight ? 'got it right 😈' : 'got it wrong 😤'}`;
        let card;
        if (c.log.caught.includes(state.me.id)) card = meCard(m, 'ghost', `<b style="font-size:1.4em;color:var(--pink)">CAUGHT!</b><br>${sub}`);
        else if (m.status === 'home' && m.moved) card = meCard(m, 'happy', `<b style="font-size:1.4em;color:var(--yellow)">${m.order === 0 ? 'FIRST HOME!' : 'HOME!'}</b><br>${sub}`);
        else if (m.status !== 'running') return `${statusCard(m)}${roadMini(c)}`;
        else card = meCard(m, m.moved ? 'run' : 'scared', `<b style="font-size:1.3em">${m.moved ? `Right! +${m.moved} step${m.moved > 1 ? 's' : ''}` : 'Wrong. You stay put.'}</b><br>${sub}`);
        return card + roadMini(c);
      },
      over: (g) => `${g.chase && g.chase.me ? `<h2>${{ home: g.chase.me.order === 0 ? '🏠 First home! +2000' : '🏠 Escaped! +1000', survived: '😅 Survived! +500', caught: `😱 Caught by ${esc(state.crew.name)}` }[g.chase.me.status] || ''}</h2>` : ''}<h1>Final scores</h1>${scoreboard(g.scores)}`,
    },
  };

  // The secret word, hidden until tapped so people sitting next to you can't see it.
  let peekRound = null;
  function secretCard(g, big) {
    const open = peekRound === `${g.round}`;
    const inner = g.isImposter
      ? `<div class="imp-you">🤫 You're the IMPOSTER</div><div>Category: <b>${esc(g.category)}</b></div><div class="dim" style="font-size:.85em">Blend in. Don't get caught!</div>`
      : `<div class="dim">Category: ${esc(g.category)}</div><div class="imp-secret">${esc(g.word)}</div>`;
    return `<button class="secret-card ${big ? 'big' : ''} ${open ? 'open' : ''}" id="peek">
      ${open ? inner : `<div class="imp-you">👀 Tap to see ${big ? 'your secret word' : 'your word'}</div><div class="dim" style="font-size:.85em">Make sure nobody's looking</div>`}
    </button>`;
  }
  const clueList = (g) => `<div class="imp-list">${g.table.map((p) => `<div><b>${esc(p.name)}</b><span>${p.clues.length ? esc(p.clues.join(' · ')) : '…'}</span></div>`).join('')}</div>`;

  function stbForm(g) {
    const stopping = g.screen === 'stopping';
    return `${timer()}
      <div class="stb-top"><div class="stb-letter onphone">${esc(g.letter)}</div>
        <div class="grow"><b>Round ${g.round} of ${g.rounds}</b><br><span class="dim">Everything must start with ${esc(g.letter)}</span></div></div>
      ${stopping ? `<div class="err" style="margin:8px 0">🚌 ${g.stoppedBy ? `${esc(g.stoppedBy.name)} stopped the bus!` : 'Time!'} Quick, finish up! <span data-secs></span>s</div>` : ''}
      <div class="stb-form">${g.categories.map((c, i) => `
        <label><span>${esc(c)}</span><input class="field" data-key="stb${g.round}-${i}" data-ci="${i}" maxlength="40" autocomplete="off" autocorrect="off" spellcheck="false" value="${esc(g.mine[i] || '')}" placeholder="${esc(g.letter)}…"></label>`).join('')}
      </div>
      ${stopping ? '' : `<button class="btn block pink stb-stop" id="stopBus" ${g.canStop ? '' : 'disabled'}>🚌 STOP THE BUS!</button>
      <p class="dim center" style="font-size:.8em">Fill every box with the right letter to stop the bus (+10 bonus)</p>`}`;
  }

  function meCard(m, mood, html) {
    return `<div class="me-card"><div class="pic">${window.CW.avatar(state.me, mood)}</div><div>${html}</div></div>`;
  }

  function statusCard(m) {
    if (!m) return wait('👀', 'Look at the big screen');
    if (m.status === 'caught') return meCard(m, 'ghost', '<b>You got caught 👻</b><br>Watch the others run for it on the big screen!');
    if (m.status === 'home') return meCard(m, 'happy', '<b>You escaped! 🏠</b><br>Watch the others run for it on the big screen!');
    return wait('👀', 'Look at the big screen');
  }

  // A tiny version of the TV street: everyone's characters and The Family.
  function roadMini(c) {
    const t = c.track;
    const x = (i) => 6 + (i * 80) / t.length;
    return `<div class="road-mini">
      <span class="door">🚪</span>
      <span class="fam" style="left:${x(t.family) + 3}%">${window.CW.crew(state.crew.id, 'stomp')}</span>
      ${t.runners.map((r) => `<span class="m" style="left:${r.status === 'home' ? 94 : x(r.pos)}%;${r.id === state.me.id ? 'z-index:3;transform:translateX(-50%) scale(1.25)' : 'opacity:.8'}">${window.CW.avatar(r, r.status === 'caught' ? 'ghost' : r.status === 'home' ? 'happy' : 'idle')}</span>`).join('')}
    </div>`;
  }

  // ---------- events ----------
  function bind(g) {
    bindPhotos();
    main.querySelectorAll('[data-me]').forEach((b) => b.addEventListener('click', () => { window.CW.buzz(15); send(b.dataset.me); }));
    if (!g) {
      const picker = $('#picker');
      if (picker) window.CW.lobby.bind(picker, async (type, data) => { const r = await send(`ctl:${type}`, data); if (r && r.error) alert(r.error); }, draw);
      return;
    }
    const input = $('#answer');
    const submitText = (type, payload) => { const v = input.value.trim(); if (!v) return input.focus(); send(type, payload(v)); input.value = ''; };
    const sub = $('#submit');
    if (sub && input) {
      const go = () => {
        if (g.id === 'storytime') { const t = g.tasks.find((x) => !x.filled); submitText('fill', (v) => ({ i: t.i, value: v })); }
        else if (g.screen === 'finalWrite') submitText('answer', (v) => ({ mi: 0, value: v }));
        else { const t = g.tasks.find((x) => !x.answered); submitText('answer', (v) => ({ mi: t.mi, value: v })); }
      };
      sub.onclick = go;
      input.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    }
    const quizBtn = $('#submitQuiz');
    if (quizBtn && input) {
      const go = () => submitText('answer', (v) => ({ text: v }));
      quizBtn.onclick = go;
      input.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    }
    // Stop the Bus: save answers as they type, light up STOP when every box starts with the letter.
    const stbInputs = main.querySelectorAll('input[data-ci]');
    if (stbInputs.length) {
      const timers = {};
      const letterOk = (v) => window.CW.firstLetter(v) === g.letter;
      const refreshStop = () => {
        const btn = $('#stopBus');
        if (btn) btn.disabled = ![...stbInputs].every((x) => letterOk(x.value));
        stbInputs.forEach((x) => x.classList.toggle('bad', !!x.value.trim() && !letterOk(x.value)));
      };
      const sendFill = (el) => { clearTimeout(timers[el.dataset.ci]); send('fill', { ci: Number(el.dataset.ci), value: el.value }); };
      stbInputs.forEach((el) => {
        el.addEventListener('input', () => { clearTimeout(timers[el.dataset.ci]); timers[el.dataset.ci] = setTimeout(() => sendFill(el), 350); refreshStop(); });
        el.addEventListener('change', () => sendFill(el));
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const n = stbInputs[Number(el.dataset.ci) + 1]; if (n) n.focus(); else el.blur(); } });
      });
      refreshStop();
      const stopBtn = $('#stopBus');
      if (stopBtn) stopBtn.onclick = () => { stbInputs.forEach(sendFill); send('stop'); };
    }
    // Imposter controls
    const peek = $('#peek');
    if (peek) peek.onclick = () => { peekRound = peekRound === `${g.round}` ? null : `${g.round}`; lastFormKey = ''; draw(); };
    const ready = $('#impReady');
    if (ready) ready.onclick = () => { peekRound = null; send('ready'); };
    const clueIn = $('#impClue');
    if (clueIn) {
      const go = () => {
        const v = clueIn.value.trim();
        if (!v) return clueIn.focus();
        const nrm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!g.isImposter && g.word && nrm(v).includes(nrm(g.word))) { $('#impErr').classList.remove('hidden'); return undefined; }
        send('clue', { text: v });
        clueIn.value = '';
        return undefined;
      };
      $('#impSend').onclick = go;
      clueIn.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    }
    const guessIn = $('#impGuess');
    if (guessIn) {
      const go = () => { const v = guessIn.value.trim(); if (v) send('guess', { text: v }); };
      $('#impGuessBtn').onclick = go;
      guessIn.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    }
    main.querySelectorAll('[data-veto]').forEach((b) => b.addEventListener('click', () => send('veto', { pid: b.dataset.veto })));
    const safety = $('#safety');
    if (safety) safety.onclick = () => { if (input) input.value = ''; send('safety', { mi: Number(safety.dataset.mi) }); };
    main.querySelectorAll('[data-vote]').forEach((b) => b.addEventListener('click', () => send('vote', { i: Number(b.dataset.vote) })));
    main.querySelectorAll('[data-pid]').forEach((b) => b.addEventListener('click', () => send('vote', { pid: b.dataset.pid })));
    main.querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => send('answer', { choice: Number(b.dataset.choice) })));
    main.querySelectorAll('[data-ctl]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.ctl === 'lobby' && !confirm('End the game for everyone?')) return;
      send(`ctl:${b.dataset.ctl}`);
    }));
  }
}());
