/* Cartoon characters. Every player gets one, picked from their id so it never changes mid-game.
   CW.avatar(player, mood)  mood: idle | run | scared | happy | ghost
   CW.family(mood)          The Family (Dad, Mum and Nan), the Final Chase baddies. mood: stomp | gloat | sulk */
(function () {
  const INK = '#14112b';
  const hash = (s) => String(s || '').split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

  const BODIES = [
    { top: 22, d: 'M50 22 C78 22 88 45 86 66 C84 86 70 92 50 92 C30 92 16 86 14 66 C12 45 22 22 50 22 Z' }, // blob
    { top: 14, d: 'M50 14 C66 14 76 22 76 40 L76 66 C76 84 66 92 50 92 C34 92 24 84 24 66 L24 40 C24 22 34 14 50 14 Z' }, // bean
    { top: 26, d: 'M30 26 L70 26 C78 26 82 30 82 38 L82 80 C82 88 78 92 70 92 L30 92 C22 92 18 88 18 80 L18 38 C18 30 22 26 30 26 Z' }, // box
    { top: 20, d: 'M50 20 C64 20 68 36 70 48 C84 56 88 72 84 82 C80 90 68 92 50 92 C32 92 20 90 16 82 C12 72 16 56 30 48 C32 36 36 20 50 20 Z' }, // pear
  ];
  const GHOST = 'M22 50 C22 28 36 20 50 20 C64 20 78 28 78 50 L78 92 L70 85 L62 92 L54 85 L46 92 L38 85 L30 92 L22 85 Z';
  const HAT_COLOURS = ['#14112b', '#fff8ec', '#ff5d73', '#4cc9f0', '#ffd23f', '#3ddc97'];

  const ACCESSORIES = [
    () => '',
    (c) => `<path d="M28 30 Q50 4 72 30 Z" fill="${c}" stroke="${INK}" stroke-width="3"/><rect x="26" y="27" width="48" height="8" rx="4" fill="#fff8ec" stroke="${INK}" stroke-width="3"/><circle cx="50" cy="9" r="6" fill="#fff8ec" stroke="${INK}" stroke-width="3"/>`, // bobble hat
    (c) => `<path d="M28 31 Q50 8 72 31 Z" fill="${c}" stroke="${INK}" stroke-width="3"/><path d="M66 29 L90 31 Q88 36 70 35 Z" fill="${c}" stroke="${INK}" stroke-width="3"/>`, // cap
    () => `<path d="M31 30 L34 11 L43 22 L50 6 L57 22 L66 11 L69 30 Z" fill="#ffd23f" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`, // crown
    (c) => `<path d="M22 56 Q22 12 50 12 Q78 12 78 56" fill="none" stroke="${INK}" stroke-width="5"/><rect x="14" y="46" width="12" height="20" rx="5" fill="${c}" stroke="${INK}" stroke-width="3"/><rect x="74" y="46" width="12" height="20" rx="5" fill="${c}" stroke="${INK}" stroke-width="3"/>`, // headphones
    () => `<rect x="36" y="2" width="28" height="22" rx="3" fill="${INK}"/><rect x="28" y="22" width="44" height="6" rx="3" fill="${INK}"/><rect x="36" y="16" width="28" height="4" fill="#ff5d73"/>`, // top hat
    () => '', // no hat, but glasses (drawn with the face)
  ];

  function face(mood, glasses) {
    let eyes;
    let mouth;
    if (mood === 'happy') {
      eyes = `<path d="M34 54 Q40 46 46 54" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/><path d="M54 54 Q60 46 66 54" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`;
      mouth = `<path d="M38 64 Q50 80 62 64 Z" fill="#7a1f35" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
    } else if (mood === 'scared') {
      eyes = `<circle cx="40" cy="52" r="8" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="60" cy="52" r="8" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="38" cy="52" r="2" fill="${INK}"/><circle cx="58" cy="52" r="2" fill="${INK}"/>`;
      mouth = `<ellipse cx="50" cy="72" rx="6" ry="8" fill="#7a1f35" stroke="${INK}" stroke-width="3"/>`;
    } else if (mood === 'ghost') {
      eyes = `<ellipse cx="40" cy="52" rx="4.5" ry="6.5" fill="${INK}"/><ellipse cx="60" cy="52" rx="4.5" ry="6.5" fill="${INK}"/>`;
      mouth = `<ellipse cx="50" cy="69" rx="4" ry="5" fill="${INK}"/>`;
    } else {
      const look = mood === 'run' ? 2.5 : 0;
      eyes = `<circle cx="40" cy="52" r="7" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="60" cy="52" r="7" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="${40 + look}" cy="53" r="3.2" fill="${INK}"/><circle cx="${60 + look}" cy="53" r="3.2" fill="${INK}"/>`;
      mouth = mood === 'run'
        ? `<path d="M42 68 Q50 64 58 68" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`
        : `<path d="M42 66 Q50 74 58 66" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`;
    }
    const cheeks = mood === 'ghost' ? '' : '<circle cx="30" cy="63" r="4.5" fill="#ff8fab" opacity=".55"/><circle cx="70" cy="63" r="4.5" fill="#ff8fab" opacity=".55"/>';
    const specs = glasses && mood !== 'ghost' ? `<g fill="none" stroke="${INK}" stroke-width="3"><circle cx="40" cy="52" r="10"/><circle cx="60" cy="52" r="10"/><path d="M50 52 L50 52"/></g>` : '';
    return cheeks + eyes + specs + mouth;
  }

  function avatar(p, mood = 'idle', cls = '') {
    const h = hash(p.id || p.name);
    const body = BODIES[h % BODIES.length];
    const accIndex = (h >>> 3) % ACCESSORIES.length;
    const hat = HAT_COLOURS[(h >>> 6) % HAT_COLOURS.length];
    const ghost = mood === 'ghost';
    const shift = `translate(0 ${body.top - 22})`;
    const legs = ghost ? '' : `
      <g class="leg l"><rect x="35" y="84" width="9" height="18" rx="4.5" fill="${p.colour}" stroke="${INK}" stroke-width="3"/><ellipse cx="38" cy="104" rx="8" ry="4.5" fill="${INK}"/></g>
      <g class="leg r"><rect x="56" y="84" width="9" height="18" rx="4.5" fill="${p.colour}" stroke="${INK}" stroke-width="3"/><ellipse cx="62" cy="104" rx="8" ry="4.5" fill="${INK}"/></g>`;
    const arms = ghost ? '' : mood === 'happy' || mood === 'scared'
      ? `<path d="M18 60 L6 40" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M82 60 L94 40" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`
      : `<path class="arm l" d="M18 64 L8 74" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path class="arm r" d="M82 64 L92 72" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`;
    return `<svg class="av ${mood} ${cls}" viewBox="0 -4 100 114" aria-label="${(p.name || '').replace(/"/g, '')}">
      ${legs}${arms}
      <g class="bod">
        <path d="${ghost ? GHOST : body.d}" fill="${ghost ? '#e9e4ff' : p.colour}" stroke="${INK}" stroke-width="3.5" ${ghost ? 'opacity=".75"' : ''}/>
        ${ghost ? '' : '<ellipse cx="36" cy="38" rx="7" ry="4" fill="#fff" opacity=".35" transform="rotate(-30 36 38)"/>'}
        ${face(mood, accIndex === ACCESSORIES.length - 1)}
        ${ghost ? '' : `<g transform="${shift}">${ACCESSORIES[accIndex](hat)}</g>`}
      </g>
    </svg>`;
  }

  // The Family: Dad (flat cap and tache), Mum (curlers and rolling pin), Nan (specs and handbag).
  function family(mood = 'stomp') {
    const eye = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="5" ry="6" fill="#ffd23f"/><circle cx="${x + 1}" cy="${y + 1}" r="2.2" fill="#14112b"/>`;
    const brow = (x, y, flip) => (mood === 'sulk'
      ? `<path d="M${x - 7} ${y + (flip ? 2 : -2)} L${x + 7} ${y + (flip ? -2 : 2)}" stroke="#0b0716" stroke-width="4" stroke-linecap="round"/>`
      : `<path d="M${x - 7} ${y + (flip ? -3 : 3)} L${x + 7} ${y + (flip ? 3 : -3)}" stroke="#0b0716" stroke-width="4" stroke-linecap="round"/>`);
    const grin = (x, y, w) => (mood === 'sulk'
      ? `<path d="M${x - w} ${y + 4} Q${x} ${y - 4} ${x + w} ${y + 4}" fill="none" stroke="#0b0716" stroke-width="4" stroke-linecap="round"/>`
      : `<path d="M${x - w} ${y} Q${x} ${y + w} ${x + w} ${y} Z" fill="#fff8ec" stroke="#0b0716" stroke-width="3"/><path d="M${x - w / 2} ${y + 1} L${x - w / 2} ${y + w / 2.4} M${x} ${y + 1} L${x} ${y + w / 2} M${x + w / 2} ${y + 1} L${x + w / 2} ${y + w / 2.4}" stroke="#0b0716" stroke-width="2"/>`);
    const feet = (x, w) => `<g class="foot l"><rect x="${x}" y="226" width="${w}" height="22" rx="7" fill="#0b0716"/></g><g class="foot r"><rect x="${x + w + 8}" y="226" width="${w}" height="22" rx="7" fill="#0b0716"/></g>`;
    return `<svg class="family ${mood}" viewBox="0 0 300 260" aria-label="The Family">
      <ellipse cx="150" cy="250" rx="140" ry="10" fill="#000" opacity=".35"/>
      <!-- Dad -->
      <g class="dad">
        ${feet(40, 22)}
        <path d="M30 70 C30 40 50 30 72 30 C94 30 112 40 112 70 L112 210 C112 228 100 234 72 234 C44 234 30 228 30 210 Z" fill="#3b1a4f" stroke="#0b0716" stroke-width="5"/>
        <path d="M24 52 Q72 18 118 52 L120 60 Q72 44 22 60 Z" fill="#5b5048" stroke="#0b0716" stroke-width="4"/>
        <path d="M110 56 L136 62 L112 66 Z" fill="#5b5048" stroke="#0b0716" stroke-width="4"/>
        ${eye(58, 86)}${eye(88, 86)}${brow(58, 74, false)}${brow(88, 74, true)}
        <path d="M50 108 Q60 100 72 106 Q84 100 96 108 Q84 116 72 110 Q60 116 50 108 Z" fill="#1a0c22"/>
        ${grin(72, 122, 14)}
      </g>
      <!-- Mum -->
      <g class="mum">
        ${feet(124, 20)}
        <path d="M110 100 C110 70 128 62 150 62 C172 62 190 70 190 100 L194 214 C194 230 178 236 150 236 C122 236 106 230 106 214 Z" fill="#561f5e" stroke="#0b0716" stroke-width="5"/>
        <circle cx="124" cy="66" r="10" fill="#ff8fab" stroke="#0b0716" stroke-width="4"/><circle cx="146" cy="56" r="10" fill="#ff8fab" stroke="#0b0716" stroke-width="4"/><circle cx="168" cy="60" r="10" fill="#ff8fab" stroke="#0b0716" stroke-width="4"/><circle cx="184" cy="74" r="9" fill="#ff8fab" stroke="#0b0716" stroke-width="4"/>
        ${eye(136, 112)}${eye(164, 112)}${brow(136, 100, false)}${brow(164, 100, true)}
        ${grin(150, 136, 12)}
        <g class="pin"><rect x="176" y="140" width="62" height="16" rx="8" fill="#c9965f" stroke="#0b0716" stroke-width="4" transform="rotate(-38 190 150)"/><rect x="226" y="98" width="16" height="8" rx="4" fill="#c9965f" stroke="#0b0716" stroke-width="3" transform="rotate(-38 234 102)"/></g>
      </g>
      <!-- Nan -->
      <g class="nan">
        ${feet(206, 18)}
        <path d="M196 150 C196 128 212 120 234 120 C256 120 272 128 272 150 L276 220 C276 234 262 238 234 238 C206 238 192 234 192 220 Z" fill="#6e3a7a" stroke="#0b0716" stroke-width="5"/>
        <circle cx="234" cy="114" r="14" fill="#c8c3d8" stroke="#0b0716" stroke-width="4"/>
        <path d="M200 138 Q234 116 268 138" fill="#c8c3d8" stroke="#0b0716" stroke-width="4"/>
        ${eye(222, 160)}${eye(246, 160)}
        <g fill="none" stroke="#0b0716" stroke-width="3.5"><circle cx="222" cy="160" r="10"/><circle cx="246" cy="160" r="10"/><path d="M232 160 L236 160"/></g>
        ${grin(234, 182, 10)}
        <g class="bag"><path d="M262 186 Q276 166 290 186" fill="none" stroke="#0b0716" stroke-width="4"/><rect x="258" y="186" width="36" height="28" rx="6" fill="#ffd23f" stroke="#0b0716" stroke-width="4"/></g>
      </g>
    </svg>`;
  }

  window.CW.avatar = avatar;
  window.CW.family = family;
}());
