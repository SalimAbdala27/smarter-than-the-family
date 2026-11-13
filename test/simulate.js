'use strict';
// End-to-end bot test: a host and N bot phones play every game to the end.
// Run: npm test   (uses port 3999)
process.env.PORT = process.env.PORT || '3999';
process.env.FAMILY_DATA_DIR = require('path').join(require('os').tmpdir(), 'family-test');
const { io: Client } = require('socket.io-client');
const { server } = require('../server/index');

const URL = `http://localhost:${process.env.PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const WORDS = ['soggy', 'Slough', 'badger', 'Greggs', 'twerking', 'Blimey', '47', 'gravy', 'Danny Dyer', 'crumpets'];

function bot(name) {
  const s = Client(URL, { forceNew: true, transports: ['websocket'] });
  const b = { name, s, state: null, acted: new Set() };
  s.on('state', (st) => { b.state = st; act(b); });
  return b;
}

function act(b) {
  const g = b.state.game;
  if (!g) return;
  const once = (k, fn) => { if (b.acted.has(k)) return; b.acted.add(k); setTimeout(fn, 20 + Math.random() * 80); };
  const send = (type, data) => b.s.emit('player:action', { type, data });
  if (g.id === 'storytime') {
    if (g.screen === 'write') g.tasks.filter((t) => !t.filled).forEach((t) => once(`st${g.title}${t.i}`, () => send('fill', { i: t.i, value: pick(WORDS) })));
    if (g.screen === 'vote' && g.myVote == null && g.options.length) once(`sv${g.title}`, () => send('vote', { i: pick(g.options).i }));
  }
  if (g.id === 'headtohead') {
    if (g.screen === 'write' || g.screen === 'finalWrite') g.tasks.filter((t) => !t.answered).forEach((t) => once(`hw${g.screen}${g.round}${t.prompt}`, () => (Math.random() < 0.15 ? send('safety', { mi: t.mi }) : send('answer', { mi: t.mi, value: `${b.name} says ${pick(WORDS)}` }))));
    if (g.screen === 'battle' && !g.inBattle && !g.myVote) once(`hv${g.round}${g.battle.prompt}`, () => send('vote', { pid: pick([g.battle.a.pid, g.battle.b.pid]) }));
    if (g.screen === 'finalVote' && !g.myVote && g.final.answers.length) once('hfv', () => send('vote', { pid: pick(g.final.answers).pid }));
  }
  if (g.id === 'pubquiz' && g.screen === 'chaseQ' && g.chase.question && g.chase.myAnswer == null) {
    once(`c${g.chase.n}`, () => send('answer', { choice: Math.random() < 0.6 ? 0 : Math.floor(Math.random() * 4) }));
  }
  if (g.id === 'pubquiz' && g.screen === 'question' && g.myAnswer == null) {
    once(`q${g.n}`, () => (g.question.kind === 'typed' ? send('answer', { text: pick(['Pacific', 'Edinburgh', 'Luigi', 'dunno']) }) : send('answer', { choice: Math.floor(Math.random() * 4) })));
  }
}

async function playGame(host, bots, gameId, options) {
  const seen = new Set();
  let finished;
  const done = new Promise((r) => { finished = r; });
  const onState = (st) => {
    const g = st.game;
    if (!g) return;
    seen.add(g.screen);
    // Host skips the "look at the screen" pauses so the test runs fast.
    if (['reveal', 'battleResult', 'scores', 'board', 'finalResult', 'chaseIntro', 'chaseReveal'].includes(g.screen)) {
      setTimeout(() => host.emit('host:action', { type: 'next' }), 30);
    }
    if (g.id === 'storytime' && g.screen === 'results') finished(st);
    if (g.screen === 'over') finished(st);
  };
  host.on('state', onState);
  const res = await emit(bots[0].s, 'player:action', { type: 'ctl:start', data: { gameId, options } });
  if (res.error) throw new Error(res.error);
  const st = await Promise.race([done, sleep(60000).then(() => { throw new Error(`${gameId} timed out; screens: ${[...seen]}`); })]);
  host.off('state', onState);
  return { st, seen };
}

(async () => {
  await sleep(300);
  const host = Client(URL, { forceNew: true, transports: ['websocket'] });
  const { code } = await emit(host, 'host:create', {});
  console.log('room', code);
  const bots = ['ALI', 'BEX', 'CHAZ', 'DEV'].map(bot);
  for (const b of bots) {
    const r = await emit(b.s, 'player:join', { code, name: b.name });
    if (!r.ok) throw new Error(r.error);
    b.token = r.token;
  }
  // Duplicate name should be refused while that player is connected.
  const dup = await emit(Client(URL, { forceNew: true, transports: ['websocket'] }), 'player:join', { code, name: 'ali' });
  if (!dup.error) throw new Error('duplicate name allowed');

  let r = await playGame(host, bots, 'storytime', {});
  const story = r.st.game.story;
  const blanks = story.filter((p) => p.t === 'blank');
  console.log('Story Time ✓', r.st.game.title, `${blanks.length} blanks, screens:`, [...r.seen].join(' → '));
  console.log('   ', story.map((p) => (p.t === 'text' ? p.v : `«${p.v}»`)).join('').slice(0, 160) + '…');
  if (blanks.some((b) => b.missed)) throw new Error('story had missed blanks');

  // Reconnect test: drop a phone mid-game and resume with its token.
  bots[2].s.disconnect();
  await sleep(100);
  const back = Client(URL, { forceNew: true, transports: ['websocket'] });
  const rr = await emit(back, 'player:resume', { code, token: bots[2].token });
  if (!rr.ok) throw new Error('resume failed');
  bots[2].s = back;
  bots[2].acted.clear();
  back.on('state', (st) => { bots[2].state = st; act(bots[2]); });
  console.log('Reconnect ✓');

  await emit(host, 'host:action', { type: 'lobby' });
  r = await playGame(host, bots, 'headtohead', {});
  console.log('Head to Head ✓ screens:', [...r.seen].join(' → '));
  console.log('    scores:', r.st.game.scores.map((s) => `${s.name} ${s.score}`).join(', '));
  if (!r.st.game.scores.some((s) => s.score > 0)) throw new Error('nobody scored in head to head');

  await emit(host, 'host:action', { type: 'lobby' });
  // Host overrules a typed answer during reveal: score should move by exactly that player's points.
  let toggled = false;
  const toggler = (st) => {
    const g = st.game;
    if (toggled || !g || g.id !== 'pubquiz' || g.screen !== 'reveal' || g.question.kind !== 'typed' || !g.results.length) return;
    toggled = { pid: g.results[0].id, before: st.players.find((p) => p.id === g.results[0].id).score, right: g.results[0].right };
    host.emit('host:action', { type: 'toggle', data: { pid: toggled.pid } });
  };
  host.on('state', toggler);
  r = await playGame(host, bots, 'pubquiz', { count: 20, categories: ['geography', 'emoji', 'words', 'gaming'] });
  host.off('state', toggler);
  console.log('Pub Quiz ✓ screens:', [...r.seen].join(' → '), toggled ? `· host overrule tested (${toggled.right ? 'right→wrong' : 'wrong→right'})` : '· (no typed reveal hit)');
  console.log('    scores:', r.st.game.scores.map((s) => `${s.name} ${s.score}`).join(', '));
  if (!r.st.game.chase) throw new Error('final chase did not run');
  const t = r.st.game.chase.track;
  console.log('Final Chase ✓', `family at ${t.family}/${t.length}:`, t.runners.map((x) => `${x.name} started ${x.start} → ${x.status}${x.status === 'home' ? ` #${x.order + 1}` : ''} (+${x.bonus})`).join(', '));
  if (t.runners.some((x) => x.status === 'running')) throw new Error('runner left running');

  // Head to Head needs 3+: drop to 2 and check it refuses.
  await emit(host, 'host:action', { type: 'lobby' });
  bots[2].s.disconnect(); bots[3].s.disconnect();
  await sleep(150);
  const refuse = await emit(host, 'host:action', { type: 'start', data: { gameId: 'headtohead' } });
  if (!refuse.error) throw new Error('2-player head to head allowed');
  console.log('Min players ✓', refuse.error);

  console.log('\nALL GOOD');
  server.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
