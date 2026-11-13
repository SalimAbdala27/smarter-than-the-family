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

    // Buzz on a new phase so people look down at their phones.
    const phase = g ? `${g.id}${g.screen}${g.n || (g.chase && g.chase.n) || ''}${g.round || ''}${g.battle ? g.battle.index : ''}` : 'lobby';
    if (phase !== lastPhase) { lastPhase = phase; if (navigator.vibrate) navigator.vibrate(40); }

    let html;
    if (!g) html = lobby();
    else if (g.screen === 'loading') html = wait('✍️', g.loadingLabel || 'Loading…');
    else html = (VIEWS[g.id] && VIEWS[g.id][g.screen] ? VIEWS[g.id][g.screen](g) : wait('👀', 'Look at the big screen'));
    if (g && me.isVIP && g.screen !== 'loading') html += vipControls(g);
    render(main, html);
    bind(g);
    runTimers(main, g && g.deadline);
  }

  const wait = (icon, text, sub = '') => `<div class="wait"><div><div class="big wobble">${icon}</div><h2 style="margin-top:12px">${esc(text)}</h2>${sub ? `<p class="dim">${sub}</p>` : ''}</div></div>`;
  const timer = () => '<div class="timer" data-timer style="margin-bottom:14px"><i></i></div>';

  function lobby() {
    const others = state.players.map((p) => `<span class="avatar-chip ${p.connected ? '' : 'off'}" style="font-size:.8em"><span class="pic">${window.CW.avatar(p, 'idle')}</span><span class="nm">${esc(p.name)}</span></span>`).join(' ');
    if (state.me.isVIP) {
      return `<h1>You're the VIP 👑</h1><p class="dim">Pick a game and start when everyone's in.</p>
        <div class="row" style="gap:6px;margin-bottom:14px">${others}</div>
        <div id="picker">${window.CW.lobby.html(state)}</div>`;
    }
    return `<div class="wait"><div><div style="width:150px;height:165px;margin:0 auto">${window.CW.avatar(state.me, 'happy')}</div><h2 style="margin-top:12px">You're in!</h2><p class="dim">This is you. Tonight: are you smarter than <b style="color:var(--yellow)">${esc(state.crew.name)}</b>?</p><p class="dim">Waiting for the VIP to start the game.</p></div></div><div class="row" style="gap:6px;justify-content:center">${others}</div>`;
  }

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
    pubquiz: {
      question: (g) => {
        const q = g.question;
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
        if (g.myAnswer == null) return wait('😴', 'Too slow!', `It was: ${esc(g.answer)}`);
        return g.right ? wait('🎉', `Correct! +${g.gained}`, `It was: ${esc(g.answer)}`) : wait('🙈', 'Wrong!', `It was: ${esc(g.answer)}`);
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
