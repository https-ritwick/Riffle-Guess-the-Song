-- What each group has played recently (song keys and challenge ids), so a new
-- group game starts with songs and questions the group hasn't had yet.
ALTER TABLE groups ADD COLUMN played_json TEXT;
