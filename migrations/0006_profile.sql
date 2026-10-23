-- Age and gender, asked once after the first sign-in (for age checks and audience analytics).
-- Age is kept as an approximate birth year so it stays current.
ALTER TABLE users ADD COLUMN birth_year INTEGER;
ALTER TABLE users ADD COLUMN gender TEXT;
ALTER TABLE users ADD COLUMN profile_at INTEGER;
