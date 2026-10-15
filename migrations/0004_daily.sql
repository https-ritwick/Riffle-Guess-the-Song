-- "Aaj Ka Challenge": one score per finished daily challenge room.
CREATE TABLE daily_scores (
  day INTEGER NOT NULL,
  room_code TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  total INTEGER NOT NULL,
  played_at INTEGER NOT NULL,
  PRIMARY KEY (day, room_code)
);
CREATE INDEX daily_scores_by_score ON daily_scores (day, score DESC);
