'use strict';
// Game registry. To add a game: write a class extending BaseGame with a static `meta`, then add it here.
const StoryTime = require('./storytime');
const HeadToHead = require('./headtohead');
const PubQuiz = require('./pubquiz');
const StopTheBus = require('./stopthebus');

const GAMES = Object.fromEntries([StoryTime, HeadToHead, PubQuiz, StopTheBus].map((G) => [G.meta.id, G]));

module.exports = { GAMES };
