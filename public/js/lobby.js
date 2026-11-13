/* Game picker shared by the host screen and the VIP's phone. */
(function () {
  const { esc } = window.CW;
  const pick = { gameId: null, options: { categories: [], count: 15, custom: '', fresh: false, chase: true } };

  function html(state) {
    const games = state.games;
    if (!pick.gameId) pick.gameId = state.lastGameId || games[0].id;
    const n = state.players.filter((p) => p.connected).length;
    const g = games.find((x) => x.id === pick.gameId);
    const o = pick.options;
    let opts = '';
    if (g.id === 'pubquiz') {
      opts += `<div class="opts">${g.categories.map((c) => `<button class="toggle ${o.categories.includes(c.id) ? 'on' : ''}" data-cat="${c.id}">${c.emoji} ${esc(c.name)}</button>`).join('')}</div>
        <div class="opts dim" style="font-size:.85em">${o.categories.length ? '' : 'No genres picked = a bit of everything'}</div>
        <div class="opts"><button class="toggle ${o.chase ? 'on' : ''}" data-chase="1">🏃 Final Chase at the end</button></div>
        <div class="opts">${[10, 15, 20, 30].map((c) => `<button class="toggle ${o.count === c ? 'on' : ''}" data-count="${c}">${c} questions</button>`).join('')}</div>`;
      if (state.ai) {
        opts += `<div class="opts" style="width:100%"><input class="field" data-key="custom" id="customTopic" maxlength="60" placeholder="Or type any genre… e.g. 90s Premier League" value="${esc(o.custom)}"></div>`;
      }
    }
    if (state.ai) {
      opts += `<div class="opts"><button class="toggle ${o.fresh ? 'on' : ''}" data-fresh="1">✨ Fresh content from Claude</button></div>`;
    }
    const need = g.minPlayers;
    return `
      <div class="games">
        ${games.map((x) => `
          <button class="game-card ${x.id === pick.gameId ? 'sel' : ''}" data-game="${x.id}">
            <h3>${esc(x.name)}</h3><p>${esc(x.tagline)} · ${x.minPlayers}+ players</p>
          </button>`).join('')}
      </div>
      ${opts}
      <div style="margin-top:16px">
        <button class="btn block" data-start ${n < need ? 'disabled' : ''}>
          ${n < need ? `Need ${need - n} more player${need - n > 1 ? 's' : ''}` : `Everybody's in — start ${esc(g.name)}`}
        </button>
      </div>`;
  }

  // Wire clicks inside root. `send(type, data)` performs the room action; `rerender()` redraws.
  function bind(root, send, rerender) {
    root.querySelectorAll('[data-game]').forEach((b) => b.addEventListener('click', () => { pick.gameId = b.dataset.game; rerender(); }));
    root.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
      const c = b.dataset.cat; const cs = pick.options.categories;
      pick.options.categories = cs.includes(c) ? cs.filter((x) => x !== c) : cs.concat(c);
      rerender();
    }));
    root.querySelectorAll('[data-count]').forEach((b) => b.addEventListener('click', () => { pick.options.count = Number(b.dataset.count); rerender(); }));
    root.querySelectorAll('[data-chase]').forEach((b) => b.addEventListener('click', () => { pick.options.chase = !pick.options.chase; rerender(); }));
    root.querySelectorAll('[data-fresh]').forEach((b) => b.addEventListener('click', () => { pick.options.fresh = !pick.options.fresh; rerender(); }));
    const ct = root.querySelector('#customTopic');
    if (ct) ct.addEventListener('input', () => { pick.options.custom = ct.value; });
    const st = root.querySelector('[data-start]');
    if (st) st.addEventListener('click', () => send('start', { gameId: pick.gameId, options: { ...pick.options, custom: pick.options.custom.trim() } }));
  }

  window.CW.lobby = { html, bind, pick };
}());
