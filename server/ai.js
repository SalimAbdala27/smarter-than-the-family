'use strict';
// Optional Claude-powered content. Set ANTHROPIC_API_KEY to switch it on.
// Everything generated is validated, then saved to data/generated.json so the
// built-in bank grows over time and still works offline. Any failure → caller falls back to the bank.
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.CHINWAG_MODEL || 'claude-haiku-5-5';
const TIMEOUT_MS = Number(process.env.CHINWAG_AI_TIMEOUT_MS) || 30000;
const DATA_DIR = process.env.CHINWAG_DATA_DIR || path.join(__dirname, '..', 'data');
const GEN_FILE = path.join(DATA_DIR, 'generated.json');

const AUDIENCE = 'The players are a group of friends in their twenties and thirties in the UK. '
  + 'Use British spelling and British cultural references (UK TV, football, food, places, slang). '
  + 'Avoid US-centric content unless it is genuinely global.';

// ---------- persistent store ----------
let store = { quiz: {}, prompts: [], finals: [], stories: [], banned: [] };
try { store = { ...store, ...JSON.parse(fs.readFileSync(GEN_FILE, 'utf8')) }; } catch { /* first run */ }

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(GEN_FILE, JSON.stringify(store, null, 1));
    } catch (e) { console.warn('[ai] could not save generated content:', e.message); }
  }, 500);
}

const banned = () => new Set(store.banned);
const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function remember(bucket, items, sub) {
  const list = sub ? (store.quiz[sub] = store.quiz[sub] || []) : store[bucket];
  const have = new Set(list.map((x) => key(Array.isArray(x) ? x[0] : x.text || x)));
  for (const it of items) {
    const k = key(Array.isArray(it) ? it[0] : it.text || it);
    if (!have.has(k)) { list.push(it); have.add(k); }
  }
  save();
}

function ban(text) {
  if (!text || store.banned.includes(text)) return;
  store.banned.push(text);
  for (const sub of Object.keys(store.quiz)) store.quiz[sub] = store.quiz[sub].filter((q) => `${q[0]}|${Array.isArray(q[1]) ? q[1][0] : q[1]}` !== text);
  save();
}

// ---------- API ----------
async function ask(system, prompt, maxTokens = 2500) {
  if (!API_KEY) throw new Error('No ANTHROPIC_API_KEY');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const text = (body.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    return JSON.parse(json);
  } finally {
    clearTimeout(t);
  }
}

const str = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;

// ---------- generators ----------
async function quiz(topics, count, avoid = []) {
  const system = `You write pub quiz questions. ${AUDIENCE} Every fact must be well established and stable: `
    + 'avoid anything that changes often (current office holders, records likely to be broken, recent results) and anything disputed. '
    + 'Mix easy, medium and hard. Respond with JSON only.';
  const prompt = `Write ${count} questions spread across these topics: ${topics.join('; ')}.\n`
    + 'About 60% should be multiple choice (type "choice": one correct answer and three plausible but definitely wrong options) '
    + 'and 40% typed (type "typed": short answers a player can type, one to three words, with common alternative spellings or forms in "accept").\n'
    + (avoid.length ? `Do not repeat any of these questions:\n- ${avoid.slice(-60).join('\n- ')}\n` : '')
    + 'Return {"questions":[{"topic":"<one of the topics>","type":"choice","q":"...","correct":"...","wrong":["...","...","..."]},'
    + '{"topic":"...","type":"typed","q":"...","correct":"...","accept":["alternative"]}]}. '
    + 'Keep questions under 140 characters and answers under 40.';
  const out = await ask(system, prompt, 300 + count * 150);
  const no = banned();
  const rows = [];
  for (const x of out.questions || []) {
    if (!x || !str(x.q, 200) || !str(x.correct, 60) || no.has(`${x.q}|${x.correct}`)) continue;
    if (x.type === 'typed') {
      const acc = (Array.isArray(x.accept) ? x.accept : []).filter((a) => str(a, 60)).map((a) => a.trim());
      rows.push({ topic: x.topic, row: [x.q.trim(), [x.correct.trim(), ...acc]] });
    } else if (Array.isArray(x.wrong) && x.wrong.length === 3 && x.wrong.every((w) => str(w, 60))
      && new Set([x.correct, ...x.wrong].map(key)).size === 4) {
      rows.push({ topic: x.topic, row: [x.q.trim(), x.correct.trim(), ...x.wrong.map((w) => w.trim())] });
    }
  }
  return rows;
}

async function prompts(count, avoid = []) {
  const system = `You write prompts for a comedy party game like Quiplash, where two players write the funniest answer. ${AUDIENCE} `
    + 'Prompts should be short, open-ended and invite silly answers. Cheeky is fine, nothing hateful or about real private people. Respond with JSON only.';
  const prompt = `Write ${count} prompts and 1 "final round" prompt that everyone answers.\n`
    + (avoid.length ? `Avoid these existing ones:\n- ${avoid.slice(-60).join('\n- ')}\n` : '')
    + 'Return {"prompts":["..."],"final":"..."}. Each under 90 characters.';
  const out = await ask(system, prompt, 200 + count * 40);
  const list = (out.prompts || []).filter((p) => str(p, 110)).map((p) => p.trim());
  return { prompts: list, final: str(out.final, 110) ? out.final.trim() : null };
}

async function story(avoidTitles = []) {
  const system = `You write fill-in-the-blank comedy stories (Mad Libs). ${AUDIENCE} Respond with JSON only.`;
  const prompt = 'Write one short, funny story of 90-140 words with 10-13 blanks. Mark each blank as [hint] where hint says what to write, '
    + 'e.g. [an adjective], [a UK town], [a celebrity], [a verb ending in -ing], [a plural noun], [an exclamation], [a number]. '
    + 'You may use {A} and {B} where a real player\'s name will be inserted. The story should be funny whatever words go in. '
    + (avoidTitles.length ? `Not about the same thing as: ${avoidTitles.join(', ')}. ` : '')
    + 'Return {"title":"...","text":"..."}.';
  const out = await ask(system, prompt, 900);
  const blanks = (String(out.text || '').match(/\[[^\]]{2,40}\]/g) || []).length;
  if (!str(out.title, 60) || !str(out.text, 1500) || blanks < 6) throw new Error('Story failed validation');
  return { id: `ai-${Date.now()}`, title: out.title.trim(), text: out.text.trim(), ai: true };
}

module.exports = {
  enabled: () => !!API_KEY,
  model: MODEL,
  store,
  remember,
  ban,
  banned,
  quiz,
  prompts,
  story,
};
