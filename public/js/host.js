/* Host (TV) screen. Shows the room, the questions and the results; phones do the input. */
(function () {
  const { esc, $, SHAPES, setNow, runTimers, render, scoreboard, beep, jingle } = window.CW;
  const socket = io();
  const main = $('#main');
  const foot = $('#foot');
  const topRight = $('#topRight');
  let state = null;
  let joinInfo = null;
  let lastKey = '';
  let sound = localStorage.getItem('cwSound') !== 'off';

  const action = (type, data) => new Promise((r) => socket.emit('host:action', { type, data }, r));

  // ---------- connection ----------
  socket.on('connect', async () => {
    const saved = JSON.parse(localStorage.getItem('cwHost') || 'null');
    let res = saved ? await new Promise((r) => socket.emit('host:resume', saved, r)) : null;
    if (!res || res.error) res = await new Promise((r) => socket.emit('host:create', {}, r));
    localStorage.setItem('cwHost', JSON.stringify({ code: res.code, hostToken: res.hostToken }));
  });
  socket.on('disconnect', () => { topRight.innerHTML = '<span class="code-badge" style="color:var(--pink)">Reconnecting…</span>'; });

  socket.on('state', async (s) => {
    state = s;
    setNow(s.now);
    if (!joinInfo || joinInfo.code !== s.code) {
      const j = await fetch(`/api/join-info?code=${s.code}`).then((r) => r.json());
      joinInfo = { ...j, code: s.code };
    }
    draw();
  });

  function newRoom() {
    localStorage.removeItem('cwHost');
    location.reload();
  }

  // ---------- sounds on phase change ----------
  function cue(g) {
    const key = g ? `${g.id}|${g.screen}|${g.n || (g.chase && g.chase.n) || ''}|${g.battle ? g.battle.index : ''}|${g.round || ''}` : 'lobby';
    if (key === lastKey) return;
    lastKey = key;
    if (!sound || !g) return;
    const sc = g.screen;
    if (sc === 'chaseIntro') jingle([392, 392, 392, 311, 466, 392]);
    else if (sc === 'chaseReveal' && g.chase && g.chase.log && g.chase.log.caught.length) jingle([523, 415, 330, 262]);
    else if (['write', 'finalWrite', 'question', 'chaseQ'].includes(sc)) jingle([523, 659, 784]);
    else if (['reveal', 'battleResult', 'finalResult'].includes(sc)) jingle([784, 988, 1175]);
    else if (['scores', 'board', 'over', 'results'].includes(sc)) jingle([523, 659, 784, 1047]);
    else beep(440);
  }

  // ---------- top-level draw ----------
  function draw() {
    const s = state;
    const g = s.game;
    cue(g);
    $('.host-top .logo').innerHTML = `ARE YOU <b>SMARTER</b> THAN <b>${esc(s.crew.name.toUpperCase())}?</b>`;
    document.title = `Are You Smarter Than ${s.crew.name}?`;
    topRight.innerHTML = `
      <button class="btn small ghost" id="snd">${sound ? '🔊' : '🔇'}</button>
      ${g ? `<span class="code-badge">Join at ${esc((joinInfo.base || '').replace(/^https?:\/\//, ''))} · <b>${s.code}</b></span>` : ''}`;
    $('#snd').onclick = () => { sound = !sound; localStorage.setItem('cwSound', sound ? 'on' : 'off'); if (sound) beep(660); draw(); };

    if (!g) return drawLobby();
    if (g.id === 'pubquiz' && g.chase && (g.screen.startsWith('chase') || g.screen === 'over')) {
      drawChase(g);
      runTimers(main, g.deadline);
      return drawFoot(g);
    }
    const fn = VIEWS[g.id] && VIEWS[g.id][g.screen];
    if (g.screen === 'loading') render(main, `<div class="center"><div class="big-q wobble">✍️</div><p class="kicker" style="margin-top:3vh">${esc(g.loadingLabel || 'Loading…')}</p></div>`);
    else if (fn) render(main, fn(g, s));
    else render(main, `<p class="center dim">…</p>`);
    main.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => action('toggle', { pid: b.dataset.toggle })));
    if (g.id === 'storytime' && g.screen === 'reveal') storyReveal.mount(g);
    else storyReveal.stop();
    runTimers(main, g.deadline);
    drawFoot(g);
  }

  function drawFoot(g) {
    const canSkip = !['over', 'results', 'loading'].includes(g.screen);
    const label = { write: 'Skip writing', finalWrite: 'Skip writing', question: 'Reveal answer', battle: 'End voting', finalVote: 'End voting', vote: 'End voting', reveal: g.id === 'storytime' ? 'Go to voting' : 'Next', chaseIntro: 'Start the chase', chaseQ: 'Reveal answer', stopping: 'Go to answers' }[g.screen] || 'Next';
    const label2 = g.id === 'stopthebus' && g.screen === 'write' ? 'Stop the bus now' : label;
    foot.innerHTML = `
      ${g.id === 'pubquiz' && g.screen === 'reveal' ? `<button class="btn small ghost" id="flag" ${g.flagged ? 'disabled' : ''}>${g.flagged ? 'Binned' : '👎 Bad question'}</button>` : ''}
      ${g.id === 'storytime' && g.screen === 'results' ? '<button class="btn small" id="again">Another story</button>' : ''}
      ${(g.screen === 'over' || g.screen === 'results') ? '<button class="btn small teal" id="replay">Play again</button>' : ''}
      ${canSkip ? `<button class="btn small ghost" id="skip">${label2} →</button>` : ''}
      <button class="btn small ghost" id="lobby">Back to lobby</button>`;
    const on = (id, fn) => { const el = $(`#${id}`); if (el) el.onclick = fn; };
    on('skip', () => action('next'));
    on('lobby', () => { if (confirm('End this game and go back to the lobby?')) action('lobby'); });
    on('again', () => action('again'));
    on('flag', () => action('flag'));
    on('replay', () => action('start', { gameId: g.id, options: window.CW.lobby.pick.options }));
  }

  // ---------- lobby ----------
  function drawLobby() {
    const s = state;
    const players = s.players.map((p) => `
      <span class="avatar-chip pop ${p.connected ? '' : 'off'}">
        <span class="pic">${window.CW.avatar(p, 'idle')}</span>
        <span class="nm">${esc(p.name)}${p.id === s.vipId ? ' 👑' : ''}</span>
        <button class="x" data-kick="${p.id}" title="Remove">×</button>
      </span>`).join('');
    render(main, `
      <div class="lobby">
        <div class="join-box stack">
          <div class="dim">Grab your phone and go to</div>
          <div style="font-size:1.6em;font-weight:700">${esc((joinInfo.base || '').replace(/^https?:\/\//, ''))}</div>
          <div class="dim">and enter the code</div>
          <div class="code">${s.code}</div>
          <div><img src="${joinInfo.qr}" alt="QR code to join"></div>
        </div>
        <div class="stack">
          <div class="card">
            <div class="row" style="margin-bottom:12px"><b>Players (${s.players.length}/10)</b><span class="grow"></span><span class="dim" style="font-size:.8em">👑 = VIP, can start from their phone</span></div>
            <div class="players-grid" style="gap:14px">${players || '<span class="dim">Waiting for people to join…</span>'}</div>
          </div>
          <div class="card" id="picker">${window.CW.lobby.html(s)}</div>
        </div>
      </div>`);
    main.querySelectorAll('[data-kick]').forEach((b) => b.addEventListener('click', () => {
      const p = s.players.find((x) => x.id === b.dataset.kick);
      if (p && confirm(`Remove ${p.name}?`)) action('kick', { playerId: p.id });
    }));
    const picker = $('#picker');
    window.CW.lobby.bind(picker, async (type, data) => {
      const r = await action(type, data);
      if (r && r.error) alert(r.error);
    }, () => drawLobby());
    foot.innerHTML = '<a class="btn small ghost" href="/kids" style="text-decoration:none">🎨 Kids\' corner</a><button class="btn small ghost" id="newroom">New room</button>';
    $('#newroom').onclick = () => { if (confirm('Start a fresh room with a new code?')) newRoom(); };
  }

  // ---------- shared bits ----------
  const timerBar = () => '<div class="timer" data-timer style="max-width:40em;margin:0 auto 3vh"><i></i></div>';
  const progress = (list, label = '') => `
    <div class="progress-list">${list.map((p) => `
      <span class="chip ${p.done >= p.total ? 'done' : ''}"><span class="dot" style="background:${p.colour}">${p.done >= p.total ? '✓' : esc(p.name[0])}</span>${esc(p.name)}${label && p.total > 1 ? ` <small>${p.done}/${p.total}</small>` : ''}</span>`).join('')}
    </div>`;
  const nameTag = (p) => (p ? `<span style="color:${p.colour}">●</span> ${esc(p.name)}` : '');

  // ---------- per-game views ----------
  const VIEWS = {
    storytime: {
      write: (g) => `${timerBar()}
        <div class="kicker">STORY TIME</div>
        <div class="big-q" style="margin-top:2vh">"${esc(g.title)}"</div>
        <p class="center dim" style="font-size:1.2em">Fill in your blanks on your phone. No peeking at the story!</p>
        ${progress(g.progress, 'x')}`,
      reveal: (g) => `
        <div class="kicker">${esc(g.title.toUpperCase())}</div>
        <div class="story" id="story" style="margin-top:3vh"></div>
        <div class="row" style="justify-content:center;margin-top:4vh" id="storyCtl"></div>`,
      vote: (g) => `${timerBar()}
        <div class="kicker">VOTE ON YOUR PHONE</div>
        <div class="big-q" style="margin-top:2vh">What was the best word?</div>
        <div class="story" style="margin-top:4vh;font-size:1.35em">${storyHtml(g.story, false)}</div>`,
      results: (g) => `
        <div class="banner pop">WORD OF THE NIGHT</div>
        <div class="row" style="justify-content:center;margin-top:3vh">${g.best.length ? g.best.map((b) => `
          <div class="quip win pop" style="min-width:12em"><div>${esc(b.value)}</div><div class="by">${nameTag(b.by)} · ${b.votes} vote${b.votes === 1 ? '' : 's'}</div><div class="dim" style="font-size:.45em;margin-top:.3em">(${esc(b.hint)})</div></div>`).join('')
          : '<p class="dim">Nobody voted. Tough crowd.</p>'}</div>
        ${scoreboard(g.scores)}`,
    },
    headtohead: {
      write: (g) => `${timerBar()}
        <div class="kicker">ROUND ${g.round}${g.round === 2 ? ' · DOUBLE POINTS' : ''}</div>
        <div class="big-q" style="margin-top:2vh">Answer the prompts on your phone</div>
        <p class="center dim" style="font-size:1.2em">Each prompt goes to two of you. Be funnier than your opponent.</p>
        ${progress(g.progress, 'x')}`,
      battle: (g) => battle(g.battle, false),
      battleResult: (g) => battle(g.battle, true),
      scores: (g) => `<div class="banner">${g.round === 2 ? 'ON TO THE FINAL' : 'END OF ROUND ' + g.round}</div>${scoreboard(g.scores)}`,
      finalWrite: (g) => `${timerBar()}
        <div class="kicker">FINAL ROUND · EVERYBODY ANSWERS</div>
        <div class="big-q" style="margin-top:2vh">${esc(g.prompt)}</div>
        ${progress(g.progress)}`,
      finalVote: (g) => `${timerBar()}
        <div class="kicker">FINAL ROUND · VOTE FOR YOUR FAVOURITE</div>
        <div class="big-q" style="margin-top:1vh;font-size:2em">${esc(g.final.prompt)}</div>
        <div class="final-grid">${g.final.answers.map((a, i) => `<div class="quip rise" style="animation-delay:${i * 90}ms">${esc(a.text)}</div>`).join('')}</div>`,
      finalResult: (g) => `
        <div class="kicker">FINAL ROUND</div>
        <div class="big-q" style="margin-top:1vh;font-size:2em">${esc(g.final.prompt)}</div>
        <div class="final-grid">${g.final.answers.slice().sort((a, b) => b.votes - a.votes).map((a, i) => `
          <div class="quip rise ${i === 0 && a.votes ? 'win' : ''}" style="animation-delay:${i * 90}ms">${a.votes ? `<span class="pts">+${a.votes * 300}</span>` : ''}
            ${esc(a.text)}<div class="by">${nameTag(a.by)} · ${a.votes} vote${a.votes === 1 ? '' : 's'}</div></div>`).join('')}</div>`,
      over: (g) => winner(g.scores),
    },
    stopthebus: {
      write: (g) => stbWrite(g),
      stopping: (g) => stbWrite(g),
      review: (g) => `${timerBar()}
        <div class="kicker">ROUND ${g.round} OF ${g.rounds} · CATEGORY ${g.ci + 1} OF ${g.categories.length}</div>
        <div class="stb-head"><span class="stb-letter small">${esc(g.letter)}</span><span class="big-q" style="margin:0">${esc(g.categories[g.ci])}</span></div>
        <div class="stb-results">${g.results.map((r, i) => `
          <div class="stb-ans ${r.status} ${r.shared ? 'shared' : ''} rise" style="animation-delay:${i * 80}ms">
            <span class="who"><span class="dot" style="background:${r.colour}"></span>${esc(r.name)}</span>
            <span class="txt">${r.text ? esc(r.text) : '—'}</span>
            <span class="pts">${r.status === 'ok' ? `+${r.points}${r.shared ? ' (same)' : ''}` : { blank: 'blank', 'wrong-letter': 'wrong letter', vetoed: 'vetoed 👎' }[r.status]}</span>
            ${r.vetoes && r.status !== 'vetoed' ? `<span class="vet">👎 ${r.vetoes}</span>` : ''}
          </div>`).join('')}</div>
        <p class="center dim">Dodgy answer? Tap 👎 on your phone. More than half of you = no points.</p>`,
      roundScores: (g) => `<div class="banner">ROUND ${g.round} SCORES</div>
        <div class="row" style="justify-content:center;gap:12px;margin:2vh 0">${g.roundPoints.map((r) => `<span class="chip pop"><span class="dot" style="background:${r.colour}">${esc(r.name[0])}</span>${esc(r.name)} +${r.points}${r.stopped ? ' 🚌' : ''}</span>`).join('')}</div>
        ${scoreboard(g.scores)}`,
      over: (g) => winner(g.scores),
    },
    pubquiz: {
      question: (g) => `${timerBar()}${quizBody(g, false)}`,
      reveal: (g) => quizBody(g, true),
      board: (g) => `<div class="banner">LEADERBOARD</div><p class="center dim">${g.n} of ${g.of} done</p>${scoreboard(g.scores)}`,
      over: (g) => winner(g.scores),
    },
  };

  function stbWrite(g) {
    const stopping = g.screen === 'stopping';
    return `${timerBar()}
      <div class="kicker">STOP THE BUS · ROUND ${g.round} OF ${g.rounds}</div>
      <div class="stb-letter pop">${esc(g.letter)}</div>
      ${stopping ? `<div class="banner pop" style="font-size:2.2em">🚌 ${g.stoppedBy ? `${esc(g.stoppedBy.name)} STOPPED THE BUS!` : 'TIME\'S NEARLY UP!'} <span data-secs></span></div>` : ''}
      <div class="stb-cats">${g.categories.map((c) => `<span>${esc(c)}</span>`).join('')}</div>
      ${progress(g.progress, 'x')}`;
  }

  function quizMedia(q) {
    if (q.image) return `<div class="center" style="margin-top:2vh"><img class="quiz-img pop" src="${esc(q.image)}" alt=""></div>`;
    if (q.emoji) return `<div class="emoji-q pop">${esc(q.emoji)}</div>`;
    return '';
  }

  function quizBody(g, reveal) {
    const q = g.question;
    const answered = state.players.filter((p) => g.answered.includes(p.id));
    const media = quizMedia(q);
    let body = '';
    if (q.kind === 'choice') {
      body = `<div class="answers4">${q.options.map((o, i) => `
        <div class="ans ans-${i} ${reveal ? (i === g.correct ? 'right' : 'wrong') : ''}">
          <span class="sh">${SHAPES[i]}</span>${esc(o)}${reveal ? `<span class="n">${g.counts[i]}</span>` : ''}
        </div>`).join('')}</div>`;
    } else if (reveal) {
      body = `<div class="typed-answer pop">${esc(g.answer)}</div>`;
    } else {
      body = '<p class="center dim" style="font-size:1.3em;margin-top:3vh">⌨️ Type your answer on your phone</p>';
    }
    let foot;
    if (reveal && q.kind === 'typed') {
      foot = g.results.length ? `<div class="guesses">${g.results.map((r) => `
        <button class="guess ${r.right ? 'ok' : 'no'} pop" data-toggle="${r.id}" title="Tap to overrule">
          <span class="dot" style="background:${r.colour}"></span><b>${esc(r.name)}</b> ${esc(r.text)}
          <span class="mark">${r.right ? `✓ +${r.gained}` : '✗'}${r.overruled ? ' (host)' : ''}</span>
        </button>`).join('')}</div><p class="center dim" style="font-size:.75em">Host: tap a guess to overrule the marking</p>`
        : '<span class="dim" style="font-size:1.3em">Nobody answered!</span>';
    } else if (reveal) {
      const right = g.results.filter((r) => r.right);
      foot = right.length ? right.map((p) => `<span class="chip pop"><span class="dot" style="background:${p.colour}">✓</span>${esc(p.name)} +${p.gained}</span>`).join('') : '<span class="dim" style="font-size:1.3em">Nobody got that one!</span>';
    } else {
      foot = `<span class="dim">${answered.length}/${state.players.filter((p) => p.connected).length} answered</span> ${answered.map((p) => `<span class="chip pop"><span class="dot" style="background:${p.colour}">${esc(p.name[0])}</span></span>`).join('')}`;
    }
    return `
      ${g.notice && g.n === 1 ? `<p class="center" style="color:var(--pink)">${esc(g.notice)}</p>` : ''}
      <div class="kicker">QUESTION ${g.n} OF ${g.of}${q.category ? ` · ${esc(q.category.toUpperCase())}` : ''}</div>
      <div class="big-q ${reveal ? '' : 'pop'} ${media ? 'with-media' : ''}" style="margin-top:2vh">${esc(q.q)}</div>
      ${media}
      ${body}
      <div class="row" style="justify-content:center;margin-top:3vh;min-height:3em">${foot}</div>`;
  }

  // ---------- Final Chase ----------
  const stage = new window.CW.ChaseStage();

  function drawChase(g) {
    const c = g.chase;
    const t = c.track;
    const mode = g.screen === 'over' ? 'over' : 'play';
    if (!main.querySelector(`[data-layout="chase-${mode}"]`)) {
      render(main, `<div class="chase-layout" data-layout="chase-${mode}"><div id="chaseTop"></div><div id="stageHolder"></div><div id="chaseBottom"></div></div>`);
    }
    const holder = $('#stageHolder');
    stage.attach(holder, `${state.code}|${state.crew.id}|${t.runners.map((r) => r.id + r.start).join(',')}`, t, state.crew.id);
    holder.firstChild.style.height = mode === 'over' ? '38vh' : '';
    const top = $('#chaseTop');
    const bottom = $('#chaseBottom');
    bottom.innerHTML = '';

    if (g.screen === 'chaseIntro') {
      top.innerHTML = `${timerBar()}<div class="banner pop" style="font-size:2.6em">THE FINAL CHASE</div>
        <p class="center" style="margin:.6vh auto 0;max-width:40em">Your quiz score bought you a head start. Get answers right to run for <b>HOME</b>, and the fastest right answer moves <b>2</b>. If <b>${esc(state.crew.name)}</b> catch you, you're out. First one home wins <b>+2000</b>.</p>`;
      stage.intro(t);
    } else if (g.screen === 'chaseQ' || g.screen === 'chaseReveal') {
      const reveal = g.screen === 'chaseReveal';
      const q = c.question;
      const answered = t.runners.filter((r) => c.answered && c.answered.includes(r.id)).length;
      const runningN = t.runners.filter((r) => r.status === 'running').length;
      top.innerHTML = `${reveal ? '' : timerBar()}
        <div class="kicker">THE FINAL CHASE · QUESTION ${c.n}${reveal ? '' : ` · ${answered}/${runningN} ANSWERED`}</div>
        <div class="big-q" style="font-size:2em;margin-top:.6vh">${esc(q.q)}</div>
        <div class="chase-answers">${q.options.map((o, i) => `<div class="ans ans-${i} ${reveal ? (i === c.correct ? 'right' : 'wrong') : ''}"><span class="sh">${SHAPES[i]}</span>${esc(o)}</div>`).join('')}</div>`;
      if (reveal) stage.reveal(t, c.log, c.n); else stage.question(t);
    } else {
      const home = t.runners.filter((r) => r.status === 'home').sort((a, b) => a.order - b.order);
      const headline = home.length ? `${esc(home[0].name)} ESCAPED FIRST!` : t.runners.some((r) => r.status === 'survived') ? 'SOME OF YOU SURVIVED!' : `${esc(state.crew.name.toUpperCase())} CAUGHT EVERYONE`;
      top.innerHTML = `<div class="banner pop" style="font-size:2.4em">${headline}</div>`;
      const topScore = g.scores[0];
      bottom.innerHTML = `<div class="row" style="justify-content:center;gap:3vw;margin-top:1vh;align-items:center">
          <div style="width:7em;height:7.7em">${topScore ? window.CW.avatar(topScore, 'happy') : ''}</div>
          <div><div class="kicker" style="text-align:left">AND THE WINNER IS…</div>
          <div class="banner pop" style="font-size:3em;text-align:left;color:${topScore ? topScore.colour : 'var(--yellow)'}">${topScore ? esc(topScore.name) : '—'}</div></div>
        </div>${scoreboard(g.scores)}`;
      stage.finale(t);
    }
  }

  function battle(b, reveal) {
    const side = (x, other) => {
      const win = reveal && b.kind === 'vote' && x.voters.length > other.voters.length;
      return `<div class="quip ${reveal ? '' : 'pop'} ${win ? 'win' : ''}">
        ${reveal && x.points ? `<span class="pts">+${x.points}</span>` : ''}
        <div>${x.text ? esc(x.text) : '<span class="dim">(no answer)</span>'}</div>
        ${reveal ? `<div class="by">${nameTag(x.by)}${x.safety ? ' · <span class="dim">safety answer</span>' : ''}</div>
          <div class="voters">${x.voters.map((v) => `<span title="${esc(v.name)}" style="background:${v.colour}"></span>`).join('')}</div>` : ''}
      </div>`;
    };
    let banner = '';
    if (reveal) {
      if (b.kind === 'jinx') banner = '<div class="banner pop">JINX! Same answer, no points</div>';
      else if (b.kind === 'forfeit') banner = '<div class="banner pop">FORFEIT!</div>';
      else if (b.sweep) banner = `<div class="banner pop">WHITEWASH! ${esc((b.sweep === b.a.pid ? b.a.by : b.b.by).name)} takes every vote</div>`;
    }
    return `${reveal ? '' : timerBar()}
      <div class="kicker">BATTLE ${b.index} OF ${b.of}</div>
      <div class="big-q" style="margin-top:1vh">${esc(b.prompt)}</div>
      <div class="vs">${side(b.a, b.b)}<div class="mid">VS</div>${side(b.b, b.a)}</div>
      <div style="margin-top:3vh;min-height:3.5em">${banner || (reveal ? '' : `<p class="center dim">Vote on your phone · ${b.voted}/${b.voters} voted</p>`)}</div>`;
  }

  function winner(scores) {
    const top = scores[0];
    return `<div class="center">
      <div class="kicker">AND THE WINNER IS…</div>
      <div class="banner pop" style="font-size:4.5em;color:${top ? top.colour : 'var(--yellow)'}">${top ? esc(top.name) : '—'}</div>
      ${scoreboard(scores)}</div>`;
  }

  // ---------- Story Time reveal: line by line, optionally read aloud ----------
  function storyHtml(parts, all) {
    return parts.map((p) => {
      if (p.t === 'text') return esc(p.v);
      if (p.t === 'name') return `<span class="nm">${esc(p.v)}</span>`;
      return `<span class="w" style="background:${p.missed ? '#776f9e' : p.by.colour}">${esc(p.v)}${all ? `<small>${esc(p.by ? p.by.name : '')}</small>` : ''}</span>`;
    }).join('');
  }

  function sentences(parts) {
    // Split into sentences so we can reveal and read one at a time.
    const out = [[]];
    parts.forEach((p) => {
      if (p.t !== 'text') { out[out.length - 1].push(p); return; }
      const bits = p.v.split(/(?<=[.!?]["”]?)\s+/);
      bits.forEach((b, i) => {
        if (b) out[out.length - 1].push({ t: 'text', v: b + (i < bits.length - 1 ? ' ' : '') });
        if (i < bits.length - 1) out.push([]);
      });
    });
    return out.filter((s) => s.length);
  }

  const storyReveal = {
    title: null, shown: 0, reading: false, list: [],
    voice() {
      const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
      return vs.find((v) => v.lang === 'en-GB' && /Daniel|Google UK|Serena|Kate|Arthur/i.test(v.name)) || vs.find((v) => v.lang === 'en-GB') || null;
    },
    mount(g) {
      if (this.title !== g.title) { this.title = g.title; this.shown = 1; this.reading = false; }
      this.list = sentences(g.story);
      this.paint();
    },
    paint() {
      const el = $('#story');
      if (!el) return;
      el.innerHTML = this.list.map((s, i) => `<span class="s ${i >= this.shown ? 'hide' : ''} ${i === this.shown - 1 ? 'now' : ''}">${storyHtml(s, false)}</span>`).join('');
      const done = this.shown >= this.list.length;
      $('#storyCtl').innerHTML = `
        ${window.speechSynthesis ? `<button class="btn ${this.reading ? 'ghost' : 'pink'}" id="read">${this.reading ? '⏸ Stop reading' : '🔊 Read it out'}</button>` : ''}
        ${done ? '' : '<button class="btn ghost" id="nextLine">Next line (space)</button><button class="btn ghost" id="showAll">Show all</button>'}
        ${done ? '<button class="btn" id="toVote">Vote for the best word →</button>' : ''}`;
      const on = (id, fn) => { const b = $(`#${id}`); if (b) b.onclick = fn; };
      on('nextLine', () => this.next());
      on('showAll', () => { this.shown = this.list.length; this.stopSpeech(); this.paint(); });
      on('toVote', () => { this.stop(); action('next'); });
      on('read', () => { if (this.reading) { this.stopSpeech(); this.paint(); } else { this.reading = true; this.shown = Math.max(1, this.shown); this.speak(this.shown - 1); } });
    },
    next() { if (this.shown < this.list.length) { this.shown += 1; this.paint(); if (sound) beep(880, 0.06); } },
    speak(i) {
      this.paint();
      const text = this.list[i].map((p) => p.v).join('');
      const u = new SpeechSynthesisUtterance(text);
      const v = this.voice();
      if (v) u.voice = v;
      u.lang = 'en-GB';
      u.rate = 0.98;
      u.onend = () => {
        if (!this.reading) return;
        if (i + 1 < this.list.length) { this.shown = i + 2; setTimeout(() => this.reading && this.speak(i + 1), 350); }
        else { this.reading = false; this.paint(); }
      };
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    },
    stopSpeech() { this.reading = false; if (window.speechSynthesis) speechSynthesis.cancel(); },
    stop() { if (this.reading) this.stopSpeech(); },
  };
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => {};

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space' || e.code === 'ArrowRight') {
      e.preventDefault();
      if (state && state.game && state.game.id === 'storytime' && state.game.screen === 'reveal') storyReveal.next();
      else if (state && state.game && ['reveal', 'battleResult', 'scores', 'board', 'finalResult', 'chaseIntro', 'chaseReveal'].includes(state.game.screen)) action('next');
    }
  });
}());
