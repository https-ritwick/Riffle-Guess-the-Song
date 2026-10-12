-- Encore accounts & groups (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  google_sub  TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  picture     TEXT,
  created_at  INTEGER NOT NULL,
  last_login  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Only a SHA-256 hash of each session token is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS groups (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  owner_id        TEXT NOT NULL REFERENCES users (id),
  invite_code     TEXT NOT NULL UNIQUE,
  invite_enabled  INTEGER NOT NULL DEFAULT 1,
  allow_guests    INTEGER NOT NULL DEFAULT 0,
  settings_json   TEXT,
  active_room     TEXT,
  active_room_at  INTEGER,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id   TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON group_members (user_id);

-- Invitations addressed to a Google account email; shown to that person when they sign in.
CREATE TABLE IF NOT EXISTS group_invites (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  invited_by  TEXT NOT NULL REFERENCES users (id),
  created_at  INTEGER NOT NULL,
  UNIQUE (group_id, email)
);
CREATE INDEX IF NOT EXISTS idx_invites_email ON group_invites (email);

CREATE TABLE IF NOT EXISTS games (
  id            TEXT PRIMARY KEY,
  group_id      TEXT REFERENCES groups (id) ON DELETE CASCADE,
  room_code     TEXT NOT NULL,
  source_title  TEXT NOT NULL,
  rounds        INTEGER NOT NULL,
  played_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_games_group ON games (group_id, played_at);

CREATE TABLE IF NOT EXISTS game_players (
  game_id   TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  user_id   TEXT REFERENCES users (id) ON DELETE SET NULL,
  name      TEXT NOT NULL,
  score     INTEGER NOT NULL,
  correct   INTEGER NOT NULL,
  rank      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_game_players_game ON game_players (game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_user ON game_players (user_id);
