# Riffle — name the song before your friends do

A free, real-time music quiz. Play **solo** or create a room and share the link so everyone plays from their own phone. The same clip plays on every device at once. Players pick the right title (or artist) from four look-alike options, each shown with album art, and faster correct answers score more. **Blend** mixes every player's Spotify (up to 300 songs each) and playlists into one game. Three **Bollywood challenges** need no audio: *Dialogue Baazi* (name the movie from a dialogue), *Star Spotting* (clues and "who said it?") and *Emoji Gaana* (name the song from emojis). Quick games need no account; signing in with Google adds saved **groups** with a shared leaderboard, and group games are for signed-in players.

> Riffle was previously called *Encore*. The product name lives in `src/shared/brand.ts`. Cookie names and local-storage keys still use the old `encore` prefix; they're internal and invisible to players.

Live: https://riffle.musicquiz.workers.dev

The original gameplay screen was modelled on the public parts of [Tapzz](https://app.tapzz.com/) (see [Reference & fidelity](#reference--fidelity)). Riffle is an independent implementation with its own name and logo.

## Features

**Difficulty that actually bites**
- **Three levels** (host picks; *Hard* is the default): *Easy* uses random wrong answers, *Medium* uses look-alikes, and *Hard* uses the closest possible look-alikes and charges **100 points for a wrong guess** (200 on the double final; scores never drop below 0, and not answering costs nothing).
- **Race the room**: the first correct answer of each song earns a **⚡ +100 bonus** in multiplayer games, shown on the leaderboard.
- **Look-alike options**: wrong answers are ranked by how easily they're mistaken for the right one: same singer, same album or movie, same era, and titles that look or sound alike. Near-identical spellings of the same song and anyone credited on the right song are never offered.
- **Album art on every option**: art is shown only when all four options have it, so it never gives the answer away.
- **Beating the hook**: store previews are cut around the chorus, so the clip starts at a random point by default and plays continuously.
- **Non-stop flow**: after each song the answer is revealed for 10 seconds while the song keeps playing, with a "Next song in …" countdown. The next song starts the moment it hits zero. The 3-2-1 countdown only opens the game.

**Bollywood challenges** (pick them in the lobby under *What are we playing?*)
- **🎬 Dialogue Baazi:** a famous dialogue appears (Sholay to Jawan); pick the movie. Wrong answers share the same star or era. The reveal shows who said it and what it means.
- **🌟 Star Spotting:** three clues unlock over the timer, hardest first, so answering early scores more. Mixed with *"who said it?"* rounds where co-stars of the same film are the wrong answers.
- **😎 Emoji Gaana:** a song spelled out in emojis. The real song (found on iTunes) plays at the reveal.
- **Fresh every game:** about 60 dialogues, 60 stars and 60 emoji songs are built in. With a Google Gemini API key (see [Environment variables](#environment-variables)), Gemini writes ~20 new questions per mode in the background as soon as the host picks it, and they make up to 60% of each game. AI questions are schema-checked (three distinct wrong answers, no clue that names the star, emoji clues without letters, and so on), used once, and the room tells Gemini what it has already played.

**Daily challenge, levels and sharing**
- **📅 Aaj Ka Challenge:** five questions a day, the same for everyone, rotating between the three Bollywood challenges and resetting at midnight India time. One attempt each, with a live leaderboard on the home page (`GET /api/daily`, table `daily_scores`, migration 0004).
- **Career:** every game earns XP towards nine filmi ranks (Junior Artist → Bollywood Ka Baadshah), keeps a day streak, and unlocks 14 badges (Pehli Picture, Dhoom, Hat-trick, Raat Baaki Hai…). Stored on the device.
- **Streak hype:** a burst on the screen at 3, 4, 5, 7 and 10+ right answers in a row.
- **Emoji songs play as soon as you crack them,** while everyone else is still thinking. AI emoji puzzles come with a word-by-word decode (shown at the reveal) and are only used when iTunes finds the song.
- **Share sheet:** a Story-sized (9:16) or square result poster drawn in the browser with the game's album covers, for Instagram Story and WhatsApp Status through the phone's share sheet, plus WhatsApp chat, X, copy text, download, and a "beat my score" link that opens a solo game of the same mode with the challenge shown.

**No repeats**
- Every room remembers the songs and questions it has played and plays new ones first, in a fresh order, every game. The host's browser also remembers its last 800, so a brand-new room with the same crew still starts fresh, and groups carry their memory into the next group game.

**Solo**
- **Play solo** from the home page gives you a private room nobody else can join. You get a "Your run" panel (accuracy, streak, progress dots), can skip ahead after each reveal (Enter), and keep a personal best per music source and difficulty.

**Blend (Spotify)**
- Every player can **Connect Spotify** to add a random 150 of their top tracks (last month, six months and all time) and liked songs, and **add playlist links** too: up to 3 sources and 300 songs per player. The host picks the *✨ Blend* tab, and songs are interleaved so each player gets a fair share. Songs nobody has heard in the room come first, and a few songs several players brought lead as *Blend matches*.
- Players can disconnect Spotify any time from the account menu. That deletes their saved top tracks.
- Every reveal shows **whose song it was**, and the results hand out *Crowd pleaser* and *Mystery DJ* awards.

**Results**
- A **story-style recap** (Spotify-Wrapped style) with filmi captions. Tap left or right to move and hold to pause. The last song keeps playing from its reveal into the first slide, then each song slide plays that song's hook. The slides cover your night (accuracy, streak, speed), plus *that's a wrap* with a cover collage, the song everyone knew, the stumper, the fastest finger, the comeback, an awards montage, and a podium finale (or your score and personal best when solo).
- **Filmy awards**, styled as film posters. Every category has a pool of Bollywood names, and each game draws new ones the room hasn't seen lately. With a Gemini API key, Gemini names them freshly every game from film titles, dialogues and trends, themed on the songs or questions you just played. The default names are:
  - *Dhoom Machale* for the fastest answer, *Don* for the longest streak and *Mr. Perfectionist* for accuracy.
  - *Baazigar* for the biggest comeback, *Bullet Raja* for the most first answers, and *Main Hoon Na* for songs only one player got.
  - *Picture Abhi Baaki Hai* for nailing the final song, and *Tareekh Pe Tareekh* for the slowest answers.
  - In Blend games, *Superstar* goes to the player whose music the room knew best, and *Mr. India* to the one whose songs stumped everyone.
  - Two friendly roasts: *Golmaal* for the most wrong answers and *Itna Sannata Kyun Hai?* for the most unanswered ones.
- A drifting **wall of every album cover** from the game, accuracy and streak stats, and a podium.
- The game laid out **as an album**, Side A and Side B. Each track shows how many players got it, who was fastest, whose Blend it came from, and what you answered. Tap a cover to replay it on a spinning record.
- A **Wordle-style share grid** (🟩🟥⬛).

**Music from any source**
- **Playlists**: paste any *public* Spotify or Apple Music playlist or album link (item songs, 90s Bollywood, your road-trip mix…). You can also pick from 84 featured playlists, all checked to load with previews and grouped as Desi, Top Hits, Throwback, Genres, Moods & Party and World. Examples: Hot Hits Hindi, Top 50 India, Bollywood Mush, This Is Arijit Singh, Old is Gold, Hot Hits Tamil/Telugu, All Out 70s–2010s, RapCaviar, Viva Latino and K-Pop ON!
- **Top Charts**: live iTunes charts. These cover Top Songs for your region plus Bollywood, Pop, Hip-Hop, Rock, Dance, Country, Latin, Tamil, Telugu, Indian Pop, Sufi, Devotional, Alternative, R&B, Electronic, J-Pop, Reggae and Jazz, and the US, UK and Brazil charts.
- **Mixes**:
  - *Desi*: Bollywood Hits, 80s, 90s, 2000s and 2010s Bollywood, Retro, Romance, Bollywood Party, Shaadi Songs, Garba & Dandiya, Punjabi, Desi Hip-Hop, Indian Indie, Sufi & Qawwali, Ghazals, Coke Studio & Pakistani Pop, South, Tamil Evergreen, Malayalam, Kannada, Marathi and Bengali.
  - *Decades*: the 60s through the 2020s.
  - *Genres*: Pop, Rap, Rock, Metal, K-Pop, EDM, R&B, Latin, Country, Movies, Christmas, Indie, Pop-Punk, Boy Bands & Girl Groups, Soul & Motown, Jazz, Reggae, Acoustic and Broadway.
  - *Moods*: Party Starters, Love Songs, Heartbreak, Workout, Road Trip, Chill, Karaoke Classics, Viral Hits and Feel-Good.
  - *World*: Afrobeats, J-Pop & Anime, Arabic, Pop en Español, French, Brazilian, Turkish and K-Pop Classics.
- **Artist** search (with photos) and **free-text search**. Every tile shows real album artwork.

**Playing**
- **Rooms:**
  - each room has a 4-letter code, a link, a QR code and a share button;
  - up to 16 players;
  - no login needed (except for group games).
- **Settings:**
  - 5–20 songs and 10–30 seconds per song;
  - guess the title, the artist, or a mix;
  - store region;
  - live scoring, random clip start, and double points on the final round.
- **Host controls:**
  - everyone sees the music and settings, but only the host can change them;
  - guests can browse everything and **suggest** music, and the host gets a toast with a one-tap "Use it" button;
  - the host can hand over the host role or remove players.
- **Each round:**
  - a 3-2-1 countdown, a timer ring and an equalizer;
  - instant right/wrong feedback with sound effects and vibration;
  - an album-cover flip that reveals the real artwork and everyone's picks;
  - **40 emoji reactions** (🔥 😂 💀 🖕 🤡 🐐 …) that float up everyone's screen with the sender's name, from the lobby, after you answer, at the reveal and on the results.
- **Room chat:** a chat dock in every multiplayer room with text, an emoji picker (7 sets), and 24 party stickers (BANGER, GG, RIGGED, BHAI KYA SCENE…). Emoji-only messages show large, unread messages get a badge and a short preview, and the last 60 messages stay in the room for anyone who joins late or refreshes.
- **Voice channel:** tap 🎧 to join and listen, or 🎙 to talk. You start muted, and the mic is only opened while you're unmuted (muting closes it again). Voice is peer-to-peer WebRTC, signalled over the room's WebSocket, with a green ring on whoever is speaking. STUN works on most networks. Add a Cloudflare TURN key (see [Environment variables](#environment-variables)) for players behind strict firewalls.
- **Live ranked leaderboard:** re-ranks the moment someone answers. Rows slide to their new place, and it shows rank arrows, answer times, streak flames and points earned.
- **Results:**
  - confetti and a podium;
  - awards for fastest finger, hot streak and sharpshooter;
  - replay any clip, with links to Spotify or Apple Music.
- **Resilient:** refresh or lose signal and you keep your seat and score. If the host disappears for 15 seconds, the host role passes to another player.

**Accounts and groups** (Google sign-in)
- **Creating and inviting:** create a group and you become its admin. Invite people with a link or QR code, so anyone with the link can join after signing in. You can also invite by Gmail address; they see the invitation when they sign in.
- **Admin controls:**
  - rename the group or delete it;
  - promote or demote admins, and remove members;
  - cancel invites, and reset or disable the invite link;
  - allow or deny guests in group games.
- **Members** can leave a group.
- **Signed-in only:** joining a group and joining a group game both need Google sign-in. Admins can still choose whether signed-in non-members may join group games.
- **One-tap group games:** any member can start a game for the group. Group pages and the home page show a live "● LIVE · 3 playing — Join" badge so members can jump straight in. Group games can be members-only.
- **Group memory:** the group remembers its last settings. It keeps an all-time leaderboard (wins, games, points) and a list of recent games.

## Architecture

```
Browser (React + Vite)                          Cloudflare (free plan)
┌───────────────────────────┐  HTTPS   ┌─────────────────────────────────────────┐
│ Home · Groups · Room      │─────────▶│ Worker  src/worker/index.ts             │
│                           │          │  • static app, /api router, CSRF check  │
│ useRoom(): reconnecting   │ WebSocket│  • auth.ts   Google OAuth + sessions    │
│ socket, clock sync,       │◀────────▶│  • groups.ts groups/invites/history API │
│ optimistic host settings  │          │  • playlist.ts reads public playlists   │
│                           │          │            │                 │          │
│ host only: builds the     │          │            ▼                 ▼          │
│ song pool (iTunes API /   │          │ Durable Object GameRoom   D1 (SQLite)   │
│ our /api/playlist)        │          │  1 per room: state,       users,        │
└───────────────────────────┘          │  timers (alarms), scoring sessions,     │
     ▲ previews & artwork              │  live leaderboard         groups, games │
     │ Apple / Spotify CDNs            └─────────────────────────────────────────┘
```

- **Cloudflare Workers + Durable Objects:** one stateful WebSocket server per room on the free plan, with no server to keep awake. Room state lives in the Durable Object's storage.
- **D1** (Cloudflare's SQLite): stores users, hashed sessions, groups, members, invitations and game history. The free plan allows 5 GB and 5 million reads a day.
- **Music:**
  - **iTunes Search API:** free, no key, 30-second previews. The host's browser makes these calls, which keeps Apple's per-IP rate limit off the server.
  - **Spotify playlists:** read on the server from the public embed page, which carries the track list and 30-second MP3 previews with no API key. Each song's album art comes from Spotify's public oEmbed endpoint.
  - **Apple Music playlists:** read on the server from the public page's schema.org JSON-LD, which carries the store IDs. One iTunes lookup turns those IDs into previews.
  - Only URLs built from validated IDs are fetched.
- **Fair play:** clients get the four options and an opaque preview URL. With live scoring, the correct answer goes only to a player who has already answered; otherwise everyone gets it at the reveal. Scores are calculated using server time.

### Project layout

```
src/
  shared/          used by browser and server
    protocol.ts    message & data schemas (zod), public state types
    account.ts     account/group API types and request schemas
    brand.ts       the product name and tagline
    catalog.ts     categories, featured playlists, regions, options
    covers.json    real album artwork for tiles (scripts/build-covers.mjs)
    playlist.ts    Spotify / Apple Music link parser
    questions.ts   question builder with look-alike wrong answers
    challenges/    Bollywood challenges: curated bank (data.ts) and question builder
    awards.ts      award categories and their pools of filmy names
    rules.ts       scoring and timing · text.ts title cleanup and similarity
    spotify.ts     Spotify connection types
  worker/
    index.ts       router, rate limits, origin checks, WebSocket identity
    room.ts        GameRoom Durable Object (game engine)
    auth.ts        Google OAuth (PKCE), sessions, dev login (localhost only)
    groups.ts      groups, invites, roles, history, "play" for a group
    playlist.ts    public playlist reader + Spotify artwork
    spotify.ts     "Connect Spotify": OAuth, top tracks, preview lookup
    ai.ts          Gemini: fresh challenge questions and award names (optional)
    rooms.ts / http.ts
  client/
    pages/         Home, RoomPage, GroupsPage, GroupPage, JoinGroupPage
    room/          Lobby, SourcePicker, GameView, Scoreboard, Results, …
    components/    UI primitives, header/user menu, toasts, group cards
    lib/           useRoom (WebSocket), auth, api, itunes, audio, sfx, covers
migrations/        D1 schema
scripts/           build-covers.mjs
tests/unit         vitest: text, questions, scoring, validation, playlist links
tests/e2e          Playwright: multiplayer games, playlists, suggestions, groups, reconnects, mobile
```

### Database (D1)

| Table | Purpose |
| --- | --- |
| `users` | Google account id (`google_sub`), email, name, photo |
| `sessions` | SHA-256 hash of the session token, user, expiry (30 days) |
| `groups` | name, owner, invite code, invite enabled, allow guests, saved settings, active room |
| `group_members` | (group, user, role `admin`/`member`) |
| `group_invites` | pending invitations by email |
| `games`, `game_players` | finished group games and per-player score, correct answers, rank |
| `spotify_links` | a browser's Spotify connection: hashed cookie token, display name, photo, and the top tracks read at connect time (no Spotify tokens are kept) |

`groups.played_json` (migration 0003) keeps the group's recently played song keys and question ids.

Schema: `migrations/0001_init.sql` to `migrations/0004_daily.sql`.

## Run locally

Requirements: Node.js 22.6+ (tested on Node 24).

```bash
npm install
cp .dev.vars.example .dev.vars                       # enables the local "developer sign-in"
npx wrangler d1 migrations apply riffle-db --local   # create the local database
npm run dev                                          # http://localhost:5290
```

Without Google credentials, the sign-in button becomes **Developer sign-in (local)**. It only works on `localhost` and lets you test groups with any name and email. To try real Google sign-in locally, put your client ID and secret in `.dev.vars` and add `http://localhost:5290/api/auth/google/callback` as a redirect URI.

Friends on the same Wi-Fi can open `http://<your-LAN-IP>:5290`. Signing in needs HTTPS, so use the deployed site for that.

```bash
npm run typecheck    # TypeScript for client and worker
npm test             # unit tests
npm run test:e2e     # Playwright end-to-end tests against the production build (uses installed Edge)
LIVE=1 npx playwright test live                                   # real iTunes songs
PW_BASE_URL=https://riffle.musicquiz.workers.dev npx playwright test   # test the deployed site
npm run covers       # regenerate real tile artwork (paced, ~7 min)
```

## Environment variables

| Name | Where | Purpose |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Worker secret | Google OAuth client id |
| `GOOGLE_CLIENT_SECRET` | Worker secret | Google OAuth client secret |
| `SPOTIFY_CLIENT_ID` | Worker secret | Spotify app client id (optional; enables *Connect Spotify*) |
| `SPOTIFY_CLIENT_SECRET` | Worker secret | Spotify app client secret |
| `GEMINI_API_KEY` | Worker secret | Optional. Google Gemini writes fresh challenge questions and award names. Without it the built-in bank and award pools are used. |
| `GEMINI_MODEL` | Worker variable | Optional. A Gemini model to try first (otherwise a built-in list of current Flash models is tried in order). |
| `TURN_KEY_ID` / `TURN_KEY_API_TOKEN` | Worker secrets | Optional. A Cloudflare TURN key (dashboard → Realtime → TURN) so voice chat also works for players on strict NATs/firewalls. Without it, `GET /api/rtc/ice` hands out STUN servers only. |
| `DEV_LOGIN` | `.dev.vars` only | `true` enables developer sign-in on localhost. Never set in production. |

Bindings (in `wrangler.jsonc`): `ROOMS` (Durable Object), `DB` (D1 `riffle-db`), `CREATE_LIMITER` / `CONNECT_LIMITER` (rate limits), `ASSETS`.

## Deploy (free)

```bash
npx wrangler login                                     # once
npx wrangler d1 create riffle-db                       # once; put the id in wrangler.jsonc
npx wrangler d1 migrations apply riffle-db --remote    # whenever migrations change
npm run deploy
```

### Turn on Google sign-in (one time, free)

1. Open https://console.cloud.google.com/ and create a project, for example "Riffle".
2. Go to **APIs & Services → OAuth consent screen**:
   - choose External, set the app name to "Riffle", add your support email, and save;
   - keep the default scopes (`openid`, `email`, `profile`);
   - click **Publish app** so any Google account can sign in. These basic scopes need no verification.
3. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID** and choose *Web application*:
   - Authorized JavaScript origin: `https://riffle.musicquiz.workers.dev`
   - Authorized redirect URI: `https://riffle.musicquiz.workers.dev/api/auth/google/callback`
4. Store the two values as Worker secrets. Each command asks you to paste the value:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
```
```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Sign-in starts working immediately, with no redeploy needed.

### Turn on "Connect Spotify" (optional, free)

Without it, Blend still works: players add a playlist link instead.

1. Open https://developer.spotify.com/dashboard and create an app. Select *Web API*.
2. Add the redirect URI `https://riffle.musicquiz.workers.dev/api/spotify/callback`.
   - For local testing, add `http://127.0.0.1:5290/api/spotify/callback` and open the app at `http://127.0.0.1:5290`. Spotify doesn't accept `localhost`.
3. Store the app's credentials as Worker secrets, and apply the new migration:

```bash
npx wrangler secret put SPOTIFY_CLIENT_ID
```
```bash
npx wrangler secret put SPOTIFY_CLIENT_SECRET
```
```bash
npx wrangler d1 migrations apply riffle-db --remote
```

**Development-mode limit:** new Spotify apps run in *development mode*, where only Spotify accounts you add under the app's **User Management** can connect (up to 25). Anyone else sees a message suggesting a playlist link instead. Wider access requires Spotify's extended-quota approval.

### Turn on AI questions and award names (optional)

Create a key at https://aistudio.google.com/apikey and store it as a Worker secret:

```bash
npx wrangler secret put GEMINI_API_KEY
```

Then open `/api/ai/health` on your site: it reports whether the key works and which model answered. Keys in the newer `AQ.` format are tried on the Gemini API first and on Vertex AI's express endpoint if the Gemini API rejects them. Each challenge game uses about one Gemini call to refill its questions, and each game one more for award names. Requests time out after 45 seconds, and a game never waits more than 15 seconds for them.

### Costs

| Service | Used for | Cost |
| --- | --- | --- |
| Cloudflare Workers, Durable Objects, D1 | hosting, WebSockets, rooms, accounts, groups | Free plan |
| Google OAuth | sign-in | Free |
| iTunes Search API, Apple/Spotify preview CDNs, Spotify embed & oEmbed | songs, previews, artwork, playlists | Free, no keys |
| Google Gemini API (optional) | AI challenge questions and award names | Free tier, then pay per use |

## Security notes

- **Room messages:** every WebSocket message is schema-validated, size-limited, and checked for host rights where needed.
- **Members-only games:** group games can require membership. The Worker checks it from the session before the room sees the connection, and strips any identity headers sent by clients.
- **Sessions:** random 256-bit tokens in an `HttpOnly; Secure; SameSite=Lax` cookie. Only a SHA-256 hash is stored. OAuth uses state and PKCE.
- **Request origin:** state-changing requests and WebSocket upgrades must come from the app's own origin.
- **Rate limits:** room creation, connections and playlist lookups are rate-limited per IP.
- **Playlist fetching:** URLs are built only from validated IDs on two fixed hosts, so there's no SSRF risk.
- **Media sources:** audio, artwork and links must come from known Apple or Spotify CDNs.
- **Browser hardening:** a strict Content Security Policy (`public/_headers`), `nosniff`, and no framing. User text is always rendered as text.
- **Developer login:** exists only when `DEV_LOGIN=true` **and** the host is `localhost`.

## Known limitations

- **Playlist size and previews:** playlists must be public. Spotify's embed lists up to 100 tracks, and songs without a preview are skipped (typically 0–15%).
- **Short links:** Spotify short links (`spotify.link/…`) aren't supported. Use "Copy link to playlist" instead.
- **Page-format dependency:** playlist import depends on the public Spotify embed page and Apple Music pages. If either changes its page format, playlist import needs an update. Charts, mixes, artist search and free-text search keep working.
- **Spotify connect:** limited to the app's allow-listed users while it is in Spotify's development mode (see above). The Web API no longer returns preview clips, so previews are read from each track's public embed page (20 per request).
- **Voice channel size:** every player in voice connects to every other one (a mesh), which is fine for a party of up to 16 but uses more upload on slow phones as more people talk. Without a TURN key, a few players on strict networks may not hear each other.
- **Email invitations:** these aren't actually emailed. The invitee sees them after signing in with that Gmail, so share the invite link to notify people directly.

## Reference & fidelity

No account was created on the reference; everything below comes from its public pages.

- **Sign-in page:** the card layout and buttons, the gradient banner, the Bricolage Grotesque font and the dark gradient background. These are reproduced on Riffle's home and join screens.
- **Public mini-quiz:** the "Song X of N / Score" bar, "What's the song? ⟨countdown⟩", the album and song-details flip reveal, the 2×2 answers and the results screen. These are reproduced in the game and results screens.
- **Signed-in app:** this couldn't be inspected. Riffle's lobby, groups, leaderboard and multiplayer screens are original designs in the same visual style.
