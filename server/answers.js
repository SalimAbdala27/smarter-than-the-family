'use strict';
// Forgiving matcher for typed quiz answers: ignores case, accents, punctuation, "the/a",
// number words, and allows small typos (scaled to answer length).

const NUMS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/).filter(Boolean)
    .map((w) => { const i = NUMS.indexOf(w); return i >= 0 ? String(i) : w; })
    .filter((w, i, a) => !(i === 0 && a.length > 1 && ['the', 'a', 'an'].includes(w)))
    .join(' ');
}

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length; const n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

const slack = (len) => (len <= 3 ? 0 : len <= 6 ? 1 : len <= 11 ? 2 : 3);

function isCorrect(guess, accepted) {
  const g = norm(guess);
  if (!g) return false;
  const gs = g.replace(/ /g, '');
  for (const a of accepted) {
    const t = norm(a);
    const ts = t.replace(/ /g, '');
    if (g === t || gs === ts) return true;
    // Numbers must be exact.
    if (/^\d+$/.test(ts) || /^\d+$/.test(gs)) continue;
    if (lev(gs, ts) <= slack(ts.length)) return true;
  }
  return false;
}

module.exports = { isCorrect, norm };
