'use strict';
// Game registry. To add a game: write a class extending BaseGame with a static `meta`, then add it here.
const StoryTime = require('./storytime');
const HeadToHead = require('./headtohead');
const PubQuiz = require('./pubquiz');

const GAMES = Object.fromEntries([StoryTime, HeadToHead, PubQuiz].map((G) => [G.meta.id, G]));

module.exports = { GAMES };
