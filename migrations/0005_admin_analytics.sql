-- Admin console and analytics.
-- "day" columns are days since the epoch in India time (IST), like the daily challenge.

-- Moderation and a little profile context for each account.
ALTER TABLE users ADD COLUMN banned_at INTEGER;
ALTER TABLE users ADD COLUMN ban_reason TEXT;
ALTER TABLE users ADD COLUMN deleted_at INTEGER;
ALTER TABLE users ADD COLUMN admin_note TEXT;
ALTER TABLE users ADD COLUMN login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_seen INTEGER;
ALTER TABLE users ADD COLUMN country TEXT;
ALTER TABLE users ADD COLUMN region TEXT;
ALTER TABLE users ADD COLUMN city TEXT;

-- Site-wide settings the admin can change without a deploy (banner, maintenance, feature switches).
CREATE TABLE IF NOT EXISTS app_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  updated_by  TEXT
);

-- Every change made from the admin console.
CREATE TABLE IF NOT EXISTS admin_actions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_email  TEXT NOT NULL,
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    TEXT,
  detail       TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_actions_time ON admin_actions (created_at);

-- One row per browser (a random id kept in the browser's local storage; only its hash is stored).
CREATE TABLE IF NOT EXISTS visitors (
  id          TEXT PRIMARY KEY,
  first_day   INTEGER NOT NULL,
  last_day    INTEGER NOT NULL,
  days        INTEGER NOT NULL DEFAULT 1,
  user_id     TEXT REFERENCES users (id) ON DELETE SET NULL,
  country     TEXT,
  region      TEXT,
  city        TEXT,
  device      TEXT,
  os          TEXT,
  browser     TEXT,
  referrer    TEXT,
  first_path  TEXT
);
CREATE INDEX IF NOT EXISTS idx_visitors_first ON visitors (first_day);

-- One row per browser per day it visited.
CREATE TABLE IF NOT EXISTS visits (
  day        INTEGER NOT NULL,
  visitor    TEXT NOT NULL,
  user_id    TEXT REFERENCES users (id) ON DELETE SET NULL,
  country    TEXT,
  region     TEXT,
  city       TEXT,
  device     TEXT,
  os         TEXT,
  browser    TEXT,
  referrer   TEXT,
  views      INTEGER NOT NULL DEFAULT 1,
  first_at   INTEGER NOT NULL,
  last_at    INTEGER NOT NULL,
  PRIMARY KEY (day, visitor)
);
CREATE INDEX IF NOT EXISTS idx_visits_user ON visits (user_id, day);

CREATE TABLE IF NOT EXISTS page_views (
  day    INTEGER NOT NULL,
  path   TEXT NOT NULL,
  views  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);

-- Counts of feature use (share, story poster, Spotify connect…), per day and country.
CREATE TABLE IF NOT EXISTS feature_usage (
  day      INTEGER NOT NULL,
  name     TEXT NOT NULL,
  country  TEXT NOT NULL DEFAULT '',
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, name, country)
);

-- Every room created (room codes are reused, so the creation time is part of the key).
CREATE TABLE IF NOT EXISTS rooms_log (
  code        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  user_id     TEXT REFERENCES users (id) ON DELETE SET NULL,
  country     TEXT,
  PRIMARY KEY (code, created_at)
);
CREATE INDEX IF NOT EXISTS idx_rooms_log_time ON rooms_log (created_at);

-- Every game played anywhere (not only group games).
CREATE TABLE IF NOT EXISTS game_events (
  id             TEXT PRIMARY KEY,
  day            INTEGER NOT NULL,
  room_code      TEXT NOT NULL,
  mode           TEXT NOT NULL,
  kind           TEXT NOT NULL,
  source_kind    TEXT NOT NULL,
  source_label   TEXT NOT NULL,
  region         TEXT,
  difficulty     TEXT,
  answer_type    TEXT,
  rounds         INTEGER NOT NULL,
  rounds_played  INTEGER NOT NULL,
  guess_seconds  INTEGER,
  live_scoring   INTEGER,
  group_id       TEXT,
  players        INTEGER NOT NULL,
  signed_in      INTEGER NOT NULL,
  completed      INTEGER NOT NULL,
  accuracy       REAL,
  top_score      INTEGER,
  chats          INTEGER NOT NULL DEFAULT 0,
  reactions      INTEGER NOT NULL DEFAULT 0,
  voice_users    INTEGER NOT NULL DEFAULT 0,
  country        TEXT,
  started_at     INTEGER NOT NULL,
  ended_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_game_events_day ON game_events (day);

CREATE TABLE IF NOT EXISTS game_participants (
  game_id      TEXT NOT NULL REFERENCES game_events (id) ON DELETE CASCADE,
  player_id    TEXT NOT NULL,
  user_id      TEXT REFERENCES users (id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  country      TEXT,
  region       TEXT,
  city         TEXT,
  device       TEXT,
  score        INTEGER NOT NULL,
  correct      INTEGER NOT NULL,
  answered     INTEGER NOT NULL,
  rank         INTEGER NOT NULL,
  best_streak  INTEGER NOT NULL,
  avg_ms       INTEGER,
  is_host      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_participants_user ON game_participants (user_id);

-- How every song / challenge question does across all games.
CREATE TABLE IF NOT EXISTS item_stats (
  key          TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  title        TEXT NOT NULL,
  subtitle     TEXT NOT NULL,
  plays        INTEGER NOT NULL DEFAULT 0,
  answers      INTEGER NOT NULL DEFAULT 0,
  correct      INTEGER NOT NULL DEFAULT 0,
  total_ms     INTEGER NOT NULL DEFAULT 0,
  last_played  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_item_stats_plays ON item_stats (plays);

-- Group games recorded before this migration count as games too.
INSERT OR IGNORE INTO game_events (id, day, room_code, mode, kind, source_kind, source_label, rounds, rounds_played, group_id, players, signed_in, completed, started_at, ended_at)
SELECT g.id, (g.played_at + 19800000) / 86400000, g.room_code, 'group', 'songs', 'unknown', g.source_title, g.rounds, g.rounds, g.group_id,
       (SELECT COUNT(*) FROM game_players p WHERE p.game_id = g.id),
       (SELECT COUNT(*) FROM game_players p WHERE p.game_id = g.id AND p.user_id IS NOT NULL),
       1, g.played_at, g.played_at
FROM games g;

INSERT OR IGNORE INTO game_participants (game_id, player_id, user_id, name, score, correct, answered, rank, best_streak)
SELECT game_id, 'legacy-' || rowid, user_id, name, score, correct, correct, rank, 0 FROM game_players;
