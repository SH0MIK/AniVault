CREATE TABLE IF NOT EXISTS homepage_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_homepage_cache_updated
  ON homepage_cache(updated_at);
