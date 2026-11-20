/* Host (TV) screen. Shows the room, the questions and the results; phones do the input. */
(function () {
  const { esc, $, SHAPES, setNow, runTimers, render, scoreboard, jingle, sfx, crowd } = window.CW;
  const socket = io();
  const main = $('#main');
  const foot = $('#foot');
  const topRight = $('#topRight');
  let state = null;
  let joinInfo = null;
  let lastKey = '';
  let sound = localStorage.getItem('cwSound') !== 'off';
  let musicOn = localStorage.getItem('cwMusic') !== 'off';
  window.CW.audio.sfxOn = sound;
  window.CW.audio.musicOn = musicOn;
  window.CW.onTick = (sec) => sfx.tick(sec <= 1);

  const action = (type, data) => new Promise((r) => socket.emit('host:action', { type, data }, r));

  // ---------- connection ----------
  socket.on('connect', async () => {
    const saved = JSON.parse(localStorage.getItem('cwHost') || 'null');
    let res = saved ? await new Promise((r) => socket.emit('host:resume', saved, r)) : null;
    if (!res || res.error) res = await new Promise((r) => socket.emit('host:create', {}, r));
    localStorage.setItem('cwHost', JSON.stringify({ code: res.code, hostToken: res.hostToken }));
  });
  socket.on('disconnect', () => { topRight.innerHTML = '<span class="code-badge" style="color:var(--pink)">Reconnecting…</span>'; });

  // ---------- running league, kept in this browser so it survives server restarts ----------
  const GAME_NAMES = { storytime: 'Story Time', headtohead: 'Head to Head', pubquiz: 'Pub Quiz', stopthebus: 'Stop the Bus', imposter: 'Imposter', doodle: 'Doodle Bluff' };
  const league = {
    get() { try { return JSON.parse(localStorage.getItem('cwLeague')) || null; } catch (e) { return null; } },
    data() { return this.get() || { players: {}, gids: [], nights: [], since: Date.now() }; },
    save(d) { try { localStorage.setItem('cwLeague', JSON.stringify(d)); } catch (e) { /* storage full or blocked */ } },
    record(res) {
      const d = this.data();
      if (d.gids.includes(res.gid)) return;
      d.gids = d.gids.concat(res.gid).slice(-200);
      const top = Math.max(0, ...res.scores.map((x) => x.score));
      res.scores.forEach((x) => {
        const p = (d.players[x.name] = d.players[x.name] || { wins: 0, games: 0, points: 0, best: {} });
        p.games += 1;
        p.points += x.score;
        if (top > 0 && x.score === top) { p.wins += 1; p.best[res.gameId] = (p.best[res.gameId] || 0) + 1; }
        p.last = res.at;
      });
      this.save(d);
    },
    champion(names) {
      const d = this.data();
      const day = new Date().toISOString().slice(0, 10);
      d.nights = d.nights.filter((n) => n.day !== day).concat({ day, names }).slice(-60);
      this.save(d);
    },
    table() {
      const d = this.data();
      return Object.entries(d.players).map(([name, p]) => ({ name, ...p, nights: d.nights.filter((n) => n.names.includes(name)).length }))
        .sort((a, b) => b.wins - a.wins || b.nights - a.nights || b.points - a.points);
    },
  };

  socket.on('state', async (s) => {
    state = s;
    setNow(s.now);
    if (s.lastResult) league.record(s.lastResult);
    if (s.game && s.game.id === 'awards' && s.game.screen === 'finale') {
      const champ = s.game.all.find((a) => a.final);
      if (champ) league.champion(champ.winners.map((w) => w.name));
    }
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

  // ---------- look and sound per game ----------
  const THEME = { pubquiz: ['pub', 'pubquiz'], stopthebus: ['road', 'stopthebus'], imposter: ['spot', 'imposter'], storytime: ['night', 'storytime'], headtohead: ['arena', 'headtohead'], doodle: ['paper', 'doodle'], awards: ['stage', 'awards'] };
  // Screens that update the same "card" in place rather than moving to a new one.
  const SAME_CARD = { pubquiz: { reveal: 'question' }, headtohead: { battleResult: 'battle', finalResult: 'finalVote' }, stopthebus: { stopping: 'write' }, doodle: { pickReveal: 'pick' } };
  function cardKey(g) {
    if (!g) return 'lobby';
    const screen = (SAME_CARD[g.id] && SAME_CARD[g.id][g.screen]) || g.screen;
    const chaseN = g.chase && g.chase.n;
    return `${g.gid}|${screen}|${g.n || ''}|${chaseN && g.screen.startsWith('chase') ? chaseN : ''}|${g.battle ? g.battle.index : ''}|${g.round || ''}|${g.ci != null ? g.ci : ''}|${g.di != null ? g.di : ''}|${g.ai != null ? g.ai : ''}|${g.turn ? g.turn.id + g.pass : ''}`;
  }

  // Sounds on phase change.
  let lastCard = '';
  function cue(g) {
    const key = g ? `${cardKey(g)}|${g.screen}` : 'lobby';
    const card = cardKey(g);
    const newCard = card !== lastCard;
    lastCard = card;
    if (key === lastKey) return;
    lastKey = key;
    const [bg, tune] = g ? (g.id === 'pubquiz' && g.screen.startsWith('chase') ? ['night', 'chase'] : THEME[g.id] || ['party', 'lobby']) : ['party', 'lobby'];
    window.CW.scene(bg);
    window.CW.music(tune);
    window.CW.audio.duck(false);
    if (newCard && g && g.screen !== 'loading') window.CW.wipe();
    if (!g) return;
    const sc = g.screen;
    if (sc === 'chaseIntro') jingle([392, 392, 392, 311, 466, 392]);
    else if (sc === 'chaseReveal' && g.chase && g.chase.log && g.chase.log.caught.length) jingle([523, 415, 330, 262]);
    else if (g.id === 'awards' && sc === 'award') { window.CW.audio.duck(true); sfx.drumroll(2); sfx.fanfare(2.05); setTimeout(() => window.CW.confetti(g.award.final ? 220 : 90, { spread: 0.6 }), 2050); }
    else if (g.id === 'awards' && sc === 'intro') sfx.sting();
    else if (g.id === 'doodle' && sc === 'pickReveal') { g.reveal.forEach((o, i) => setTimeout(() => (o.truth ? sfx.ding() : sfx.pop()), 600 + i * 1700)); if (g.reveal.length) sfx.drumroll(0.6 + (g.reveal.length - 1) * 1.7); }
    else if (g.id === 'pubquiz' && sc === 'reveal') {
      window.CW.audio.duck(true);
      sfx.drumroll(1.2);
      if (g.results.some((r) => r.right)) sfx.ding(1.25); else sfx.wah(1.3);
    } else if (['over', 'results', 'finale'].includes(sc)) { sfx.fanfare(); setTimeout(() => window.CW.confetti(160, { spread: 1.2 }), 300); }
    else if (['scores', 'board', 'roundScores', 'scoresDraw'].includes(sc)) sfx.swoosh();
    else if (['reveal', 'battleResult', 'finalResult', 'votereveal', 'roundResult', 'pickReveal'].includes(sc)) { sfx.sting(); }
    else if (newCard) sfx.whoosh();
    else sfx.blip();
  }

  // ---------- top-level draw ----------
  function draw() {
    const s = state;
    const g = s.game;
    cue(g);
    $('.host-top .logo').innerHTML = `ARE YOU <b>SMARTER</b> THAN <b>${esc(s.crew.name.toUpperCase())}?</b>`;
    document.title = `Are You Smarter Than ${s.crew.name}?`;
    window.CW.gid = g ? g.gid : '';
    topRight.innerHTML = `
      <button class="btn small ghost" id="mus" title="Music">${musicOn ? '🎵' : '<s>🎵</s>'}</button>
      <button class="btn small ghost" id="snd" title="Sound">${sound ? '🔊' : '🔇'}</button>
      ${g ? `<span class="code-badge">Join at ${esc((joinInfo.base || '').replace(/^https?:\/\//, ''))} · <b>${s.code}</b></span>` : ''}`;
    $('#snd').onclick = () => { sound = !sound; window.CW.audio.sfxOn = sound; localStorage.setItem('cwSound', sound ? 'on' : 'off'); sfx.blip(); draw(); };
    $('#mus').onclick = () => { musicOn = !musicOn; window.CW.audio.musicOn = musicOn; localStorage.setItem('cwMusic', musicOn ? 'on' : 'off'); draw(); };

    if (!g) return drawLobby();
    if (g.id === 'pubquiz' && g.chase && (g.screen.startsWith('chase') || g.screen === 'over')) {
      drawChase(g);
      runTimers(main, g.deadline);
      return drawFoot(g);
    }
    const fn = VIEWS[g.id] && VIEWS[g.id][g.screen];
    const key = `${cardKey(g)}|${g.screen}`;
    if (g.screen === 'loading') render(main, `<div class="center"><div class="big-q wobble">✍️</div><p class="kicker" style="margin-top:3vh">${esc(g.loadingLabel || 'Loading…')}</p></div>`, key);
    else if (fn) render(main, fn(g, s), key);
    else render(main, `<p class="center dim">…</p>`, key);
    main.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => action('toggle', { pid: b.dataset.toggle })));
    if (g.id === 'storytime' && g.screen === 'reveal') storyReveal.mount(g);
    else storyReveal.stop();
    runTimers(main, g.deadline);
    drawFoot(g);
  }

  function drawFoot(g) {
    const canSkip = !['over', 'results', 'loading', 'finale'].includes(g.screen);
    const label = { write: 'Skip writing', finalWrite: 'Skip writing', question: 'Reveal answer', battle: 'End voting', finalVote: 'End voting', vote: 'End voting', reveal: g.id === 'storytime' ? 'Go to voting' : 'Next', chaseIntro: 'Start the chase', chaseQ: 'Reveal answer', stopping: 'Go to answers' }[g.screen] || 'Next';
    const impLabels = { reveal: 'Start clues', clue: 'Skip turn', discuss: 'Start voting', votereveal: 'Next', guess: 'Time up' };
    const label2 = g.id === 'stopthebus' && g.screen === 'write' ? 'Stop the bus now' : g.id === 'imposter' && impLabels[g.screen] ? impLabels[g.screen] : label;
    foot.innerHTML = `
      ${g.id === 'pubquiz' && g.screen === 'reveal' ? `<button class="btn small ghost" id="flag" ${g.flagged ? 'disabled' : ''}>${g.flagged ? 'Binned' : '👎 Bad question'}</button>` : ''}
      ${g.id === 'storytime' && g.screen === 'results' ? '<button class="btn small" id="again">Another story</button>' : ''}
      ${(g.screen === 'over' || g.screen === 'results') && g.id !== 'awards' ? '<button class="btn small teal" id="replay">Play again</button>' : ''}
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
    const players = s.players.map((p, i) => `
      <span class="avatar-chip pop ${p.connected ? '' : 'off'}" data-a="chip-${p.id}-${p.look}-${p.colour}">
        <span class="pic dance" style="--d:${(i % 5) * -0.37}s">${window.CW.avatar(p, 'idle')}</span>
        <span class="nm">${esc(p.name)}${p.id === s.vipId ? ' 👑' : ''}</span>
        <button class="x" data-kick="${p.id}" title="Remove">×</button>
      </span>`).join('');
    render(main, `
      <div class="lobby">
        <div class="stack"><div class="join-box stack ${league.table().length ? 'compact' : ''}">
          <div class="dim">Grab your phone and go to</div>
          <div style="font-size:1.6em;font-weight:700">${esc((joinInfo.base || '').replace(/^https?:\/\//, ''))}</div>
          <div class="dim">and enter the code</div>
          <div class="code">${s.code}</div>
          <div><img src="${joinInfo.qr}" alt="QR code to join"></div>
        </div>${leagueCard()}</div>
        <div class="stack">
          <div class="card">
            <div class="row" style="margin-bottom:12px"><b>Players (${s.players.length}/10)</b><span class="grow"></span><span class="dim" style="font-size:.8em">👑 = VIP, can start from their phone</span></div>
            <div class="players-grid" style="gap:14px">${players || '<span class="dim">Waiting for people to join…</span>'}</div>
          </div>
          <div class="card" id="picker">${window.CW.lobby.html(s)}</div>
        </div>
      </div>`, 'lobby');
    const lr = $('#leagueReset');
    if (lr) lr.onclick = () => { if (confirm('Wipe the all-time league table on this device?')) { localStorage.removeItem('cwLeague'); drawLobby(); } };
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
  const progress = (list, label = '') => crowd(list.map((p) => ({ ...p, state: p.done >= p.total ? 'done' : 'typing', note: label && p.total > 1 && p.done < p.total ? `${p.done}/${p.total}` : '' })));
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
    imposter: {
      reveal: (g) => `${timerBar()}
        <div class="kicker">IMPOSTER · ROUND ${g.round} OF ${g.rounds}</div>
        <div class="banner pop" style="font-size:3.4em">🤫 One of you is the imposter</div>
        <div class="imp-cat">Category: <b>${esc(g.category)}</b></div>
        <p class="center dim" style="font-size:1.2em">Check your phone in secret. Everyone has the word, apart from the imposter.</p>
        <div class="imp-row">${state.players.filter((p) => p.connected).map((p) => `<div class="imp-seat ${g.ready.includes(p.id) ? 'ready' : ''}"><div class="pic">${window.CW.avatar(p, g.ready.includes(p.id) ? 'happy' : 'idle')}</div><b>${esc(p.name)}</b><small>${g.ready.includes(p.id) ? 'ready' : 'looking…'}</small></div>`).join('')}</div>`,
      clue: (g) => `${timerBar()}
        <div class="kicker">IMPOSTER · ROUND ${g.round} OF ${g.rounds}${g.passes > 1 ? ` · CLUE ${g.pass} OF ${g.passes}` : ''}</div>
        <div class="imp-cat">Category: <b>${esc(g.category)}</b></div>
        <div class="big-q" style="margin:1vh 0 2vh;font-size:2em">${esc(g.turn.name)}, give us a clue…</div>
        ${impTable(g, g.turn.id)}`,
      discuss: (g) => `${timerBar()}
        <div class="banner pop">🗣️ DISCUSS! WHO'S THE IMPOSTER?</div>
        <div class="imp-cat">Category: <b>${esc(g.category)}</b></div>
        ${impTable(g)}`,
      vote: (g) => `${timerBar()}
        <div class="banner">🗳️ VOTE ON YOUR PHONE</div>
        <p class="center dim">${g.voted.length}/${state.players.filter((p) => p.connected).length} voted</p>
        ${impTable(g)}`,
      votereveal: (g) => `
        <div class="banner pop">${g.accused ? `THE GROUP ACCUSES ${esc(g.accused.name)}!` : "IT'S A TIE! NOBODY GETS THROWN OUT"}</div>
        <div class="imp-row" style="margin-top:3vh">${g.tally.map((t) => `
          <div class="imp-seat ${g.accused && g.accused.id === t.id ? 'accused' : ''}">
            <div class="pic">${window.CW.avatar(t, g.accused && g.accused.id === t.id ? 'scared' : 'idle')}</div>
            <b>${esc(t.name)}</b><span class="imp-votes">${t.votes} vote${t.votes === 1 ? '' : 's'}</span>
            <div class="voters">${t.voters.map((v) => `<span title="${esc(v.name)}" style="background:${v.colour}"></span>`).join('')}</div>
          </div>`).join('')}</div>
        <p class="center dim" style="font-size:1.3em;margin-top:3vh">But were they the imposter…?</p>`,
      guess: (g) => `${timerBar()}
        <div class="banner pop">🎯 ${esc(g.imposter.name)} WAS THE IMPOSTER!</div>
        <div style="width:10em;height:11em;margin:2vh auto">${window.CW.avatar(g.imposter, 'scared')}</div>
        <div class="big-q" style="font-size:2em">…but if they can guess the secret word, they steal the round!</div>
        <div class="imp-cat" style="margin-top:2vh">Category: <b>${esc(g.category)}</b></div>`,
      roundResult: (g) => {
        const headline = { escaped: `${esc(g.imposter.name)} GOT AWAY WITH IT! +300`, stole: `${esc(g.imposter.name)} GUESSED IT AND STOLE THE ROUND! +200`, caught: 'IMPOSTER CAUGHT! EVERYONE ELSE +100' }[g.outcome];
        return `<div class="kicker">THE SECRET WORD WAS</div>
          <div class="imp-word pop">${esc(g.word)}</div>
          <div class="row" style="justify-content:center;gap:2vw;margin:1vh 0">
            <div style="width:7em;height:7.7em">${window.CW.avatar(g.imposter, g.outcome === 'caught' ? 'ghost' : 'happy')}</div>
            <div><div class="kicker" style="text-align:left">THE IMPOSTER WAS ${esc(g.imposter.name)}</div>
            <div class="banner" style="font-size:1.8em;text-align:left">${headline}</div>
            ${g.guess ? `<div class="dim">Their guess: “${esc(g.guess)}”</div>` : ''}
            ${g.outcome === 'caught' ? '<div class="dim">+100 more for everyone who voted for them</div>' : ''}</div>
          </div>${scoreboard(g.scores)}`;
      },
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
    doodle: {
      draw: (g) => `${timerBar()}
        <div class="kicker">DOODLE BLUFF · ROUND ${g.round} OF ${g.rounds}</div>
        <div class="big-q" style="margin-top:2vh">✏️ Draw your secret prompt on your phone!</div>
        <p class="center dim" style="font-size:1.2em">Don't let anyone see it. Then we'll all make up fake titles for each other's drawings.</p>
        ${crowd(state.players.filter((p) => p.connected).map((p) => ({ ...p, state: g.done.includes(p.id) ? 'done' : 'typing' })))}`,
      lie: (g) => `${timerBar()}
        <div class="kicker">DRAWING ${g.di + 1} OF ${g.of}</div>
        <div class="dd-stage">${ddFrame(g)}
          <div class="dd-side">
            <div class="big-q" style="font-size:2.1em;text-align:left;margin:0">What on earth is this?</div>
            <p class="dim" style="font-size:1.15em">Write a <b style="color:var(--yellow)">fake title</b> on your phone that'll fool everyone. ${esc(g.artist.name)} drew it, so they sit this bit out.</p>
            ${crowd(state.players.filter((p) => p.connected && p.id !== g.artist.id).map((p) => ({ ...p, state: g.lied.includes(p.id) ? 'done' : 'typing' })), 'left')}
          </div></div>`,
      pick: (g) => `${timerBar()}
        <div class="kicker">DRAWING ${g.di + 1} OF ${g.of} · WHICH IS THE REAL TITLE?</div>
        <div class="dd-stage">${ddFrame(g)}
          <div class="dd-side"><div class="dd-opts ${g.options.length > 5 ? 'many' : ''}">${g.options.map((o, i) => `<div class="dd-opt" style="--i:${i}">${esc(o.text)}</div>`).join('')}</div>
          ${crowd(state.players.filter((p) => p.connected && p.id !== g.artist.id).map((p) => ({ ...p, state: g.picked.includes(p.id) ? 'done' : 'typing' })), 'left')}</div></div>`,
      pickReveal: (g) => `
        <div class="kicker">DRAWING ${g.di + 1} OF ${g.of}</div>
        <div class="dd-stage">${ddFrame(g)}
          <div class="dd-side"><div class="dd-opts ${g.reveal.length > 5 ? 'many' : ''}">${g.reveal.map((o, i) => `
            <div class="dd-rev ${o.truth ? 'truth' : ''}" style="--i:${i}">
              <div class="t">${esc(o.text)}</div>
              <div class="who">${o.truth ? `<b class="tag ok">THE REAL ONE</b> drawn by ${esc(g.artist.name)}` : `<b class="tag">FAKE</b> by ${o.authors.map((a) => esc(a.name)).join(' & ')}`}</div>
              <div class="pk">${o.pickers.length ? o.pickers.map((p) => `<span class="mini" title="${esc(p.name)}">${window.CW.avatar(p, o.truth ? 'happy' : 'sad')}</span>`).join('') : '<span class="dim">nobody</span>'}
                ${o.pickers.length ? `<span class="pts">${o.truth ? `+1000 each · ${esc(g.artist.name)} +${500 * o.pickers.length}` : `+${500 * o.pickers.length} to ${o.authors.map((a) => esc(a.name)).join(' & ')}`}</span>` : ''}</div>
            </div>`).join('')}</div></div></div>`,
      scores: (g) => `<div class="banner">${g.round < g.rounds ? `END OF ROUND ${g.round}` : 'FINAL SCORES'}</div>${scoreboard(g.scores)}`,
      over: (g) => winner(g.scores),
    },
    awards: {
      intro: () => `<div class="center">
        <div class="aw-trophy">🏆</div>
        <div class="banner pop" style="font-size:3.6em">THE END OF THE NIGHT AWARDS</div>
        <p class="dim" style="font-size:1.3em">Based on everything you got up to tonight…</p>
        ${crowd(state.players.filter((p) => p.connected).map((p) => ({ ...p, state: 'idle' })))}</div>`,
      award: (g) => {
        const a = g.award;
        return `<div class="center aw ${a.final ? 'final' : ''}">
          <div class="kicker">${a.final ? 'AND THE BIG ONE…' : `AWARD ${g.ai + 1} OF ${g.of - (g.of > 1 ? 1 : 0)}`}</div>
          <div class="aw-emoji">${a.emoji}</div>
          <div class="banner aw-title">${esc(a.title.toUpperCase())}</div>
          <div class="aw-drum dim">and it goes to…</div>
          <div class="aw-winners">${a.winners.map((w, i) => `<div class="aw-win" style="--i:${i}"><div class="pic">${window.CW.avatar(w, 'happy')}</div><div class="nm" style="color:${w.colour}">${esc(w.name)}</div></div>`).join('')}</div>
          <div class="aw-line">${esc(a.line)}</div></div>`;
      },
      finale: (g) => `<div class="banner pop">🏆 TONIGHT'S WINNERS 🏆</div>
        <div class="aw-grid">${g.all.filter((a) => !a.final).map(awCard).join('') || (g.all.length ? '' : '<p class="dim">Play a few games first!</p>')}</div>
        ${g.all.filter((a) => a.final).map((a) => awCard(a, g.all.length)).join('')}`,
    },
    pubquiz: {
      question: (g) => `${timerBar()}${quizBody(g, false)}`,
      reveal: (g) => quizBody(g, true),
      board: (g) => `<div class="banner">LEADERBOARD</div><p class="center dim">${g.n} of ${g.of} done</p>${scoreboard(g.scores)}`,
      over: (g) => winner(g.scores),
    },
  };

  // Each drawing "draws itself" the first time the TV shows it.
  const drawnOnce = new Set();
  function ddFrame(g) {
    const k = `${g.gid}-${g.round}-${g.di}`;
    const fresh = !drawnOnce.has(k);
    drawnOnce.add(k);
    return `<div class="dd-frame"><div class="dd-paper">${window.CW.drawingSvg(g.drawing, fresh ? 'draw-in' : '')}</div><div class="dd-by">by ${esc(g.artist.name)}</div></div>`;
  }

  const awCard = (a, i) => `<div class="aw-card ${a.final ? 'final' : ''}" style="--i:${i}">
    <div class="em">${a.emoji}</div><div class="t">${esc(a.title)}</div>
    <div class="ws">${a.winners.map((w) => `<span><span class="mini">${window.CW.avatar(w, 'happy')}</span>${esc(w.name)}</span>`).join('')}</div>
    <div class="l">${esc(a.line)}</div></div>`;

  function impTable(g, turnId) {
    return `<div class="imp-table">${g.table.map((p) => `
      <div class="imp-clue ${turnId === p.id ? 'turn' : ''} ${p.clues.length ? '' : 'waiting'}">
        <div class="pic">${window.CW.avatar(p, turnId === p.id ? 'scared' : 'idle')}</div>
        <div class="who">${esc(p.name)}</div>
        <div class="said">${p.clues.length ? p.clues.map((c) => `<span class="pop">${esc(c)}</span>`).join('') : (turnId === p.id ? '<span class="thinking">thinking…</span>' : '<span class="dim">—</span>')}</div>
      </div>`).join('')}</div>`;
  }

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
    const media = quizMedia(q);
    let body = '';
    if (q.kind === 'choice') {
      body = `<div class="answers4 ${reveal ? 'drum' : ''}">${q.options.map((o, i) => `
        <div class="ans ans-${i} ${reveal ? (i === g.correct ? 'right' : 'wrong') : ''}" style="--i:${i}">
          <span class="sh">${SHAPES[i]}</span>${esc(o)}${reveal ? `<span class="n">${g.counts[i]}</span>` : ''}
        </div>`).join('')}</div>`;
    } else if (reveal) {
      body = `<div class="typed-answer drum-in">${esc(g.answer)}</div>`;
    } else {
      body = '<p class="center dim" style="font-size:1.3em;margin-top:3vh">⌨️ Type your answer on your phone</p>';
    }
    let foot;
    if (reveal && q.kind === 'typed') {
      foot = g.results.length ? `<div class="guesses">${g.results.map((r, i) => `
        <button class="guess ${r.right ? 'ok' : 'no'} late" data-toggle="${r.id}" title="Tap to overrule" style="--i:${i}">
          <span class="mini">${window.CW.avatar(r, r.right ? 'happy' : 'sad')}</span><b>${esc(r.name)}</b> ${esc(r.text)}
          <span class="mark">${r.right ? `✓ +${r.gained}` : '✗'}${r.overruled ? ' (host)' : ''}</span>
        </button>`).join('')}</div><p class="center dim" style="font-size:.75em">Host: tap a guess to overrule the marking</p>`
        : '<span class="dim" style="font-size:1.3em">Nobody answered!</span>';
    } else if (reveal) {
      const res = Object.fromEntries(g.results.map((r) => [r.id, r]));
      const people = state.players.filter((p) => p.connected || res[p.id]);
      foot = `<div class="late-crowd">${crowd(people.map((p) => {
        const r = res[p.id];
        if (p.id === q.owner) return { ...p, state: 'idle', note: '📸 theirs' };
        return { ...p, state: !r ? 'asleep' : r.right ? 'right' : 'wrong', note: r && r.right ? `+${r.gained}` : '' };
      }))}</div>`;
    } else {
      const people = state.players.filter((p) => p.connected);
      foot = crowd(people.map((p) => (p.id === q.owner ? { ...p, state: 'idle', note: '📸 theirs' } : { ...p, state: g.answered.includes(p.id) ? 'done' : 'typing' })));
    }
    return `
      ${g.notice && g.n === 1 ? `<p class="center" style="color:var(--pink)">${esc(g.notice)}</p>` : ''}
      <div class="kicker">QUESTION ${g.n} OF ${g.of}${q.category ? ` · ${esc(q.category.toUpperCase())}` : ''}</div>
      <div class="big-q ${reveal ? '' : 'pop'} ${media ? 'with-media' : ''}" style="margin-top:2vh">${esc(q.q)}</div>
      ${media && q.kind === 'choice' ? `<div class="q-split">${media}${body}</div>` : `${media}${body}`}
      <div class="row" style="justify-content:center;margin-top:3vh;min-height:5em">${foot}</div>`;
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
    const topKey = `${g.screen}|${c.n || ''}`;
    top.classList.toggle('settled', top.dataset.k === topKey);
    top.dataset.k = topKey;

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
        <div class="chase-answers">${q.options.map((o, i) => `<div class="ans ans-${i} ${reveal ? (i === c.correct ? 'right' : 'wrong') : ''}" style="--i:${i}"><span class="sh">${SHAPES[i]}</span>${esc(o)}</div>`).join('')}</div>`;
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

  function leagueCard() {
    const t = league.table();
    if (!t.length) return '';
    const fav = (p) => { const e = Object.entries(p.best).sort((a, b) => b[1] - a[1])[0]; return e ? GAME_NAMES[e[0]] || '' : ''; };
    return `<div class="card league">
      <div class="row"><b>📈 All-time league</b><span class="grow"></span><button class="btn small ghost" id="leagueReset" title="Reset">Reset</button></div>
      <table><tr><th></th><th>Name</th><th title="Games won">Wins</th><th title="Champion of the Night">🏆</th><th>Played</th><th>Best at</th></tr>
      ${t.slice(0, 8).map((p, i) => `<tr class="${i === 0 ? 'lead' : ''}"><td>${i + 1}</td><td>${esc(p.name)}</td><td>${p.wins}</td><td>${p.nights || ''}</td><td>${p.games}</td><td class="dim">${esc(fav(p))}</td></tr>`).join('')}</table>
      <div class="dim" style="font-size:.7em;margin-top:6px">Kept on this TV/laptop. Use the same name each time to keep your record.</div></div>`;
  }

  function leagueLine() {
    const t = league.table();
    if (!t.length || !t[0].wins) return '';
    const lead = t[0];
    const tie = t.filter((p) => p.wins === lead.wins);
    return `<p class="league-line">📈 All-time league: ${tie.length > 1 ? `${tie.map((p) => esc(p.name)).join(' & ')} tied on` : `<b>${esc(lead.name)}</b> leads with`} ${lead.wins} win${lead.wins === 1 ? '' : 's'}</p>`;
  }

  function winner(scores) {
    const top = scores[0];
    return `<div class="center winner">
      <div class="kicker">AND THE WINNER IS…</div>
      <div class="win-hero">
        ${top ? `<div class="win-pic">${window.CW.avatar(top, 'happy')}</div>` : ''}
        <div class="banner win-name" style="font-size:4.5em;color:${top ? top.colour : 'var(--yellow)'}">${top ? esc(top.name) : '—'}</div>
      </div>
      ${scoreboard(scores)}${leagueLine()}</div>`;
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
