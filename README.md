# Riffle — name the song before your friends do

A free, real-time music quiz. Play **solo** or create a room and share the link so everyone plays from their own phone. The same clip plays on every device at once. Players pick the right title (or artist) from four look-alike options, each shown with album art, and faster correct answers score more. **Blend** mixes every player's Spotify top tracks (or a playlist each) into one game. Playing needs no account; signing in with Google adds saved **groups** with a shared leaderboard.

> Riffle was previously called *Encore*. Only the user-facing name changed (`src/shared/brand.ts`). The Worker name, the D1 database (`encore-db`), cookie names and local-storage keys keep their old identifiers, so deployed data, sessions and saved seats keep working.

Live: https://encore-music-quiz.ggsipuedc.workers.dev

The original gameplay screen was modelled on the public parts of [Tapzz](https://app.tapzz.com/) (see [Reference & fidelity](#reference--fidelity)). Riffle is an independent implementation with its own name and logo.

## Features

**Difficulty that actually bites**
- **Three levels** (host picks; *Hard* is the default): *Easy* uses random wrong answers, *Medium* uses look-alikes, and *Hard* uses the closest possible look-alikes and charges **100 points for a wrong guess** (200 on the double final; scores never drop below 0, and not answering costs nothing).
- **Race the room**: the first correct answer of each song earns a **⚡ +100 bonus** in multiplayer games, shown on the leaderboard.
- **Look-alike options**: wrong answers are ranked by how easily they're mistaken for the right one: same singer, same album or movie, same era, and titles that look or sound alike. Near-identical spellings of the same song and anyone credited on the right song are never offered.
- **Album art on every option**: art is shown only when all four options have it, so it never gives the answer away.
- **Beating the hook**: store previews are cut around the chorus, so the clip starts at a random point by default and plays continuously.
- **Non-stop flow**: after each song the answer is revealed for 10 seconds while the song keeps playing, with a "Next song in …" countdown. The next song starts the moment it hits zero. The 3-2-1 countdown only opens the game.

**Solo**
- **Play solo** from the home page gives you a private room nobody else can join. You get a "Your run" panel (accuracy, streak, progress dots), can skip ahead after each reveal (Enter), and keep a personal best per music source and difficulty.

**Blend (Spotify)**
- Every player can **Connect Spotify** to add their top tracks (topped up with liked songs), or **add any playlist link**. The host picks the *✨ Blend* tab, and songs are interleaved so each player gets a fair share. Songs several players brought come first as *Blend matches*.
- Players can disconnect Spotify any time from the account menu. That deletes their saved top tracks.
- Every reveal shows **whose song it was**, and the results hand out *Crowd pleaser* and *Mystery DJ* awards.

**Results**
- A **story-style recap** (Spotify-Wrapped style) with filmi captions. Tap left or right to move and hold to pause. The last song keeps playing from its reveal into the first slide, then each song slide plays that song's hook. The slides cover your night (accuracy, streak, speed), plus *that's a wrap* with a cover collage, the song everyone knew, the stumper, the fastest finger, the comeback, an awards montage, and a podium finale (or your score and personal best when solo).
- **Filmy awards**, styled as film posters:
  - *Dhoom Machale* for the fastest answer, *Don* for the longest streak and *Mr. Perfectionist* for accuracy.
  - *Baazigar* for the biggest comeback, *Bullet Raja* for the most first answers, and *Main Hoon Na* for songs only one player got.
  - *Picture Abhi Baaki Hai* for nailing the final song, and *Tareekh Pe Tareekh* for the slowest answers.
  - In Blend games, *Superstar* goes to the player whose music the room knew best, and *Mr. India* to the one whose songs stumped everyone.
- A drifting **wall of every album cover** from the game, accuracy and streak stats, and a podium.
- The game laid out **as an album**, Side A and Side B. Each track shows how many players got it, who was fastest, whose Blend it came from, and what you answered. Tap a cover to replay it on a spinning record.
- A **Wordle-style share grid** (🟩🟥⬛).

**Music from any source**
- **Playlists**: paste any *public* Spotify or Apple Music playlist or album link (item songs, 90s Bollywood, your road-trip mix…). You can also pick a featured playlist, such as Bollywood Item Songs, Hot Hits Hindi, Bollywood Central, Punjabi 101 or All Out 90s.
- **Top Charts**: live iTunes charts. These cover Top Songs for your region plus Bollywood, Pop, Hip-Hop, Rock, Dance, Country, Latin, Tamil and Telugu.
- **Mixes**:
  - *Desi*: Bollywood Hits, 90s and 2000s Bollywood, Retro, Punjabi, Desi Hip-Hop, Indian Indie and South.
  - *Decades*: the 70s through the 2020s.
  - *Genres*: Pop, Rap, Rock, Metal, K-Pop, EDM, R&B, Latin, Country, Movies and Christmas.
- **Artist** search (with photos) and **free-text search**. Every tile shows real album artwork.

**Playing**
- **Rooms:**
  - each room has a 4-letter code, a link, a QR code and a share button;
  - up to 16 players;
  - no login needed.
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
  - an album-cover flip that reveals the real artwork, everyone's picks, and emoji reactions.
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
    rules.ts       scoring and timing · text.ts title cleanup and similarity
    spotify.ts     Spotify connection types
  worker/
    index.ts       router, rate limits, origin checks, WebSocket identity
    room.ts        GameRoom Durable Object (game engine)
    auth.ts        Google OAuth (PKCE), sessions, dev login (localhost only)
    groups.ts      groups, invites, roles, history, "play" for a group
    playlist.ts    public playlist reader + Spotify artwork
    spotify.ts     "Connect Spotify": OAuth, top tracks, preview lookup
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

Schema: `migrations/0001_init.sql`, `migrations/0002_spotify.sql`.

## Run locally

Requirements: Node.js 22.6+ (tested on Node 24).

```bash
npm install
cp .dev.vars.example .dev.vars                       # enables the local "developer sign-in"
npx wrangler d1 migrations apply encore-db --local   # create the local database
npm run dev                                          # http://localhost:5290
```

Without Google credentials, the sign-in button becomes **Developer sign-in (local)**. It only works on `localhost` and lets you test groups with any name and email. To try real Google sign-in locally, put your client ID and secret in `.dev.vars` and add `http://localhost:5290/api/auth/google/callback` as a redirect URI.

Friends on the same Wi-Fi can open `http://<your-LAN-IP>:5290`. Signing in needs HTTPS, so use the deployed site for that.

```bash
npm run typecheck    # TypeScript for client and worker
npm test             # unit tests
npm run test:e2e     # Playwright end-to-end tests against the production build (uses installed Edge)
LIVE=1 npx playwright test live                                   # real iTunes songs
PW_BASE_URL=https://encore-music-quiz.ggsipuedc.workers.dev npx playwright test   # test the deployed site
npm run covers       # regenerate real tile artwork (paced, ~7 min)
```

## Environment variables

| Name | Where | Purpose |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Worker secret | Google OAuth client id |
| `GOOGLE_CLIENT_SECRET` | Worker secret | Google OAuth client secret |
| `SPOTIFY_CLIENT_ID` | Worker secret | Spotify app client id (optional; enables *Connect Spotify*) |
| `SPOTIFY_CLIENT_SECRET` | Worker secret | Spotify app client secret |
| `DEV_LOGIN` | `.dev.vars` only | `true` enables developer sign-in on localhost. Never set in production. |

Bindings (in `wrangler.jsonc`): `ROOMS` (Durable Object), `DB` (D1 `encore-db`), `CREATE_LIMITER` / `CONNECT_LIMITER` (rate limits), `ASSETS`.

## Deploy (free)

```bash
npx wrangler login                                     # once
npx wrangler d1 create encore-db                       # once; put the id in wrangler.jsonc
npx wrangler d1 migrations apply encore-db --remote    # whenever migrations change
npm run deploy
```

### Turn on Google sign-in (one time, free)

1. Open https://console.cloud.google.com/ and create a project, for example "Riffle".
2. Go to **APIs & Services → OAuth consent screen**:
   - choose External, set the app name to "Riffle", add your support email, and save;
   - keep the default scopes (`openid`, `email`, `profile`);
   - click **Publish app** so any Google account can sign in. These basic scopes need no verification.
3. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID** and choose *Web application*:
   - Authorized JavaScript origin: `https://encore-music-quiz.ggsipuedc.workers.dev`
   - Authorized redirect URI: `https://encore-music-quiz.ggsipuedc.workers.dev/api/auth/google/callback`
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
2. Add the redirect URI `https://encore-music-quiz.ggsipuedc.workers.dev/api/spotify/callback`.
   - For local testing, add `http://127.0.0.1:5290/api/spotify/callback` and open the app at `http://127.0.0.1:5290`. Spotify doesn't accept `localhost`.
3. Store the app's credentials as Worker secrets, and apply the new migration:

```bash
npx wrangler secret put SPOTIFY_CLIENT_ID
```
```bash
npx wrangler secret put SPOTIFY_CLIENT_SECRET
```
```bash
npx wrangler d1 migrations apply encore-db --remote
```

**Development-mode limit:** new Spotify apps run in *development mode*, where only Spotify accounts you add under the app's **User Management** can connect (up to 25). Anyone else sees a message suggesting a playlist link instead. Wider access requires Spotify's extended-quota approval.

### Costs

| Service | Used for | Cost |
| --- | --- | --- |
| Cloudflare Workers, Durable Objects, D1 | hosting, WebSockets, rooms, accounts, groups | Free plan |
| Google OAuth | sign-in | Free |
| iTunes Search API, Apple/Spotify preview CDNs, Spotify embed & oEmbed | songs, previews, artwork, playlists | Free, no keys |

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
- **Email invitations:** these aren't actually emailed. The invitee sees them after signing in with that Gmail, so share the invite link to notify people directly.

## Reference & fidelity

No account was created on the reference; everything below comes from its public pages.

- **Sign-in page:** the card layout and buttons, the gradient banner, the Bricolage Grotesque font and the dark gradient background. These are reproduced on Riffle's home and join screens.
- **Public mini-quiz:** the "Song X of N / Score" bar, "What's the song? ⟨countdown⟩", the album and song-details flip reveal, the 2×2 answers and the results screen. These are reproduced in the game and results screens.
- **Signed-in app:** this couldn't be inspected. Riffle's lobby, groups, leaderboard and multiplayer screens are original designs in the same visual style.
