'use strict';
// Loads every category file in this folder, plus the picture round from public/pictures.
// Add a genre: copy any file here, change id/name/emoji, add questions, add its id to ORDER.
const fs = require('fs');
const path = require('path');

const ORDER = ['geography', 'history', 'science', 'nature', 'sport', 'football', 'music', 'screen',
  'celebs', 'gaming', 'food', 'britain', 'cars', 'words', 'emoji'];
const PICTURES_DIR = process.env.CHINWAG_PICTURES_DIR || path.join(__dirname, '..', '..', '..', 'public', 'pictures');

const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.js') && f !== 'index.js').map((f) => require(path.join(__dirname, f)));
files.sort((a, b) => (ORDER.indexOf(a.id) + 1 || 99) - (ORDER.indexOf(b.id) + 1 || 99));

const KIND_PROMPT = { film: 'Name the film', song: 'Name the song', food: 'Name the food', 'TV show': 'Name the TV show', 'UK place': 'Name the UK place' };

// Normalise a raw row from a category file into a question object.
function toQuestion(cat, row, emojiRound) {
  if (emojiRound) {
    const [emoji, accept, kind] = row;
    return { cat, kind: 'typed', q: KIND_PROMPT[kind] || `Name the ${kind}`, emoji, answer: accept[0], accept };
  }
  if (Array.isArray(row[1])) return { cat, kind: 'typed', q: row[0], answer: row[1][0], accept: row[1] };
  return { cat, kind: 'choice', q: row[0], answer: row[1], wrong: row.slice(2, 5) };
}

const BANK = {};
const CATEGORIES = [];
for (const f of files) {
  CATEGORIES.push({ id: f.id, name: f.name, emoji: f.emoji });
  BANK[f.id] = f.questions.map((r) => toQuestion(f.id, r, f.emojiRound));
}

// ---------- picture round ----------
// public/pictures/<folder>/<Answer>.jpg  — optional alternatives in brackets: "Ed Sheeran (Sheeran).jpg"
const PIC_PROMPTS = [
  [/food|dish/i, 'Name this food'],
  [/famous|face|people|celeb|person|artist|singer/i, 'Who is this?'],
  [/logo|brand/i, 'Whose logo is this?'],
  [/place|landmark|city|where/i, 'Where is this?'],
  [/flag/i, 'Which country\'s flag is this?'],
  [/car/i, 'Name this car'],
];
const IMG = /\.(jpe?g|png|webp|gif|avif)$/i;

function pictureQuestions() {
  const out = [];
  const walk = (dir, folder) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) { walk(path.join(dir, e.name), e.name); continue; }
      if (!IMG.test(e.name)) continue;
      const base = e.name.replace(IMG, '').replace(/[_]+/g, ' ').trim();
      const m = base.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
      const answer = (m ? m[1] : base).trim();
      const alts = m ? m[2].split(',').map((s) => s.trim()).filter(Boolean) : [];
      const prompt = (PIC_PROMPTS.find(([re]) => re.test(folder || '')) || [null, 'What is this?'])[1];
      const rel = path.relative(PICTURES_DIR, path.join(dir, e.name)).split(path.sep).map(encodeURIComponent).join('/');
      out.push({ cat: 'pictures', kind: 'typed', q: prompt, image: `/pictures/${rel}`, answer, accept: [answer, ...alts] });
    }
  };
  walk(PICTURES_DIR, '');
  return out;
}

function categories() {
  const n = pictureQuestions().length;
  return n ? CATEGORIES.concat({ id: 'pictures', name: `Picture Round (${n})`, emoji: '🖼️' }) : CATEGORIES.slice();
}

function bank(catId) {
  if (catId === 'pictures') return pictureQuestions();
  return BANK[catId] || [];
}

module.exports = { categories, bank, toQuestion, CATEGORIES };
