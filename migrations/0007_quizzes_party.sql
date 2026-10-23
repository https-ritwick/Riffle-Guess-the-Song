-- Player-made quizzes: a signed-in player picks the songs, anyone with the link (or the public list) plays them.
CREATE TABLE IF NOT EXISTS quizzes (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  emoji           TEXT NOT NULL DEFAULT '🎵',
  cover           TEXT,
  tracks_json     TEXT NOT NULL,
  track_count     INTEGER NOT NULL,
  visibility      TEXT NOT NULL CHECK (visibility IN ('public', 'unlisted')),
  plays           INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  -- Taken down by an admin (hidden everywhere, kept for review).
  removed_at      INTEGER,
  removed_reason  TEXT
);
CREATE INDEX IF NOT EXISTS idx_quizzes_public ON quizzes (visibility, removed_at, plays);
CREATE INDEX IF NOT EXISTS idx_quizzes_owner ON quizzes (owner_id);

-- Party features used in each game, for analytics.
ALTER TABLE game_events ADD COLUMN teams INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_events ADD COLUMN power_ups INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_events ADD COLUMN tv INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_events ADD COLUMN quiz_id TEXT;
