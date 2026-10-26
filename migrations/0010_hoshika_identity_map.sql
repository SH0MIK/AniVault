-- Hoshika identity bridge for the catalog migration.
-- Existing anime_list/watch_history/episode_videos rows stay untouched and keep
-- their legacy MAL IDs until an explicit, verified mapping is available.
CREATE TABLE IF NOT EXISTS anime_identity_map (
  hoshika_short_id TEXT PRIMARY KEY,
  legacy_mal_id INTEGER UNIQUE,
  hoshika_uuid TEXT,
  slug TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  mapping_source TEXT NOT NULL DEFAULT 'hoshika',
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_anime_identity_legacy_mal
  ON anime_identity_map(legacy_mal_id);
CREATE INDEX IF NOT EXISTS idx_anime_identity_title
  ON anime_identity_map(title);
