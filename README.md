# Are You Smarter Than The Family?

*(or The Group Chat, The Know-It-Alls, or whatever you call them: the title follows the chasers you pick in the lobby)*

Jackbox-style party games for a UK crowd. One screen (TV or laptop) shows the game; everyone plays on their phone in the browser. No app to install.

| Game | Players | What happens |
|---|---|---|
| **Story Time** | 2–10 | Everyone fills in blanks ("a UK town", "a verb ending in -ing") without seeing the story. The finished story is shown line by line and can be read aloud in a British voice. Then everyone votes for the best word. |
| **Head to Head** | 3–10 | Each prompt goes to two players. Everyone else votes for the funnier answer. Round 2 scores double. The final round is one prompt that everyone answers. |
| **Pub Quiz** | 1–10 | 830 built-in questions in 24 genres: general knowledge, *Who Am I?* famous faces, flags, True or False, Odd One Out, Missing Vowels, Name the Year, Christmas, Slogans & Catchphrases and an Easy Peasy family round. You can add your own photos too. It mixes multiple choice with typed answers, and faster answers score more. It ends with **The Final Chase**. |
| **Stop the Bus** | 2–10 | A random letter and eight categories (Boy's name, Animal, Country, City…). Fill them all and hit STOP THE BUS to give everyone else 5 seconds. Each category is then reviewed on the TV and players can 👎 dodgy answers. 10 points for a unique answer, 5 for a shared one, plus a 10-point bonus for stopping the bus. Choose classic or random categories, over 3 or 5 rounds. |

### The Final Chase
It plays out on the TV as a cartoon street scene, and every player has their own character. In the lobby you pick **who's chasing**, and the title changes to match:

- **The Family**: Dad, Mum and Nan, for family nights
- **The Group Chat**: three mates with a phone, shades and a pint
- **The Know-It-Alls**: mortarboard, bow tie and clipboard, for work dos

You can also type your own name for them, like "The Johnsons" or "Accounts Team". Each crew has its own speech-bubble taunts, and anyone caught turns into a ghost.
This round runs at the end of the Pub Quiz (switch it off in the lobby if you like). Your quiz rank buys a head start of 1–4 steps on a 10-step track. **The Family** 👪 is a computer chaser that starts at the back and gets about 70% of questions right. A right answer moves you 1 step, and the fastest right answer moves 2. If The Family reaches your square, you're caught and out. Reaching HOME scores +2000 if you're first and +1000 after that, and anyone still running when the questions run out gets +500.

## Kids' corner: Colour Lab

There's also a solo game for little ones at **/kids**, linked from the main page and the TV lobby. Kids tap paint pots (red, yellow, blue, white, black) to mix colours in a bowl. The mixing works like real paint, so yellow and blue make green. There are 16 colour challenges with stars and a hint button, plus a free-mixing mode that says the name of each colour out loud. Progress is saved on that device.

## Run it

```bash
npm install
npm start
```

Open **http://localhost:3000/host** on the TV/laptop. Phones scan the QR code (or go to the address shown on screen) and type the 4-letter code. Everyone needs to be on the same Wi-Fi.

The first person to join is the **VIP 👑** and can start or skip games from their phone. That's handy when the host screen is a TV with no keyboard.

### Keep it running on the Mac mini

```bash
npm i -g pm2
pm2 start server/index.js --name family
pm2 save && pm2 startup   # restarts on boot
```

### Play with people who aren't on your Wi-Fi

Deploy it anywhere that runs Node or Docker (Render, Railway, Fly.io), or expose the Mac mini with a Cloudflare Tunnel. Set `PUBLIC_URL` to the public address so the QR code points there.

```bash
docker build -t family . && docker run -p 3000:3000 -v $(pwd)/data:/app/data family
```

## Fresh content from Claude (optional)

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

With a key set, the lobby gets two extra options:

- **✨ Fresh content from Claude**: new quiz questions, Head to Head prompts and Story Time stories for each game.
- **Type any genre** in the Pub Quiz, e.g. "90s Premier League" or "Gavin & Stacey".

Everything it writes is checked for the right format and saved to `data/generated.json`, so the bank grows every time you play. If the API is slow or down, the game falls back to the built-in bank. The **👎 Bad question** button on the reveal screen bins a question for good.

| Variable | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Turns on Claude content |
| `FAMILY_MODEL` | `claude-haiku-5-5` | Any Claude model id |
| `PORT` | `3000` | |
| `PUBLIC_URL` | auto (LAN IP) | Address phones should use |
| `FAMILY_PICTURES_DIR` | `public/pictures` | Picture round folder |
| `FAMILY_DATA_DIR` | `data/` | Generated content and the binned-question list |

## Adding your own content

- **Quiz genre**: copy any file in `server/content/quiz/`, change `id`, `name` and `emoji`, then add questions.
  - `['Question?', 'Right', 'Wrong', 'Wrong', 'Wrong']` is multiple choice (shuffled when asked).
  - `['Question?', ['Answer', 'Also accepted']]` is a typed answer. Small typos, "the" and accents are forgiven, and the host can tap a guess to overrule the marking.
- **Picture round**: see `public/pictures/README.txt`. Name each file after its answer, e.g. `food/Toad in the hole.jpg`.
- **Head to Head prompts**: `server/content/prompts.js` (150 prompts, plus 20 for the final round)
- **Stories**: `server/content/stories.js` (30 stories). Use `[a hint]` for blanks and `{A}` / `{B}` for random player names.
- **New game**: write a class that extends `BaseGame` (`server/games/base.js`) and register it in `server/games/index.js`. The server owns all state. Each game provides `hostView()` and `playerView(p)`, and the screens just render those.

## Test

```bash
npm test
```

This runs bot players through every game end to end, plus reconnects, duplicate names, minimum player counts and host overrules.

## How it works

Node + Express + Socket.IO, with plain HTML/JS on the front end and no build step. The server keeps each room's state and sends every screen a full snapshot after each change. That means a phone that locks or drops Wi-Fi just reconnects (its token is in `localStorage`) and carries on where it left off. Phones also ask the browser to keep the screen awake while playing.
