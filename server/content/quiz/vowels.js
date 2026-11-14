// Missing Vowels: the vowels are removed and the spaces shuffled about. Typed answers.
// Add more as [answer, clue] pairs. The puzzle text is generated from the answer.
const LIST = [
  ['Gavin and Stacey', 'UK sitcom'], ['Only Fools and Horses', 'UK sitcom'], ['Coronation Street', 'UK soap'],
  ['Strictly Come Dancing', 'TV show'], ['Peaky Blinders', 'TV drama'], ['Doctor Who', 'TV show'],
  ['Line of Duty', 'TV drama'], ['Match of the Day', 'TV show'], ['The Great British Bake Off', 'TV show'],
  ['Love Island', 'TV show'], ['The Lion King', 'film'], ['Jurassic Park', 'film'], ['Home Alone', 'film'],
  ['Toy Story', 'film'], ['Finding Nemo', 'film'], ['Back to the Future', 'film'], ['Love Actually', 'film'],
  ['Notting Hill', 'film'], ['Paddington', 'film'], ['The Godfather', 'film'],
  ['David Beckham', 'footballer'], ['Wayne Rooney', 'footballer'], ['Harry Kane', 'footballer'],
  ['Steven Gerrard', 'footballer'], ['Lionel Messi', 'footballer'], ['Cristiano Ronaldo', 'footballer'],
  ['Thierry Henry', 'footballer'], ['Mohamed Salah', 'footballer'], ['Bukayo Saka', 'footballer'], ['Alan Shearer', 'footballer'],
  ['Fish and Chips', 'food'], ['Toad in the Hole', 'food'], ['Spaghetti Bolognese', 'food'], ['Chicken Tikka Masala', 'food'],
  ['Sticky Toffee Pudding', 'food'], ['Beans on Toast', 'food'], ['Yorkshire Pudding', 'food'], ['Bangers and Mash', 'food'],
  ['Birmingham', 'UK city'], ['Edinburgh', 'UK city'], ['Manchester', 'UK city'], ['Stratford upon Avon', 'UK town'],
  ['Isle of Wight', 'UK place'], ['Lake District', 'UK place'], ['Loch Ness', 'UK place'], ['Blackpool Tower', 'UK landmark'],
  ['Buckingham Palace', 'UK landmark'], ['Stonehenge', 'UK landmark'],
  ['The Beatles', 'band'], ['Arctic Monkeys', 'band'], ['Spice Girls', 'band'], ['One Direction', 'band'],
  ['Little Mix', 'band'], ['Take That', 'band'], ['Rolling Stones', 'band'], ['Coldplay', 'band'],
  ['Ed Sheeran', 'singer'], ['Amy Winehouse', 'singer'], ['Elton John', 'singer'], ['Dua Lipa', 'singer'],
];

// Deterministic "random" regrouping so the puzzle is the same every time.
function puzzle(answer) {
  const letters = answer.toUpperCase().replace(/[^A-Z]/g, '').replace(/[AEIOU]/g, '');
  let seed = answer.length * 7919;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const parts = [];
  let i = 0;
  while (i < letters.length) {
    const size = Math.min(letters.length - i, 2 + Math.floor(rnd() * 3));
    parts.push(letters.slice(i, i + size));
    i += size;
  }
  return parts.join(' ');
}

module.exports = {
  id: 'vowels', name: 'Missing Vowels', emoji: '🔡',
  questions: LIST.map(([answer, clue]) => [`Missing vowels (${clue}): ${puzzle(answer)}`, [answer, answer.replace(/^The /, '')]]),
};
