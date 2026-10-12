-- "Connect Spotify" for Blend games. Each row is one browser's connection: the
-- listener's display name, photo and the top tracks read once at connect time.
-- Spotify access/refresh tokens are never stored. Only a SHA-256 hash of the cookie token is kept.
CREATE TABLE IF NOT EXISTS spotify_links (
  token_hash   TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  image        TEXT,
  tracks_json  TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spotify_links_expiry ON spotify_links (expires_at);
