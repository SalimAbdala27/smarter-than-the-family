/* Shared helpers for host + phone screens. */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const SHAPES = ['▲', '●', '■', '◆'];

  // Server and client clocks differ; track the offset from each state's `now`.
  let offset = 0;
  const setNow = (serverNow) => { if (serverNow) offset = serverNow - Date.now(); };
  const now = () => Date.now() + offset;

  // Animated countdown bar + seconds. Call after each render.
  let raf = null;
  function runTimers(root, deadline, totalGuessMs) {
    cancelAnimationFrame(raf);
    const bars = root.querySelectorAll('[data-timer]');
    const secs = root.querySelectorAll('[data-secs]');
    if (!deadline) { bars.forEach((b) => b.classList.add('hidden')); secs.forEach((s) => { s.textContent = ''; }); return; }
    const start = now();
    const total = Math.max(1000, totalGuessMs || deadline - start);
    const tick = () => {
      const left = Math.max(0, deadline - now());
      bars.forEach((b) => { b.classList.remove('hidden'); b.firstElementChild.style.transform = `scaleX(${Math.min(1, left / total)})`; });
      secs.forEach((s) => { s.textContent = Math.ceil(left / 1000); });
      if (left > 0) raf = requestAnimationFrame(tick);
    };
    tick();
  }

  // Re-rendering on every state update would wipe whatever someone is typing,
  // so carry input values, focus and caret across renders.
  function render(root, html) {
    const saved = {};
    root.querySelectorAll('input[data-key], textarea[data-key]').forEach((el) => { saved[el.dataset.key] = el.value; });
    const active = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null;
    const caret = active ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    root.innerHTML = html;
    root.querySelectorAll('input[data-key], textarea[data-key]').forEach((el) => {
      if (saved[el.dataset.key] != null) el.value = saved[el.dataset.key];
      if (el.dataset.key === active) { el.focus(); try { el.setSelectionRange(caret[0], caret[1]); } catch (e) { /* number inputs */ } }
    });
  }

  function scoreboard(scores) {
    return `<div class="board">${scores.map((s, i) => `
      <div class="rowp rise" style="animation-delay:${i * 70}ms">
        <span class="rk">${i + 1}</span>
        ${window.CW.avatar ? `<span class="mini">${window.CW.avatar(s, i === 0 ? 'happy' : 'idle')}</span>` : `<span style="color:${s.colour}">●</span>`} ${esc(s.name)}
        <span class="sc">${s.score}</span>
      </div>`).join('')}</div>`;
  }

  // Tiny synth so the host screen can beep without any audio files.
  let ctx = null;
  function beep(freq = 660, dur = 0.12, type = 'triangle', vol = 0.15) {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.connect(g).connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + dur);
    } catch (e) { /* no audio */ }
  }
  const jingle = (notes) => notes.forEach((f, i) => setTimeout(() => beep(f, 0.14), i * 110));

  window.CW = { esc, $, SHAPES, setNow, now, runTimers, render, scoreboard, beep, jingle };
}());
